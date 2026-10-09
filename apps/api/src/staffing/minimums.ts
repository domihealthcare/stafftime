import { EventAudience, PracticeEventKind, ShiftStatus } from '@prisma/client';
import {
  addDaysTo,
  localDateIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { shortDate } from '../pto/time-off-clashes';

/**
 * A minimum per office per job role (October 2026, Dominguez — making the app
 * smarter): "North Bergen needs at least 2 Front Desk". Optional, set by
 * managers on Job roles (`StaffingMinimum`). Where one is set:
 *
 * - **Too many off at once** goes by it — a clash is time off that leaves
 *   fewer than the minimum — instead of "more than half" (`time-off-clashes.ts`).
 * - **Short days on the rota**: a day the office is open (it has a shift on
 *   the rota, and is not closed at noon) with fewer people on in that job role
 *   than the minimum. A person counts once, under the job role of their shift
 *   (or their main role, for a shift saved without one), at the office of the
 *   shift; working from home does not count, nor open shifts with nobody on.
 *   Drafts count, as on the rota. On the Schedule banner and in the nightly
 *   email for the next two weeks, and in Before you publish.
 *
 * Warns, never refuses. Pure: `loadShortDays` reads.
 */

export const SHORT_DAYS_AHEAD = 14;

export interface Minimum {
  locationId: string;
  locationName: string;
  jobRoleId: string;
  jobRoleName: string;
  jobRoleOrder: number;
  minimum: number;
}

export interface OnDuty {
  employeeId: string;
  locationId: string;
  jobRoleId: string | null;
  /// "YYYY-MM-DD", the office's day.
  date: string;
}

export interface ShortDay {
  date: string;
  locationId: string;
  locationName: string;
  jobRoleId: string;
  jobRoleName: string;
  minimum: number;
  /// How many are on in that role that day.
  scheduled: number;
}

export function findShortDays(
  minimums: Minimum[],
  onDuty: OnDuty[],
  /// The days each office is open, in order.
  openDays: (locationId: string) => string[],
): ShortDay[] {
  const out: ShortDay[] = [];
  for (const rule of minimums) {
    for (const date of openDays(rule.locationId)) {
      const people = new Set(
        onDuty
          .filter(
            (duty) =>
              duty.date === date &&
              duty.locationId === rule.locationId &&
              duty.jobRoleId === rule.jobRoleId,
          )
          .map((duty) => duty.employeeId),
      );
      if (people.size < rule.minimum) {
        out.push({
          date,
          locationId: rule.locationId,
          locationName: rule.locationName,
          jobRoleId: rule.jobRoleId,
          jobRoleName: rule.jobRoleName,
          minimum: rule.minimum,
          scheduled: people.size,
        });
      }
    }
  }
  const order = new Map(minimums.map((rule) => [rule.jobRoleId, rule.jobRoleOrder]));
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.locationName.localeCompare(b.locationName) ||
      (order.get(a.jobRoleId) ?? 0) - (order.get(b.jobRoleId) ?? 0),
  );
}

/// "North Bergen, Tue, Oct 13: 1 in Front Desk on the rota, minimum 2".
export function describeShortDay(day: ShortDay): string {
  const on = day.scheduled === 0 ? 'nobody' : String(day.scheduled);
  return `${day.locationName}, ${shortDate(day.date)}: ${on} in ${day.jobRoleName} on the rota, minimum ${day.minimum}`;
}

export async function loadMinimums(prisma: PrismaService): Promise<Minimum[]> {
  const rows = await prisma.staffingMinimum.findMany({
    select: {
      locationId: true,
      jobRoleId: true,
      minimum: true,
      location: { select: { name: true } },
      jobRole: { select: { name: true, sortOrder: true } },
    },
  });
  return rows.map((row) => ({
    locationId: row.locationId,
    locationName: row.location.name,
    jobRoleId: row.jobRoleId,
    jobRoleName: row.jobRole.name,
    jobRoleOrder: row.jobRole.sortOrder,
    minimum: row.minimum,
  }));
}

/// The short days from `from` to `to` (plain dates, both included), at the
/// offices given or all of them.
export async function loadShortDays(
  prisma: PrismaService,
  from: string,
  to: string,
  locationIds?: string[],
): Promise<ShortDay[]> {
  let minimums = await loadMinimums(prisma);
  if (locationIds) minimums = minimums.filter((rule) => locationIds.includes(rule.locationId));
  if (minimums.length === 0) return [];

  const offices = [...new Set(minimums.map((rule) => rule.locationId))];
  const windowStart = zonedTimeToUtc(from, '00:00', PRACTICE_ZONE);
  const windowEnd = zonedTimeToUtc(addDaysTo(to, 1), '00:00', PRACTICE_ZONE);
  const [shifts, closures] = await Promise.all([
    prisma.shift.findMany({
      where: {
        status: { not: ShiftStatus.CANCELLED },
        locationId: { in: offices },
        startsAt: { gte: windowStart, lt: windowEnd },
      },
      select: {
        employeeId: true,
        locationId: true,
        jobRoleId: true,
        isRemote: true,
        startsAt: true,
        location: { select: { timezone: true } },
        employee: {
          select: { jobRoles: { where: { isPrimary: true }, select: { jobRoleId: true } } },
        },
      },
    }),
    prisma.practiceEvent.findMany({
      where: {
        kind: PracticeEventKind.CLOSURE,
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
      },
      select: { audience: true, locationId: true, startsAt: true, endsAt: true },
    }),
  ]);

  const open = new Map<string, Set<string>>();
  const onDuty: OnDuty[] = [];
  for (const shift of shifts) {
    const date = localDateIn(shift.startsAt, shift.location.timezone);
    open.set(shift.locationId, (open.get(shift.locationId) ?? new Set()).add(date));
    if (!shift.employeeId || shift.isRemote) continue;
    onDuty.push({
      employeeId: shift.employeeId,
      locationId: shift.locationId,
      jobRoleId: shift.jobRoleId ?? shift.employee?.jobRoles[0]?.jobRoleId ?? null,
      date,
    });
  }
  const closedAtNoon = (locationId: string, date: string) => {
    const noon = zonedTimeToUtc(date, '12:00', PRACTICE_ZONE);
    return closures.some(
      (closure) =>
        (closure.audience !== EventAudience.LOCATION || closure.locationId === locationId) &&
        closure.startsAt <= noon &&
        closure.endsAt > noon,
    );
  };
  const openDays = (locationId: string) =>
    [...(open.get(locationId) ?? [])]
      .filter((date) => date >= from && date <= to && !closedAtNoon(locationId, date))
      .sort();

  return findShortDays(minimums, onDuty, openDays);
}
