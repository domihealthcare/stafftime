import { WEEK_ORDER, WEEKDAY_NAMES } from './format';

/**
 * Which weeks a repeating shift is on, as well as which days: every week,
 * every 2–4 weeks, or certain weeks of the month ("the first Saturday").
 * The same rules as the server's `shifts/repeat-pattern.ts`, here so the
 * forms can show the first few dates before anything is saved.
 */
export interface RepeatWeeks {
  /// 1 is every week.
  everyWeeks: number;
  /// 1–4 for the first to fourth, -1 for the last. Empty: not by the month.
  weeksOfMonth: number[];
}

export const EVERY_WEEK: RepeatWeeks = { everyWeeks: 1, weeksOfMonth: [] };

/// The weeks of the month, in the order the toggles show them.
export const WEEKS_OF_MONTH = [
  { value: 1, short: '1st', long: 'first' },
  { value: 2, short: '2nd', long: 'second' },
  { value: 3, short: '3rd', long: 'third' },
  { value: 4, short: '4th', long: 'fourth' },
  { value: -1, short: 'Last', long: 'last' },
] as const;

const EVERY: Record<number, string> = { 2: 'other', 3: 'third', 4: 'fourth' };

export function isEveryWeek(weeks: RepeatWeeks): boolean {
  return weeks.everyWeeks === 1 && weeks.weeksOfMonth.length === 0;
}

/// Monday 1 … Sunday 7, for a plain date.
function weekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/// The week of the month a date is in, as the toggles offer it: 1–4, or
/// -1 for a fifth.
export function weekOfMonth(date: string): number {
  const week = Math.ceil(Number(date.slice(8, 10)) / 7);
  return week > 4 ? -1 : week;
}

/// Whether the shift falls on `date`. `cycleFrom` is a date in a week it is
/// on, for every 2+ weeks; weeks are counted Sunday first.
export function onPattern(
  date: string,
  days: number[],
  weeks: RepeatWeeks,
  cycleFrom: string,
): boolean {
  if (!days.includes(weekdayOf(date))) return false;
  if (weeks.weeksOfMonth.length > 0) {
    const nth = Math.ceil(Number(date.slice(8, 10)) / 7);
    const last = addDays(date, 7).slice(5, 7) !== date.slice(5, 7);
    return weeks.weeksOfMonth.some((week) => (week === -1 ? last : week === nth));
  }
  if (weeks.everyWeeks <= 1) return true;
  const sunday = (d: string) => addDays(d, -(weekdayOf(d) % 7));
  const apart = Math.round(
    (Date.parse(`${sunday(date)}T00:00:00Z`) - Date.parse(`${sunday(cycleFrom)}T00:00:00Z`)) /
      (7 * 86_400_000),
  );
  return ((apart % weeks.everyWeeks) + weeks.everyWeeks) % weeks.everyWeeks === 0;
}

/// The first `count` dates on or after `from` (and not after `until`).
export function firstDates(
  from: string,
  days: number[],
  weeks: RepeatWeeks,
  count: number,
  until?: string,
  cycleFrom: string = from,
): string[] {
  const found: string[] = [];
  if (days.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return found;
  // A year is more than any pattern here needs to show three.
  for (let date = from, i = 0; i < 400 && found.length < count; i += 1) {
    if (until && date > until) break;
    if (onPattern(date, days, weeks, cycleFrom)) found.push(date);
    date = addDays(date, 1);
  }
  return found;
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/// "Mondays and Thursdays", "Every day", "Every other Saturday", "The first
/// and third Saturday of the month" — Sunday first, as the calendar reads.
/// Mid-sentence (`start` false) it is "every day", "the first Saturday…".
export function describeRepeat(days: number[], weeks: RepeatWeeks, start = true): string {
  const phrase = describe(days, weeks);
  return start ? phrase : phrase.replace(/^(The|Every) /, (word) => word.toLowerCase());
}

function describe(days: number[], weeks: RepeatWeeks): string {
  const ordered = WEEK_ORDER.filter((day) => days.includes(day));
  const names = ordered.map((day) => WEEKDAY_NAMES[day - 1]);
  if (weeks.weeksOfMonth.length > 0) {
    const which = WEEKS_OF_MONTH.filter((week) => weeks.weeksOfMonth.includes(week.value)).map(
      (week) => week.long,
    );
    return `The ${listOf(which)} ${listOf(names)} of the month`;
  }
  if (weeks.everyWeeks > 1) return `Every ${EVERY[weeks.everyWeeks]} ${listOf(names)}`;
  if (names.length === 7) return 'Every day';
  return listOf(names.map((name) => `${name}s`));
}
