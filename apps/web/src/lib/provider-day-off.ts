import { displayName, formatClock } from './format';
import { practiceClockOf } from './practice-time';
import type {
  CoverOption,
  CoverOptions,
  PerShiftAction,
  PerShiftDecision,
  ProviderDayOffShift,
} from './types';

/**
 * A provider's day off (November 2026, Dominguez): approving it is decided
 * shift by shift. These are the pure rules behind the dialog and the coverage
 * lines, kept apart so they can be tested.
 */

export const ACTION_LABELS: Record<PerShiftAction, string> = {
  KEEP: 'Keep',
  REMOVE: 'Remove',
  OPEN: 'Leave open',
  ASK: 'Ask for cover',
};

/// Who can be asked: not already on at the time, and not the holder.
export const askable = (option: CoverOption) => option.fit !== 'cannot' && !option.current;

export function askableOf(cover: CoverOptions | null | undefined): CoverOption[] {
  return (cover?.options ?? []).filter(askable);
}

/// Good fits start ticked; the ones with a catch are offered, unticked.
export function defaultPicks(cover: CoverOptions | null | undefined): Set<string> {
  return new Set(
    askableOf(cover)
      .filter((option) => option.fit === 'good')
      .map((option) => option.employeeId),
  );
}

/// Ask for cover when anybody can be asked; otherwise leave it open.
export function defaultAction(cover: CoverOptions | null | undefined): PerShiftAction {
  return askableOf(cover).length > 0 ? 'ASK' : 'OPEN';
}

/// What goes to the server. ASK carries the ticked people, in list order.
export function buildPerShift(
  shifts: { id: string }[],
  actions: Record<string, PerShiftAction>,
  picks: Record<string, Set<string>>,
): PerShiftDecision[] {
  return shifts.map((shift) => {
    const action = actions[shift.id] ?? 'OPEN';
    return action === 'ASK'
      ? { shiftId: shift.id, action, employeeIds: [...(picks[shift.id] ?? [])] }
      : { shiftId: shift.id, action };
  });
}

/// Approve waits until every "Ask for cover" has somebody to ask.
export function allAskedHaveSomeone(decisions: PerShiftDecision[]): boolean {
  return decisions.every(
    (decision) => decision.action !== 'ASK' || (decision.employeeIds?.length ?? 0) > 0,
  );
}

/// "Tue, Nov 17, 9:00 AM–5:00 PM" on the practice's clock.
export function shiftWhen(startsAt: string, endsAt: string): string {
  const day = new Date(startsAt).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${day}, ${formatClock(practiceClockOf(startsAt))}–${formatClock(practiceClockOf(endsAt))}`;
}

/// For the person asked: the server's own words on which of their telemedicine
/// shifts taking this frees ("Your telemedicine ... will be left open.").
export function releasesLine(willRelease: string[] | undefined): string {
  if (!willRelease || willRelease.length === 0) return '';
  return `Taking this would also free your telemedicine: ${willRelease.join(' ')}`;
}

/// One shift's coverage for a manager, once the request is decided.
export function coverageLine(shift: ProviderDayOffShift): string {
  if (shift.status === 'CANCELLED') return 'Removed';
  const cover = shift.cover;
  if (!cover) return shift.employeeId === null ? 'Left open' : 'Still on the rota';
  if (cover.state === 'covered' && cover.takenBy) return `Covered by ${displayName(cover.takenBy)}`;
  if (cover.state === 'open') {
    const asked = cover.asks.length;
    const everyoneNo = asked > 0 && cover.asks.every((ask) => ask.answer === false);
    return asked === 0 || everyoneNo ? 'Nobody yet' : `Asked ${asked}, waiting`;
  }
  return 'Nobody yet';
}
