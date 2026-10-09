import { useDialog } from './useDialog';
import { useCallback, useEffect, useId, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate, formatTimeCompact, localDate } from '../lib/format';
import { Link } from 'react-router-dom';
import { CALENDAR_KINDS, KIND_STYLE, officeShort } from '../lib/calendar-kinds';
import { FOOD_LABEL, STATUS_LABEL } from '../lib/reps';
import { jobRoleHex } from '../lib/job-role-colours';
import type {
  Employee,
  EventAudience,
  EventInput,
  EventKind,
  JobRole,
  Location,
  EventRep,
  PracticeEvent,
  Rep,
  RepeatInput,
} from '../lib/types';
import { useConfirm, type ConfirmOptions } from './ConfirmDialog';
import { InviteePicker, NOBODY, type InviteeSelection } from './InviteePicker';
import { RepeatPicker } from './RepeatPicker';
import { Alert, Badge, Card, buttonClass } from './ui';

/**
 * Practice events on the schedule: office meetings, provider meetings, a
 * wellness day — and closures: Christmas, Christmas Eve from 1pm, one office
 * shut for the day (September 2026). Since October 2026 also holidays that
 * shut nothing (Election Day) and the diagnostics schedule ("US + ECHO 8–2,
 * West New York"), all on the practice calendar.
 *
 * Not shifts. They sit above the rota and in the month, go to phones through
 * the calendar feed, and add nothing to anybody's hours — somebody paid to be
 * there clocks in as usual (decided with Dominguez). A shift that lands in a
 * closure is warned about, never refused, and pay is untouched.
 */

export const isClosure = (event: PracticeEvent) => event.kind === 'CLOSURE';
/// Holidays, diagnostics and rep lunches are for everyone; nobody chooses who.
const forEveryone = (kind: EventKind) =>
  kind === 'HOLIDAY' || kind === 'DIAGNOSTIC' || kind === 'REP_LUNCH';
/// Diagnostics and rep lunches happen at an office.
const atAnOffice = (kind: EventKind) => kind === 'DIAGNOSTIC' || kind === 'REP_LUNCH';

/// What a chip calls it: a rep lunch by its rep, the rest by their title.
export function shortTitle(event: PracticeEvent): string {
  return event.kind === 'REP_LUNCH'
    ? (event.rep?.name ?? event.title.replace(/^Rep lunch: /, ''))
    : event.title;
}

/// A video call link fit to open: https only. The server refuses anything
/// else; this is the second lock on the door.
export function joinLink(event: PracticeEvent): string | null {
  return event.meetingUrl && /^https:\/\/\S+$/.test(event.meetingUrl) ? event.meetingUrl : null;
}

/// The days an event covers, as the viewer's "YYYY-MM-DD".
function daysOf(event: PracticeEvent): { first: string; last: string } {
  if (event.allDay && event.startDate && event.endDate) {
    return { first: event.startDate, last: event.endDate };
  }
  // A meeting that ends at midnight belongs to the day it started.
  return {
    first: localDate(new Date(event.startsAt)),
    last: localDate(new Date(new Date(event.endsAt).getTime() - 1)),
  };
}

/// The events on one day: closures first, then holidays, diagnostics and
/// meetings; within each, all-day ones first, then by time.
export function eventsOnDay(events: PracticeEvent[], day: string): PracticeEvent[] {
  const rank = (event: PracticeEvent) => CALENDAR_KINDS.indexOf(event.kind);
  return events
    .filter((event) => {
      const { first, last } = daysOf(event);
      return first <= day && day <= last;
    })
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(b.allDay) - Number(a.allDay) ||
        a.startsAt.localeCompare(b.startsAt) ||
        a.title.localeCompare(b.title),
    );
}

/// Midnight on the viewer's clock — the end of a "closes at 1pm" day.
const atMidnight = (iso: string) => {
  const date = new Date(iso);
  return date.getHours() === 0 && date.getMinutes() === 0;
};

/// "All day", "12:30pm–1:30pm", or for a meeting running past midnight
/// "from 6pm" / "until 1am" on its first and last day. A closure says
/// "Closed all day", "Closed from 1pm", "Closed 12pm–2pm".
export function eventTimeLabel(event: PracticeEvent, day?: string): string {
  const closed = isClosure(event);
  const words = (text: string) => (closed ? `Closed ${text}` : text);
  if (event.allDay) return closed ? 'Closed all day' : 'All day';
  const { first, last } = daysOf(event);
  const start = formatTimeCompact(event.startsAt);
  const end = formatTimeCompact(event.endsAt);
  if (first === last || !day) {
    return atMidnight(event.endsAt) ? words(`from ${start}`) : words(`${start}–${end}`);
  }
  if (day === first) return words(`from ${start}`);
  if (day === last) return words(`until ${end}`);
  return words('all day');
}

/// "Everyone", "Provider", "North Bergen" — or for a closure, which offices.
export function audienceLabel(event: PracticeEvent): string {
  if (atAnOffice(event.kind)) return event.atLocation?.name ?? 'An office since removed';
  if (event.audience === 'CHOSEN') {
    const names = event.invitees.map((invitee) => invitee.name);
    if (names.length === 0) return 'Nobody — everyone on the list has since gone';
    return names.length <= 3
      ? names.join(', ')
      : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  }
  if (event.audience === 'JOB_ROLE') return event.jobRole?.name ?? 'A job role since removed';
  if (event.audience === 'LOCATION') return event.location?.name ?? 'An office since removed';
  return isClosure(event) ? 'Both offices' : 'Everyone';
}

/// The full "when", for the details pop-up.
function describeWhen(event: PracticeEvent): string {
  const closed = isClosure(event);
  if (event.allDay && event.startDate && event.endDate) {
    const first = formatCalendarDate(event.startDate);
    const whole = closed ? 'closed all day' : 'all day';
    return event.startDate === event.endDate
      ? `${first}, ${whole}`
      : `${first} – ${formatCalendarDate(event.endDate)}, ${whole}`;
  }
  const { first, last } = daysOf(event);
  const day = (iso: string) => formatCalendarDate(localDate(new Date(iso)));
  if (first === last) {
    return `${day(event.startsAt)}, ${eventTimeLabel(event).replace(/^Closed/, 'closed')}`;
  }
  return `${day(event.startsAt)}, ${formatTimeCompact(event.startsAt)} – ${day(event.endsAt)}, ${formatTimeCompact(event.endsAt)}`;
}

/// One event, small enough for a rota cell. Opens the details.
export function EventChip({
  event,
  day,
  onOpen,
}: {
  event: PracticeEvent;
  day: string;
  onOpen: (event: PracticeEvent) => void;
}) {
  const style = KIND_STYLE[event.kind];
  const atOffice = atAnOffice(event.kind);
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      data-testid={`${event.kind === 'EVENT' ? 'event' : event.kind.toLowerCase()}-chip`}
      aria-label={`${event.title}, ${eventTimeLabel(event, day)}, ${
        event.kind === 'EVENT' ? 'for ' : atOffice ? 'at ' : ''
      }${audienceLabel(event)}`}
      className={`block w-full rounded-md px-1.5 py-1 text-left text-xs leading-tight ring-1 ring-inset ${style.chip}`}
    >
      <span className="block truncate font-semibold">
        <span aria-hidden="true">{style.emoji}</span> {shortTitle(event)}
        {event.series && (
          <span aria-hidden="true" title="Repeats" className="ml-1 font-normal">
            🔁
          </span>
        )}
        {joinLink(event) && (
          <span aria-hidden="true" title="Video call" className="ml-1 font-normal">
            🎥
          </span>
        )}
      </span>
      <span className={`block truncate text-[11px] ${style.subtle}`}>
        {eventTimeLabel(event, day)}
        {atOffice
          ? event.atLocation && ` · ${officeShort(event.atLocation.name)}`
          : event.audience !== 'EVERYONE' && ` · ${audienceLabel(event)}`}
        {event.kind === 'REP_LUNCH' && event.rep?.company && ` · ${event.rep.company}`}
      </span>
    </button>
  );
}

/// What one event is, and — for managers — a way to change or remove it.
export function EventDialog({
  event,
  canEdit,
  onEdit,
  onDuplicate,
  onRemoved,
  onClose,
}: {
  event: PracticeEvent;
  canEdit: boolean;
  onEdit: () => void;
  /// "Add another date like this": the same, on a day still to choose. The
  /// diagnostics schedule is "usually similar but not always the same".
  onDuplicate?: () => void;
  onRemoved: () => void;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const dialog = useDialog(onClose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /// For a date in a series: which dates to remove, asked before the usual
  /// confirmation.
  const [choosing, setChoosing] = useState(false);
  const closed = isClosure(event);

  async function remove(scope: 'one' | 'following') {
    setChoosing(false);
    const upcoming = new Date(event.endsAt) > new Date();
    const sure = await confirm({
      title:
        scope === 'following'
          ? `Remove “${event.title}” from ${formatCalendarDate(localDate(new Date(event.startsAt)), { year: false })} on?`
          : event.series
            ? `Remove “${event.title}” on ${formatCalendarDate(localDate(new Date(event.startsAt)), { year: false })}?`
            : `Remove “${event.title}”?`,
      body: closed
        ? `It comes off the schedule and off synced phone calendars${
            upcoming ? ', and staff are told the office is open as usual' : ''
          }.`
        : `It comes off the schedule and off synced phone calendars${
            upcoming ? ', and the people it was for are told it is cancelled' : ''
          }.`,
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    setBusy(true);
    try {
      await api.deleteEvent(event.id, scope);
      onRemoved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that event.');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center"
      onMouseDown={(mouse) => mouse.target === mouse.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        {...dialog}
        className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl outline-none"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            <span aria-hidden="true">{KIND_STYLE[event.kind].emoji}</span> {event.title}
            <span className="ml-2 align-middle text-xs font-medium text-slate-500">
              {KIND_STYLE[event.kind].one}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <dl className="space-y-2 text-sm">
          <div>
            <dt className="sr-only">When</dt>
            <dd className="font-medium text-slate-900">{describeWhen(event)}</dd>
          </div>
          {event.place && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Where</dt>
              <dd className="text-slate-800">{event.place}</dd>
            </div>
          )}
          {joinLink(event) && (
            <div>
              <dt className="sr-only">Video call</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <a
                  href={joinLink(event)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  <span aria-hidden="true">🎥</span> Join video call
                </a>
                <span className="truncate text-xs text-slate-500">
                  {new URL(joinLink(event)!).host}
                </span>
              </dd>
            </div>
          )}
          {atAnOffice(event.kind) && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">At</dt>
              <dd className="text-slate-800">{audienceLabel(event)}</dd>
            </div>
          )}
          {event.kind === 'REP_LUNCH' && event.rep && <RepDetails rep={event.rep} />}
          {!forEveryone(event.kind) && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {closed ? 'Closed' : 'For'}
              </dt>
              <dd className="flex items-center gap-1.5 text-slate-800">
                {event.jobRole && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: jobRoleHex(event.jobRole.colour) }}
                  />
                )}
                {audienceLabel(event)}
                {!closed && event.audience === 'LOCATION' && ' staff'}
              </dd>
            </div>
          )}
          {event.series && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Repeats
              </dt>
              <dd className="text-slate-800" data-testid="event-series">
                <span aria-hidden="true">🔁</span> {event.series.summary}
              </dd>
            </div>
          )}
          {event.description && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Details
              </dt>
              <dd className="whitespace-pre-line text-slate-800">{event.description}</dd>
            </div>
          )}
        </dl>

        {closed && (
          <p className="mt-3 text-xs text-slate-500">
            Anybody scheduled then is flagged to managers. Pay is not changed by a closure — anybody
            who works clocks in as usual.
          </p>
        )}

        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}

        {canEdit && (
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
            {choosing ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove('one')}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  Just this date
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove('following')}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  This and all after
                </button>
                <button
                  type="button"
                  onClick={() => setChoosing(false)}
                  className={buttonClass('secondary', 'sm')}
                >
                  Keep them
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => (event.series ? setChoosing(true) : void remove('one'))}
                className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                Remove
              </button>
            )}
            {onDuplicate && !choosing && (
              <button
                type="button"
                disabled={busy}
                onClick={onDuplicate}
                className={buttonClass('secondary', 'sm')}
              >
                Add another date like this
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={onEdit}
              className={buttonClass('primary', 'sm')}
            >
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/// "2026-10-14T12:30" in the viewer's own time, for a datetime-local input.
function inputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/// Adding an event, diagnostics date, holiday or closure, or changing one.
export function EventForm({
  event,
  template,
  initialKind = 'EVENT',
  employees,
  locations,
  jobRoles,
  defaultDate,
  onSaved,
  onCancel,
}: {
  /// The event being changed; absent to add one.
  event?: PracticeEvent;
  /// A new one that starts as a copy of this (not its repeat): "Add another
  /// date like this".
  template?: PracticeEvent;
  /// What a new one starts as.
  initialKind?: EventKind;
  /// Everybody who can be put on an event's list.
  employees: Employee[];
  locations: Location[];
  jobRoles: JobRole[];
  /// Where a new event starts: the first day on screen, or today if that is
  /// in the past.
  defaultDate: Date;
  /// With how many dates were written — more than one for a series.
  onSaved: (created: number) => void;
  onCancel: () => void;
}) {
  const id = useId();
  /// Where the fields start from: the event being changed, or the one copied.
  const source = event ?? template;
  const [kind, setKind] = useState<EventKind>(source?.kind ?? initialKind);
  const closed = kind === 'CLOSURE';
  const holiday = kind === 'HOLIDAY';
  const diagnostic = kind === 'DIAGNOSTIC';
  const repLunch = kind === 'REP_LUNCH';
  const atOffice = atAnOffice(kind);
  const confirm = useConfirm();
  const [title, setTitle] = useState(source?.title ?? '');
  /// A rep lunch: the rep, from the managers' list.
  const [repId, setRepId] = useState(source?.rep?.id ?? '');
  const [reps, setReps] = useState<Rep[] | null>(null);
  useEffect(() => {
    if (!repLunch || reps) return;
    api
      .reps()
      .then(setReps)
      .catch(() => setReps([]));
  }, [repLunch, reps]);
  const chosenRep = reps?.find((rep) => rep.id === repId) ?? null;
  // A holiday is the whole day; a meeting usually is not.
  const [allDay, setAllDay] = useState(
    source?.allDay ?? (initialKind === 'CLOSURE' || initialKind === 'HOLIDAY'),
  );
  /// A copy keeps the times of day and moves to the day it is added on.
  const onDay = (iso: string) => {
    const date = new Date(iso);
    if (event) return date;
    const moved = new Date(defaultDate);
    moved.setHours(date.getHours(), date.getMinutes(), 0, 0);
    return moved;
  };
  const [startsAt, setStartsAt] = useState(() => {
    if (source && !source.allDay) return inputValue(onDay(source.startsAt));
    const start = new Date(defaultDate);
    start.setHours(12, 0, 0, 0);
    return inputValue(start);
  });
  const [endsAt, setEndsAt] = useState(() => {
    if (source && !source.allDay) {
      const length = new Date(source.endsAt).getTime() - new Date(source.startsAt).getTime();
      return inputValue(new Date(onDay(source.startsAt).getTime() + length));
    }
    const end = new Date(defaultDate);
    end.setHours(13, 0, 0, 0);
    return inputValue(end);
  });
  const [startDate, setStartDate] = useState(
    event?.startDate ?? (event ? localDate(new Date(event.startsAt)) : localDate(defaultDate)),
  );
  const [endDate, setEndDate] = useState(
    event?.endDate ?? (event ? localDate(new Date(event.startsAt)) : localDate(defaultDate)),
  );
  const [place, setPlace] = useState(source?.place ?? '');
  const [meetingUrl, setMeetingUrl] = useState(source?.meetingUrl ?? '');
  /// A diagnostics date: the office it is at.
  const [atLocationId, setAtLocationId] = useState(source?.atLocation?.id ?? '');
  /// Offered only once Google Meet is set up (Practice settings can't: it is
  /// two server settings — see docs/google-meet-setup.md).
  const [meetAvailable, setMeetAvailable] = useState(false);
  const [createMeet, setCreateMeet] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .appConfig()
      .then((config) => !cancelled && setMeetAvailable(Boolean(config.googleMeet)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const [audience, setAudience] = useState<EventAudience>(source?.audience ?? 'EVERYONE');
  const [jobRoleId, setJobRoleId] = useState(source?.jobRole?.id ?? '');
  const [locationId, setLocationId] = useState(source?.location?.id ?? '');
  const [description, setDescription] = useState(source?.description ?? '');
  /// An event's list: Everyone, or any mix of job roles, offices and people.
  /// One made before the list existed opens with its one role or office on it.
  const [invitees, setInvitees] = useState<InviteeSelection>(() => {
    if (!source || source.audience === 'EVERYONE') return { ...NOBODY, everyone: true };
    if (source.audience === 'JOB_ROLE')
      return { ...NOBODY, jobRoleIds: source.jobRole ? [source.jobRole.id] : [] };
    if (source.audience === 'LOCATION')
      return { ...NOBODY, locationIds: source.location ? [source.location.id] : [] };
    return {
      everyone: false,
      employeeIds: source.invitees.filter((i) => i.type === 'EMPLOYEE').map((i) => i.id),
      jobRoleIds: source.invitees.filter((i) => i.type === 'JOB_ROLE').map((i) => i.id),
      locationIds: source.invitees.filter((i) => i.type === 'LOCATION').map((i) => i.id),
    };
  });
  const [repeat, setRepeat] = useState<RepeatInput | null>(() =>
    event?.series
      ? {
          frequency: event.series.frequency,
          interval: event.series.interval,
          weekdays: event.series.weekdays,
          monthlyMode: event.series.monthlyMode ?? undefined,
          monthlyWeek: event.series.monthlyWeek ?? undefined,
          until: event.series.until,
        }
      : null,
  );
  /// A new closure can be entered for the next few years too.
  const [yearly, setYearly] = useState(false);
  const [yearsAhead, setYearsAhead] = useState(5);
  /// A date in a series: change just it, or it and every one after it.
  const [scope, setScope] = useState<'one' | 'following'>('one');
  const showRepeat = !holiday && (!event || !event.series || scope === 'following');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick the first of the list once it has arrived, so the select never shows
  // one thing while holding another.
  useEffect(() => {
    if (audience === 'JOB_ROLE' && !jobRoleId && jobRoles.length > 0) setJobRoleId(jobRoles[0].id);
    if (audience === 'LOCATION' && !locationId && locations.length > 0)
      setLocationId(locations[0].id);
    if (atAnOffice(kind) && !atLocationId && locations.length > 0) setAtLocationId(locations[0].id);
  }, [audience, jobRoleId, locationId, kind, atLocationId, jobRoles, locations]);

  function chooseKind(next: EventKind) {
    setKind(next);
    // A closure shuts an office, never a job role or a list of people.
    if (next === 'CLOSURE' && audience !== 'LOCATION') setAudience('EVERYONE');
    if (next === 'HOLIDAY') setAllDay(true);
    else if (!event) setAllDay(next === 'CLOSURE');
  }

  /// Moving the start keeps the length, so a one-hour meeting stays one hour.
  function moveStart(value: string) {
    const oldStart = new Date(startsAt).getTime();
    const oldEnd = new Date(endsAt).getTime();
    const newStart = new Date(value).getTime();
    setStartsAt(value);
    if (Number.isFinite(oldStart) && Number.isFinite(oldEnd) && Number.isFinite(newStart)) {
      setEndsAt(inputValue(new Date(newStart + Math.max(oldEnd - oldStart, 30 * 60_000))));
    }
  }

  function moveStartDate(value: string) {
    // Keep the same number of days.
    const span =
      (new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) /
      86_400_000;
    setStartDate(value);
    if (value && Number.isFinite(span)) {
      const end = new Date(`${value}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + Math.max(0, span));
      setEndDate(end.toISOString().slice(0, 10));
    }
  }

  async function submit(form: React.FormEvent) {
    form.preventDefault();
    setError(null);
    const chosen =
      invitees.employeeIds.length + invitees.jobRoleIds.length + invitees.locationIds.length > 0;
    if (kind === 'EVENT' && !invitees.everyone && !chosen) {
      setError('Add who it is for — Everyone, or job roles, offices and people.');
      return;
    }
    if (repLunch && !repId) {
      setError('Choose the rep.');
      return;
    }
    if (atOffice && !atLocationId) {
      setError('Choose which office it is at.');
      return;
    }
    if (
      kind === 'EVENT' &&
      !createMeet &&
      meetingUrl.trim() &&
      !/^https:\/\/\S+$/.test(meetingUrl.trim())
    ) {
      setError('Paste the whole video call link — it starts https://');
      return;
    }
    if (showRepeat && repeat?.frequency === 'WEEKLY' && (repeat.weekdays ?? []).length === 0) {
      setError('Choose at least one day of the week for it to repeat on.');
      return;
    }
    // Warn, never refuse: a rep marked "don't book" can still be put in.
    if (repLunch && chosenRep?.status === 'DO_NOT_BOOK' && chosenRep.id !== event?.rep?.id) {
      const sure = await confirm({
        title: `${chosenRep.name} is marked “Don’t book”`,
        body: chosenRep.notes ? (
          <p className="whitespace-pre-line">{chosenRep.notes}</p>
        ) : undefined,
        confirmLabel: 'Book them anyway',
        cancelLabel: 'Go back',
        tone: 'neutral',
      });
      if (!sure) return;
    }
    const meeting = kind === 'EVENT';
    const body: EventInput = {
      kind,
      title: repLunch ? undefined : title.trim(),
      repId: repLunch ? repId : undefined,
      description: description.trim() || undefined,
      place: meeting ? place.trim() || undefined : undefined,
      meetingUrl: !meeting || createMeet ? undefined : meetingUrl.trim() || undefined,
      createMeetLink: meeting && createMeet ? true : undefined,
      allDay,
      ...(forEveryone(kind)
        ? {
            audience: 'EVERYONE' as EventAudience,
            atLocationId: atOffice ? atLocationId : undefined,
          }
        : closed
          ? {
              audience: audience === 'LOCATION' ? 'LOCATION' : 'EVERYONE',
              locationId: audience === 'LOCATION' ? locationId : undefined,
            }
          : invitees.everyone
            ? { audience: 'EVERYONE' as EventAudience }
            : {
                audience: 'CHOSEN' as EventAudience,
                invitees: {
                  employeeIds: invitees.employeeIds,
                  jobRoleIds: invitees.jobRoleIds,
                  locationIds: invitees.locationIds,
                },
              }),
      // Changing just one date of a series leaves how it repeats alone.
      ...(showRepeat ? { repeat } : {}),
      ...((closed || holiday) && !event && yearly ? { yearsAhead } : {}),
      ...(allDay
        ? { startDate, endDate }
        : // datetime-local is the viewer's wall clock; the API stores instants.
          { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }),
    };
    if (!allDay && new Date(endsAt) <= new Date(startsAt)) {
      setError(
        closed ? 'The closure must end after it starts.' : 'The event must end after it starts.',
      );
      return;
    }
    if (allDay && endDate < startDate) {
      setError('The last day cannot be before the first.');
      return;
    }
    setBusy(true);
    try {
      const saved = event
        ? await api.updateEvent(event.id, body, event.series ? scope : 'one')
        : await api.createEvent(body);
      onSaved(saved.created ?? 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
      setBusy(false);
    }
  }

  const field =
    'mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600';
  const label = 'block text-sm font-medium text-slate-700';
  const heading = `${event ? 'Change' : 'New'} ${KIND_STYLE[kind].one.toLowerCase()}`;

  return (
    <Card className="p-4">
      <form
        onSubmit={(form) => void submit(form)}
        className="grid gap-3 sm:grid-cols-2"
        aria-label={heading}
      >
        <h2 className="text-base font-semibold text-slate-900 sm:col-span-2">{heading}</h2>

        <div
          className="flex flex-wrap rounded-lg border border-slate-300 bg-white p-0.5 sm:col-span-2 sm:w-fit"
          role="group"
          aria-label="What kind"
        >
          {(
            [
              ['EVENT', '📅 An event or meeting'],
              ['DIAGNOSTIC', '🩺 Diagnostics'],
              ['REP_LUNCH', '🍽️ Rep lunch'],
              ['HOLIDAY', '⭐ A holiday (open as usual)'],
              ['CLOSURE', '🔒 The office is closed'],
            ] as const
          ).map(([option, text]) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => chooseKind(option)}
              className={`rounded-md px-3 py-1 text-sm font-medium max-sm:py-2.5 ${
                kind === option
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        {event?.series && (
          <fieldset className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-200 sm:col-span-2">
            <legend className="sr-only">Which dates to change</legend>
            <p className="font-medium">This date is part of a series: {event.series.summary}.</p>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-scope`}
                checked={scope === 'one'}
                onChange={() => setScope('one')}
              />
              Change only this date ({describeWhen(event).split(',').slice(0, 2).join(',')})
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-scope`}
                checked={scope === 'following'}
                onChange={() => setScope('following')}
              />
              Change this date and all after it
            </label>
          </fieldset>
        )}

        {repLunch ? (
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-rep`} className={label}>
              Which rep?
            </label>
            <select
              id={`${id}-rep`}
              required
              value={repId}
              onChange={(change) => setRepId(change.target.value)}
              className={field}
            >
              <option value="">{reps === null ? 'Loading…' : 'Choose a rep…'}</option>
              {(reps ?? []).map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                  {rep.company ? ` — ${rep.company}` : ''}
                  {rep.status === 'DO_NOT_BOOK' ? ' (don’t book)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Not on the list?{' '}
              <Link to="/reps" className="font-medium text-brand-700 underline">
                Add them under Manage → Reps
              </Link>
              .
            </p>
            {chosenRep && (
              <div
                data-testid="chosen-rep"
                className={`mt-2 rounded-lg px-3 py-2 text-sm ring-1 ring-inset ${
                  chosenRep.status === 'DO_NOT_BOOK'
                    ? 'bg-rose-50 text-rose-950 ring-rose-200'
                    : chosenRep.status === 'RESTRICTED'
                      ? 'bg-amber-50 text-amber-950 ring-amber-200'
                      : 'bg-slate-50 text-slate-800 ring-slate-200'
                }`}
              >
                <p className="font-medium">
                  {STATUS_LABEL[chosenRep.status].text}
                  {chosenRep.food ? ` · ${FOOD_LABEL[chosenRep.food]}` : ''}
                  {chosenRep.medication ? ` · ${chosenRep.medication}` : ''}
                </p>
                {chosenRep.notes && <p className="mt-0.5 whitespace-pre-line">{chosenRep.notes}</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-title`} className={label}>
              {closed
                ? 'Which holiday or closure?'
                : holiday
                  ? 'Which holiday?'
                  : diagnostic
                    ? 'Which tests?'
                    : 'What is it?'}
            </label>
            <input
              id={`${id}-title`}
              required
              minLength={2}
              maxLength={120}
              value={title}
              onChange={(change) => setTitle(change.target.value)}
              placeholder={
                closed
                  ? 'Christmas Day, Christmas Eve, New Year’s Day…'
                  : holiday
                    ? 'Election Day, Veterans Day, Black Friday…'
                    : diagnostic
                      ? 'US + ECHO, ANS + VNG…'
                      : 'Office meeting, Provider meeting, Wellness day…'
              }
              className={field}
            />
          </div>
        )}

        {!holiday && (
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(change) => setAllDay(change.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            {closed ? 'Closed all day' : 'All day'}
          </label>
        )}

        {allDay ? (
          <>
            <div>
              <label htmlFor={`${id}-first`} className={label}>
                First day
              </label>
              <input
                id={`${id}-first`}
                type="date"
                required
                value={startDate}
                onChange={(change) => moveStartDate(change.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor={`${id}-last`} className={label}>
                Last day
              </label>
              <input
                id={`${id}-last`}
                type="date"
                required
                min={startDate}
                value={endDate}
                onChange={(change) => setEndDate(change.target.value)}
                className={field}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor={`${id}-starts`} className={label}>
                {closed ? 'Closed from' : 'Starts'}
              </label>
              <input
                id={`${id}-starts`}
                type="datetime-local"
                required
                value={startsAt}
                onChange={(change) => moveStart(change.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor={`${id}-ends`} className={label}>
                {closed ? 'Open again at' : 'Ends'}
              </label>
              <input
                id={`${id}-ends`}
                type="datetime-local"
                required
                value={endsAt}
                onChange={(change) => setEndsAt(change.target.value)}
                className={field}
              />
              {closed && (
                <p className="mt-1 text-xs text-slate-500">
                  Closing early for the rest of the day? Put midnight at the end of that day.
                </p>
              )}
            </div>
          </>
        )}

        {kind === 'EVENT' && (
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-place`} className={label}>
              Where <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id={`${id}-place`}
              maxLength={200}
              value={place}
              onChange={(change) => setPlace(change.target.value)}
              list={`${id}-offices`}
              placeholder="An office, a room, a park, a video call link…"
              className={field}
            />
            {/* The offices, with their addresses, so a phone's map can find them. */}
            <datalist id={`${id}-offices`}>
              {locations.map((location) => (
                <option
                  key={location.id}
                  value={`${location.name} — ${location.addressLine1}, ${location.city}, ${location.state}`}
                />
              ))}
            </datalist>
          </div>
        )}

        {kind === 'EVENT' && (
          <div className="sm:col-span-2">
            {meetAvailable && (
              <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={createMeet}
                  onChange={(change) => setCreateMeet(change.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                />
                {event?.meetingUrl ? 'Make a new Google Meet link' : 'Create a Google Meet link'}
                <span className="text-xs text-slate-500">
                  hosted by the practice account{showRepeat && repeat ? ', one for every date' : ''}
                </span>
              </label>
            )}
            {!createMeet && (
              <>
                <label htmlFor={`${id}-meeting`} className={label}>
                  Video call link <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <input
                  id={`${id}-meeting`}
                  type="url"
                  inputMode="url"
                  maxLength={500}
                  value={meetingUrl}
                  onChange={(change) => setMeetingUrl(change.target.value)}
                  placeholder="https://meet.google.com/…"
                  className={field}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {meetAvailable ? 'Or paste' : 'Paste'} a link from Google Meet, Zoom or Teams.
                  People get a Join button here and a tappable link on their phone calendar.
                </p>
              </>
            )}
          </div>
        )}

        {atOffice ? (
          <div>
            <label htmlFor={`${id}-at`} className={label}>
              Which office?
            </label>
            <select
              id={`${id}-at`}
              required
              value={atLocationId}
              onChange={(change) => setAtLocationId(change.target.value)}
              className={field}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
        ) : holiday ? null : closed ? (
          <>
            <div>
              <label htmlFor={`${id}-audience`} className={label}>
                Which offices are closed?
              </label>
              <select
                id={`${id}-audience`}
                value={audience === 'LOCATION' ? 'LOCATION' : 'EVERYONE'}
                onChange={(change) => setAudience(change.target.value as EventAudience)}
                className={field}
              >
                <option value="EVERYONE">Both offices</option>
                <option value="LOCATION">One office</option>
              </select>
            </div>
            {audience === 'LOCATION' && (
              <div>
                <label htmlFor={`${id}-office`} className={label}>
                  Office
                </label>
                <select
                  id={`${id}-office`}
                  required
                  value={locationId}
                  onChange={(change) => setLocationId(change.target.value)}
                  className={field}
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        ) : (
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-who`} className={label}>
              Who is it for?
            </label>
            <InviteePicker
              id={`${id}-who`}
              value={invitees}
              onChange={setInvitees}
              employees={employees}
              jobRoles={jobRoles}
              locations={locations}
            />
            <p className="mt-1 text-xs text-slate-500">
              Everyone, or any mix of job roles, offices and people — e.g. Provider, Kayla,
              Angelina.
            </p>
          </div>
        )}

        {(closed || holiday) && !event && (
          <div className="sm:col-span-2">
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={yearly}
                onChange={(change) => setYearly(change.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              <span>
                Repeat every year on this date
                <span className="block text-xs text-slate-500">
                  Puts it on the calendar for the next{' '}
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={yearsAhead}
                    disabled={!yearly}
                    aria-label="Years ahead"
                    onChange={(change) =>
                      setYearsAhead(Math.max(1, Math.min(10, Number(change.target.value) || 1)))
                    }
                    className="mx-1 w-14 rounded border-slate-300 py-0.5 text-xs"
                  />
                  years. Each year is its own entry, so a holiday that moves (Thanksgiving) can be
                  fixed one year at a time.
                </span>
              </span>
            </label>
          </div>
        )}

        {showRepeat && (
          <div className="sm:col-span-2">
            <RepeatPicker
              startDate={allDay ? startDate : startsAt.slice(0, 10)}
              value={repeat}
              onChange={setRepeat}
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-details`} className={label}>
            Details <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id={`${id}-details`}
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(change) => setDescription(change.target.value)}
            placeholder={
              diagnostic
                ? 'Book from 9am, the tech’s name, the vendor…'
                : repLunch
                  ? 'How many to feed, where to set up…'
                  : closed || holiday
                    ? 'Anything staff should know…'
                    : 'What to bring, what it is about…'
            }
            className={field}
          />
        </div>

        <p className="text-xs text-slate-500 sm:col-span-2">
          {closed
            ? 'Staff at the office see it on their schedule, get a notification and have it on their phone if they sync their calendar. Shifts during it are flagged to managers, never refused. Pay is not changed.'
            : holiday
              ? 'Everyone sees it on the calendar and on their phone if they sync it. It shuts nothing — nobody is notified and shifts are not flagged. If an office is shut, add a closure instead.'
              : diagnostic
                ? 'Everyone sees it on the calendar and gets a notification when a date is added, moved or cancelled. Write when the tests are on — never a patient’s name or who is booked.'
                : repLunch
                  ? 'Everyone sees it on the calendar — the rep, company, medication and whether they bring catering. Staff at that office are told when it is added, moved or cancelled, and every evening hear whether there is a rep lunch the next day. The front desk sees the rep’s cell; the status and notes stay with managers.'
                  : 'Everybody it is for sees it on their schedule and gets a notification; it reaches their phone if they sync their calendar. It does not count as work hours — anybody paid to be there clocks in as usual.'}
        </p>

        {error && (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            {busy
              ? 'Saving…'
              : event
                ? 'Save changes'
                : `Add ${KIND_STYLE[kind].one.toLowerCase()}`}
          </button>
        </div>
      </form>
    </Card>
  );
}

/// A rep lunch's rep, in its pop-up. Staff get who, the company, the
/// medication and the food; the phone, status and notes come only to managers
/// (the server leaves them out for everybody else).
function RepDetails({ rep }: { rep: EventRep }) {
  const row = (term: string, value: React.ReactNode) => (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{term}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
  return (
    <>
      {row('Rep', `${rep.name}${rep.company ? ` — ${rep.company}` : ''}`)}
      {rep.medication && row('Medication', rep.medication)}
      {rep.food && row('Lunch', FOOD_LABEL[rep.food])}
      {rep.cellPhone &&
        row(
          'Cell',
          <a
            href={`tel:${rep.cellPhone.replace(/[^0-9+]/g, '')}`}
            className="text-brand-700 underline"
          >
            {rep.cellPhone}
          </a>,
        )}
      {rep.status &&
        row(
          'Status',
          <Badge tone={STATUS_LABEL[rep.status].tone}>{STATUS_LABEL[rep.status].text}</Badge>,
        )}
      {rep.notes &&
        row('Notes (managers only)', <span className="whitespace-pre-line">{rep.notes}</span>)}
    </>
  );
}

// ---------------------------------------------------------------------------
// Closures and shifts: warn, never refuse (Dominguez, September 2026)
// ---------------------------------------------------------------------------

export interface ProposedPlace {
  locationId: string;
  startsAt: string;
  endsAt: string;
}

/// The closures that shut the office a shift is at, while it is on.
export function closuresCovering(
  events: PracticeEvent[],
  { locationId, startsAt, endsAt }: ProposedPlace,
): PracticeEvent[] {
  return events.filter(
    (event) =>
      isClosure(event) &&
      (event.audience === 'EVERYONE' || event.location?.id === locationId) &&
      new Date(event.startsAt) < new Date(endsAt) &&
      new Date(event.endsAt) > new Date(startsAt),
  );
}

async function fetchClosures(proposed: ProposedPlace): Promise<PracticeEvent[]> {
  const events = await api.events(proposed.startsAt, proposed.endsAt);
  return closuresCovering(events, proposed);
}

/// Checked while a shift form is filled in, so the warning is there before
/// the button is pressed.
export function useClosureCheck(proposed: ProposedPlace | null): PracticeEvent[] {
  const [closures, setClosures] = useState<PracticeEvent[]>([]);
  const key = proposed ? JSON.stringify(proposed) : '';

  useEffect(() => {
    setClosures([]);
    if (!key) return;
    const query = JSON.parse(key) as ProposedPlace;
    if (!(new Date(query.endsAt) > new Date(query.startsAt))) return;
    let cancelled = false;
    // A short pause, so typing a time does not fire a request per keystroke.
    const timer = window.setTimeout(() => {
      fetchClosures(query)
        .then((found) => !cancelled && setClosures(found))
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  return closures;
}

function closureLine(closure: PracticeEvent): string {
  const where =
    closure.audience === 'LOCATION' ? `${audienceLabel(closure)} is` : 'Both offices are';
  return `${where} closed — ${closure.title} (${eventTimeLabel(closure).replace(/^Closed /, '')})`;
}

/// The warning inside a shift form.
export function ClosureWarning({ closures }: { closures: PracticeEvent[] }) {
  if (closures.length === 0) return null;
  return (
    <div
      data-testid="closure-warning"
      className="rounded-lg border-l-4 border-slate-600 bg-slate-100 px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300"
    >
      {closures.map((closure) => (
        <p key={closure.id} className="font-semibold">
          <span aria-hidden="true">🔒</span> {closureLine(closure)}
        </p>
      ))}
      <p className="mt-0.5">You can still add the shift — it will be flagged on the rota.</p>
    </div>
  );
}

/// Asked again, fresh, when the shift is saved. Yes to go ahead.
export async function confirmClosure(
  confirm: (options: ConfirmOptions) => Promise<boolean>,
  proposed: ProposedPlace,
): Promise<boolean> {
  const closures = await fetchClosures(proposed).catch(() => []);
  if (closures.length === 0) return true;
  return confirm({
    title: 'The office is closed then',
    body: (
      <>
        {closures.map((closure) => (
          <p key={closure.id}>{closureLine(closure)}.</p>
        ))}
        <p className="mt-1">Add the shift anyway? It will be flagged until it is moved.</p>
      </>
    ),
    confirmLabel: 'Yes, add it anyway',
    cancelLabel: 'Go back',
    tone: 'neutral',
  });
}

// ---------------------------------------------------------------------------
// Holidays and closures, a year at a time
// ---------------------------------------------------------------------------

/// Midnight on 1 January in the viewer's own time, as an instant.
const newYear = (year: number) => new Date(year, 0, 1).toISOString();

/**
 * The year's holidays and closures, for everybody — staff see the ones at
 * their offices — with, for managers, "+ Add holiday", "+ Add closure" and
 * "Copy into next year". Copying puts each one on the same date a year on, to be checked:
 * a holiday that moves, like Thanksgiving, lands on the wrong day.
 */
export function ClosuresCard({
  initialYear,
  canEdit,
  version,
  onAdd,
  onOpen,
  onChanged,
  bare = false,
}: {
  /// Inside another card (the Schedule's tabs): no card of its own.
  bare?: boolean;
  initialYear: number;
  canEdit: boolean;
  /// Bumped when events change elsewhere on the page, to re-fetch.
  version: number;
  onAdd: (kind: 'HOLIDAY' | 'CLOSURE') => void;
  onOpen: (closure: PracticeEvent) => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [year, setYear] = useState(initialYear);
  const [closures, setClosures] = useState<PracticeEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .events(newYear(year), newYear(year + 1))
      .then((events) =>
        setClosures(events.filter((event) => isClosure(event) || event.kind === 'HOLIDAY')),
      )
      .catch(() => setClosures([]));
  }, [year]);

  useEffect(() => {
    load();
  }, [load, version]);

  async function copy() {
    const sure = await confirm({
      title: `Copy ${year}’s holidays and closures into ${year + 1}?`,
      body: (
        <>
          <p>
            Each one goes on the same date in {year + 1}, at the same times and offices. Any already
            there are left alone.
          </p>
          <p className="mt-1">
            The holidays that move from year to year — Thanksgiving and the day after, Memorial Day,
            Labor Day, MLK Day, Presidents&rsquo; Day, Columbus Day, Election Day, Good Friday,
            Easter — go to their day in {year + 1}. You&rsquo;ll see a list of what moved, and of
            any that land on a weekend.
          </p>
        </>
      ),
      confirmLabel: `Yes, copy into ${year + 1}`,
      cancelLabel: 'Not now',
      tone: 'neutral',
    });
    if (!sure) return;
    setBusy(true);
    setError(null);
    try {
      const done = await api.copyClosures(year);
      setResult(
        `${done.copied} copied into ${done.toYear}.${
          done.moved.length > 0
            ? ` Moved to their day in ${done.toYear}: ${done.moved.join('; ')}.`
            : ''
        }${
          done.onWeekend.length > 0
            ? ` On a weekend — check which day the office takes instead: ${done.onWeekend.join('; ')}.`
            : ''
        }${done.skipped.length > 0 ? ` Skipped: ${done.skipped.join('; ')}.` : ''}`,
      );
      setYear(done.toYear);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not copy them.');
    } finally {
      setBusy(false);
    }
  }

  const describeDays = (closure: PracticeEvent) => {
    if (closure.allDay && closure.startDate && closure.endDate) {
      const first = formatCalendarDate(closure.startDate, { year: false });
      return closure.startDate === closure.endDate
        ? first
        : `${first} – ${formatCalendarDate(closure.endDate, { year: false })}`;
    }
    return `${formatCalendarDate(localDate(new Date(closure.startsAt)), { year: false })}, ${eventTimeLabel(closure).replace(/^Closed /, '')}`;
  };

  return (
    <Wrap bare={bare} testId="closures-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!bare && (
          <h2 className="text-sm font-semibold text-slate-900">
            <span aria-hidden="true">🔒</span> Holidays and closures
          </h2>
        )}
        <div className="flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            aria-label="Previous year"
            className="rounded px-2 py-0.5 text-slate-600 hover:bg-slate-100"
          >
            ←
          </button>
          <span className="font-medium tabular-nums text-slate-800">{year}</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            aria-label="Next year"
            className="rounded px-2 py-0.5 text-slate-600 hover:bg-slate-100"
          >
            →
          </button>
        </div>
      </div>

      {closures === null ? null : closures.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">None in {year} yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {closures.map((closure) => (
            <li key={closure.id}>
              <button
                type="button"
                onClick={() => onOpen(closure)}
                className="flex w-full flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">
                  <span aria-hidden="true">{KIND_STYLE[closure.kind].emoji}</span> {closure.title}
                </span>
                <span className="text-slate-600">
                  {describeDays(closure)} ·{' '}
                  {isClosure(closure) ? audienceLabel(closure) : 'Open as usual'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {result && (
        <p role="status" className="mt-2 text-sm text-emerald-800">
          {result}
        </p>
      )}
      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onAdd('HOLIDAY')}
            className={buttonClass('secondary', 'sm')}
          >
            + Add holiday
          </button>
          <button
            type="button"
            onClick={() => onAdd('CLOSURE')}
            className={buttonClass('secondary', 'sm')}
          >
            + Add closure
          </button>
          {closures && closures.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void copy()}
              className={buttonClass('secondary', 'sm')}
            >
              {busy ? 'Copying…' : `Copy these into ${year + 1}`}
            </button>
          )}
        </div>
      )}
    </Wrap>
  );
}

/// A card, or — inside the Schedule's tabbed card — just its contents.
function Wrap({
  bare,
  testId,
  children,
}: {
  bare: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  return bare ? (
    <div data-testid={testId}>{children}</div>
  ) : (
    <Card className="p-4" testId={testId}>
      {children}
    </Card>
  );
}
