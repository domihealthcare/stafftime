import { PRACTICE_ZONE } from '../common/util/zoned-time.util';

/**
 * "Your week" (October 2026, Dominguez - a "smarter" idea, with an off switch
 * like "You're on tomorrow"). On Sunday evening - the first day of the week on
 * screen - each person hears the hours they worked last week and the shifts
 * they are down for this week. The words, kept apart from the sending.
 */

/// From when, on Sunday on the practice's clock, it goes out.
export const WEEKLY_SUMMARY_FROM = '18:00';

export interface SummaryShift {
  startsAt: Date;
  endsAt: Date;
  isRemote: boolean;
  locationName: string;
}

export interface WeeklySummaryInput {
  /// Last week, Sunday to Saturday, as "YYYY-MM-DD".
  lastFrom: string;
  lastTo: string;
  hours: number;
  /// Clock-outs the app made at midnight, not corrected yet - left out.
  toCorrect: number;
  shifts: SummaryShift[];
  /// False for somebody who does not clock in (`Employee.clocksIn`): with no
  /// punches, "0 hours worked" would only be wrong, so only the shifts are told.
  clocksIn?: boolean;
}

const calendarDay = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
const shiftDay = (at: Date) =>
  at.toLocaleDateString('en-US', {
    timeZone: PRACTICE_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
const time = (at: Date) =>
  at.toLocaleTimeString('en-US', { timeZone: PRACTICE_ZONE, hour: 'numeric', minute: '2-digit' });

const hoursWords = (hours: number) =>
  `${hours.toFixed(hours % 1 === 0 ? 0 : 1)} ${hours === 1 ? 'hour' : 'hours'}`;

/// The bell's title and body. Null when there is nothing to say: no hours
/// last week and nothing on the rota this week.
export function weeklySummaryWords(
  input: WeeklySummaryInput,
): { title: string; body: string } | null {
  if (input.hours === 0 && input.shifts.length === 0 && input.toCorrect === 0) return null;
  const shifts = input.shifts.length;
  const coming = `${shifts} ${shifts === 1 ? 'shift' : 'shifts'} coming up`;
  // Somebody who does not clock in hears hours only if they punched anyway.
  const noHours = input.clocksIn === false && input.hours === 0 && input.toCorrect === 0;
  if (noHours && shifts === 0) return null;
  const title = noHours
    ? `Your week: ${coming}`
    : `Your week: ${hoursWords(input.hours)} worked · ${coming}`;
  const body = [
    ...(noHours
      ? []
      : [
          `Last week (${calendarDay(input.lastFrom)}–${calendarDay(input.lastTo)}): ${hoursWords(input.hours)} worked.`,
        ]),
    ...(input.toCorrect > 0
      ? [
          `${input.toCorrect} ${input.toCorrect === 1 ? 'day is' : 'days are'} not counted yet - clocked out by the app at midnight, for a manager to correct.`,
        ]
      : []),
    shifts === 0 ? 'Nothing on the rota for you this week yet.' : 'This week:',
    ...input.shifts.map(
      (shift) =>
        `${shiftDay(shift.startsAt)}: ${time(shift.startsAt)}–${time(shift.endsAt)} ${
          shift.isRemote ? 'working from home' : `at ${shift.locationName}`
        }`,
    ),
  ].join('\n');
  return { title, body };
}
