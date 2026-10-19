import { EventAudience, PracticeEventKind } from '@prisma/client';
import { isoDate } from '../common/util/calendar-date.util';
import {
  addDaysTo,
  datesBetween,
  isoWeekdayOf,
  localDateIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Which days a time-off request takes (October 2026, Dominguez, from staff
 * feedback: "please do not include weekends"): **weekdays only**, and not a
 * weekday the office is **closed all day** (Christmas). Ivanna's Wednesday
 * 21 to Wednesday 28 October is 6 days, not 8.
 *
 * One rule for every place a request is counted - balances, the request
 * lists, the form before it is sent, "Approve the clean time off" - so the
 * numbers can never disagree. Pure, apart from `loadClosedDays`.
 */

/// The whole days the practice is shut, "YYYY-MM-DD": for both offices, and
/// per office.
export interface ClosedDays {
  everywhere: Set<string>;
  byOffice: Map<string, Set<string>>;
}

export const NO_CLOSURES: ClosedDays = { everywhere: new Set(), byOffice: new Map() };

/// The days one person does not have to take off: closed for everyone, or
/// closed at every one of their offices (somebody at both offices still works
/// the day only one of them is shut).
export function closedFor(closed: ClosedDays, officeIds: string[]): Set<string> {
  const days = new Set(closed.everywhere);
  if (officeIds.length === 0) return days;
  const [first, ...rest] = officeIds.map((id) => closed.byOffice.get(id) ?? new Set<string>());
  for (const day of first) {
    if (rest.every((office) => office.has(day))) days.add(day);
  }
  return days;
}

/// Monday to Friday.
export function isWeekday(date: string): boolean {
  return isoWeekdayOf(date) <= 5;
}

/**
 * The days of a request that count, within [start, end) - a request across
 * New Year counts against each policy year for its part. A half day counts
 * 0.5 when its day counts at all.
 */
export function countedDays(
  request: { startDate: Date; endDate: Date; isHalfDay: boolean },
  closed: Set<string>,
  start?: Date,
  end?: Date,
): number {
  const from = start && request.startDate < start ? start : request.startDate;
  // endDate is inclusive; end is exclusive.
  const lastAllowed = end ? new Date(end.getTime() - 86_400_000) : null;
  const to = lastAllowed && request.endDate > lastAllowed ? lastAllowed : request.endDate;
  if (to < from) return 0;

  const days = datesBetween(isoDate(from), isoDate(to)).filter(
    (date) => isWeekday(date) && !closed.has(date),
  ).length;
  const single = request.startDate.getTime() === request.endDate.getTime();
  return request.isHalfDay && single && days === 1 ? 0.5 : days;
}

/// The days skipped, for saying so: "Sat, Sun and Christmas Day don't count".
export function skippedDays(
  request: { startDate: Date; endDate: Date },
  closed: Set<string>,
): { weekend: number; closed: string[] } {
  const dates = datesBetween(isoDate(request.startDate), isoDate(request.endDate));
  return {
    weekend: dates.filter((date) => !isWeekday(date)).length,
    closed: dates.filter((date) => isWeekday(date) && closed.has(date)),
  };
}

/**
 * Every whole day a closure covers between two dates, inclusive. A closure
 * that is all day covers its days; a timed one covers a day only if it runs
 * from that day's midnight to the next (a 1pm early close takes nothing off
 * anybody's time off - they worked the morning).
 */
export async function loadClosedDays(
  prisma: PrismaService,
  from: string,
  to: string,
): Promise<ClosedDays> {
  const start = zonedTimeToUtc(from, '00:00', PRACTICE_ZONE);
  const end = zonedTimeToUtc(addDaysTo(to, 1), '00:00', PRACTICE_ZONE);
  const closures = await prisma.practiceEvent.findMany({
    where: { kind: PracticeEventKind.CLOSURE, startsAt: { lt: end }, endsAt: { gt: start } },
    select: { startsAt: true, endsAt: true, audience: true, locationId: true },
  });

  const closed: ClosedDays = { everywhere: new Set(), byOffice: new Map() };
  for (const closure of closures) {
    // Only the closure's own days, inside the range asked about.
    const first = localDateIn(closure.startsAt, PRACTICE_ZONE);
    const last = localDateIn(closure.endsAt, PRACTICE_ZONE);
    const days = datesBetween(first > from ? first : from, last < to ? last : to).filter(
      (date) =>
        closure.startsAt <= zonedTimeToUtc(date, '00:00', PRACTICE_ZONE) &&
        closure.endsAt >= zonedTimeToUtc(addDaysTo(date, 1), '00:00', PRACTICE_ZONE),
    );
    if (closure.audience === EventAudience.LOCATION) {
      // A closure for an office since removed shuts nothing.
      if (!closure.locationId) continue;
      const office = closed.byOffice.get(closure.locationId) ?? new Set<string>();
      days.forEach((day) => office.add(day));
      closed.byOffice.set(closure.locationId, office);
    } else {
      days.forEach((day) => closed.everywhere.add(day));
    }
  }
  return closed;
}
