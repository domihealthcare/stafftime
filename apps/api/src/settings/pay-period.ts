import { addDaysTo } from '../common/util/zoned-time.util';

/// Domi is paid every two weeks (confirmed by Dominguez, September 2026).
export const PAY_PERIOD_DAYS = 14;

export interface DateRange {
  /// First day, inclusive, as YYYY-MM-DD.
  from: string;
  /// Last day, inclusive.
  to: string;
}

/**
 * The pay period containing `date`, given any day a period began.
 *
 * Works either side of the anchor: a period that began before it is still a
 * whole number of fortnights away, so the anchor can be any past or future
 * period start and the answer does not change.
 */
export function payPeriodContaining(date: string, anchor: string): DateRange {
  const days = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86_400_000,
  );
  const offset = Math.floor(days / PAY_PERIOD_DAYS) * PAY_PERIOD_DAYS;
  const from = addDaysTo(anchor, offset);
  return { from, to: addDaysTo(from, PAY_PERIOD_DAYS - 1) };
}

/// This pay period and the one before it — what the date shortcuts offer.
export function payPeriods(today: string, anchor: string | null) {
  if (!anchor) return { current: null, previous: null };
  const current = payPeriodContaining(today, anchor);
  return { current, previous: payPeriodContaining(addDaysTo(current.from, -1), anchor) };
}
