import { Injectable, Logger } from '@nestjs/common';
import {
  EmploymentStatus,
  EventAudience,
  PracticeEventKind,
  Prisma,
  PtoStatus,
  PunchReminderKind,
  ShiftStatus,
} from '@prisma/client';
import { NotificationsService } from '../email/notifications.service';
import { AutoClockOutService } from '../time-entries/auto-clock-out.service';
import { LunchNoticesService } from '../events/lunch-notices.service';
import { LicenseRemindersService } from './license-reminders.service';
import { OnboardingRemindersService } from './onboarding-reminders.service';
import { PrismaService } from '../prisma/prisma.service';
import { localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { toUtcDate } from '../common/util/calendar-date.util';

/// How long after a shift starts (or ends) somebody is reminded to clock in
/// (or out). Dominguez, October 2026: "notify the person, 15 minutes after".
export const PUNCH_REMINDER_AFTER_MINUTES = 15;

/// Nothing is said about a shift that started — or ended — longer ago than
/// this. The first check after this goes live, or after the timer was off for
/// a while, must not dig up the morning's shifts and send a pile of stale
/// reminders at once.
export const PUNCH_REMINDER_LOOKBACK_MINUTES = 120;

/// A shift starting this soon counts as the one they are on: somebody working
/// 8–12 and 12:30–5 who stayed clocked in over lunch is not told to clock out.
const NEXT_SHIFT_MINUTES = 30;

/// How far back an open punch is looked at. A punch older than a day is
/// already on the managers' list of missing clock-outs.
const OPEN_PUNCH_HOURS = 24;

export interface PunchReminderReport {
  /// People told they have not clocked in for a shift that has started.
  clockIn: number;
  /// People told they are still clocked in after their shift ended.
  clockOut: number;
  /// Punches left open past midnight, closed at that midnight (and the person
  /// told) — see `AutoClockOutService`.
  autoClockedOut: number;
  /// Offices told this evening about tomorrow's rep lunch, or that there is
  /// none — see `LunchNoticesService`.
  lunchNotices: number;
  /// People told a license of theirs runs out soon, or has — see
  /// `LicenseRemindersService`. Also run nightly; each is sent once.
  licenseReminders: number;
  /// New hires told a task of theirs on their onboarding checklist is due
  /// soon, or overdue — see `OnboardingRemindersService`. Also run nightly.
  onboardingReminders: number;
}

/**
 * Reminders to the person themselves (October 2026, Dominguez): "You haven't
 * clocked in" 15 minutes into a published shift with no punch, and "You're
 * still clocked in" 15 minutes after it ends. By email and on the bell.
 *
 * Run every few minutes by an outside timer (`GET /api/maintenance/punch-
 * reminders`), because Vercel's free plan only runs its own timer once a
 * day. Each shift is reminded about at most once for each kind: the reminder
 * is recorded (`PunchReminder`) before anything is sent, so a slow run and the
 * next one cannot both send it.
 *
 * Only ever about a **published** shift with somebody on it. Nothing is said
 * on approved time off or when the office is closed, and a punch with no
 * shift has nothing to measure against, so it is left to the managers' list.
 */
@Injectable()
export class PunchRemindersService {
  private readonly logger = new Logger(PunchRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly autoClockOut: AutoClockOutService,
    private readonly lunchNotices: LunchNoticesService,
    private readonly licenseReminders: LicenseRemindersService,
    private readonly onboardingReminders: OnboardingRemindersService,
  ) {}

  async run(now: Date = new Date()): Promise<PunchReminderReport> {
    const report = {
      // First, so last night's forgotten punch does not count as clocked in
      // for this morning's shift.
      autoClockedOut: await this.autoClockOut.closeForgotten({ now }),
      clockIn: await this.remindToClockIn(now),
      clockOut: await this.remindToClockOut(now),
      // In the evening: tomorrow's rep lunch, or none, to each office.
      lunchNotices: await this.lunchNotices.send(now),
      // During the day rather than with the 5am round-up; the nightly job
      // sends any this timer missed.
      licenseReminders: await this.licenseReminders.send(now),
      onboardingReminders: await this.onboardingReminders.send(now),
    };
    if (report.clockIn || report.clockOut) {
      this.logger.log(`Reminded ${report.clockIn} to clock in and ${report.clockOut} to clock out`);
    }
    return report;
  }

  /// Shifts that started 15 minutes ago or more, are still going, and have no
  /// punch from the person on them.
  private async remindToClockIn(now: Date): Promise<number> {
    const shifts = await this.prisma.shift.findMany({
      where: {
        status: ShiftStatus.PUBLISHED,
        employeeId: { not: null },
        employee: { employmentStatus: EmploymentStatus.ACTIVE },
        startsAt: { gte: minutesBefore(now, PUNCH_REMINDER_LOOKBACK_MINUTES), lte: due(now) },
        endsAt: { gt: now },
        reminders: { none: { kind: PunchReminderKind.CLOCK_IN } },
      },
      select: {
        id: true,
        employeeId: true,
        locationId: true,
        startsAt: true,
        isRemote: true,
        location: { select: { name: true } },
      },
      orderBy: { startsAt: 'asc' },
    });

    let sent = 0;
    for (const shift of shifts) {
      const employeeId = shift.employeeId as string;
      if (await this.hasPunchFor(employeeId, shift.startsAt, now)) continue;
      if (await this.onLeave(employeeId, shift.startsAt)) continue;
      if (await this.closed(shift.locationId, shift.startsAt)) continue;
      if (!(await this.claim(shift.id, PunchReminderKind.CLOCK_IN))) continue;

      await this.notifications.missedClockIn(employeeId, {
        startsAt: shift.startsAt,
        isRemote: shift.isRemote,
        locationName: shift.location.name,
      });
      sent += 1;
    }
    return sent;
  }

  /// Open punches whose shift ended 15 minutes ago or more, with no other
  /// shift of theirs going on or about to start.
  private async remindToClockOut(now: Date): Promise<number> {
    const open = await this.prisma.timeEntry.findMany({
      where: {
        clockOutAt: null,
        clockInAt: { gte: minutesBefore(now, OPEN_PUNCH_HOURS * 60) },
        employee: { employmentStatus: EmploymentStatus.ACTIVE },
      },
      select: { employeeId: true, clockInAt: true },
      orderBy: { clockInAt: 'asc' },
    });

    let sent = 0;
    for (const entry of open) {
      // Their published shifts since they clocked in, up to one about to
      // start: the latest to end is the one they are clocked in for.
      const shifts = await this.prisma.shift.findMany({
        where: {
          employeeId: entry.employeeId,
          status: ShiftStatus.PUBLISHED,
          endsAt: { gt: entry.clockInAt },
          startsAt: { lte: minutesAfter(now, NEXT_SHIFT_MINUTES) },
        },
        select: {
          id: true,
          endsAt: true,
          isRemote: true,
          location: { select: { name: true } },
          reminders: { where: { kind: PunchReminderKind.CLOCK_OUT }, select: { id: true } },
        },
        orderBy: { endsAt: 'desc' },
      });

      const last = shifts[0];
      // No shift: nothing to measure against. Still on, or less than 15
      // minutes over: nothing to say yet.
      if (!last || last.endsAt > due(now)) continue;
      if (last.endsAt < minutesBefore(now, PUNCH_REMINDER_LOOKBACK_MINUTES)) continue;
      if (last.reminders.length > 0) continue;
      if (!(await this.claim(last.id, PunchReminderKind.CLOCK_OUT))) continue;

      await this.notifications.missedClockOut(entry.employeeId, {
        endsAt: last.endsAt,
        isRemote: last.isRemote,
        locationName: last.location.name,
      });
      sent += 1;
    }
    return sent;
  }

  /// Clocked in for it: a punch that began before now and was still going at
  /// the shift's start, or began after it. An open punch from earlier counts
  /// too — they cannot clock in again until it is closed, so telling them to
  /// would be no help.
  private async hasPunchFor(employeeId: string, startsAt: Date, now: Date): Promise<boolean> {
    const count = await this.prisma.timeEntry.count({
      where: {
        employeeId,
        clockInAt: { lte: now },
        OR: [{ clockOutAt: null }, { clockOutAt: { gt: startsAt } }],
      },
    });
    return count > 0;
  }

  /// Approved time off on the day the shift starts, in New Jersey. A shift
  /// left on a day off is the manager's to tidy up, not a reason to nag.
  private async onLeave(employeeId: string, startsAt: Date): Promise<boolean> {
    const day = toUtcDate(localDateIn(startsAt, PRACTICE_ZONE));
    const count = await this.prisma.ptoRequest.count({
      where: {
        employeeId,
        status: PtoStatus.APPROVED,
        startDate: { lte: day },
        endDate: { gte: day },
      },
    });
    return count > 0;
  }

  /// The office — or both — closed when the shift starts.
  private async closed(locationId: string, startsAt: Date): Promise<boolean> {
    const count = await this.prisma.practiceEvent.count({
      where: {
        kind: PracticeEventKind.CLOSURE,
        startsAt: { lte: startsAt },
        endsAt: { gt: startsAt },
        OR: [{ audience: { not: EventAudience.LOCATION } }, { locationId }],
      },
    });
    return count > 0;
  }

  /// Records the reminder, or reports that another run already has.
  private async claim(shiftId: string, kind: PunchReminderKind): Promise<boolean> {
    try {
      await this.prisma.punchReminder.create({ data: { shiftId, kind } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }
}

function due(now: Date): Date {
  return minutesBefore(now, PUNCH_REMINDER_AFTER_MINUTES);
}

function minutesBefore(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

function minutesAfter(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60_000);
}
