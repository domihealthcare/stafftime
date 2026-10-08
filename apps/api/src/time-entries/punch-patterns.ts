import { EmploymentStatus } from '@prisma/client';
import { addUtcDays } from '../common/util/calendar-date.util';
import {
  addDaysTo,
  isoWeekdayOf,
  localDateIn,
  practiceDayStart,
} from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Patterns in somebody's punches (Dominguez, October 2026 — making the app
 * smarter, with the defaults proposed and agreed): not one late clock-in,
 * which the timesheet already flags, but the same thing again and again.
 *
 * - **Late** 3 or more times in the last 4 weeks — and if 3 of them fall on
 *   the same weekday in a row ("3 Mondays running"), it says so, because that
 *   usually has a reason worth finding (a bus, a school run, a shift that
 *   starts too early).
 * - **Missed clock-outs** 2 or more times: clocked out by the app at midnight,
 *   or a punch still open from an earlier day.
 * - **Leaving early** 2 or more times.
 *
 * Managers only, on the Dashboard and in the nightly email's "when you have
 * a minute" — never a banner, and the person is not told: it is a quiet
 * heads-up to have a word, not a verdict. Read from the flags the timesheet
 * already sets (with its grace minutes), so the two always agree. Hours
 * entered by hand are not punches and are left out.
 */
export const PATTERN_WINDOW_DAYS = 28;
export const LATE_TIMES = 3;
export const MISSED_CLOCK_OUT_TIMES = 2;
export const EARLY_TIMES = 2;
/// "3 Mondays running".
export const SAME_WEEKDAY_RUN = 3;

export type PatternKind = 'late' | 'missed-clock-out' | 'early';

export interface PunchPattern {
  employeeId: string;
  employeeName: string;
  kind: PatternKind;
  count: number;
  /// The local dates it happened, oldest first.
  dates: string[];
  /// "Late 4 times in the last 4 weeks, 3 Mondays running".
  summary: string;
}

/// One punch, reduced to what the patterns need.
export interface PatternEntry {
  employeeId: string;
  employeeName: string;
  /// The local date it was clocked in on.
  date: string;
  isLate: boolean;
  isEarlyDeparture: boolean;
  /// Clocked out by the app at midnight, or still open from an earlier day.
  missedClockOut: boolean;
}

const WEEKDAYS = [
  '',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
  'Sundays',
];

const ORDER: Record<PatternKind, number> = { late: 0, 'missed-clock-out': 1, early: 2 };

/// The patterns in these punches, most repeated first.
export function findPunchPatterns(entries: PatternEntry[]): PunchPattern[] {
  const byPerson = new Map<string, PatternEntry[]>();
  for (const entry of entries) {
    byPerson.set(entry.employeeId, [...(byPerson.get(entry.employeeId) ?? []), entry]);
  }

  const patterns: PunchPattern[] = [];
  for (const [employeeId, theirs] of byPerson) {
    const employeeName = theirs[0].employeeName;
    const datesOf = (test: (entry: PatternEntry) => boolean) =>
      [...new Set(theirs.filter(test).map((entry) => entry.date))].sort();
    // Counted once a day: two punches late on one split-shift day are one late day.
    const late = datesOf((entry) => entry.isLate);
    const missed = datesOf((entry) => entry.missedClockOut);
    const early = datesOf((entry) => entry.isEarlyDeparture && !entry.missedClockOut);

    if (late.length >= LATE_TIMES) {
      const run = longestWeekdayRun(late);
      patterns.push({
        employeeId,
        employeeName,
        kind: 'late',
        count: late.length,
        dates: late,
        summary:
          `Late ${times(late.length)} in the last 4 weeks` +
          (run.length >= SAME_WEEKDAY_RUN
            ? `, ${run.length} ${WEEKDAYS[run.weekday]} running`
            : ''),
      });
    }
    if (missed.length >= MISSED_CLOCK_OUT_TIMES) {
      patterns.push({
        employeeId,
        employeeName,
        kind: 'missed-clock-out',
        count: missed.length,
        dates: missed,
        summary: `Forgot to clock out ${times(missed.length)} in the last 4 weeks`,
      });
    }
    if (early.length >= EARLY_TIMES) {
      patterns.push({
        employeeId,
        employeeName,
        kind: 'early',
        count: early.length,
        dates: early,
        summary: `Left early ${times(early.length)} in the last 4 weeks`,
      });
    }
  }

  return patterns.sort(
    (a, b) =>
      b.count - a.count ||
      ORDER[a.kind] - ORDER[b.kind] ||
      a.employeeName.localeCompare(b.employeeName),
  );
}

/// The longest run of the same weekday a week apart: Mon 5th, 12th, 19th.
export function longestWeekdayRun(dates: string[]): { weekday: number; length: number } {
  const set = new Set(dates);
  let best = { weekday: 0, length: 0 };
  for (const date of dates) {
    // Only count from the start of a run.
    if (set.has(addDaysTo(date, -7))) continue;
    let length = 1;
    while (set.has(addDaysTo(date, 7 * length))) length += 1;
    if (length > best.length) best = { weekday: isoWeekdayOf(date), length };
  }
  return best;
}

function times(count: number): string {
  return count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`;
}

/// Reads the last four weeks' punches for current staff and finds the patterns.
/// Shared by the Dashboard and the nightly round-up, so they cannot disagree.
export async function loadPunchPatterns(prisma: PrismaService): Promise<PunchPattern[]> {
  const dayStart = practiceDayStart();
  const rows = await prisma.timeEntry.findMany({
    where: {
      clockInAt: { gte: addUtcDays(dayStart, -PATTERN_WINDOW_DAYS), lt: dayStart },
      enteredByHandAt: null,
      employee: { employmentStatus: EmploymentStatus.ACTIVE },
      OR: [
        { isLate: true },
        { isEarlyDeparture: true },
        { autoClockedOutAt: { not: null } },
        { clockOutAt: null },
      ],
    },
    select: {
      employeeId: true,
      clockInAt: true,
      clockOutAt: true,
      autoClockedOutAt: true,
      isLate: true,
      isEarlyDeparture: true,
      location: { select: { timezone: true } },
      employee: { select: { firstName: true, preferredName: true, lastName: true } },
    },
  });
  return findPunchPatterns(
    rows.map((row) => ({
      employeeId: row.employeeId,
      employeeName: `${row.employee.preferredName ?? row.employee.firstName} ${row.employee.lastName}`,
      date: localDateIn(row.clockInAt, row.location.timezone),
      isLate: row.isLate,
      isEarlyDeparture: row.isEarlyDeparture,
      missedClockOut: row.autoClockedOutAt !== null || row.clockOutAt === null,
    })),
  );
}
