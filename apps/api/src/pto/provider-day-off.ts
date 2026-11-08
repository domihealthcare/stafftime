import { addUtcDays, isoDate } from '../common/util/calendar-date.util';
import { PRACTICE_ZONE, zonedTimeToUtc } from '../common/util/zoned-time.util';

/**
 * "Provider day off" (November 2026, Dominguez): a provider asks for time off
 * and the manager decides FIRST; on approving, the manager chooses for each
 * shift that falls inside the dates: keep it, take it off the rota, leave it
 * as an open shift, or ask colleagues to cover it. The rules and words are
 * here, pure, so they can be tested without a database. See
 * `provider-day-off.service.ts` for the reads and writes.
 */

export type ShiftAction = 'KEEP' | 'REMOVE' | 'OPEN' | 'ASK';

export interface ShiftChoice {
  shiftId: string;
  action: ShiftAction;
  employeeIds?: string[];
}

/// The instant a date-only value's day begins at the practice.
export function dayStart(date: Date): Date {
  return zonedTimeToUtc(isoDate(date), '00:00', PRACTICE_ZONE);
}

/// The instant the day after it begins at the practice.
export function dayEnd(date: Date): Date {
  return dayStart(addUtcDays(date, 1));
}

export interface ChoosableShift {
  id: string;
  employeeId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
}

/**
 * Why these choices cannot be used, in a manager's words, or null when they
 * can. Every shift must be the provider's own, inside the dates, still to
 * come and not cancelled; a shift can be chosen once; asking needs people.
 */
export function problemWithChoices(
  choices: ShiftChoice[],
  shifts: ChoosableShift[],
  request: { employeeId: string; startDate: Date; endDate: Date },
  now: Date,
): string | null {
  const from = dayStart(request.startDate);
  const to = dayEnd(request.endDate);
  const seen = new Set<string>();
  for (const choice of choices) {
    if (seen.has(choice.shiftId)) return 'Each shift can be chosen once.';
    seen.add(choice.shiftId);
    const shift = shifts.find((one) => one.id === choice.shiftId);
    if (!shift || shift.employeeId !== request.employeeId) {
      return 'One of those shifts is not theirs, so it cannot be dealt with here.';
    }
    if (shift.status === 'CANCELLED') return 'One of those shifts was cancelled.';
    if (!(shift.startsAt < to && shift.endsAt > from)) {
      return 'One of those shifts is outside the days off.';
    }
    if (shift.startsAt <= now) return 'One of those shifts has already started.';
    if (choice.action === 'ASK' && (choice.employeeIds?.length ?? 0) === 0) {
      return 'Choose who to ask for each shift you want covered.';
    }
  }
  return null;
}

/// The on-call dates (YYYY-MM-DD) that fall inside the days off, in order.
export function onCallInside(dates: string[], startDate: Date, endDate: Date): string[] {
  const first = isoDate(startDate);
  const last = isoDate(endDate);
  return [...new Set(dates)].filter((date) => date >= first && date <= last).sort();
}

/// "Mon, Nov 9" for a YYYY-MM-DD date, whatever the computer's zone.
function shortDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/// To the provider whose time off was approved and who is on call inside it.
export function onCallWords(dates: string[]): { title: string; body: string } {
  const days = dates.map(shortDay);
  const list =
    days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} and ${days.at(-1)}`;
  return {
    title:
      days.length === 1
        ? 'You are on call on a day you will be off'
        : 'You are on call on days you will be off',
    body: `Your time off is approved, but you are on call ${list}. Please ask a colleague to swap ${days.length === 1 ? 'that day' : 'those days'} on the On call page.`,
  };
}
