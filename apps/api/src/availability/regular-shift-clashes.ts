import { EmploymentStatus, UnavailabilityKind } from '@prisma/client';
import { isoDate } from '../common/util/calendar-date.util';
import { addDaysTo, localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { onPattern, patternPhrase, RepeatPattern } from '../shifts/repeat-pattern';
import { appliesOn, describe, overlaps, Rule, twelveHour } from './availability.rules';

/**
 * Availability that clashes with a regular shift (October 2026, Dominguez —
 * making the app smarter). Somebody with a regular Monday shift can say they
 * are no longer free on Mondays; availability needs no approval, so nothing
 * stopped it, and nobody found out until the rota for that week was built —
 * or the shift, written out weeks ahead, was simply not worked.
 *
 * For each regular shift with somebody on it, still running, every date it
 * falls on in the next eight weeks (as far ahead as regular shifts are written
 * out) is checked against that person's availability, by the same rules the
 * scheduler warns with (`availability.rules.ts`). One line per regular shift
 * and rule, with the first date they meet.
 *
 * Warns, never changes anything: the manager decides whether the regular shift
 * ends, moves, or the person is asked about it. Pure, with `loadRegularShiftClashes`
 * doing the reading.
 */

export const CLASH_DAYS_AHEAD = 56;

export interface RegularShift extends RepeatPattern {
  id: string;
  employeeId: string;
  employeeName: string;
  locationName: string;
  isRemote: boolean;
  /// "08:00", the office's own clock.
  startTime: string;
  endTime: string;
  startsOn: string;
  endsOn: string | null;
}

export interface PersonRule extends Rule {
  id: string;
  employeeId: string;
}

export interface RegularShiftClash {
  shift: RegularShift;
  rule: PersonRule;
  /// The first date in the window they meet.
  firstDate: string;
}

export function regularShiftClashes(
  shifts: RegularShift[],
  rules: PersonRule[],
  today: string,
  daysAhead = CLASH_DAYS_AHEAD,
): RegularShiftClash[] {
  const clashes: RegularShiftClash[] = [];
  const horizon = addDaysTo(today, daysAhead - 1);
  for (const shift of shifts) {
    const theirs = rules.filter((rule) => rule.employeeId === shift.employeeId);
    if (theirs.length === 0) continue;
    const from = shift.startsOn > today ? shift.startsOn : today;
    const to = shift.endsOn && shift.endsOn < horizon ? shift.endsOn : horizon;
    // A shift past midnight counts until the end of its first day, the day a
    // rule is about — as the scheduler does.
    const endTime = shift.endTime <= shift.startTime ? '24:00' : shift.endTime;
    const met = new Map<string, string>();
    for (let date = from; date <= to; date = addDaysTo(date, 1)) {
      if (!onPattern(date, shift)) continue;
      for (const rule of theirs) {
        if (met.has(rule.id)) continue;
        if (
          appliesOn(rule, date) &&
          overlaps(rule, { date, startTime: shift.startTime, endTime })
        ) {
          met.set(rule.id, date);
        }
      }
    }
    for (const rule of theirs) {
      const firstDate = met.get(rule.id);
      if (firstDate) clashes.push({ shift, rule, firstDate });
    }
  }
  return clashes.sort(
    (a, b) =>
      a.firstDate.localeCompare(b.firstDate) ||
      a.shift.employeeName.localeCompare(b.shift.employeeName),
  );
}

/// "Frankie Front-Desk — regular Mondays 9:00 AM–5:00 PM at North Bergen, but
/// not available Mondays, 3:00 PM–9:00 PM (from Mon, Oct 19)".
export function describeRegularShiftClash(clash: RegularShiftClash): string {
  const { shift } = clash;
  const where = shift.isRemote ? 'working from home' : `at ${shift.locationName}`;
  const rule = describe(clash.rule);
  const from = new Date(`${clash.firstDate}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${shift.employeeName} — regular ${patternPhrase(shift)} ${twelveHour(
    shift.startTime,
  )}–${twelveHour(shift.endTime)} ${where}, but ${rule.charAt(0).toLowerCase()}${rule.slice(
    1,
  )} (from ${from})`;
}

/// Everybody's, or one person's.
export async function loadRegularShiftClashes(
  prisma: PrismaService,
  now: Date = new Date(),
  employeeId?: string,
): Promise<RegularShiftClash[]> {
  const today = localDateIn(now, PRACTICE_ZONE);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const series = await prisma.shiftSeries.findMany({
    where: {
      employeeId: employeeId ?? { not: null },
      employee: { employmentStatus: { not: EmploymentStatus.TERMINATED } },
      OR: [{ endsOn: null }, { endsOn: { gte: todayDate } }],
    },
    select: {
      id: true,
      employeeId: true,
      isRemote: true,
      daysOfWeek: true,
      everyWeeks: true,
      weeksOfMonth: true,
      cycleFrom: true,
      startTime: true,
      endTime: true,
      startsOn: true,
      endsOn: true,
      location: { select: { name: true } },
      employee: { select: { firstName: true, preferredName: true, lastName: true } },
    },
  });
  if (series.length === 0) return [];

  const rows = await prisma.unavailability.findMany({
    where: {
      employeeId: { in: [...new Set(series.map((row) => row.employeeId as string))] },
      OR: [
        { kind: UnavailabilityKind.ONE_OFF, date: { gte: todayDate } },
        {
          kind: UnavailabilityKind.WEEKLY,
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: todayDate } }],
        },
      ],
    },
  });

  return regularShiftClashes(
    series.map((row) => ({
      id: row.id,
      employeeId: row.employeeId as string,
      employeeName: `${row.employee?.preferredName ?? row.employee?.firstName} ${row.employee?.lastName}`,
      locationName: row.location.name,
      isRemote: row.isRemote,
      daysOfWeek: row.daysOfWeek,
      everyWeeks: row.everyWeeks,
      weeksOfMonth: row.weeksOfMonth,
      cycleFrom: row.cycleFrom ? isoDate(row.cycleFrom) : undefined,
      startTime: row.startTime,
      endTime: row.endTime,
      startsOn: isoDate(row.startsOn),
      endsOn: row.endsOn ? isoDate(row.endsOn) : null,
    })),
    rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      kind: row.kind,
      weekday: row.weekday,
      date: row.date ? isoDate(row.date) : null,
      startTime: row.startTime,
      endTime: row.endTime,
      effectiveFrom: isoDate(row.effectiveFrom),
      effectiveUntil: row.effectiveUntil ? isoDate(row.effectiveUntil) : null,
    })),
    today,
  );
}
