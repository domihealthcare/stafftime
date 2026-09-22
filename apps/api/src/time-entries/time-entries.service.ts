import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
import { AuthUser } from '../common/auth/auth-user';
import { normalizeIp } from '../common/util/ip.util';
import { PrismaService } from '../prisma/prisma.service';
import { payrollStateOf, withPayroll } from './payroll-state';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { EditTimeEntryDto } from './dto/edit-time-entry.dto';
import { QueryTimeEntriesDto } from './dto/query-time-entries.dto';
import {
  LocationVerificationService,
  VerifiableLocation,
} from './location-verification.service';

const TIME_ENTRY_INCLUDE = {
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
} satisfies Prisma.TimeEntryInclude;

/// How far from a punch we will look for a scheduled shift to attach it to.
const SHIFT_MATCH_WINDOW_MINUTES = 240;

@Injectable()
export class TimeEntriesService {
  private readonly graceMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: LocationVerificationService,
    config: ConfigService,
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

    const clockInAt = new Date();
    const shift = await this.findMatchingShift(employeeId, dto.locationId, clockInAt);

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
              locationId: dto.locationId,
              shiftId: shift?.id,
              method: dto.method,
              status: TimeEntryStatus.OPEN,
              clockInAt,
              clockInLatitude: dto.latitude,
              clockInLongitude: dto.longitude,
              clockInAccuracyMeters: dto.accuracyMeters,
              clockInIp: ip,
              clockInVerification: outcome.verificationMethod,
              isLate: shift ? this.isLate(clockInAt, shift.startsAt) : false,
            },
            include: TIME_ENTRY_INCLUDE,
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

  async clockOut(dto: ClockOutDto, actor: AuthUser, ipAddress: string | undefined, employeeIdOverride?: string) {
    const employeeId = employeeIdOverride ?? actor.id;
    if (employeeIdOverride && employeeIdOverride !== actor.id && actor.role === Role.EMPLOYEE) {
      throw new ForbiddenException('You may only clock yourself out.');
    }

    const open = await this.findOpenEntry(employeeId);
    if (!open) {
      throw new ConflictException('No open time entry to clock out of.');
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

    return this.prisma.timeEntry.update({
      where: { id: open.id },
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
      include: TIME_ENTRY_INCLUDE,
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
      include: TIME_ENTRY_INCLUDE,
      orderBy: { clockInAt: 'desc' },
    });

    return entries.map((entry) => withPayroll(entry));
  }

  /// The raw row, payroll state and all. Callers that hand an entry back to a
  /// screen put it through `withPayroll` first.
  async findOne(id: string) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id },
      include: TIME_ENTRY_INCLUDE,
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
      include: TIME_ENTRY_INCLUDE,
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
      include: TIME_ENTRY_INCLUDE,
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
    entry: Prisma.TimeEntryGetPayload<{ include: typeof TIME_ENTRY_INCLUDE }>,
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
      include: TIME_ENTRY_INCLUDE,
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
      geofenceRadiusMeters: location.geofenceRadiusMeters,
      allowedIps: location.allowedIps,
      kioskEnabled: location.kioskEnabled,
      isActive: location.isActive,
    };
  }

  /// Attach the punch to the nearest scheduled shift, so "late" means something.
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
