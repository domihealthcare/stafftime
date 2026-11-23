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

// ------------------------------------------------------- telling about it

/// The longest message written for the person with "Let them know".
export const MAX_RAISE_MESSAGE_LENGTH = 1000;

interface Named {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}

const nameOf = (person: Named) => `${person.preferredName ?? person.firstName} ${person.lastName}`;

/// "Monday, Dec 1": the day a change starts, for the bell and the email.
function dayWords(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/// Why an approved raise cannot be told to the person yet, or null.
export function tellProblem(raise: {
  status: PayRaiseStatus;
  toldAt: Date | null;
  payChangeKept: boolean;
  message: string | null;
}): string | null {
  if (raise.status !== PayRaiseStatus.APPROVED) {
    return 'Only an approved raise can be told to the person.';
  }
  if (raise.toldAt) return 'They have already been told about this raise.';
  if (!raise.payChangeKept) {
    return 'The pay change this raise made has been taken out of the history, so there is nothing to show them.';
  }
  if ((raise.message ?? '').trim().length > MAX_RAISE_MESSAGE_LENGTH) {
    return `The message is at most ${MAX_RAISE_MESSAGE_LENGTH} characters.`;
  }
  return null;
}

/// What the person is told, on the bell and by email (November 2026, Kayla:
/// "Typically, I will email the individual"). Never the amount: an email and
/// a phone notification go outside the app, so the pay itself is read on
/// Your pay, behind their PIN.
export function raiseNoticeWords(
  raise: { effectiveOn: string; newPosition: string | null },
  today: string,
) {
  const what = raise.newPosition ? 'Your pay and position' : 'Your pay';
  const when =
    raise.effectiveOn > today
      ? `change${raise.newPosition ? '' : 's'} from ${dayWords(raise.effectiveOn)}`
      : `changed on ${dayWords(raise.effectiveOn)}`;
  return {
    title: 'Good news about your pay',
    body: `${what} ${when}. See it under Your pay in Domi Staff; your PIN is asked first.`,
    link: '/your-pay',
  };
}

/// What whoever runs payroll is told: whose raise and from when, never the
/// amount, which they read on Pay & raises behind their PIN.
export function payrollNoticeWords(
  subject: Named,
  subjectId: string,
  raise: { effectiveOn: string },
  today: string,
) {
  const when =
    raise.effectiveOn > today
      ? `starts ${dayWords(raise.effectiveOn)}`
      : `started ${dayWords(raise.effectiveOn)}`;
  return {
    title: `Update ADP: a raise for ${nameOf(subject)}`,
    body: `Their new pay ${when}. Domi Staff does not change ADP. See it on Pay & raises; your PIN is asked first.`,
    link: `/pay?person=${subjectId}`,
  };
}

/// The pay changes the person may see on Your pay: every change in their
/// history except one made by an approved raise they have not been told
/// about yet (so the screen never gets ahead of Kayla's conversation).
export function visibleToPerson<T extends { id: string }>(
  changes: T[],
  untoldChangeIds: Set<string>,
): T[] {
  return changes.filter((change) => !untoldChangeIds.has(change.id));
}
