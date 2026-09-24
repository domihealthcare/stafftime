import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, Prisma, PtoStatus, Role, ShiftStatus } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { countDays, isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePtoRequestDto, QueryPtoRequestsDto, ReviewPtoRequestDto } from './dto/pto.dto';

const REQUEST_INCLUDE = {
  employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PtoRequestInclude;

/// Longest single request we will accept, as a guard against a mis-typed year.
const MAX_REQUEST_DAYS = 90;

@Injectable()
export class PtoService {
  private readonly logger = new Logger(PtoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreatePtoRequestDto, actor: AuthUser) {
    const employeeId = this.resolveEmployeeId(dto, actor);
    const { startDate, endDate } = this.parseDates(dto.startDate, dto.endDate);

    if (dto.isHalfDay && startDate.getTime() !== endDate.getTime()) {
      throw new BadRequestException('A half day has to be a single date.');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employmentStatus: true, firstName: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }
    if (employee.employmentStatus === EmploymentStatus.TERMINATED) {
      throw new ForbiddenException('That employee is no longer active.');
    }

    await this.assertNoOverlap(employeeId, startDate, endDate);

    const request = await this.prisma.ptoRequest.create({
      data: {
        employeeId,
        type: dto.type,
        startDate,
        endDate,
        isHalfDay: dto.isHalfDay ?? false,
        notes: dto.notes,
      },
      include: REQUEST_INCLUDE,
    });

    this.logger.log(`PTO request ${request.id} created for employee ${employeeId}`);

    // Awaited so it is not lost on a serverless host, but never allowed to fail
    // the request: until now a request could sit for a week because nobody looked.
    await this.notifyQuietly(() => this.notifications.ptoRequested(request.id));

    return this.decorate(request);
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

    return requests.map((request) => this.decorate(request));
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
    return this.decorate(request);
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

    const updated = await this.prisma.ptoRequest.update({
      where: { id },
      data: {
        status: dto.decision,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote?.trim() || null,
      },
      include: REQUEST_INCLUDE,
    });

    this.logger.log(`PTO request ${id} ${dto.decision.toLowerCase()} by ${actor.id}`);
    await this.notifyQuietly(() => this.notifications.ptoDecided(updated.id));

    return this.decorate(updated);
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

    return this.decorate(updated);
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
        endsAt: { gt: request.startDate },
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

  private resolveEmployeeId(dto: CreatePtoRequestDto, actor: AuthUser): string {
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

  /// Adds the derived facts every screen wants, so neither has to work them out.
  private decorate<T extends { startDate: Date; endDate: Date; isHalfDay: boolean }>(request: T) {
    const days = countDays(request.startDate, request.endDate);
    return {
      ...request,
      startDate: isoDate(request.startDate),
      endDate: isoDate(request.endDate),
      days: request.isHalfDay ? 0.5 : days,
    };
  }
}

// ---------------------------------------------------------------------------

/// "an approved request", not "a approved request".
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function endOfDay(date: Date): Date {
  return new Date(date.getTime() + 86_400_000);
}

function isEndInPast(endDate: Date): boolean {
  return endOfDay(endDate).getTime() < Date.now();
}
