import { addUtcDays, toUtcDate } from '../common/util/calendar-date.util';

/**
 * Time off past the balance, split when it is approved (2 November 2026,
 * Dominguez: "People are requesting days and it says Approved but does not
 * say UNPAID"). The days still covered by the allowance stay as they were
 * asked for (Sick or PTO); the rest become a separate, Unpaid part, so what
 * the Time off screen says is what payroll pays. Pure.
 *
 * Only whole days are paid: with 2.5 sick days left, 5 asked for is 2 Sick
 * and 3 Unpaid, and the half day stays in the balance. A half day asked for
 * with less than half a day left is Unpaid as a whole.
 */
export interface PastBalanceSplit {
  /// Days still paid from the allowance, and days unpaid.
  paidDays: number;
  unpaidDays: number;
  /// The paid part's dates; null when nothing was left, and the whole
  /// request is unpaid.
  paid: { startDate: Date; endDate: Date } | null;
  /// The unpaid part's dates: from the first unpaid day to the request's end.
  unpaid: { startDate: Date; endDate: Date; isHalfDay: boolean };
}

export function splitPastBalance(
  request: { startDate: Date; endDate: Date; isHalfDay: boolean },
  /// The days of the request that count, in order ("YYYY-MM-DD").
  countedDates: string[],
  /// What is left of the allowance, before this request.
  left: number,
): PastBalanceSplit | null {
  const halfDay = request.isHalfDay && countedDates.length === 1;
  const days = halfDay ? 0.5 : countedDates.length;
  // A small allowance for rounding: balances are kept to one decimal.
  if (days === 0 || days <= left + 1e-9) return null;

  const paidWhole = halfDay ? 0 : Math.max(0, Math.floor(left + 1e-9));
  if (paidWhole === 0) {
    return {
      paidDays: 0,
      unpaidDays: days,
      paid: null,
      unpaid: {
        startDate: request.startDate,
        endDate: request.endDate,
        isHalfDay: request.isHalfDay,
      },
    };
  }

  // The unpaid part starts on the first day past what is paid; the paid part
  // runs to the day before it, so a weekend in between stays with it.
  const unpaidStart = toUtcDate(countedDates[paidWhole]);
  return {
    paidDays: paidWhole,
    unpaidDays: days - paidWhole,
    paid: { startDate: request.startDate, endDate: addUtcDays(unpaidStart, -1) },
    unpaid: { startDate: unpaidStart, endDate: request.endDate, isHalfDay: false },
  };
}
