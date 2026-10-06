import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TimeEntryStatus, VerificationMethod } from '@prisma/client';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  addDaysTo,
  localDateIn,
  practiceDayStart,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';

/**
 * Clocks out anybody still clocked in at midnight (October 2026, Dominguez:
 * "the goal is that the next day people are able to clock in, even if they
 * forgot to clock out the day prior").
 *
 * A punch begun on an earlier day in New Jersey and never closed is closed at
 * the **midnight that ended that day** — the time the app clocked them out,
 * recorded as it is, never a guess at when they really left. That is almost
 * always too late, so it is a warning both ways:
 *
 * - the entry is a **missing punch** for a manager to correct (listed on the
 *   Timesheet banner, the dashboard and the nightly email until corrected, and
 *   refused for approval until then — see `TimeEntriesService.approve`);
 * - the person is told, on the bell and by email, so they can say when they
 *   actually finished.
 *
 * With a shift or without one: the point is that nobody is stuck. It runs from
 * the outside timer and the nightly job for everybody, and for one person
 * whenever they open Home, clock in, or use the time clock — so a timer that
 * missed a night still never traps anybody on yesterday's punch.
 *
 * Each entry is closed with a compare-and-set (`clockOutAt: null`), so two
 * runs at once close it once and tell the person once.
 */
@Injectable()
export class AutoClockOutService {
  private readonly logger = new Logger(AutoClockOutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /// Closes every punch left open from before today — or only this person's.
  /// Returns how many it closed.
  async closeForgotten(options: { employeeId?: string; now?: Date } = {}): Promise<number> {
    const now = options.now ?? new Date();
    const stale = await this.prisma.timeEntry.findMany({
      where: {
        clockOutAt: null,
        clockInAt: { lt: practiceDayStart(now) },
        ...(options.employeeId ? { employeeId: options.employeeId } : {}),
      },
      select: { id: true, employeeId: true, clockInAt: true },
      orderBy: { clockInAt: 'asc' },
    });

    let closed = 0;
    for (const entry of stale) {
      const midnight = midnightAfter(entry.clockInAt);
      const updated = await this.prisma.timeEntry.updateMany({
        where: { id: entry.id, clockOutAt: null },
        data: {
          clockOutAt: midnight,
          clockOutVerification: VerificationMethod.MANUAL,
          status: TimeEntryStatus.NEEDS_REVIEW,
          isMissingPunch: true,
          isEarlyDeparture: false,
          autoClockedOutAt: now,
        } satisfies Prisma.TimeEntryUpdateManyMutationInput,
      });
      // Another run got there first; it has told them.
      if (updated.count === 0) continue;

      closed += 1;
      await this.notifications.autoClockedOut(entry.employeeId, {
        clockInAt: entry.clockInAt,
        clockOutAt: midnight,
      });
    }

    if (closed > 0) {
      this.logger.log(`Clocked out ${closed} punch(es) left open past midnight`);
    }
    return closed;
  }
}

/// The midnight that ended the New Jersey day `instant` fell on.
export function midnightAfter(instant: Date): Date {
  return zonedTimeToUtc(addDaysTo(localDateIn(instant, PRACTICE_ZONE), 1), '00:00', PRACTICE_ZONE);
}
