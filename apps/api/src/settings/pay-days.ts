import { addDaysTo, isoWeekdayOf } from '../common/util/zoned-time.util';
import { PAY_PERIOD_DAYS, payPeriodContaining } from './pay-period';

/// Friday, as `isoWeekdayOf` counts (1 = Monday … 7 = Sunday).
const FRIDAY = 5;

/**
 * The day a pay period is paid: the Friday after it ends (Dominguez, October
 * 2026). A period that ends on a Friday is paid the Friday a week later —
 * "after", not "on".
 */
export function payDayFor(periodEnd: string): string {
  const daysToFriday = (FRIDAY - isoWeekdayOf(periodEnd) + 7) % 7 || 7;
  return addDaysTo(periodEnd, daysToFriday);
}

/**
 * Every pay day from `from` to `to` (both YYYY-MM-DD, inclusive), given any
 * day a pay period began. None until a pay period has been set in Practice
 * settings: a guessed pay day on somebody's calendar is worse than none.
 */
export function payDaysBetween(from: string, to: string, anchor: string | null): string[] {
  if (!anchor || to < from) return [];
  // A period paid inside the range ended up to two weeks before it began.
  let period = payPeriodContaining(addDaysTo(from, -PAY_PERIOD_DAYS), anchor);
  const days: string[] = [];
  while (period.from <= to) {
    const payDay = payDayFor(period.to);
    if (payDay >= from && payDay <= to) days.push(payDay);
    period = {
      from: addDaysTo(period.from, PAY_PERIOD_DAYS),
      to: addDaysTo(period.to, PAY_PERIOD_DAYS),
    };
  }
  return days;
}
