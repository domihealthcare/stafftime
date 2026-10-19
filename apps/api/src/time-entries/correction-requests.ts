import { PRACTICE_ZONE } from '../common/util/zoned-time.util';

/**
 * "Ask for a correction" (October 2026, Dominguez - a "smarter" idea). The
 * rules and words with no database in them.
 */

/// Longer than this between in and out is a typo, as for hours entered by
/// hand.
export const CORRECTION_MAX_HOURS = 16;

/// How far the times asked for may move from the punch's own clock-in -
/// enough for a forgotten clock-out late at night, not a different day.
export const CORRECTION_MAX_SHIFT_HOURS = 18;

const time = (at: Date) =>
  at.toLocaleTimeString('en-US', { timeZone: PRACTICE_ZONE, hour: 'numeric', minute: '2-digit' });
const day = (at: Date) =>
  at.toLocaleDateString('en-US', {
    timeZone: PRACTICE_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

/// What is wrong with the times asked for, or null.
export function correctionProblem(
  entry: { clockInAt: Date; clockOutAt: Date | null },
  asked: { clockInAt: Date; clockOutAt: Date },
  now: Date,
): string | null {
  if (Number.isNaN(asked.clockInAt.getTime()) || Number.isNaN(asked.clockOutAt.getTime())) {
    return 'Those are not times.';
  }
  if (asked.clockOutAt <= asked.clockInAt) return 'The finish has to be after the start.';
  if (asked.clockOutAt.getTime() - asked.clockInAt.getTime() > CORRECTION_MAX_HOURS * 3_600_000) {
    return `That is more than ${CORRECTION_MAX_HOURS} hours. Check the times.`;
  }
  if (asked.clockOutAt.getTime() > now.getTime() + 60_000) {
    return 'The finish cannot be later than now.';
  }
  const far = CORRECTION_MAX_SHIFT_HOURS * 3_600_000;
  if (
    Math.abs(asked.clockInAt.getTime() - entry.clockInAt.getTime()) > far ||
    Math.abs(asked.clockOutAt.getTime() - entry.clockInAt.getTime()) >
      far + CORRECTION_MAX_HOURS * 3_600_000
  ) {
    return 'That is a different day. Ask your manager to add those hours instead.';
  }
  if (
    entry.clockOutAt &&
    asked.clockInAt.getTime() === entry.clockInAt.getTime() &&
    asked.clockOutAt.getTime() === entry.clockOutAt.getTime()
  ) {
    return 'Those are the times already there.';
  }
  return null;
}

/// "Thu, Oct 8: in 9:00 AM, out 5:00 PM" - the times asked for.
export function askedWords(asked: { clockInAt: Date; clockOutAt: Date }): string {
  return `${day(asked.clockInAt)}: in ${time(asked.clockInAt)}, out ${time(asked.clockOutAt)}`;
}

/// The reason, as it goes on the entry once approved.
export function editReasonFor(reason: string, askedBy: string): string {
  return `Asked for by ${askedBy}: ${reason}`.slice(0, 500);
}
