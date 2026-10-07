import { formatTimeCompact, localDate } from '../lib/format';
import type { PracticeEvent, Shift } from '../lib/types';
import { eventsOnDay, shortTitle } from './PracticeEvents';

/// The rep lunches at an office on a day.
export function lunchesAt(events: PracticeEvent[], locationId: string, day: string) {
  return eventsOnDay(
    events.filter((event) => event.kind === 'REP_LUNCH' && event.atLocation?.id === locationId),
    day,
  );
}

/// "Rep lunch at 12:30pm with Jane Smith (Novo Nordisk), bringing catering",
/// or "No rep lunch, bring your own lunch". No dashes: the month grid uses
/// "—" for a day with nothing on it.
export function lunchWords(lunches: PracticeEvent[]): string {
  if (lunches.length === 0) return 'No rep lunch, bring your own lunch';
  return lunches
    .map(
      (lunch) =>
        `Rep lunch at ${formatTimeCompact(lunch.startsAt)} with ${shortTitle(lunch)}${
          lunch.rep?.company ? ` (${lunch.rep.company})` : ''
        }${
          lunch.rep?.food === 'CATERING'
            ? ', bringing catering'
            : lunch.rep?.food === 'SELF_ORDER'
              ? ', the office orders'
              : ''
        }`,
    )
    .join('; ');
}

/**
 * Lunch on a shift (October 2026, Dominguez: "if there is lunch scheduled
 * (or not scheduled) should show that in the employees shift - via an
 * icon"): 🍽️ when a rep is bringing lunch to that office that day, 🥪 when
 * nobody is — bring your own. Shifts at an office only; from home there is
 * nothing to say. The words are in the tooltip and for screen readers.
 */
export function LunchIcon({ shift, events }: { shift: Shift; events: PracticeEvent[] }) {
  if (shift.isRemote || !shift.employeeId) return null;
  const lunches = lunchesAt(events, shift.locationId, localDate(new Date(shift.startsAt)));
  const words = lunchWords(lunches);
  return (
    <span
      data-testid="lunch-icon"
      data-lunch={lunches.length > 0 ? 'rep' : 'none'}
      title={words}
      className="shrink-0"
    >
      <span aria-hidden="true">{lunches.length > 0 ? '🍽️' : '🥪'}</span>
      <span className="sr-only">{words}. </span>
    </span>
  );
}
