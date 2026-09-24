import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClockMethod,
  EmploymentStatus,
  PayrollExportStatus,
  Prisma,
  Role,
  ShiftStatus,
  TimeEntryStatus,
  VerificationMethod,
} from '@prisma/client';
import { ClosingService } from '../closing/closing.service';
import { AuthUser } from '../common/auth/auth-user';
import { normalizeIp } from '../common/util/ip.util';
import { PrismaService } from '../prisma/prisma.service';
import { isPastLocationRetention } from './location-retention';
import { payrollStateOf, withPayroll } from './payroll-state';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { EditTimeEntryDto } from './dto/edit-time-entry.dto';
import { QueryTimeEntriesDto } from './dto/query-time-entries.dto';
import { LocationVerificationService, VerifiableLocation } from './location-verification.service';

/**
 * What a time entry looks like when it leaves the server.
 *
 * A `select` rather than an `include`, and that is the whole point: an include
 * returns every scalar on the row, which means the captured coordinates and IP
 * of every punch went out with every timesheet, to every screen, forever — and
 * nothing on the screens ever used them.
 *
 * They are still recorded, because a disputed punch is the reason to capture
 * them, and `clockInVerification` says what the check concluded. But reading
 * where somebody physically was is a deliberate act now: one entry at a time,
 * through `locationTrail`, admin-only and logged. Listing a fortnight of
 * timesheets is not that act.
 *
 * Adding a field here is how the coordinates would come back, so: don't.
 */
const TIME_ENTRY_SELECT = {
  id: true,
  employeeId: true,
  locationId: true,
  shiftId: true,
  method: true,
  status: true,
  clockInAt: true,
  clockInVerification: true,
  clockOutAt: true,
  clockOutVerification: true,
  isLate: true,
  isEarlyDeparture: true,
  isManuallyEdited: true,
  isMissingPunch: true,
  editedById: true,
  editedAt: true,
  editReason: true,
  approvedById: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
  employee: { select: { id: true, firstName: true, lastName: true } },
  location: { select: { id: true, name: true, slug: true, timezone: true } },
  shift: { select: { id: true, startsAt: true, endsAt: true } },
  /// Which payroll runs these hours went out in. Voided runs are excluded:
  /// they are on the record but they are no longer what payroll was paid.
  payrollExports: {
    where: { export: { status: PayrollExportStatus.GENERATED } },
    select: {
      export: { select: { id: true, target: true, generatedAt: true } },
    },
    orderBy: { export: { generatedAt: 'desc' } },
  },
} satisfies Prisma.TimeEntrySelect;

/// How far from a punch we will look for a scheduled shift to attach it to.
const SHIFT_MATCH_WINDOW_MINUTES = 240;

/// How early somebody may clock in to a work-from-home shift. Unlike an office
/// punch, nothing else proves they are working, so the shift itself is the
/// permission — and it is kept close to the shift.
const REMOTE_EARLY_MINUTES = 30;

@Injectable()
export class TimeEntriesService {
  private readonly logger = new Logger(TimeEntriesService.name);
  private readonly graceMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: LocationVerificationService,
    config: ConfigService,
    /// Optional so the many punch tests that are not about checklists need
    /// not build one.
    @Optional() private readonly closing?: ClosingService,
  ) {
    this.graceMinutes = config.get<number>('PUNCH_GRACE_MINUTES', 5);
  }

  async clockIn(dto: ClockInDto, actor: AuthUser, ipAddress: string | undefined) {
    const employeeId = this.resolveEmployeeId(dto, actor);
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employmentStatus: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }
    if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
      throw new ForbiddenException(
        `Employee is ${employee.employmentStatus.toLowerCase().replace('_', ' ')} and cannot clock in.`,
      );
    }

    // Working from home: a published remote shift covering now is the
    // permission. No office check, and — as promised to staff — no location
    // or IP recorded. The kiosk is always an office punch.
    const remoteShift =
      dto.method === ClockMethod.KIOSK ? null : await this.findRemoteShift(employeeId, new Date());
    if (remoteShift) {
      return this.createEntry({
        employeeId,
        locationId: remoteShift.locationId,
        shift: remoteShift,
        method: dto.method,
        verification: VerificationMethod.REMOTE,
      });
    }

    const location = await this.loadVerifiableLocation(dto.locationId);
    const isAssignedToLocation = await this.isAssigned(employeeId, dto.locationId);
    const ip = ipAddress ? normalizeIp(ipAddress) : null;

    const outcome = this.verification.verify({
      method: dto.method,
      location,
      isAssignedToLocation,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracyMeters: dto.accuracyMeters,
      ipAddress: ip,
    });
    if (!outcome.allowed) {
      throw new ForbiddenException(outcome.reason);
    }

    const shift = await this.findMatchingShift(employeeId, dto.locationId, new Date());
    return this.createEntry({
      employeeId,
      locationId: dto.locationId,
      shift,
      method: dto.method,
      verification: outcome.verificationMethod,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracyMeters: dto.accuracyMeters,
      ip,
    });
  }

  private async createEntry(input: {
    employeeId: string;
    locationId: string;
    shift: { id: string; startsAt: Date } | null;
    method: ClockMethod;
    verification: VerificationMethod;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    ip?: string | null;
  }) {
    const { employeeId, shift } = input;
    const clockInAt = new Date();

    // Checking for an existing open punch and inserting the new one must be atomic,
    // or a double-tapped button leaves the employee clocked in twice. Serializable
    // isolation makes the database reject the loser of that race.
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const open = await tx.timeEntry.findFirst({
            where: { employeeId, clockOutAt: null },
            select: { id: true, clockInAt: true },
          });
          if (open) {
            throw new ConflictException(
              `Already clocked in since ${open.clockInAt.toISOString()}. Clock out first.`,
            );
          }

          return tx.timeEntry.create({
            data: {
              employeeId,
              locationId: input.locationId,
              shiftId: shift?.id,
              method: input.method,
              status: TimeEntryStatus.OPEN,
              clockInAt,
              clockInLatitude: input.latitude,
              clockInLongitude: input.longitude,
              clockInAccuracyMeters: input.accuracyMeters,
              clockInIp: input.ip ?? null,
              clockInVerification: input.verification,
              isLate: shift ? this.isLate(clockInAt, shift.startsAt) : false,
            },
            select: TIME_ENTRY_SELECT,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // P2034: the transaction lost a write conflict, i.e. a concurrent clock-in won.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Already clocked in. Clock out first.');
      }
      throw error;
    }
  }

  /**
   * Closes the open punch, then records its closing checklist. The punch comes
   * first and stands on its own: nothing about the checklist — missing,
   * skipped, or failing to save — can stop somebody clocking out.
   */
  async clockOut(
    dto: ClockOutDto,
    actor: AuthUser,
    ipAddress: string | undefined,
    employeeIdOverride?: string,
  ) {
    const entry = await this.closeOpenEntry(dto, actor, ipAddress, employeeIdOverride);
    await this.closing?.recordForClockOut(
      {
        id: entry.id,
        employeeId: employeeIdOverride ?? actor.id,
        locationId: entry.locationId,
        clockInAt: entry.clockInAt,
      },
      dto.closing,
      actor.id,
    );
    return entry;
  }

  private async closeOpenEntry(
    dto: ClockOutDto,
    actor: AuthUser,
    ipAddress: string | undefined,
    employeeIdOverride?: string,
  ) {
    const employeeId = employeeIdOverride ?? actor.id;
    if (employeeIdOverride && employeeIdOverride !== actor.id && actor.role === Role.EMPLOYEE) {
      throw new ForbiddenException('You may only clock yourself out.');
    }

    const open = await this.findOpenEntry(employeeId);
    if (!open) {
      throw new ConflictException('No open time entry to clock out of.');
    }

    // A work-from-home punch ends the way it started: no office check, and
    // nothing about where they are recorded.
    if (open.clockInVerification === VerificationMethod.REMOTE) {
      const clockOutAt = new Date();
      const closed = await this.prisma.timeEntry.updateMany({
        where: { id: open.id, clockOutAt: null },
        data: {
          clockOutAt,
          clockOutVerification: VerificationMethod.REMOTE,
          status: TimeEntryStatus.COMPLETED,
          isEarlyDeparture: open.shift
            ? this.isEarlyDeparture(clockOutAt, open.shift.endsAt)
            : false,
        },
      });
      if (closed.count === 0) throw new ConflictException('No open time entry to clock out of.');
      return this.prisma.timeEntry.findUniqueOrThrow({
        where: { id: open.id },
        select: TIME_ENTRY_SELECT,
      });
    }

    const location = await this.loadVerifiableLocation(open.locationId);
    const ip = ipAddress ? normalizeIp(ipAddress) : null;

    const outcome = this.verification.verify({
      method: open.method,
      location,
      isAssignedToLocation: await this.isAssigned(employeeId, open.locationId),
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracyMeters: dto.accuracyMeters,
      ipAddress: ip,
    });

    // A failed clock-out must never trap someone on the clock: record the punch,
    // mark it MANUAL, and flag it for a manager to review.
    const verificationMethod = outcome.allowed
      ? outcome.verificationMethod
      : VerificationMethod.MANUAL;
    const needsReview = !outcome.allowed;

    const clockOutAt = new Date();

    // Compare-and-set, for the same reason clock-in runs serializable: the
    // entry was read a few lines up and something else may have closed it in
    // between. `clockOutAt: null` in the where clause makes the database do the
    // deciding, so only the first of several concurrent punches lands.
    //
    // Without it, six taps on a slow phone were six writes to the same row,
    // each stamping its own clock-out time over the last. The hours barely
    // moved — they were milliseconds apart — but the *verification* came along
    // for the ride, so a punch correctly flagged NEEDS_REVIEW could be
    // overwritten by a later one that passed, and the flag simply vanished.
    const updated = await this.prisma.timeEntry.updateMany({
      where: { id: open.id, clockOutAt: null },
      data: {
        clockOutAt,
        clockOutLatitude: dto.latitude,
        clockOutLongitude: dto.longitude,
        clockOutAccuracyMeters: dto.accuracyMeters,
        clockOutIp: ip,
        clockOutVerification: verificationMethod,
        status: needsReview ? TimeEntryStatus.NEEDS_REVIEW : TimeEntryStatus.COMPLETED,
        isEarlyDeparture: open.shift ? this.isEarlyDeparture(clockOutAt, open.shift.endsAt) : false,
      },
    });

    // Somebody else closed it first. The same answer a second tap gets a minute
    // later, rather than a different one because it arrived a millisecond later.
    if (updated.count === 0) {
      throw new ConflictException('No open time entry to clock out of.');
    }

    return this.prisma.timeEntry.findUniqueOrThrow({
      where: { id: open.id },
      select: TIME_ENTRY_SELECT,
    });
  }

  async findAll(query: QueryTimeEntriesDto) {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        employeeId: query.employeeId,
        locationId: query.locationId,
        status: query.status,
        clockInAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lt: query.to ? new Date(query.to) : undefined,
        },
      },
      select: TIME_ENTRY_SELECT,
      orderBy: { clockInAt: 'desc' },
    });

    return entries.map((entry) => withPayroll(entry));
  }

  /// The raw row, payroll state and all. Callers that hand an entry back to a
  /// screen put it through `withPayroll` first.
  async findOne(id: string) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id },
      select: TIME_ENTRY_SELECT,
    });
    if (!entry) {
      throw new NotFoundException(`Time entry ${id} not found`);
    }
    return entry;
  }

  /// The employee's currently open punch, if any — drives the clock-in/out button.
  async findCurrent(employeeId: string) {
    const open = await this.prisma.timeEntry.findFirst({
      where: { employeeId, clockOutAt: null },
      select: TIME_ENTRY_SELECT,
      orderBy: { clockInAt: 'desc' },
    });
    return open ? withPayroll(open) : null;
  }

  async edit(id: string, dto: EditTimeEntryDto, actor: AuthUser) {
    const entry = await this.findOne(id);
    this.assertEditIsDeliberate(entry, dto);

    const clockInAt = dto.clockInAt ? new Date(dto.clockInAt) : entry.clockInAt;
    // Omitting clockOutAt keeps whatever is there; clearing it is an explicit ask.
    const clockOutAt = dto.clearClockOut
      ? null
      : dto.clockOutAt
        ? new Date(dto.clockOutAt)
        : (entry.clockOutAt ?? null);

    if (clockOutAt && clockOutAt <= clockInAt) {
      throw new BadRequestException('clockOutAt must be after clockInAt.');
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        clockInAt,
        clockOutAt,
        isManuallyEdited: true,
        isMissingPunch: clockOutAt === null,
        editedById: actor.id,
        editedAt: new Date(),
        editReason: dto.editReason,
        status: clockOutAt ? TimeEntryStatus.COMPLETED : TimeEntryStatus.NEEDS_REVIEW,
      },
      select: TIME_ENTRY_SELECT,
    });

    return withPayroll(updated);
  }

  /**
   * Corrections to hours that have already been paid are allowed, but not by
   * accident.
   *
   * Refusing outright would be worse: the database would stay wrong forever,
   * and the mistake is usually exactly what needs fixing. But changing a number
   * that has already gone to payroll, with nobody noticing, means the
   * spreadsheet and this app quietly disagree — so the manager has to say they
   * know, and the entry is then flagged until it reaches a later run.
   */
  private assertEditIsDeliberate(
    entry: Prisma.TimeEntryGetPayload<{ select: typeof TIME_ENTRY_SELECT }>,
    dto: EditTimeEntryDto,
  ): void {
    const payroll = payrollStateOf(entry);
    if (!payroll.exported || dto.acknowledgeExported) return;

    throw new ConflictException({
      code: 'ALREADY_EXPORTED',
      message: `These hours were already sent to payroll on ${payroll.exportedAt?.toISOString().slice(0, 10)}. Correcting them now means the correction has to reach a later pay run.`,
      exportedAt: payroll.exportedAt,
      exportId: payroll.exportId,
    });
  }

  /**
   * Where a punch was made from — one entry, on purpose, and written to the log.
   *
   * This is the only route that returns coordinates. Capturing them is what
   * makes a browser clock-in trustworthy, and there is one honest reason to
   * read them back: somebody disputes a punch, or a manager thinks one was made
   * from a car park. Everything else about the entry is already on the
   * timesheet, including what the geofence check concluded.
   *
   * Admin-only, and logged, because "I looked up where you were on the 3rd"
   * should leave a trace. Coordinates older than the retention window have
   * already been cleared by the nightly job, and the answer then says so
   * rather than pretending the punch had no location.
   */
  async locationTrail(id: string, actor: AuthUser) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id },
      select: {
        id: true,
        employeeId: true,
        clockInAt: true,
        clockInLatitude: true,
        clockInLongitude: true,
        clockInAccuracyMeters: true,
        clockInIp: true,
        clockInVerification: true,
        clockOutAt: true,
        clockOutLatitude: true,
        clockOutLongitude: true,
        clockOutAccuracyMeters: true,
        clockOutIp: true,
        clockOutVerification: true,
      },
    });
    if (!entry) throw new NotFoundException(`Time entry ${id} not found`);

    this.logger.log(
      `Location detail for entry ${id} (employee ${entry.employeeId}) read by ${actor.id}`,
    );

    const cleared =
      entry.clockInLatitude === null &&
      entry.clockInIp === null &&
      isPastLocationRetention(entry.clockInAt);

    return { ...entry, cleared };
  }

  async approve(id: string, actor: AuthUser) {
    const entry = await this.findOne(id);
    if (!entry.clockOutAt) {
      throw new BadRequestException('Cannot approve a time entry that is still open.');
    }

    const approved = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        status: TimeEntryStatus.APPROVED,
        approvedById: actor.id,
        approvedAt: new Date(),
      },
      select: TIME_ENTRY_SELECT,
    });

    return withPayroll(approved);
  }

  // -------------------------------------------------------------------------

  private resolveEmployeeId(dto: ClockInDto, actor: AuthUser): string {
    if (!dto.employeeId) {
      return actor.id;
    }
    // Only a kiosk (or a manager fixing something) punches on someone else's behalf.
    if (dto.method !== ClockMethod.KIOSK && actor.role === Role.EMPLOYEE) {
      throw new ForbiddenException('You may only clock yourself in.');
    }
    return dto.employeeId;
  }

  private findOpenEntry(employeeId: string) {
    return this.prisma.timeEntry.findFirst({
      where: { employeeId, clockOutAt: null },
      include: { shift: { select: { id: true, startsAt: true, endsAt: true } } },
      orderBy: { clockInAt: 'desc' },
    });
  }

  private async isAssigned(employeeId: string, locationId: string): Promise<boolean> {
    const assignment = await this.prisma.employeeLocation.findUnique({
      where: { employeeId_locationId: { employeeId, locationId } },
      select: { employeeId: true },
    });
    return assignment !== null;
  }

  private async loadVerifiableLocation(locationId: string): Promise<VerifiableLocation> {
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) {
      throw new NotFoundException(`Location ${locationId} not found`);
    }

    return {
      id: location.id,
      name: location.name,
      // Prisma returns Decimal for these columns; the geofence maths wants numbers.
      latitude: location.latitude.toNumber(),
      longitude: location.longitude.toNumber(),
      geofenceRadiusFeet: location.geofenceRadiusFeet,
      allowedIps: location.allowedIps,
      kioskEnabled: location.kioskEnabled,
      isActive: location.isActive,
    };
  }

  /// Attach the punch to the nearest scheduled shift, so "late" means something.
  /// A published work-from-home shift that covers `at` — from half an hour
  /// before it starts to when it ends.
  private findRemoteShift(employeeId: string, at: Date) {
    return this.prisma.shift.findFirst({
      where: {
        employeeId,
        isRemote: true,
        status: ShiftStatus.PUBLISHED,
        startsAt: { lte: new Date(at.getTime() + REMOTE_EARLY_MINUTES * 60_000) },
        endsAt: { gt: at },
      },
      select: { id: true, locationId: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' },
    });
  }

  private findMatchingShift(employeeId: string, locationId: string, at: Date) {
    const windowMs = SHIFT_MATCH_WINDOW_MINUTES * 60_000;
    return this.prisma.shift.findFirst({
      where: {
        employeeId,
        locationId,
        status: ShiftStatus.PUBLISHED,
        startsAt: { lte: new Date(at.getTime() + windowMs) },
        endsAt: { gte: new Date(at.getTime() - windowMs) },
      },
      select: { id: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' },
    });
  }

  private isLate(clockInAt: Date, shiftStartsAt: Date): boolean {
    return clockInAt.getTime() > shiftStartsAt.getTime() + this.graceMinutes * 60_000;
  }

  private isEarlyDeparture(clockOutAt: Date, shiftEndsAt: Date): boolean {
    return clockOutAt.getTime() < shiftEndsAt.getTime() - this.graceMinutes * 60_000;
  }
}
