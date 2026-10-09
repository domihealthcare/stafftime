import { ShiftStatus } from '@prisma/client';
import { isoDate } from '../common/util/calendar-date.util';
import {
  addDaysTo,
  isoWeekdayOf,
  localDateIn,
  localTimeIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { onPattern, RepeatPattern } from './repeat-pattern';

/**
 * Smarter starting hours on a new shift (October 2026, Dominguez — making the
 * app smarter). Every shift form started on 9 to 5, so a person who always
 * works 7 to 3 at West New York meant retyping three things for every shift.
 * The form now starts on **their usual** for that day:
 *
 * 1. their **regular shift** that falls on that date, if they have one; else
 * 2. the hours and place they have worked **most often on that weekday** in
 *    the last eight weeks (at least twice), the latest winning a tie; else
 * 3. the same over **any day** of those eight weeks (at least three times);
 * 4. otherwise nothing — the form keeps 9 to 5.
 *
 * Only ever a starting point: the manager changes anything, and nothing is
 * stored. Pure: `loadUsualShift` reads.
 */

export const USUAL_WEEKS = 8;
export const SAME_WEEKDAY_AT_LEAST = 2;
export const ANY_DAY_AT_LEAST = 3;

export interface UsualShift {
  startTime: string;
  endTime: string;
  locationId: string;
  isRemote: boolean;
  jobRoleId: string | null;
  /// Where it came from, for the hint under the form.
  from: 'regular' | 'weekday' | 'recent';
}

export interface PastShiftTimes {
  /// "YYYY-MM-DD", New Jersey.
  date: string;
  startTime: string;
  endTime: string;
  locationId: string;
  isRemote: boolean;
  jobRoleId: string | null;
}

export interface RegularShiftTimes extends RepeatPattern {
  startTime: string;
  endTime: string;
  locationId: string;
  isRemote: boolean;
  jobRoleId: string | null;
  startsOn: string;
  endsOn: string | null;
}

export function usualShiftFor(
  date: string,
  regular: RegularShiftTimes[],
  past: PastShiftTimes[],
): UsualShift | null {
  const standing = regular.find(
    (series) =>
      series.startsOn <= date &&
      (series.endsOn === null || series.endsOn >= date) &&
      onPattern(date, series),
  );
  if (standing) {
    return {
      startTime: standing.startTime,
      endTime: standing.endTime,
      locationId: standing.locationId,
      isRemote: standing.isRemote,
      jobRoleId: standing.jobRoleId,
      from: 'regular',
    };
  }

  const weekday = isoWeekdayOf(date);
  const sameDay = mostCommon(past.filter((shift) => isoWeekdayOf(shift.date) === weekday));
  if (sameDay && sameDay.count >= SAME_WEEKDAY_AT_LEAST)
    return { ...sameDay.shift, from: 'weekday' };
  const anyDay = mostCommon(past);
  if (anyDay && anyDay.count >= ANY_DAY_AT_LEAST) return { ...anyDay.shift, from: 'recent' };
  return null;
}

function mostCommon(
  shifts: PastShiftTimes[],
): { shift: Omit<UsualShift, 'from'>; count: number } | null {
  const groups = new Map<string, { shift: PastShiftTimes; count: number; latest: string }>();
  for (const shift of shifts) {
    const key = [shift.startTime, shift.endTime, shift.locationId, shift.isRemote].join('|');
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { shift, count: 1, latest: shift.date });
    } else {
      group.count += 1;
      // The latest one's job role: it is the most likely to still be right.
      if (shift.date > group.latest) {
        group.latest = shift.date;
        group.shift = shift;
      }
    }
  }
  const best = [...groups.values()].sort(
    (a, b) => b.count - a.count || b.latest.localeCompare(a.latest),
  )[0];
  if (!best) return null;
  const { startTime, endTime, locationId, isRemote, jobRoleId } = best.shift;
  return { shift: { startTime, endTime, locationId, isRemote, jobRoleId }, count: best.count };
}

export async function loadUsualShift(
  prisma: PrismaService,
  employeeId: string,
  date: string,
): Promise<UsualShift | null> {
  const dateOnly = new Date(`${date}T00:00:00Z`);
  const [series, shifts] = await Promise.all([
    prisma.shiftSeries.findMany({
      where: {
        employeeId,
        startsOn: { lte: dateOnly },
        OR: [{ endsOn: null }, { endsOn: { gte: dateOnly } }],
      },
      select: {
        daysOfWeek: true,
        everyWeeks: true,
        weeksOfMonth: true,
        cycleFrom: true,
        startTime: true,
        endTime: true,
        locationId: true,
        isRemote: true,
        jobRoleId: true,
        startsOn: true,
        endsOn: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.shift.findMany({
      where: {
        employeeId,
        status: { not: ShiftStatus.CANCELLED },
        startsAt: {
          gte: zonedTimeToUtc(addDaysTo(date, -USUAL_WEEKS * 7), '00:00', PRACTICE_ZONE),
          lt: zonedTimeToUtc(date, '00:00', PRACTICE_ZONE),
        },
      },
      select: { startsAt: true, endsAt: true, locationId: true, isRemote: true, jobRoleId: true },
    }),
  ]);

  return usualShiftFor(
    date,
    series.map((row) => ({
      ...row,
      cycleFrom: row.cycleFrom ? isoDate(row.cycleFrom) : undefined,
      startsOn: isoDate(row.startsOn),
      endsOn: row.endsOn ? isoDate(row.endsOn) : null,
    })),
    shifts.map((row) => ({
      date: localDateIn(row.startsAt, PRACTICE_ZONE),
      startTime: localTimeIn(row.startsAt, PRACTICE_ZONE),
      endTime: localTimeIn(row.endsAt, PRACTICE_ZONE),
      locationId: row.locationId,
      isRemote: row.isRemote,
      jobRoleId: row.jobRoleId,
    })),
  );
}
