import { localDate } from './format';

/**
 * Calendar days written "YYYY-MM-DD", as the screens and the API pass them.
 *
 * Two ideas of "today" live in the web app, on purpose or not, and each screen
 * keeps the one it has always used:
 *
 * - `browserToday()`, below: the day on this browser's own clock. Most forms
 *   start on it (a date box's first value, its `min` or `max`).
 * - `practiceDate()` in `practice-time.ts`: the day in New Jersey, whatever
 *   the browser's zone. Anything compared with what the server works out
 *   (who is on call, schedule reviews, pay changes) uses it.
 *
 * At the practice the two are the same day; they differ only on a computer
 * set to another time zone (CI's, in UTC, from 8 pm New Jersey time).
 *
 * `Date` arithmetic on the browser's own calendar (a week's Sunday, a month's
 * grid) is in `format.ts`.
 */

/// Whole days on (or back, with a negative number) from a "YYYY-MM-DD". In
/// UTC, so a clock change cannot move it: "2026-03-07" + 1 is "2026-03-08"
/// wherever the browser is.
export function addCalendarDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/// Today on this browser's own calendar, "YYYY-MM-DD". Not New Jersey's: for
/// that, `practiceDate()` in `practice-time.ts`.
export function browserToday(): string {
  return localDate(new Date());
}
