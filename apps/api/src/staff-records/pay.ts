import { PayRaiseStatus, PayRateUnit } from '@prisma/client';
import type { RaiseOutcome } from './dto/pay.dto';
import type { EmploymentChangeView } from './staff-records.service';

/**
 * The rules of a raise (October 2026, Dominguez: "full steps"), kept apart
 * from the database so they can be tested on their own.
 *
 *   asked for -> a meeting set -> offered -> approved or declined
 *
 * Every step after the ask is optional: a raise can be approved straight from
 * the ask, and the meeting can be set, moved or taken off at any point while
 * it is still open. Approved, declined and withdrawn are the end.
 */
export const OPEN_STATUSES: PayRaiseStatus[] = [
  PayRaiseStatus.REQUESTED,
  PayRaiseStatus.MEETING_SET,
  PayRaiseStatus.OFFERED,
];

export function isOpen(status: PayRaiseStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export interface Decision {
  outcome: RaiseOutcome;
  newRate?: number | null;
  newUnit?: PayRateUnit | null;
  newPosition?: string | null;
  effectiveOn?: string | null;
}

/// What is wrong with a decision, in words for the screen, or null.
export function decisionProblem(status: PayRaiseStatus, decision: Decision): string | null {
  if (!isOpen(status)) return 'This raise has already been settled.';
  const hasRate = decision.newRate !== null && decision.newRate !== undefined;
  const hasUnit = decision.newUnit !== null && decision.newUnit !== undefined;
  if (hasRate !== hasUnit) {
    return hasRate
      ? 'Say whether the new pay is per hour or per year.'
      : 'Give the new pay as well as per hour or per year.';
  }
  if (decision.outcome === 'OFFERED' && !hasRate) return 'Give the pay being offered.';
  if (decision.outcome === 'APPROVED') {
    if (!hasRate) return 'Give the new pay.';
    if (!decision.effectiveOn) return 'Give the day the new pay starts.';
  }
  return null;
}

/// The status a meeting moves a raise to: an offer already made stays offered.
export function statusWithMeeting(status: PayRaiseStatus): PayRaiseStatus {
  return status === PayRaiseStatus.OFFERED ? status : PayRaiseStatus.MEETING_SET;
}

/// And without one: back to asked for, unless an offer is out.
export function statusWithoutMeeting(status: PayRaiseStatus): PayRaiseStatus {
  return status === PayRaiseStatus.OFFERED ? status : PayRaiseStatus.REQUESTED;
}

/// The next pay change still to come (a raise agreed for next month), or null.
/// `changes` may be in any order.
export function upcomingOf(
  changes: EmploymentChangeView[],
  today: string,
): { rate: number; unit: PayRateUnit; effectiveOn: string; position: string | null } | null {
  const next = changes
    .filter((change) => change.effectiveOn > today && change.payRate !== null && change.payUnit)
    .sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn))[0];
  return next
    ? {
        rate: next.payRate!,
        unit: next.payUnit!,
        effectiveOn: next.effectiveOn,
        position: next.position,
      }
    : null;
}

/// A meeting's title on the calendar. It reaches the person's calendar and
/// any manager's, so it says nothing about pay.
export function meetingTitle(personName: string, actorName: string): string {
  return personName === actorName
    ? `Check-in: ${personName}`
    : `Check-in: ${personName} and ${actorName}`;
}
