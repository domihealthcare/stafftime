import { PRACTICE_ZONE } from '../common/util/zoned-time.util';

/**
 * "You're on tomorrow" (October 2026, Dominguez - a "smarter" idea, with
 * "should be able to turn off as a user"). The evening before each day
 * somebody works, one note on the bell and one email listing that day's
 * published shifts: hours, place, job role and any note on the shift. The
 * words, kept apart from the sending so they can be tested on their own.
 */

/// From when, on the practice's clock, the evening reminder goes out - the
/// same hour as the rep lunch notice.
export const TOMORROW_REMINDER_FROM = '18:00';

export interface TomorrowShift {
  startsAt: Date;
  endsAt: Date;
  isRemote: boolean;
  locationName: string;
  jobRoleName: string | null;
  notes: string | null;
}

const time = (at: Date) =>
  at.toLocaleTimeString('en-US', { timeZone: PRACTICE_ZONE, hour: 'numeric', minute: '2-digit' });

const day = (at: Date) =>
  at.toLocaleDateString('en-US', {
    timeZone: PRACTICE_ZONE,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

const hours = (shift: TomorrowShift) => `${time(shift.startsAt)}–${time(shift.endsAt)}`;

const place = (shift: TomorrowShift) =>
  shift.isRemote ? 'working from home' : `at ${shift.locationName}`;

/// One line for a shift: "7:00 AM–2:00 PM at West New York (Front Desk)".
export function shiftLine(shift: TomorrowShift): string {
  return `${hours(shift)} ${place(shift)}${shift.jobRoleName ? ` (${shift.jobRoleName})` : ''}`;
}

/// The bell's title and body, for a day's shifts in the order they start.
export function tomorrowWords(shifts: TomorrowShift[]): { title: string; body: string } {
  const [first] = shifts;
  const title =
    shifts.length === 1
      ? `You're on tomorrow, ${hours(first)} ${place(first)}`
      : `You're on tomorrow: ${shifts.length} shifts, from ${time(first.startsAt)}`;
  const body = [
    day(first.startsAt),
    ...shifts.flatMap((shift) => [
      shiftLine(shift),
      ...(shift.notes ? [`Note: ${shift.notes}`] : []),
    ]),
  ].join('\n');
  return { title, body };
}
