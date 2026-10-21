import type { CmeRequest, CmeStatus, CmeYear } from './types';

/**
 * CME requests on screen (October 2026): money and dates as the server words
 * them (`apps/api/src/cme/cme.ts` holds the rules).
 */

/// "$1,250.00".
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/// "", "$1,250", "1250.50" → cents; "" is 0; junk is null so a form can refuse it.
export function parseCents(text: string): number | null {
  const trimmed = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (trimmed === '') return 0;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

/// Cents as a form's starting text: 125000 → "1250", 12550 → "125.50".
export function centsText(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/// "Mar 3, 2027", "Mar 3 - 5, 2027", "Mar 30 - Apr 2, 2027".
export function datesWords(startsOn: string, endsOn: string): string {
  const day = (date: string, withYear: boolean) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  if (startsOn === endsOn) return day(startsOn, true);
  if (startsOn.slice(0, 4) !== endsOn.slice(0, 4)) {
    return `${day(startsOn, true)} - ${day(endsOn, true)}`;
  }
  if (startsOn.slice(0, 7) === endsOn.slice(0, 7)) {
    return `${day(startsOn, false)} - ${Number(endsOn.slice(8, 10))}, ${endsOn.slice(0, 4)}`;
  }
  return `${day(startsOn, false)} - ${day(endsOn, true)}`;
}

export const STATUS_WORDS: Record<CmeStatus, string> = {
  PENDING: 'Waiting for a decision',
  APPROVED: 'Approved',
  DECLINED: 'Not approved',
  WITHDRAWN: 'Withdrawn',
};

/// What an approved one counts against the allowance: paid back, else approved.
export function countedCents(request: CmeRequest): number {
  if (request.status !== 'APPROVED') return 0;
  return request.reimbursedCents ?? request.approvedCents ?? request.askedCents;
}

/// "$800.00 of $2,000.00 used, $1,200.00 left" for a year.
export function yearWords(year: CmeYear): string {
  if (year.allowanceCents === null) return `${money(year.usedCents)} approved, no allowance set`;
  const left =
    year.leftCents !== null && year.leftCents < 0
      ? `${money(-year.leftCents)} past it`
      : `${money(year.leftCents ?? 0)} left`;
  return `${money(year.usedCents)} of ${money(year.allowanceCents)} used, ${left}`;
}

/// After adding `cents` to a year: "leaves $400.00 of the allowance" or
/// "goes $200.00 past the allowance"; null with no allowance.
export function afterWords(year: CmeYear | undefined, cents: number): string | null {
  if (!year || year.allowanceCents === null || year.leftCents === null) return null;
  const left = year.leftCents - cents;
  return left >= 0
    ? `leaves ${money(left)} of the ${money(year.allowanceCents)} allowance for ${year.year}`
    : `goes ${money(-left)} past the ${money(year.allowanceCents)} allowance for ${year.year}`;
}
