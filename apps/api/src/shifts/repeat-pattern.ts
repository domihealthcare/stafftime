import { addDaysTo, isoWeekdayOf } from '../common/util/zoned-time.util';

/**
 * Which weeks a repeating shift is on, as well as which days (Dominguez,
 * October 2026: "repeat shifts on like 1st Saturday of the month").
 *
 * Three kinds, one at a time:
 * - every week — what repeating shifts always did;
 * - every 2, 3 or 4 weeks — counted in calendar weeks, Sunday first as the
 *   rota reads, from the week of `cycleFrom`;
 * - certain weeks of the month — the first to fourth, or the last, of each
 *   chosen weekday: "the first Saturday", "the second and fourth Friday".
 *   The first Saturday is the one on the 1st–7th, the second on the 8th–14th,
 *   and so on; the last is the one with fewer than seven days of the month
 *   after it. A fifth Saturday is only ever "the last".
 *
 * Worked on calendar dates, never instants, like the rest of the planner.
 */
export interface RepeatPattern {
  /// 1 = Monday … 7 = Sunday.
  daysOfWeek: number[];
  /// 1 is every week. Not used with `weeksOfMonth`.
  everyWeeks?: number;
  /// 1–4 for the first to fourth, -1 for the last. Empty: not by the month.
  weeksOfMonth?: number[];
  /// For every 2+ weeks: a date in a week it is on. Weeks are counted from
  /// the Sunday of that week.
  cycleFrom?: string;
}

export const MAX_EVERY_WEEKS = 4;
export const WEEKS_OF_MONTH = [1, 2, 3, 4, -1] as const;

/// What is wrong with a pattern, in words, or null.
export function patternProblem(pattern: RepeatPattern): string | null {
  const every = pattern.everyWeeks ?? 1;
  const weeks = pattern.weeksOfMonth ?? [];
  if (!Number.isInteger(every) || every < 1 || every > MAX_EVERY_WEEKS) {
    return `Repeat every week, or every 2 to ${MAX_EVERY_WEEKS} weeks.`;
  }
  if (weeks.some((week) => !(WEEKS_OF_MONTH as readonly number[]).includes(week))) {
    return 'Choose the first, second, third, fourth or last week of the month.';
  }
  if (every > 1 && weeks.length > 0) {
    return 'Choose every few weeks or certain weeks of the month, not both.';
  }
  return null;
}

/// Weekly every week, with nothing else to it — what a usual week is made of.
export function isEveryWeek(pattern: RepeatPattern): boolean {
  return (pattern.everyWeeks ?? 1) === 1 && (pattern.weeksOfMonth ?? []).length === 0;
}

/// Whether the shift falls on `date`.
export function onPattern(date: string, pattern: RepeatPattern): boolean {
  if (!pattern.daysOfWeek.includes(isoWeekdayOf(date))) return false;

  const weeks = pattern.weeksOfMonth ?? [];
  if (weeks.length > 0) {
    const day = Number(date.slice(8, 10));
    const nth = Math.ceil(day / 7);
    const last = addDaysTo(date, 7).slice(5, 7) !== date.slice(5, 7);
    return weeks.some((week) => (week === -1 ? last : week === nth));
  }

  const every = pattern.everyWeeks ?? 1;
  if (every === 1) return true;
  const first = sundayOf(pattern.cycleFrom ?? date);
  const weeksApart = Math.round(daysApart(first, sundayOf(date)) / 7);
  return ((weeksApart % every) + every) % every === 0;
}

const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ORDINAL: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  [-1]: 'last',
};
const EVERY: Record<number, string> = { 2: 'other', 3: 'third', 4: 'fourth' };

/// "Mondays", "every other Saturday", "the first and third Saturday of the
/// month" — for the bell and the server's messages. Sunday first.
export function patternPhrase(pattern: RepeatPattern): string {
  const days = [...new Set(pattern.daysOfWeek)].sort((a, b) => (a % 7) - (b % 7));
  const weeks = [...new Set(pattern.weeksOfMonth ?? [])].sort(
    (a, b) => (a === -1 ? 5 : a) - (b === -1 ? 5 : b),
  );
  if (weeks.length > 0) {
    return `the ${listOf(weeks.map((week) => ORDINAL[week]))} ${listOf(
      days.map((day) => WEEKDAY[day - 1]),
    )} of the month`;
  }
  const every = pattern.everyWeeks ?? 1;
  if (every > 1) return `every ${EVERY[every]} ${listOf(days.map((day) => WEEKDAY[day - 1]))}`;
  return listOf(days.map((day) => `${WEEKDAY[day - 1]}s`));
}

/// The phrase with its first letter up, to start a sentence.
export function capitalised(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function sundayOf(date: string): string {
  return addDaysTo(date, -(isoWeekdayOf(date) % 7));
}

function daysApart(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
