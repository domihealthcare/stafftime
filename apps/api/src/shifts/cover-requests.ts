import { PRACTICE_ZONE } from '../common/util/zoned-time.util';

/**
 * "Someone called out: ask who can cover" (October 2026, Dominguez — a
 * "smarter" idea). The words, and what a person asked is shown — pure, so
 * they can be tested without a database. See `cover-requests.service.ts`.
 */

export interface CoverShift {
  startsAt: Date;
  endsAt: Date;
  isRemote: boolean;
  location: { name: string } | null;
  jobRole: { name: string } | null;
}

/// "Tue, Oct 14, 7:00 AM–2:00 PM", on the practice's clock.
export function coverWhen(shift: Pick<CoverShift, 'startsAt' | 'endsAt'>): string {
  const day = shift.startsAt.toLocaleDateString('en-US', {
    timeZone: PRACTICE_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = (at: Date) =>
    at.toLocaleTimeString('en-US', { timeZone: PRACTICE_ZONE, hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time(shift.startsAt)}–${time(shift.endsAt)}`;
}

/// "West New York (Front Desk)", or "from home".
export function coverWhere(shift: Pick<CoverShift, 'isRemote' | 'location' | 'jobRole'>): string {
  const place = shift.isRemote ? 'from home' : `at ${shift.location?.name ?? 'the office'}`;
  return shift.jobRole ? `${place} (${shift.jobRole.name})` : place;
}

export interface Words {
  title: string;
  body: string;
}

/// To each person asked.
export function askWords(shift: CoverShift): Words {
  return {
    title: `Can you cover ${coverWhen(shift)}?`,
    body: `A shift ${coverWhere(shift)} needs somebody. The first to say yes gets it — answer in Domi Staff.`,
  };
}

/// To the manager who asked, when somebody says yes.
export function takenWords(shift: CoverShift, who: string): Words {
  return {
    title: `${who} will cover ${coverWhen(shift)}`,
    body: `They said yes, so the shift ${coverWhere(shift)} is theirs and on their schedule.`,
  };
}

/// To the others asked who had not said no, once it is taken.
export function coveredWords(shift: CoverShift): Words {
  return {
    title: `${coverWhen(shift)} is covered`,
    body: 'Somebody else said yes first — thank you for being asked.',
  };
}

/// To the manager, when everybody asked has said no.
export function nobodyWords(shift: CoverShift, asked: number): Words {
  return {
    title: `Nobody you asked can cover ${coverWhen(shift)}`,
    body: `All ${asked} said no. The shift ${coverWhere(shift)} is still open — ask somebody else, or put somebody in it.`,
  };
}

/// To those still to answer, when the manager stops asking.
export function stoppedWords(shift: CoverShift): Words {
  return {
    title: `${coverWhen(shift)} no longer needs covering`,
    body: 'Thanks — you do not need to answer.',
  };
}

/// Where the shift stands, for the person asked.
/// - `open`: still needs somebody, and they can say yes;
/// - `yours`: they said yes and got it;
/// - `covered`: somebody else got it, or a manager filled it;
/// - `stopped`: the manager stopped asking;
/// - `started`: too late to say yes.
export type CoverState = 'open' | 'yours' | 'covered' | 'stopped' | 'started';

export function coverState(
  request: { closedAt: Date | null; takenById: string | null },
  shift: { employeeId: string | null; startsAt: Date; status: string },
  viewerId: string,
  now: Date,
): CoverState {
  if (request.takenById === viewerId || (shift.employeeId === viewerId && request.closedAt)) {
    return 'yours';
  }
  if (request.takenById || shift.employeeId) return 'covered';
  if (request.closedAt || shift.status === 'CANCELLED') return 'stopped';
  if (shift.startsAt <= now) return 'started';
  return 'open';
}
