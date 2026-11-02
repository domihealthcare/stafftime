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
import { describeDates, describeSplit, TIME_OFF_KIND } from './describe-time-off';
import { loadTimeOffClashes } from './time-off-clashes';
import { TimeOffDaysService } from './time-off-days.service';
import {
  CreatePtoRequestDto,
  EditPtoRequestDto,
  PreviewPtoRequestDto,
  QueryPtoRequestsDto,
  RecordPtoDto,
  ReviewPtoRequestDto,
} from './dto/pto.dto';

const REQUEST_INCLUDE = {
  employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  recordedBy: { select: { id: true, firstName: true, lastName: true } },
  // The other part of a request split into paid and unpaid days when it was
  // approved, and every change made to it (November 2026).
  splitFrom: {
    select: {
      id: true,
      type: true,
      status: true,
      startDate: true,
      endDate: true,
      isHalfDay: true,
      employeeId: true,
    },
  },
  splitParts: {
    select: {
      id: true,
      type: true,
      status: true,
      startDate: true,
      endDate: true,
      isHalfDay: true,
      employeeId: true,
    },
    orderBy: { startDate: 'asc' },
  },
  changes: {
    select: {
      id: true,
      changedAt: true,
      summary: true,
      note: true,
      changedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { changedAt: 'desc' },
  },
} satisfies Prisma.PtoRequestInclude;

/// The kinds a manager may change a request to: what a new request can be.
const EDITABLE_TYPES: PtoType[] = [PtoType.SICK, PtoType.VACATION, PtoType.UNPAID];

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
   * A manager or admin changes somebody's time off (2 November 2026,
   * Dominguez: "I need to be able to edit PTO/SICK ... can have notes ...
   * can say who it is altered by"): the kind, the dates, a half day, and a
   * note the person reads. Waiting or approved, past days too, because the
   * balance reads the request afresh. Never your own. Each change is kept
   * with who made it, and the person is told. Nothing is split here: what a
   * manager sets is deliberate, even past the balance.
   */
  async edit(id: string, dto: EditPtoRequestDto, actor: AuthUser) {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id },
      select: {
        id: true,
        employeeId: true,
        status: true,
        type: true,
        startDate: true,
        endDate: true,
        isHalfDay: true,
        unpaidPastBalanceOf: true,
      },
    });
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    if (request.employeeId === actor.id) {
      throw new ForbiddenException(
        'You cannot change your own time off. Ask another manager or an administrator.',
      );
    }
    if (request.status !== PtoStatus.PENDING && request.status !== PtoStatus.APPROVED) {
      throw new BadRequestException('Only a waiting or approved request can be changed.');
    }
    if (dto.type && dto.type !== request.type && !EDITABLE_TYPES.includes(dto.type)) {
      throw new BadRequestException('Time off is Sick, PTO or Unpaid.');
    }

    const type = dto.type ?? request.type;
    const { startDate, endDate } = this.parseDates(
      dto.startDate ?? isoDate(request.startDate),
      dto.endDate ?? isoDate(request.endDate),
    );
    const single = startDate.getTime() === endDate.getTime();
    const isHalfDay = dto.isHalfDay ?? (request.isHalfDay && single);
    if (isHalfDay && !single) {
      throw new BadRequestException('A half day has to be a single date.');
    }
    const note = dto.note?.trim() || null;

    const changes: string[] = [];
    if (type !== request.type) {
      changes.push(`Kind: ${TIME_OFF_KIND[type]} (was ${TIME_OFF_KIND[request.type]})`);
    }
    const datesChanged =
      startDate.getTime() !== request.startDate.getTime() ||
      endDate.getTime() !== request.endDate.getTime();
    if (datesChanged || isHalfDay !== request.isHalfDay) {
      changes.push(
        `Dates: ${describeDates({ startDate, endDate, isHalfDay })} (was ${describeDates(request)})`,
      );
    }
    if (changes.length === 0 && !note) {
      throw new BadRequestException(
        'Nothing was changed. Change the kind or the dates, or write a note.',
      );
    }
    if (datesChanged) {
      await this.assertNoOverlap(request.employeeId, startDate, endDate, [id]);
    }

    const summary = changes.length > 0 ? changes.join('; ') : 'Note added';
    const [updated, change] = await this.prisma.$transaction([
      this.prisma.ptoRequest.update({
        where: { id },
        data: {
          type,
          startDate,
          endDate,
          isHalfDay,
          // Unpaid chosen by a manager is not "past the balance", and a kind
          // that is no longer Unpaid is not either.
          ...(type !== request.type ? { unpaidPastBalanceOf: null } : {}),
          ...(type === PtoType.UNPAID ? { pastBalance: false } : {}),
        },
        include: REQUEST_INCLUDE,
      }),
      this.prisma.ptoChange.create({
        data: { requestId: id, changedById: actor.id, summary, note },
        select: { id: true },
      }),
    ]);
    this.logger.log(`Time off ${id} changed by ${actor.id}: ${summary}`);

    await this.notifyQuietly(() => this.notifications.ptoChanged(change.id));

    return (await this.decorateAll([updated]))[0];
  }

  /// Approve or deny. Managers only, and never your own request.
  async review(id: string, dto: ReviewPtoRequestDto, actor: AuthUser) {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id },
      select: {
        id: true,
        employeeId: true,
        status: true,
        type: true,
        startDate: true,
        endDate: true,
        isHalfDay: true,
      },
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

    // Past the balance, the days not covered become a separate Unpaid part
    // (November 2026, Dominguez), so "Approved" never hides unpaid days.
    const approving = dto.decision === PtoStatus.APPROVED;
    const [split] = approving ? await this.days.approvalSplits([request]) : [null];
    const reviewedAt = new Date();
    const decided = {
      status: dto.decision,
      reviewedById: actor.id,
      reviewedAt,
      reviewNote: dto.reviewNote?.trim() || null,
    };

    // Still pending in the write itself, so two managers deciding at the same
    // moment cannot both succeed (and the person get two answers).
    let updated;
    try {
      if (!split) {
        updated = await this.prisma.ptoRequest.update({
          where: { id, status: PtoStatus.PENDING },
          data: decided,
          include: REQUEST_INCLUDE,
        });
      } else {
        const unpaidPart = split.paid
          ? [
              this.prisma.ptoRequest.create({
                data: {
                  employeeId: request.employeeId,
                  type: PtoType.UNPAID,
                  status: PtoStatus.APPROVED,
                  startDate: split.unpaid.startDate,
                  endDate: split.unpaid.endDate,
                  isHalfDay: split.unpaid.isHalfDay,
                  reviewedById: actor.id,
                  reviewedAt,
                  splitFromId: id,
                  unpaidPastBalanceOf: request.type,
                },
                select: { id: true },
              }),
            ]
          : [];
        const [first] = await this.prisma.$transaction([
          this.prisma.ptoRequest.update({
            where: { id, status: PtoStatus.PENDING },
            data: split.paid
              ? { ...decided, endDate: split.paid.endDate }
              : // Nothing left at all: the whole request is unpaid.
                {
                  ...decided,
                  type: PtoType.UNPAID,
                  unpaidPastBalanceOf: request.type,
                  pastBalance: false,
                },
            select: { id: true },
          }),
          ...unpaidPart,
          this.prisma.ptoChange.create({
            data: {
              requestId: id,
              changedById: actor.id,
              summary: describeSplit(request, split, 'Approved past the'),
            },
            select: { id: true },
          }),
        ]);
        updated = await this.prisma.ptoRequest.findUniqueOrThrow({
          where: { id: first.id },
          include: REQUEST_INCLUDE,
        });
      }
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new BadRequestException('Somebody else has just decided that request.');
      }
      throw error;
    }

    this.logger.log(`PTO request ${id} ${dto.decision.toLowerCase()} by ${actor.id}`);

    // Their shifts inside the dates, when the manager chose to deal with them
    // in the same step (October 2026, Dominguez - making the app smarter).
    // Every day of it, paid or not: the person is off either way.
    const shiftsHandled =
      approving && dto.shifts && dto.shifts !== 'KEEP'
        ? await this.handleShifts(request, dto.shifts)
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
      select: { id: true, employeeId: true, status: true, endDate: true, splitFromId: true },
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

    const cancelledAt = new Date();
    const updated = await this.prisma.ptoRequest.update({
      where: { id },
      data: { status: PtoStatus.CANCELLED, cancelledAt },
      include: REQUEST_INCLUDE,
    });

    // A request split into paid and unpaid days is one absence: its other
    // part goes with it, unless that part is already over.
    const rootId = request.splitFromId ?? request.id;
    const relatives = await this.prisma.ptoRequest.findMany({
      where: {
        OR: [{ id: rootId }, { splitFromId: rootId }],
        id: { not: id },
        status: { in: [PtoStatus.PENDING, PtoStatus.APPROVED] },
      },
      select: { id: true, status: true, endDate: true },
    });
    const alsoCancelled = relatives
      .filter((part) => part.status === PtoStatus.PENDING || !isEndInPast(part.endDate))
      .map((part) => part.id);
    if (alsoCancelled.length > 0) {
      await this.prisma.ptoRequest.updateMany({
        where: { id: { in: alsoCancelled } },
        data: { status: PtoStatus.CANCELLED, cancelledAt },
      });
    }

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

  /// The same for several requests from one read: each request's own shifts,
  /// as `conflictingShifts` gives them, in the order the requests are given.
  async conflictingShiftsFor(requests: { employeeId: string; startDate: Date; endDate: Date }[]) {
    if (requests.length === 0) return [];
    const windows = requests.map((request) => ({
      employeeId: request.employeeId,
      startsAt: { lt: endOfDay(request.endDate) },
      endsAt: { gt: startOfDay(request.startDate) },
    }));
    const shifts = await this.prisma.shift.findMany({
      where: { status: { not: ShiftStatus.CANCELLED }, OR: windows },
      select: {
        id: true,
        employeeId: true,
        startsAt: true,
        endsAt: true,
        location: { select: { name: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
    return windows.map((window) =>
      shifts
        .filter(
          (shift) =>
            shift.employeeId === window.employeeId &&
            shift.startsAt < window.startsAt.lt &&
            shift.endsAt > window.endsAt.gt,
        )
        .map((shift) => ({
          id: shift.id,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          location: shift.location,
        })),
    );
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

  private async assertNoOverlap(
    employeeId: string,
    startDate: Date,
    endDate: Date,
    except: string[] = [],
  ) {
    const clash = await this.prisma.ptoRequest.findFirst({
      where: {
        employeeId,
        ...(except.length > 0 ? { id: { notIn: except } } : {}),
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
  /// the days the person's office is shut (`counted-days.ts`). Since November
  /// 2026 also the other part of a request split into paid and unpaid days,
  /// and, for one still waiting, what approving it would split off.
  private async decorateAll<
    T extends {
      employeeId: string;
      type: PtoType;
      status: PtoStatus;
      startDate: Date;
      endDate: Date;
      isHalfDay: boolean;
      splitFrom?: SplitPart | null;
      splitParts?: SplitPart[];
    },
  >(requests: T[]) {
    const parts = requests.flatMap((request) => [
      ...(request.splitFrom ? [request.splitFrom] : []),
      ...(request.splitParts ?? []),
    ]);
    const waiting = requests.filter((request) => request.status === PtoStatus.PENDING);
    const [count, splits] = await Promise.all([
      this.days.counterFor([...requests, ...parts]),
      this.days.approvalSplits(waiting),
    ]);
    const splitOf = new Map(waiting.map((request, index) => [request, splits[index]]));
    const part = (one: SplitPart) => ({
      id: one.id,
      type: one.type,
      status: one.status,
      startDate: isoDate(one.startDate),
      endDate: isoDate(one.endDate),
      isHalfDay: one.isHalfDay,
      days: count(one),
    });
    return requests.map((request) => {
      const split = splitOf.get(request) ?? null;
      return {
        ...request,
        startDate: isoDate(request.startDate),
        endDate: isoDate(request.endDate),
        days: count(request),
        splitFrom: request.splitFrom ? part(request.splitFrom) : null,
        splitParts: (request.splitParts ?? []).map(part),
        approvalSplit: split
          ? {
              paidDays: split.paidDays,
              unpaidDays: split.unpaidDays,
              unpaidFrom: isoDate(split.unpaid.startDate),
            }
          : null,
      };
    });
  }
}

/// The other part of a split request, as the lists carry it.
interface SplitPart {
  id: string;
  employeeId: string;
  type: PtoType;
  status: PtoStatus;
  startDate: Date;
  endDate: Date;
  isHalfDay: boolean;
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
