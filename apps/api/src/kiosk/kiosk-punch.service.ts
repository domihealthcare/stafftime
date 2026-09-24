import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClockMethod, EmploymentStatus } from '@prisma/client';
import { ApplicableSection, ClosingService } from '../closing/closing.service';
import type { ClosingSubmissionDto } from '../closing/dto/closing.dto';
import { PrismaService } from '../prisma/prisma.service';
import { TimeEntriesService } from '../time-entries/time-entries.service';
import { PinService } from './pin.service';
import type { PairedDevice } from './kiosk.service';

/// One message for every PIN failure. Which employee has a PIN, and whether a
/// given PIN is close, are both things a bystander at the front desk should not
/// be able to learn.
const PIN_REJECTED = 'That PIN was not recognised. Try again or ask a manager.';

/// CHECKLIST: nothing was punched — this person is clocking out and has a
/// closing checklist to fill in first. The tablet shows it, then sends the PIN
/// again with the answers.
export type PunchAction = 'CLOCKED_IN' | 'CLOCKED_OUT' | 'CHECKLIST';

export interface PunchResult {
  action: PunchAction;
  employeeName: string;
  at: string;
  locationName: string;
  /// Present on a clock-out: how long the shift ran.
  workedMinutes?: number;
  isLate: boolean;
  /// Present with CHECKLIST.
  checklist?: ApplicableSection[];
}

@Injectable()
export class KioskPunchService {
  private readonly logger = new Logger(KioskPunchService.name);
  private readonly maxAttempts: number;
  private readonly lockoutMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pins: PinService,
    private readonly timeEntries: TimeEntriesService,
    config: ConfigService,
    private readonly closing: ClosingService,
  ) {
    this.maxAttempts = config.get<number>('MAX_PIN_ATTEMPTS', 5);
    this.lockoutMinutes = config.get<number>('PIN_LOCKOUT_MINUTES', 10);
  }

  /**
   * Verifies the PIN and toggles the employee's clock.
   *
   * One call does both on purpose: there is no intermediate "PIN accepted"
   * state for someone to walk up to and inherit at a shared tablet.
   */
  async punch(
    device: PairedDevice,
    employeeId: string,
    pin: string,
    closing?: ClosingSubmissionDto,
  ): Promise<PunchResult> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        firstName: true,
        preferredName: true,
        lastName: true,
        pinHash: true,
        employmentStatus: true,
        pinFailedAttempts: true,
        pinLockedUntil: true,
        locations: { select: { locationId: true } },
      },
    });

    // Same work and the same answer whether or not this employee exists or has
    // a PIN, so the keypad cannot be used to enumerate staff.
    if (!employee?.pinHash) {
      await this.pins.verify(pin, DUMMY_PIN_HASH);
      throw new UnauthorizedException(PIN_REJECTED);
    }

    if (employee.pinLockedUntil && employee.pinLockedUntil > new Date()) {
      const minutes = Math.max(
        1,
        Math.ceil((employee.pinLockedUntil.getTime() - Date.now()) / 60_000),
      );
      throw new UnauthorizedException(
        `Too many incorrect PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or ask a manager.`,
      );
    }

    const correct = await this.pins.verify(pin, employee.pinHash);
    if (!correct) {
      await this.recordPinFailure(employee.id, employee.pinFailedAttempts);
      throw new UnauthorizedException(PIN_REJECTED);
    }

    // Checked only after the PIN is proven, so the keypad cannot be used to
    // find out who still works here.
    if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
      throw new ForbiddenException('This account is not active. Please speak to a manager.');
    }

    if (!employee.locations.some((l) => l.locationId === device.locationId)) {
      throw new ForbiddenException(`You are not assigned to ${device.locationName}.`);
    }

    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { pinFailedAttempts: 0, pinLockedUntil: null },
    });

    const displayName = employee.preferredName ?? employee.firstName;
    const open = await this.prisma.timeEntry.findFirst({
      where: { employeeId: employee.id, clockOutAt: null },
      select: { id: true, clockInAt: true, locationId: true },
    });

    // The kiosk acts for the employee, so it is its own actor: it can punch for
    // this person and nothing else.
    const actor = { id: employee.id, email: '', role: 'EMPLOYEE' as const };

    if (open) {
      // The checklist comes before the punch, not after: a person walking away
      // from a shared tablet mid-checklist leaves nothing half-done behind.
      // Nothing is held on the server between the two calls — the second one
      // proves the PIN again.
      if (!closing) {
        const checklist = await this.closing.applicableFor(employee.id, open.locationId);
        if (checklist.length > 0) {
          return {
            action: 'CHECKLIST',
            employeeName: displayName,
            at: new Date().toISOString(),
            locationName: device.locationName,
            isLate: false,
            checklist,
          };
        }
      }
      const entry = await this.timeEntries.clockOut({ closing }, actor, undefined, employee.id);
      this.logger.log(`Kiosk ${device.deviceId}: ${employee.id} clocked out`);
      return {
        action: 'CLOCKED_OUT',
        employeeName: displayName,
        at: (entry.clockOutAt ?? new Date()).toISOString(),
        locationName: device.locationName,
        workedMinutes: Math.round(
          ((entry.clockOutAt ?? new Date()).getTime() - entry.clockInAt.getTime()) / 60_000,
        ),
        isLate: entry.isLate,
      };
    }

    const entry = await this.timeEntries.clockIn(
      { locationId: device.locationId, method: ClockMethod.KIOSK, employeeId: employee.id },
      actor,
      undefined,
    );
    this.logger.log(`Kiosk ${device.deviceId}: ${employee.id} clocked in`);

    return {
      action: 'CLOCKED_IN',
      employeeName: displayName,
      at: entry.clockInAt.toISOString(),
      locationName: device.locationName,
      isLate: entry.isLate,
    };
  }

  /// An administrator setting or clearing an employee's kiosk PIN.
  async setPin(employeeId: string, pin: string): Promise<void> {
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        pinHash: await this.pins.hash(pin),
        pinUpdatedAt: new Date(),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    });
    this.logger.log(`Kiosk PIN set for employee ${employeeId}`);
  }

  async clearPin(employeeId: string): Promise<void> {
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        pinHash: null,
        pinUpdatedAt: null,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    });
    this.logger.log(`Kiosk PIN cleared for employee ${employeeId}`);
  }

  private async recordPinFailure(employeeId: string, previousFailures: number): Promise<void> {
    const attempts = previousFailures + 1;
    const locked = attempts >= this.maxAttempts;

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        pinFailedAttempts: attempts,
        pinLockedUntil: locked ? new Date(Date.now() + this.lockoutMinutes * 60_000) : null,
      },
    });

    if (locked) {
      this.logger.warn(`Employee ${employeeId} kiosk-locked after ${attempts} wrong PINs`);
    }
  }
}

/// A real argon2 hash of a PIN nobody knows, so a nonexistent account costs the
/// same time as a real one.
const DUMMY_PIN_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$5RsaKm/t9r/Kwve5BISw2w$yxDFdiawGe40y5bO2tSBYB0AEjBpI9A9cVEAqKVXycQ';
