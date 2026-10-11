import { addDaysTo, isoWeekdayOf } from '../common/util/zoned-time.util';

/**
 * Who is on call on a day (October 2026, Dominguez: "dr. jonathan dominguez
 * is on call m,t,w,f and every weekend except the 4th weekend and thursdays
 * which Jose Badia covers"). Worked on plain dates; a day's turn runs from
 * its rota's hand-over time ("12:00") on that date to the same time the next
 * day.
 *
 * - The **rota** in force is the latest one starting on or before the day.
 * - Its **entry** for the day is the most particular one for the weekday: a
 *   week of the month (1st–4th) over the **last** over **every** week.
 * - **Weekends are counted by their Saturday**: the 4th weekend is the 4th
 *   Saturday of the month and the Sunday after it, even when that Sunday is
 *   the month's 5th (or the next month's 1st). Weekdays count as usual: the
 *   1st Monday is the one on the 1st–7th.
 * - A **changed day** (a manager's change, or a swap) beats the rota.
 *
 * Pure, and the only place these rules live.
 */

export interface RotaRule {
  startsOn: string;
  changesAt: string;
  entries: { weekday: number; weekOfMonth: number; employeeId: string }[];
}

export type OnCallSource = 'USUAL' | 'CHANGED' | 'SWAPPED' | 'NONE';

export interface OnCallDayView {
  date: string;
  employeeId: string | null;
  source: OnCallSource;
  /// When the turn starts and ends, "HH:MM" on its date and the next.
  changesAt: string;
}

export const WEEKS_OF_MONTH = [0, 1, 2, 3, 4, -1] as const;

/// Which week of the month a day is in, for the rota: the nth of its weekday,
/// and whether it is the last — a Sunday counted with the Saturday before.
export function weekOfMonthOf(date: string): { nth: number; last: boolean } {
  const anchor = isoWeekdayOf(date) === 7 ? addDaysTo(date, -1) : date;
  const day = Number(anchor.slice(8, 10));
  const nth = Math.ceil(day / 7);
  const last = addDaysTo(anchor, 7).slice(5, 7) !== anchor.slice(5, 7);
  return { nth, last };
}

/// The rota in force on a day: the latest starting on or before it.
export function rotaOn(date: string, rotas: RotaRule[]): RotaRule | null {
  let found: RotaRule | null = null;
  for (const rota of rotas) {
    if (rota.startsOn <= date && (!found || rota.startsOn > found.startsOn)) found = rota;
  }
  return found;
}

/// The rota's provider for a day, or null for nobody.
export function usualOn(date: string, rota: RotaRule): string | null {
  const weekday = isoWeekdayOf(date);
  const { nth, last } = weekOfMonthOf(date);
  const forDay = rota.entries.filter((entry) => entry.weekday === weekday);
  const pick =
    forDay.find((entry) => entry.weekOfMonth === nth) ??
    (last ? forDay.find((entry) => entry.weekOfMonth === -1) : undefined) ??
    forDay.find((entry) => entry.weekOfMonth === 0);
  return pick?.employeeId ?? null;
}

export function onCallOn(
  date: string,
  rotas: RotaRule[],
  changed: Map<string, { employeeId: string; swapped: boolean }>,
): OnCallDayView {
  const rota = rotaOn(date, rotas);
  const changesAt = rota?.changesAt ?? '12:00';
  const change = changed.get(date);
  if (change) {
    return {
      date,
      employeeId: change.employeeId,
      source: change.swapped ? 'SWAPPED' : 'CHANGED',
      changesAt,
    };
  }
  const employeeId = rota ? usualOn(date, rota) : null;
  return { date, employeeId, source: employeeId ? 'USUAL' : 'NONE', changesAt };
}

/// The day whose turn is running at a moment, given the date and "HH:MM" it
/// is in New Jersey: before the hand-over it is still yesterday's.
export function turnDateAt(today: string, timeNow: string, rotas: RotaRule[]): string {
  const changesAt = rotaOn(today, rotas)?.changesAt ?? '12:00';
  return timeNow < changesAt ? addDaysTo(today, -1) : today;
}

/// "Mondays", "the 4th Saturday", "the last Friday" — an entry in words.
export function entryWords(weekday: number, weekOfMonth: number): string {
  const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (weekOfMonth === 0) return `${days[weekday]}s`;
  const which = weekOfMonth === -1 ? 'last' : ['', '1st', '2nd', '3rd', '4th'][weekOfMonth];
  return `the ${which} ${days[weekday]}`;
}

/// "12:00" → "12 PM", "08:30" → "8:30 AM".
export function clockWords(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
}
