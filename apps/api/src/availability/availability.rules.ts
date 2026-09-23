import { UnavailabilityKind } from '@prisma/client';
import { isoWeekdayOf } from '../common/util/zoned-time.util';

/// The parts of a rule the clash check needs — shaped like the database row,
/// with dates as plain "YYYY-MM-DD" strings.
export interface Rule {
  kind: UnavailabilityKind;
  weekday: number | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

/// A shift in the location's own wall-clock terms.
export interface LocalShift {
  date: string;
  startTime: string;
  /// "24:00" for a shift that runs past midnight: it is unavailable-for until
  /// the end of its first day, which is the day the rule is about.
  endTime: string;
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

/// Whether a rule applies on a given local date at all.
export function appliesOn(rule: Rule, date: string): boolean {
  if (rule.kind === UnavailabilityKind.ONE_OFF) return rule.date === date;
  return (
    rule.weekday === isoWeekdayOf(date) &&
    rule.effectiveFrom <= date &&
    (rule.effectiveUntil === null || rule.effectiveUntil >= date)
  );
}

/// Overlap, not containment: a shift that only starts before somebody's 5pm
/// cut-off still has them working past it. Touching ends do not count — a
/// shift ending at 17:00 fits "not after 5".
export function overlaps(rule: Rule, shift: LocalShift): boolean {
  if (rule.startTime === null || rule.endTime === null) return true;
  return rule.startTime < shift.endTime && shift.startTime < rule.endTime;
}

/// The first rule a shift runs into, described for the manager — or null.
export function clashFor(rules: Rule[], shift: LocalShift): string | null {
  const hit = rules.find((rule) => appliesOn(rule, shift.date) && overlaps(rule, shift));
  return hit ? describe(hit) : null;
}

/// "Not available Tuesdays, 5:00 PM–9:00 PM" — what the scheduler shows.
export function describe(rule: Rule): string {
  const when =
    rule.kind === UnavailabilityKind.WEEKLY
      ? WEEKDAYS[rule.weekday ?? 0]
      : `on ${new Date(`${rule.date}T00:00:00Z`).toLocaleDateString('en-US', {
          timeZone: 'UTC',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })}`;
  const hours =
    rule.startTime && rule.endTime
      ? `, ${twelveHour(rule.startTime)}–${twelveHour(rule.endTime)}`
      : ' (all day)';
  return `Not available ${when}${hours}`;
}

export function twelveHour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 && hours < 24 ? 'PM' : 'AM';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}
