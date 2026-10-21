import { CmeStatus } from '@prisma/client';

/**
 * CME activities a provider asks to have approved (October 2026, Dominguez: "a
 * CME reimbursement submission form for providers for managers to approve ...
 * it's to approve a cme activity/event"), and their yearly allowance.
 *
 * - **Asked**: what it will cost (registration, travel, lodging, other).
 * - **Counted against the allowance**: an approved one, at what was paid back
 *   once it has been, else at what was approved. Still waiting is shown beside
 *   it, never counted.
 * - **The year** is the calendar year the activity starts in.
 * - Going past the allowance **warns, never refuses** - the manager decides.
 *
 * Pure, and the only place these rules live. Money in cents.
 */

/// The most one line of cost may be: $50,000.
export const MAX_CENTS = 5_000_000;
/// How far back an activity may be asked about (already attended), and ahead.
export const DAYS_BACK = 366;
export const YEARS_AHEAD = 2;

export interface CmeCosts {
  registrationCents: number;
  travelCents: number;
  lodgingCents: number;
  otherCents: number;
}

export interface CmeCounted extends CmeCosts {
  status: CmeStatus;
  /// "YYYY-MM-DD".
  startsOn: string;
  approvedCents: number | null;
  reimbursedCents: number | null;
}

export function askedCents(costs: CmeCosts): number {
  return costs.registrationCents + costs.travelCents + costs.lodgingCents + costs.otherCents;
}

/// What an approved one takes off the allowance; nothing for any other.
export function countedCents(request: CmeCounted): number {
  if (request.status !== CmeStatus.APPROVED) return 0;
  return request.reimbursedCents ?? request.approvedCents ?? askedCents(request);
}

export const yearOf = (date: string) => Number(date.slice(0, 4));

export interface CmeYear {
  year: number;
  allowanceCents: number | null;
  /// Approved (or paid back), counted against the allowance.
  usedCents: number;
  /// Still waiting for a decision.
  waitingCents: number;
  /// What is left; null with no allowance. Below zero when past it.
  leftCents: number | null;
}

export function yearSummary(
  requests: CmeCounted[],
  year: number,
  allowanceCents: number | null,
): CmeYear {
  const inYear = requests.filter((request) => yearOf(request.startsOn) === year);
  const usedCents = inYear.reduce((sum, request) => sum + countedCents(request), 0);
  const waitingCents = inYear
    .filter((request) => request.status === CmeStatus.PENDING)
    .reduce((sum, request) => sum + askedCents(request), 0);
  return {
    year,
    allowanceCents,
    usedCents,
    waitingCents,
    leftCents: allowanceCents === null ? null : allowanceCents - usedCents,
  };
}

/// "$1,250.00".
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/// "Mar 3, 2027" or "Mar 3 - 5, 2027" or "Dec 30, 2026 - Jan 2, 2027".
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

export interface CmeInput extends CmeCosts {
  title: string;
  startsOn: string;
  endsOn: string;
  credits?: number | null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/// What is wrong with a request, in words for the provider, or null.
export function requestProblem(input: CmeInput, today: string): string | null {
  if (input.title.trim().length < 3) return 'Give the activity a name.';
  if (!DATE_ONLY.test(input.startsOn) || !DATE_ONLY.test(input.endsOn)) {
    return 'Give the first and last day.';
  }
  if (input.endsOn < input.startsOn) return 'The last day is before the first.';
  if (addDays(input.startsOn, 31) < input.endsOn) return 'An activity of a month at most.';
  if (input.startsOn < addDays(today, -DAYS_BACK)) {
    return 'That was more than a year ago.';
  }
  if (yearOf(input.startsOn) > yearOf(today) + YEARS_AHEAD) {
    return `Ask about activities up to ${YEARS_AHEAD} years ahead.`;
  }
  const lines = [input.registrationCents, input.travelCents, input.lodgingCents, input.otherCents];
  if (lines.some((cents) => !Number.isInteger(cents) || cents < 0 || cents > MAX_CENTS)) {
    return 'Each cost is from $0 to $50,000.';
  }
  if (input.credits != null && (!(input.credits >= 0) || input.credits > 200)) {
    return 'Credits are a number from 0 to 200.';
  }
  return null;
}
