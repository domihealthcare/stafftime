import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate, formatTimeCompact, localDate } from '../lib/format';
import type { FoundTimes, TimeSuggestion } from '../lib/types';
import type { InviteeSelection } from './InviteePicker';
import { Alert, buttonClass } from './ui';

/// How many days each look covers.
const SEARCH_DAYS = 14;

/**
 * "Find a time" in the event form (October 2026, Dominguez): the best few
 * times in the next two weeks for everybody the meeting is for, going by the
 * rota, time off, availability and their other meetings - never anybody's own
 * calendar. Best first: nobody off or in another meeting, then as many as
 * possible already at work. Pressing one puts it in Starts and Ends; any
 * other time can still be typed.
 */
export function FindATime({
  invitees,
  from,
  minutes,
  eventId,
  onPick,
}: {
  invitees: InviteeSelection;
  /// The first day to look at, "2026-10-20".
  from: string;
  /// How long the meeting is.
  minutes: number;
  /// The meeting being changed, so it is not in its own way.
  eventId?: string;
  onPick: (startsAt: string, endsAt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lookFrom, setLookFrom] = useState(from);
  const [found, setFound] = useState<FoundTimes | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const chosen =
    invitees.employeeIds.length + invitees.jobRoleIds.length + invitees.locationIds.length > 0;
  const who = JSON.stringify(invitees);

  // A different list or length makes the answers stale: look again from the
  // form's day when next asked.
  useEffect(() => {
    setFound(null);
    setPicked(null);
    setOpen(false);
  }, [who, minutes]);

  async function look(day: string) {
    setOpen(true);
    setBusy(true);
    setError(null);
    setLookFrom(day);
    try {
      setFound(
        await api.findATime({
          audience: invitees.everyone ? 'EVERYONE' : 'CHOSEN',
          invitees: invitees.everyone
            ? undefined
            : {
                employeeIds: invitees.employeeIds,
                jobRoleIds: invitees.jobRoleIds,
                locationIds: invitees.locationIds,
              },
          from: day,
          days: SEARCH_DAYS,
          minutes,
          eventId,
        }),
      );
    } catch (err) {
      setFound(null);
      setError(err instanceof ApiError ? err.message : 'Could not look for a time.');
    } finally {
      setBusy(false);
    }
  }

  const canLook = invitees.everyone || chosen;
  const nextFrom = found ? addDays(found.from, found.days) : null;

  return (
    <div className="sm:col-span-2" data-testid="find-a-time">
      <button
        type="button"
        disabled={!canLook || busy}
        onClick={() => void look(from)}
        className={buttonClass('secondary', 'sm')}
      >
        {busy && !found ? 'Looking…' : 'Find a time everyone is free'}
      </button>
      {!canLook && <span className="ml-2 text-xs text-slate-500">Add who it is for first.</span>}

      {open && (
        <div
          role="region"
          aria-label="Suggested times"
          className="mt-2 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-inset ring-slate-200"
        >
          {error && <Alert>{error}</Alert>}
          {found && (
            <>
              <p className="text-slate-700">
                The best {found.suggestions.length === 1 ? 'time' : 'times'} for{' '}
                {found.people === 1 ? '1 person' : `${found.people} people`} in the {found.days}{' '}
                days from {formatCalendarDate(found.from, { year: false })}, going by the rota, time
                off, availability and their other meetings.
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                It can’t see anybody’s own calendar. Best first: nobody off or busy, then the most
                already at work.
              </p>
              {found.suggestions.length === 0 ? (
                <p className="mt-2 font-medium text-slate-800">
                  Nothing between 7am and 7pm in those days - try the next two weeks, or a shorter
                  meeting.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {found.suggestions.map((suggestion) => (
                    <SuggestionRow
                      key={suggestion.startsAt}
                      suggestion={suggestion}
                      picked={picked === suggestion.startsAt}
                      onPick={() => {
                        setPicked(suggestion.startsAt);
                        onPick(suggestion.startsAt, suggestion.endsAt);
                      }}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {nextFrom && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void look(nextFrom)}
                className={buttonClass('secondary', 'sm')}
              >
                {busy ? 'Looking…' : 'Look at the next two weeks'}
              </button>
            )}
            {found && lookFrom !== from && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void look(from)}
                className={buttonClass('secondary', 'sm')}
              >
                Back to the first two weeks
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 text-sm text-slate-600 underline"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  picked,
  onPick,
}: {
  suggestion: TimeSuggestion;
  picked: boolean;
  onPick: () => void;
}) {
  const day = formatCalendarDate(localDate(new Date(suggestion.startsAt)), { year: false });
  const when = `${day}, ${formatTimeCompact(suggestion.startsAt)}–${formatTimeCompact(suggestion.endsAt)}`;
  const everyoneThere = suggestion.atWork === suggestion.total;
  return (
    <li
      data-testid="time-suggestion"
      className={`rounded-lg bg-white p-2 ring-1 ring-inset ${
        picked ? 'ring-brand-600' : 'ring-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-900">{when}</span>
        <button
          type="button"
          onClick={onPick}
          aria-label={picked ? `Chosen: ${when}` : `Use ${when}`}
          className={buttonClass(picked ? 'primary' : 'secondary', 'sm')}
        >
          {picked ? 'Chosen ✓' : 'Use this time'}
        </button>
      </div>
      <p className="mt-0.5 text-xs text-slate-600">
        {everyoneThere
          ? suggestion.total === 1
            ? 'At work then'
            : `All ${suggestion.total} at work then`
          : `${suggestion.atWork} of ${suggestion.total} at work then`}
        {suggestion.notOnRota.length > 0 &&
          ` · not on the rota then: ${suggestion.notOnRota.join(', ')}`}
      </p>
      {suggestion.check.map((person) => (
        <p key={`check-${person.name}`} className="text-xs text-amber-800">
          Check: {person.name} - {person.why}
        </p>
      ))}
      {suggestion.busy.map((person) => (
        <p key={`busy-${person.name}`} className="text-xs text-rose-700">
          {person.name} - {person.why}
        </p>
      ))}
    </li>
  );
}

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
