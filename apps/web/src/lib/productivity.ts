import type { ProductivityTotals } from './types';

/// The same sums as the server's `productivity-math.ts`, so the editor can show
/// the result as numbers are typed. The server works them out again when it
/// saves, and what it sends back is what is shown afterwards. Money is whole
/// cents, never floating dollars.

export interface IntervalFigures {
  expected: number | null;
  counts: number[];
}

export function toCents(dollars: number | null): number | null {
  return dollars === null || !Number.isFinite(dollars) ? null : Math.round(dollars * 100);
}

export function figures(
  intervals: IntervalFigures[],
  multiplier: number | null,
): ProductivityTotals {
  const hasTarget = intervals.some((interval) => interval.expected !== null);
  const expected = hasTarget
    ? intervals.reduce((total, interval) => total + (interval.expected ?? 0), 0)
    : null;
  const actual = intervals.reduce(
    (total, interval) => total + interval.counts.reduce((sum, count) => sum + count, 0),
    0,
  );
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

/// 115000 → "$1,150.00"; -80000 → "-$800.00".
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const dollars = Math.abs(cents) / 100;
  return `${sign}$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/// +23, −16, 0: a difference always shows its direction.
export function formatDifference(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '0';
}

/// "" or "12" → a whole count; anything else is null so the form can refuse it.
export function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/// "" → null (nothing set); "50", "12.35" → the number; junk → undefined.
export function parseMoney(text: string): number | null | undefined {
  const trimmed = text.trim().replace(/^\$/, '');
  if (trimmed === '') return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(trimmed)) return undefined;
  return Number(trimmed);
}
