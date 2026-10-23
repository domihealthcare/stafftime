import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, Prisma, PtoStatus, PtoType, Role, ShiftStatus } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { addUtcDays, isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { PRACTICE_ZONE, practiceToday, zonedTimeToUtc } from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { loadTimeOffClashes } from './time-off-clashes';
import { TimeOffDaysService } from './time-off-days.service';
import {
  CreatePtoRequestDto,
  PreviewPtoRequestDto,
  QueryPtoRequestsDto,
  RecordPtoDto,
  ReviewPtoRequestDto,
} from './dto/pto.dto';

const REQUEST_INCLUDE = {
  employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  recordedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PtoRequestInclude;

/// Longest single request we will accept, as a guard against a mis-typed year.
const MAX_REQUEST_DAYS = 90;

@Injectable()
export class PtoService {
  private readonly logger = new Logger(PtoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly days: TimeOffDaysService,
  ) {}

  async create(dto: CreatePtoRequestDto, actor: AuthUser) {
    const employeeId = this.resolveEmployeeId(dto, actor);
    const { startDate, endDate } = this.parseDates(dto.startDate, dto.endDate);

    if (dto.isHalfDay && startDate.getTime() !== endDate.getTime()) {
      throw new BadRequestException('A half day has to be a single date.');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employmentStatus: true, firstName: true, isSharedAccount: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }
    if (employee.employmentStatus === EmploymentStatus.TERMINATED) {
      throw new ForbiddenException('That employee is no longer active.');
    }
    // A shared account is not a person, so it takes no time off (`common/people.ts`).
    if (employee.isSharedAccount) {
      throw new ForbiddenException(
        'This is a shared account, so it does not take time off. Ask with your own account.',
      );
    }

    await this.assertNoOverlap(employeeId, startDate, endDate);

    // More than is left: asked anyway, once they have said they understand
    // the rest may be unpaid (October 2026, Dominguez). Whoever decides sees it.
    const preview = await this.days.preview({
      employeeId,
      type: dto.type,
      startDate,
      endDate,
      isHalfDay: dto.isHalfDay ?? false,
    });
    const pastBalance = preview.after !== null && preview.inOneYear && preview.after < 0;
    if (pastBalance && !dto.acknowledgedUnpaid) {
      throw new BadRequestException(
        `That is more ${preview.bucket === 'sick' ? 'sick time' : 'PTO'} than is left (${preview.remaining} left, ${preview.days} asked for). Tick that you understand the days past it may be unpaid, then send it again.`,
      );
    }

    const request = await this.prisma.ptoRequest.create({
      data: {
        employeeId,
        type: dto.type,
        startDate,
        endDate,
        isHalfDay: dto.isHalfDay ?? false,
        notes: dto.notes,
        pastBalance,
      },
      include: REQUEST_INCLUDE,
    });

    this.logger.log(`PTO request ${request.id} created for employee ${employeeId}`);

    // Awaited so it is not lost on a serverless host, but never allowed to fail
    // the request: until now a request could sit for a week because nobody looked.
    await this.notifyQuietly(() => this.notifications.ptoRequested(request.id));

    return (await this.decorateAll([request]))[0];
  }

  /// What a request would take and leave, before it is sent - the form's
  /// "6 days · 4 left afterwards", and its warning past the balance.
  async preview(dto: PreviewPtoRequestDto, actor: AuthUser) {
    const employeeId = this.resolveEmployeeId(dto, actor);
    const { startDate, endDate } = this.parseDates(dto.startDate, dto.endDate);
    const isHalfDay = dto.isHalfDay === 'true' && startDate.getTime() === endDate.getTime();
    return this.days.preview({ employeeId, type: dto.type, startDate, endDate, isHalfDay });
  }

  /**
   * Time off somebody has already taken, written down by an admin - the
   * back-log from before Domi Staff, or a sick day nobody asked for in the
   * app (October 2026, Dominguez). Approved from the start, so it comes off
   * their balance like any other; nobody is notified, because nothing is
   * being decided.
   */
  async record(dto: RecordPtoDto, actor: AuthUser) {
    if (dto.employeeId === actor.id) {
      throw new ForbiddenException(
        'You cannot record your own time off. Ask another administrator.',
      );
    }
    const { startDate, endDate } = this.parseDates(dto.startDate, dto.endDate);
    if (dto.isHalfDay && startDate.getTime() !== endDate.getTime()) {
      throw new BadRequestException('A half day has to be a single date.');
    }
    if (endDate > practiceToday()) {
      throw new BadRequestException(
        'This is for time off already taken. Days still to come are asked for on the Time off screen.',
      );
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    }

    await this.assertNoOverlap(dto.employeeId, startDate, endDate);

    const now = new Date();
    const recorded = await this.prisma.ptoRequest.create({
      data: {
        employeeId: dto.employeeId,
        type: dto.type,
        status: PtoStatus.APPROVED,
        startDate,
        endDate,
        isHalfDay: dto.isHalfDay ?? false,
        reviewedById: actor.id,
        reviewedAt: now,
        reviewNote: dto.comment?.trim() || null,
        recordedById: actor.id,
      },
      include: REQUEST_INCLUDE,
    });
    this.logger.log(`Time off ${recorded.id} recorded for ${dto.employeeId} by ${actor.id}`);
    return (await this.decorateAll([recorded]))[0];
  }

  /**
   * Takes back time off an admin recorded by mistake. Only a recorded entry:
   * a request somebody made stays on file however it ended (see cancel).
   */
  async removeRecorded(id: string) {
    const entry = await this.prisma.ptoRequest.findUnique({
      where: { id },
      select: { id: true, recordedById: true },
    });
    if (!entry) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    if (entry.recordedById === null) {
      throw new BadRequestException(
        'Only time off recorded after the fact can be removed. A request stays on file - cancel it instead.',
      );
    }
    await this.prisma.ptoRequest.delete({ where: { id } });
    return { deleted: true };
  }

  async findAll(query: QueryPtoRequestsDto, actor: AuthUser) {
    // Employees only ever see their own, whatever they ask for.
    const employeeId = actor.role === Role.EMPLOYEE ? actor.id : query.employeeId;

    const requests = await this.prisma.ptoRequest.findMany({
      where: {
        employeeId,
        status: query.status,
        type: query.type,
        // Overlap: the request starts before the window ends and ends after it starts.
        startDate: query.to ? { lte: new Date(query.to) } : undefined,
        endDate: query.from ? { gte: new Date(query.from) } : undefined,
      },
      include: REQUEST_INCLUDE,
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }],
    });

    return this.decorateAll(requests);
  }

  async findOne(id: string, actor: AuthUser) {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    if (actor.role === Role.EMPLOYEE && request.employeeId !== actor.id) {
      // Not "forbidden": whether someone else's request exists is not this
      // employee's business either.
      throw new NotFoundException(`Request ${id} not found`);
    }
    return (await this.decorateAll([request]))[0];
  }

  /**
   * Corrects what kind of time off a request is - an hourly person who put a
   * sick day down as PTO (October 2026). Allowed while it is waiting or
   * approved, for days already past too, because the balance reads the type
   * afresh. Never your own, as with deciding a request. Nobody is told; the
   * balance on their screen moves.
   */
  async changeType(id: string, type: PtoType, actor: AuthUser) {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id },
      select: { id: true, employeeId: true, status: true, type: true },
    });
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    if (request.employeeId === actor.id) {
      throw new ForbiddenException(
        'You cannot change the kind of your own time off. Ask another manager or an administrator.',
      );
    }
    if (request.status !== PtoStatus.PENDING && request.status !== PtoStatus.APPROVED) {
      throw new BadRequestException('Only a waiting or approved request can be changed.');
    }
    if (request.type === type) {
      throw new BadRequestException('It is already that kind of time off.');
    }
    const updated = await this.prisma.ptoRequest.update({
      where: { id },
      data: { type, ...(type === PtoType.UNPAID ? { pastBalance: false } : {}) },
      include: REQUEST_INCLUDE,
    });
    this.logger.log(`Time off ${id} changed from ${request.type} to ${type} by ${actor.id}`);
    return (await this.decorateAll([updated]))[0];
  }

  /// Approve or deny. Managers only, and never your own request.
  async review(id: string, dto: ReviewPtoRequestDto, actor: AuthUser) {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id },
      select: { id: true, employeeId: true, status: true, startDate: true, endDate: true },
    });
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    if (request.employeeId === actor.id) {
      throw new ForbiddenException(
        'You cannot decide your own time off. Ask another manager or an administrator.',
      );
    }

    if (request.status !== PtoStatus.PENDING) {
      throw new BadRequestException(
        `That request has already been ${request.status.toLowerCase()}.`,
      );
    }

    if (dto.decision !== PtoStatus.APPROVED && dto.decision !== PtoStatus.DENIED) {
      throw new BadRequestException('A decision must be APPROVED or DENIED.');
    }

    if (dto.decision === PtoStatus.DENIED && !dto.reviewNote?.trim()) {
      throw new BadRequestException('Give a reason when denying a request.');
    }

    // Still pending in the write itself, so two managers deciding at the same
    // moment cannot both succeed (and the person get two answers).
    let updated;
    try {
      updated = await this.prisma.ptoRequest.update({
        where: { id, status: PtoStatus.PENDING },
        data: {
          status: dto.decision,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote?.trim() || null,
        },
        include: REQUEST_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new BadRequestException('Somebody else has just decided that request.');
      }
      throw error;
    }

    this.logger.log(`PTO request ${id} ${dto.decision.toLowerCase()} by ${actor.id}`);

    // Their shifts inside the dates, when the manager chose to deal with them
    // in the same step (October 2026, Dominguez - making the app smarter).
    const shiftsHandled =
      dto.decision === PtoStatus.APPROVED && dto.shifts && dto.shifts !== 'KEEP'
        ? await this.handleShifts(updated, dto.shifts)
        : 0;

    await this.notifyQuietly(() => this.notifications.ptoDecided(updated.id, shiftsHandled));

    return (await this.decorateAll([updated]))[0];
  }

  /**
   * The shifts an approved request lands on, still to come: taken off the
   * rota (a draft deleted, a published shift cancelled) or left as open
   * shifts for somebody else to cover - same office, hours, job role and
   * note, no longer theirs, and no longer part of their regular shift. A
   * half-day request keeps its shifts: half of one is still worked. The
   * person is told once, in the "time off approved" notice. Returns how many.
   */
  private async handleShifts(
    request: { employeeId: string; startDate: Date; endDate: Date; isHalfDay: boolean },
    choice: 'REMOVE' | 'OPEN',
  ): Promise<number> {
    if (request.isHalfDay) return 0;
    const shifts = await this.prisma.shift.findMany({
      where: {
        employeeId: request.employeeId,
        status: { not: ShiftStatus.CANCELLED },
        startsAt: { gte: new Date(), lt: endOfDay(request.endDate) },
        endsAt: { gt: startOfDay(request.startDate) },
      },
      select: { id: true, status: true },
    });
    if (shifts.length === 0) return 0;
    const ids = shifts.map((shift) => shift.id);
    if (choice === 'OPEN') {
      await this.prisma.shift.updateMany({
        where: { id: { in: ids } },
        data: { employeeId: null, seriesId: null },
      });
    } else {
      const drafts = shifts.filter((shift) => shift.status === ShiftStatus.DRAFT);
      await this.prisma.$transaction([
        this.prisma.shift.deleteMany({ where: { id: { in: drafts.map((shift) => shift.id) } } }),
        this.prisma.shift.updateMany({
          where: { id: { in: ids }, status: { not: ShiftStatus.DRAFT } },
          data: { status: ShiftStatus.CANCELLED },
        }),
      ]);
    }
    this.logger.log(
      `${shifts.length} shift(s) ${choice === 'OPEN' ? 'left open' : 'taken off'} for approved time off`,
    );
    return shifts.length;
  }

  /**
   * Starts a notification and walks away.
   *
   * `void somePromise()` is not enough: an unhandled rejection takes the whole
   * Node process down, so a mail server having a bad afternoon would stop the
   * practice clocking in. The rejection has to be caught here, where the only
   * sensible response is a line in the log.
   */
  private async notifyQuietly(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error: unknown) {
      this.logger.error(
        `Could not send a time-off notification: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Withdrawn by the employee, or cancelled by a manager.
   *
   * Requests are never deleted: an approved absence that later gets cancelled
   * is a thing people need to be able to look back at.
   */
  async cancel(id: string, actor: AuthUser) {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id },
      select: { id: true, employeeId: true, status: true, endDate: true },
    });
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    const isOwn = request.employeeId === actor.id;
    if (!isOwn && actor.role === Role.EMPLOYEE) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    if (request.status === PtoStatus.CANCELLED) {
      throw new BadRequestException('That request is already cancelled.');
    }
    if (request.status === PtoStatus.DENIED) {
      throw new BadRequestException('A denied request cannot be cancelled.');
    }

    // Letting someone cancel time off they already took would quietly rewrite
    // history; a manager corrects that on the timesheet instead.
    if (request.status === PtoStatus.APPROVED && isEndInPast(request.endDate)) {
      throw new BadRequestException(
        'That time off has already passed. Ask a manager to correct the timesheet instead.',
      );
    }

    const updated = await this.prisma.ptoRequest.update({
      where: { id },
      data: { status: PtoStatus.CANCELLED, cancelledAt: new Date() },
      include: REQUEST_INCLUDE,
    });

    return (await this.decorateAll([updated]))[0];
  }

  /// What a manager needs to look at: pending requests, soonest first.
  async pendingCount(actor: AuthUser): Promise<{ pending: number }> {
    if (actor.role === Role.EMPLOYEE) {
      return { pending: 0 };
    }
    const pending = await this.prisma.ptoRequest.count({
      where: { status: PtoStatus.PENDING, employeeId: { not: actor.id } },
    });
    return { pending };
  }

  /// Who else from the same job role and office is off on the same days -
  /// the clashes this request is part of.
  async clashes(id: string) {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id },
      select: { employeeId: true, startDate: true, endDate: true },
    });
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    return loadTimeOffClashes(this.prisma, isoDate(request.startDate), isoDate(request.endDate), {
      employeeId: request.employeeId,
    });
  }

  /// Shifts already on the schedule inside an approved absence, so a manager
  /// knows what needs re-covering.
  async conflictingShifts(id: string) {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id },
      select: { employeeId: true, startDate: true, endDate: true },
    });
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return this.prisma.shift.findMany({
      where: {
        employeeId: request.employeeId,
        status: { not: ShiftStatus.CANCELLED },
        startsAt: { lt: endOfDay(request.endDate) },
        endsAt: { gt: startOfDay(request.startDate) },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        location: { select: { name: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  // -------------------------------------------------------------------------

  private resolveEmployeeId(dto: { employeeId?: string }, actor: AuthUser): string {
    if (!dto.employeeId || dto.employeeId === actor.id) {
      return actor.id;
    }
    if (actor.role === Role.EMPLOYEE) {
      throw new ForbiddenException('You can only request time off for yourself.');
    }
    return dto.employeeId;
  }

  private parseDates(startRaw: string, endRaw: string) {
    // Whole days, anchored at UTC midnight so a @db.Date round-trip cannot
    // shift them by a timezone offset.
    const startDate = toUtcDate(startRaw);
    const endDate = toUtcDate(endRaw);

    if (endDate < startDate) {
      throw new BadRequestException('The last day cannot be before the first day.');
    }

    const days = (endDate.getTime() - startDate.getTime()) / 86_400_000 + 1;
    if (days > MAX_REQUEST_DAYS) {
      throw new BadRequestException(
        `That is ${Math.round(days)} days. Split a request longer than ${MAX_REQUEST_DAYS} days into separate ones.`,
      );
    }

    return { startDate, endDate };
  }

  private async assertNoOverlap(employeeId: string, startDate: Date, endDate: Date) {
    const clash = await this.prisma.ptoRequest.findFirst({
      where: {
        employeeId,
        status: { in: [PtoStatus.PENDING, PtoStatus.APPROVED] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    });

    if (clash) {
      const status = clash.status.toLowerCase();
      throw new BadRequestException(
        `That overlaps ${article(status)} ${status} request from ${isoDate(clash.startDate)} to ${isoDate(clash.endDate)}.`,
      );
    }
  }

  /// Adds the derived facts every screen wants, so neither has to work them
  /// out: the dates as plain days, and the days it takes - weekdays only, not
  /// the days the person's office is shut (`counted-days.ts`).
  private async decorateAll<
    T extends { employeeId: string; startDate: Date; endDate: Date; isHalfDay: boolean },
  >(requests: T[]) {
    const count = await this.days.counterFor(requests);
    return requests.map((request) => ({
      ...request,
      startDate: isoDate(request.startDate),
      endDate: isoDate(request.endDate),
      days: count(request),
    }));
  }
}

// ---------------------------------------------------------------------------

/// "an approved request", not "a approved request".
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/// The instant a date-only value's day begins at the practice - not UTC
/// midnight, which is the evening before in New Jersey.
function startOfDay(date: Date): Date {
  return zonedTimeToUtc(isoDate(date), '00:00', PRACTICE_ZONE);
}

/// The instant the day after it begins at the practice.
function endOfDay(date: Date): Date {
  return startOfDay(addUtcDays(date, 1));
}

function isEndInPast(endDate: Date): boolean {
  return endOfDay(endDate).getTime() < Date.now();
}
