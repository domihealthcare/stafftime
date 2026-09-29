import { addDaysTo, isoWeekdayOf } from '../common/util/zoned-time.util';

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

/**
 * The weekday overtime weeks start on (1 = Monday … 7 = Sunday): the pay
 * period's own first day, so each fortnight is exactly two overtime weeks
 * (Dominguez, September 2026: "the overtime hours should be dependent on the
 * pay period").
 *
 * Still forty hours **a week**, not eighty a fortnight: federal and New Jersey
 * law count overtime week by week, and the 8/80 exception is for hospitals.
 * Monday when no pay period has been set, as it always was.
 */
export function workweekStartsOn(payPeriodStart: Date | string | null): number {
  if (!payPeriodStart) return 1;
  const date =
    typeof payPeriodStart === 'string' ? payPeriodStart : payPeriodStart.toISOString();
  return isoWeekdayOf(date.slice(0, 10));
}
