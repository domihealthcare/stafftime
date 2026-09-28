import { addDaysTo, isoWeekdayOf } from '../common/util/zoned-time.util';

/**
 * Repeating events: which days a series lands on.
 *
 * Worked on calendar dates ("2026-10-02"), never on instants, so a series at
 * 9am stays at 9am through the clocks changing — the caller turns each date
 * back into instants on the practice's clock. A series is written out as one
 * event per date (like repeating shifts), so any one of them can be moved or
 * removed on its own; the rule is kept so "this and all after it" can be
 * changed as a whole.
 */

export type RepeatFrequency = 'WEEKLY' | 'MONTHLY';

/// For a monthly series: the same date (the 15th) or the same weekday in the
/// same week of the month (the first Friday, the last Monday).
export type MonthlyMode = 'DAY_OF_MONTH' | 'WEEKDAY_OF_MONTH';

export interface RepeatRule {
  frequency: RepeatFrequency;
  /// Every 1, 2, 3… weeks or months.
  interval: number;
  /// WEEKLY: the weekdays it is on, 1 = Monday … 7 = Sunday.
  weekdays?: number[];
  /// MONTHLY: which kind of monthly.
  monthlyMode?: MonthlyMode;
  /// WEEKDAY_OF_MONTH: 1–4 for the first to fourth, -1 for the last.
  monthlyWeek?: number;
  /// The last date it can land on, inclusive.
  until: string;
}

/// A year ahead is as far as anybody plans a meeting; further is a typo.
export const MAX_SPAN_DAYS = 366;
/// Every weekday for a year is 261; this is a backstop, not a target.
export const MAX_OCCURRENCES = 400;
export const MAX_INTERVAL = 12;

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ORDINALS: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  [-1]: 'last',
};

/// What is wrong with a rule, in words, or null.
export function ruleProblem(firstDate: string, rule: RepeatRule): string | null {
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > MAX_INTERVAL) {
    return `Repeat every 1 to ${MAX_INTERVAL} ${rule.frequency === 'WEEKLY' ? 'weeks' : 'months'}.`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rule.until)) return 'Choose when it stops repeating.';
  if (rule.until < firstDate) return 'It has to stop repeating after it starts.';
  if (rule.until > addDaysTo(firstDate, MAX_SPAN_DAYS)) {
    return 'A repeating event can run for at most a year — add another series after that.';
  }
  if (rule.frequency === 'WEEKLY') {
    const days = rule.weekdays ?? [];
    if (days.length === 0) return 'Choose at least one day of the week.';
    if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
      return 'Those are not days of the week.';
    }
  } else if (rule.frequency === 'MONTHLY') {
    if (rule.monthlyMode !== 'DAY_OF_MONTH' && rule.monthlyMode !== 'WEEKDAY_OF_MONTH') {
      return 'Choose the same date or the same weekday each month.';
    }
    if (
      rule.monthlyMode === 'WEEKDAY_OF_MONTH' &&
      ![1, 2, 3, 4, -1].includes(rule.monthlyWeek ?? 0)
    ) {
      return 'Choose the first, second, third, fourth or last week of the month.';
    }
  } else {
    return 'Choose weekly or monthly.';
  }
  return null;
}

/**
 * Every date the series lands on, from `firstDate` to `rule.until`.
 *
 * Weekly series count their weeks from the Monday of the first date's week,
 * so "every 2 weeks on Monday and Friday" keeps both days in the same
 * fortnight. The first date itself is included only if it is one of the
 * chosen days.
 */
export function occurrenceDates(firstDate: string, rule: RepeatRule): string[] {
  const dates: string[] = [];
  if (rule.frequency === 'WEEKLY') {
    const weekdays = [...new Set(rule.weekdays ?? [])].sort((a, b) => a - b);
    const firstMonday = addDaysTo(firstDate, 1 - isoWeekdayOf(firstDate));
    for (let week = 0; ; week += rule.interval) {
      const monday = addDaysTo(firstMonday, week * 7);
      if (monday > rule.until) break;
      for (const weekday of weekdays) {
        const date = addDaysTo(monday, weekday - 1);
        if (date >= firstDate && date <= rule.until) dates.push(date);
      }
      if (dates.length > MAX_OCCURRENCES) break;
    }
    return dates.slice(0, MAX_OCCURRENCES);
  }

  const [year, month, day] = firstDate.split('-').map(Number);
  const weekday = isoWeekdayOf(firstDate);
  for (let step = 0; ; step += rule.interval) {
    const index = month - 1 + step;
    const y = year + Math.floor(index / 12);
    const m = (index % 12) + 1;
    if (`${y}-${pad(m)}-01` > rule.until) break;
    const date =
      rule.monthlyMode === 'WEEKDAY_OF_MONTH'
        ? nthWeekdayOf(y, m, weekday, rule.monthlyWeek ?? 1)
        : day <= daysIn(y, m)
          ? `${y}-${pad(m)}-${pad(day)}`
          : // The 31st in a 30-day month is skipped, not moved.
            null;
    if (date && date >= firstDate && date <= rule.until) dates.push(date);
    if (dates.length >= MAX_OCCURRENCES) break;
  }
  return dates;
}

/// The week of the month a date is in, as the form offers it: 1–4, or -1
/// for the last when it is the fifth.
export function weekOfMonth(date: string): number {
  const week = Math.ceil(Number(date.slice(8, 10)) / 7);
  return week > 4 ? -1 : week;
}

/// "Every 2 weeks on Mon and Fri until Dec 31, 2026", for the screens and
/// the bell. `firstDate` supplies the weekday of a monthly series.
export function describeRule(firstDate: string, rule: RepeatRule): string {
  const until = new Date(`${rule.until}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const every =
    rule.interval === 1
      ? `Every ${rule.frequency === 'WEEKLY' ? 'week' : 'month'}`
      : `Every ${rule.interval} ${rule.frequency === 'WEEKLY' ? 'weeks' : 'months'}`;

  let on: string;
  if (rule.frequency === 'WEEKLY') {
    const days = [...new Set(rule.weekdays ?? [])].sort((a, b) => a - b);
    on = `on ${listOf(days.map((d) => WEEKDAY_NAMES[d - 1]))}`;
  } else if (rule.monthlyMode === 'WEEKDAY_OF_MONTH') {
    on = `on the ${ORDINALS[rule.monthlyWeek ?? 1]} ${WEEKDAY_LONG[isoWeekdayOf(firstDate) - 1]}`;
  } else {
    on = `on the ${ordinalDay(Number(firstDate.slice(8, 10)))}`;
  }
  return `${every} ${on} until ${until}`;
}

function nthWeekdayOf(year: number, month: number, weekday: number, nth: number): string | null {
  if (nth === -1) {
    const last = `${year}-${pad(month)}-${pad(daysIn(year, month))}`;
    const back = (isoWeekdayOf(last) - weekday + 7) % 7;
    return addDaysTo(last, -back);
  }
  const first = `${year}-${pad(month)}-01`;
  const ahead = (weekday - isoWeekdayOf(first) + 7) % 7;
  const date = addDaysTo(first, ahead + (nth - 1) * 7);
  return date.slice(5, 7) === pad(month) ? date : null;
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function ordinalDay(day: number): string {
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  return `${day}${suffix}`;
}
