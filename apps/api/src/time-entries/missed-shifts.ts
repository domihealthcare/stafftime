import {
  EmploymentStatus,
  EventAudience,
  PracticeEventKind,
  PtoStatus,
  ShiftStatus,
} from '@prisma/client';
import { isoDate } from '../common/util/calendar-date.util';
import { localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Shifts nobody turned up for (October 2026, Dominguez — making the app
 * smarter). The person is reminded 15 minutes into a shift with no punch
 * ("You haven't clocked in yet"), but once the shift was over nothing told a
 * manager: a missed day was found at payroll, or not at all.
 *
 * A **published** shift with somebody on it, **over**, in the last two weeks,
 * with **no punch of theirs that day** (or overlapping it, for a shift past
 * midnight) — a hand entry counts, so "+ Add hours" settles it — and not on
 * **approved time off** that day, nor in a **closure** of its office when it
 * started. Current staff only: a leaver's shifts are already on their own list.
 *
 * Settled by what a manager would do anyway: add the hours by hand (they were
 * there and forgot), record the time off (they were off), or remove the shift
 * (it should never have been on the rota). Nothing new is stored.
 *
 * Pure: `loadMissedShifts` reads, `findMissedShifts` decides.
 */

export const MISSED_SHIFT_DAYS = 14;

export interface PastShift {
  id: string;
  employeeId: string;
  employeeName: string;
  locationId: string;
  locationName: string;
  isRemote: boolean;
  startsAt: Date;
  endsAt: Date;
}

export interface Punch {
  employeeId: string;
  clockInAt: Date;
  clockOutAt: Date | null;
}

export interface Leave {
  employeeId: string;
  /// Plain dates, "YYYY-MM-DD", both included.
  from: string;
  to: string;
}

export interface Closure {
  /// Null: both offices.
  locationId: string | null;
  startsAt: Date;
  endsAt: Date;
}

export function findMissedShifts(input: {
  now: Date;
  shifts: PastShift[];
  punches: Punch[];
  leave: Leave[];
  closures: Closure[];
}): PastShift[] {
  const now = input.now.getTime();
  return input.shifts
    .filter((shift) => shift.endsAt.getTime() <= now)
    .filter((shift) => {
      const day = localDateIn(shift.startsAt, PRACTICE_ZONE);
      const theirs = input.punches.filter((punch) => punch.employeeId === shift.employeeId);
      const clockedIn = theirs.some(
        (punch) =>
          localDateIn(punch.clockInAt, PRACTICE_ZONE) === day ||
          (punch.clockInAt < shift.endsAt &&
            (punch.clockOutAt?.getTime() ?? now) > shift.startsAt.getTime()),
      );
      if (clockedIn) return false;
      const off = input.leave.some(
        (leave) => leave.employeeId === shift.employeeId && leave.from <= day && leave.to >= day,
      );
      if (off) return false;
      const closed = input.closures.some(
        (closure) =>
          (closure.locationId === null || closure.locationId === shift.locationId) &&
          closure.startsAt <= shift.startsAt &&
          closure.endsAt > shift.startsAt,
      );
      return !closed;
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/// "Frankie Front-Desk — Tue, Oct 6, 9:00 AM–5:00 PM at North Bergen".
export function describeMissedShift(shift: PastShift): string {
  const day = shift.startsAt.toLocaleDateString('en-US', {
    timeZone: PRACTICE_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = (instant: Date) =>
    instant.toLocaleTimeString('en-US', {
      timeZone: PRACTICE_ZONE,
      hour: 'numeric',
      minute: '2-digit',
    });
  const where = shift.isRemote ? 'working from home' : `at ${shift.locationName}`;
  return `${shift.employeeName} — ${day}, ${time(shift.startsAt)}–${time(shift.endsAt)} ${where}`;
}

export async function loadMissedShifts(
  prisma: PrismaService,
  now: Date = new Date(),
): Promise<PastShift[]> {
  const since = new Date(now.getTime() - MISSED_SHIFT_DAYS * 86_400_000);
  const rows = await prisma.shift.findMany({
    where: {
      status: ShiftStatus.PUBLISHED,
      employeeId: { not: null },
      employee: { employmentStatus: { not: EmploymentStatus.TERMINATED } },
      endsAt: { gte: since, lte: now },
    },
    select: {
      id: true,
      employeeId: true,
      locationId: true,
      isRemote: true,
      startsAt: true,
      endsAt: true,
      location: { select: { name: true } },
      employee: { select: { firstName: true, preferredName: true, lastName: true } },
    },
  });
  if (rows.length === 0) return [];

  const employeeIds = [...new Set(rows.map((row) => row.employeeId as string))];
  // A day either side, for a punch on the shift's day in New Jersey whatever
  // the server's clock, and one begun the evening before a shift past midnight.
  const from = new Date(since.getTime() - 2 * 86_400_000);
  const [punches, leave, closures] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { employeeId: { in: employeeIds }, clockInAt: { gte: from, lte: now } },
      select: { employeeId: true, clockInAt: true, clockOutAt: true },
    }),
    prisma.ptoRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: PtoStatus.APPROVED,
        endDate: { gte: from },
        startDate: { lte: now },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
    prisma.practiceEvent.findMany({
      where: {
        kind: PracticeEventKind.CLOSURE,
        endsAt: { gte: from },
        startsAt: { lte: now },
      },
      select: { audience: true, locationId: true, startsAt: true, endsAt: true },
    }),
  ]);

  return findMissedShifts({
    now,
    shifts: rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId as string,
      employeeName: `${row.employee?.preferredName ?? row.employee?.firstName} ${row.employee?.lastName}`,
      locationId: row.locationId,
      locationName: row.location.name,
      isRemote: row.isRemote,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    })),
    punches,
    leave: leave.map((row) => ({
      employeeId: row.employeeId,
      from: isoDate(row.startDate),
      to: isoDate(row.endDate),
    })),
    closures: closures.map((row) => ({
      locationId: row.audience === EventAudience.LOCATION ? row.locationId : null,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    })),
  });
}
