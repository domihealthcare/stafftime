import { isoWeekdayOf } from '../common/util/zoned-time.util';

/// Whether a minimum's weekdays (1 = Monday ... 7 = Sunday; empty or missing:
/// every day) include this date, "YYYY-MM-DD". Its own file so the time-off
/// clashes and the short days can both use it without importing each other.
export function appliesOn(weekdays: number[] | null | undefined, date: string): boolean {
  return !weekdays || weekdays.length === 0 || weekdays.includes(isoWeekdayOf(date));
}
