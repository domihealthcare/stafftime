import { addDaysTo, isoWeekdayOf } from '../common/util/zoned-time.util';

/**
 * Moving holidays, copied right (October 2026, Dominguez — making the app
 * smarter). **Copy these into next year** kept every closure and holiday on
 * the same date, so Thanksgiving, Memorial Day, Labor Day and the rest had to
 * be fixed by hand each year. Here the US holidays that move are recognised
 * by name, and moved by their rule ("the fourth Thursday of November").
 *
 * Only when this year's entry was really on the rule's day — a "Thanksgiving
 * lunch" on 20 November is somebody's event, not the holiday, and keeps its
 * date. Anything not recognised keeps its date, as before. Nothing is decided
 * about a fixed holiday landing on a weekend (which day the office takes off
 * instead is the practice's call); it is only pointed out.
 */

export interface MovingHoliday {
  name: string;
  /// Matched against the title, lower case.
  pattern: RegExp;
  /// The day in a given year, "YYYY-MM-DD".
  on: (year: number) => string;
}

/// The nth (1–4) given ISO weekday of a month, or the last (-1).
export function nthWeekday(year: number, month: number, weekday: number, nth: number): string {
  const mm = String(month).padStart(2, '0');
  if (nth > 0) {
    const first = `${year}-${mm}-01`;
    const offset = (weekday - isoWeekdayOf(first) + 7) % 7;
    return addDaysTo(first, offset + (nth - 1) * 7);
  }
  const nextMonth =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const last = addDaysTo(nextMonth, -1);
  return addDaysTo(last, -((isoWeekdayOf(last) - weekday + 7) % 7));
}

/// Easter Sunday (Gregorian), by the anonymous computus.
export function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONDAY = 1;
const TUESDAY = 2;
const THURSDAY = 4;

/// Checked in order: the day after Thanksgiving before Thanksgiving.
export const MOVING_HOLIDAYS: MovingHoliday[] = [
  {
    name: 'The day after Thanksgiving',
    pattern: /(day after thanksgiving|black friday)/,
    on: (year) => addDaysTo(nthWeekday(year, 11, THURSDAY, 4), 1),
  },
  {
    name: 'Thanksgiving',
    pattern: /thanksgiving/,
    on: (year) => nthWeekday(year, 11, THURSDAY, 4),
  },
  { name: 'Memorial Day', pattern: /memorial day/, on: (year) => nthWeekday(year, 5, MONDAY, -1) },
  { name: 'Labor Day', pattern: /labou?r day/, on: (year) => nthWeekday(year, 9, MONDAY, 1) },
  {
    name: 'Martin Luther King Jr. Day',
    pattern: /(martin luther king|\bmlk\b)/,
    on: (year) => nthWeekday(year, 1, MONDAY, 3),
  },
  {
    name: "Presidents' Day",
    pattern: /(president'?s'? ?day|washington'?s birthday)/,
    on: (year) => nthWeekday(year, 2, MONDAY, 3),
  },
  {
    name: 'Columbus Day',
    pattern: /(columbus day|indigenous peoples'? day)/,
    on: (year) => nthWeekday(year, 10, MONDAY, 2),
  },
  {
    name: 'Election Day',
    pattern: /election day/,
    // The Tuesday after the first Monday in November.
    on: (year) => addDaysTo(nthWeekday(year, 11, MONDAY, 1), TUESDAY - MONDAY),
  },
  { name: 'Good Friday', pattern: /good friday/, on: (year) => addDaysTo(easter(year), -2) },
  { name: 'Easter Monday', pattern: /easter monday/, on: (year) => addDaysTo(easter(year), 1) },
  { name: 'Easter', pattern: /easter/, on: (year) => easter(year) },
];

/// Where a closure or holiday that started on `firstDay` (in `fromYear`)
/// starts next year: the moving holiday's day when it was on it, else null —
/// keep the same date.
export function movedFirstDay(title: string, firstDay: string, toYear: number): string | null {
  const fromYear = Number(firstDay.slice(0, 4));
  const holiday = MOVING_HOLIDAYS.find((candidate) => candidate.pattern.test(title.toLowerCase()));
  if (!holiday || holiday.on(fromYear) !== firstDay) return null;
  return holiday.on(toYear);
}

/// "Sat" or "Sun" when a day is on the weekend, else null.
export function weekendDay(date: string): string | null {
  const weekday = isoWeekdayOf(date);
  return weekday === 6 ? 'Saturday' : weekday === 7 ? 'Sunday' : null;
}
