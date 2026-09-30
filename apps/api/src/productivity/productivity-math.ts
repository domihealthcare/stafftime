/**
 * The sums behind a productivity statement, kept apart from the database so the
 * screen, the provider's view and the tests can all be held to the same
 * numbers. Money is worked in whole cents — never floating dollars — so 23 over
 * at $50.00 is exactly $1,150.00 and a $12.35 multiplier cannot drift.
 *
 * The practice's sheet, for the record: two two-week intervals of 169 and 154
 * patients against 150 expected each. Expected 300, actual 323, difference 23,
 * multiplier $50, amount $1,150. A short period is negative (-16 → -$800), and
 * that is kept, not floored at nothing.
 */

export interface IntervalInput {
  /// Null when the interval has no target.
  expected: number | null;
  /// Patients counted, one number per category (or one in all).
  counts: number[];
}

export interface StatementTotals {
  /// Null when no interval has a target — then there is only a count.
  expected: number | null;
  actual: number;
  /// Actual less expected. Null with no target.
  difference: number | null;
  multiplierCents: number | null;
  /// Null when there is no multiplier. With a target it is the difference times
  /// the multiplier; with no target, every patient counted at the multiplier.
  amountCents: number | null;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/// "50", "12.35", 50 or a Prisma decimal → 5000, 1235, 5000. Null stays null.
export function toCents(value: { toString(): string } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value.toString());
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

export function totals(
  intervals: IntervalInput[],
  multiplier: { toString(): string } | number | null | undefined,
): StatementTotals {
  const targets = intervals.map((interval) => interval.expected);
  const hasTarget = targets.some((target) => target !== null);
  const expected = hasTarget ? sum(targets.map((target) => target ?? 0)) : null;
  const actual = sum(intervals.map((interval) => sum(interval.counts)));
  const difference = expected === null ? null : actual - expected;
  const multiplierCents = toCents(multiplier);
  const basis = difference === null ? actual : difference;
  return {
    expected,
    actual,
    difference,
    multiplierCents,
    amountCents: multiplierCents === null ? null : basis * multiplierCents,
  };
}

/// Whole days, as `YYYY-MM-DD`, the way every date in this app travels.
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/// The consecutive intervals a new statement starts with: `count` of them,
/// each `weeks` long, beginning on `startIso`. Interval 1 of two weeks from
/// Sunday 1 June ends Saturday 14 June; interval 2 starts the 15th.
export function planIntervals(
  startIso: string,
  weeks: number,
  count: number,
): { startDate: string; endDate: string }[] {
  const out: { startDate: string; endDate: string }[] = [];
  let start = startIso;
  for (let index = 0; index < count; index += 1) {
    const end = addDaysIso(start, weeks * 7 - 1);
    out.push({ startDate: start, endDate: end });
    start = addDaysIso(end, 1);
  }
  return out;
}
