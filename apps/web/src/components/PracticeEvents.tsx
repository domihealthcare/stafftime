import { useEffect, useId, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate, formatTimeCompact, localDate } from '../lib/format';
import { jobRoleHex } from '../lib/job-role-colours';
import type { EventAudience, EventInput, JobRole, Location, PracticeEvent } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Alert, Card } from './ui';

/**
 * Practice events on the schedule: office meetings, provider meetings, a
 * wellness day (September 2026).
 *
 * Not shifts. They sit above the rota and in the month, go to phones through
 * the calendar feed, and add nothing to anybody's hours — somebody paid to be
 * there clocks in as usual (decided with Dominguez).
 */

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

/// The events on one day, all-day ones first, then by start time.
export function eventsOnDay(events: PracticeEvent[], day: string): PracticeEvent[] {
  return events
    .filter((event) => {
      const { first, last } = daysOf(event);
      return first <= day && day <= last;
    })
    .sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        a.startsAt.localeCompare(b.startsAt) ||
        a.title.localeCompare(b.title),
    );
}

/// "All day", "12:30pm–1:30pm", or for a meeting running past midnight
/// "from 6pm" / "until 1am" on its first and last day.
export function eventTimeLabel(event: PracticeEvent, day?: string): string {
  if (event.allDay) return 'All day';
  const { first, last } = daysOf(event);
  const start = formatTimeCompact(event.startsAt);
  const end = formatTimeCompact(event.endsAt);
  if (first === last || !day) return `${start}–${end}`;
  if (day === first) return `from ${start}`;
  if (day === last) return `until ${end}`;
  return 'All day';
}

/// "Everyone", "Provider", "North Bergen".
export function audienceLabel(event: PracticeEvent): string {
  if (event.audience === 'JOB_ROLE') return event.jobRole?.name ?? 'A job role since removed';
  if (event.audience === 'LOCATION') return event.location?.name ?? 'An office since removed';
  return 'Everyone';
}

/// The full "when", for the details pop-up.
function describeWhen(event: PracticeEvent): string {
  if (event.allDay && event.startDate && event.endDate) {
    const first = formatCalendarDate(event.startDate);
    return event.startDate === event.endDate
      ? `${first}, all day`
      : `${first} – ${formatCalendarDate(event.endDate)}, all day`;
  }
  const { first, last } = daysOf(event);
  const day = (iso: string) => formatCalendarDate(localDate(new Date(iso)));
  return first === last
    ? `${day(event.startsAt)}, ${formatTimeCompact(event.startsAt)}–${formatTimeCompact(event.endsAt)}`
    : `${day(event.startsAt)}, ${formatTimeCompact(event.startsAt)} – ${day(event.endsAt)}, ${formatTimeCompact(event.endsAt)}`;
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
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      data-testid="event-chip"
      aria-label={`${event.title}, ${eventTimeLabel(event, day)}, for ${audienceLabel(event)}`}
      className="block w-full rounded-md bg-indigo-50 px-1.5 py-1 text-left text-xs leading-tight text-indigo-950 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100"
    >
      <span className="block truncate font-semibold">
        <span aria-hidden="true">📅</span> {event.title}
      </span>
      <span className="block truncate text-[11px] text-indigo-800">
        {eventTimeLabel(event, day)}
        {event.audience !== 'EVERYONE' && ` · ${audienceLabel(event)}`}
      </span>
    </button>
  );
}

/// What one event is, and — for managers — a way to change or remove it.
export function EventDialog({
  event,
  canEdit,
  onEdit,
  onRemoved,
  onClose,
}: {
  event: PracticeEvent;
  canEdit: boolean;
  onEdit: () => void;
  onRemoved: () => void;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const sure = await confirm({
      title: `Remove “${event.title}”?`,
      body:
        new Date(event.endsAt) > new Date()
          ? 'It comes off the schedule and off synced phone calendars, and the people it was for are told it is cancelled.'
          : 'It comes off the schedule and off synced phone calendars.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    setBusy(true);
    try {
      await api.deleteEvent(event.id);
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
        className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            <span aria-hidden="true">📅</span> {event.title}
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
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">For</dt>
            <dd className="flex items-center gap-1.5 text-slate-800">
              {event.jobRole && (
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: jobRoleHex(event.jobRole.colour) }}
                />
              )}
              {audienceLabel(event)}
              {event.audience === 'LOCATION' && ' staff'}
            </dd>
          </div>
          {event.description && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Details
              </dt>
              <dd className="whitespace-pre-line text-slate-800">{event.description}</dd>
            </div>
          )}
        </dl>

        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}

        {canEdit && (
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              Remove
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onEdit}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
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

/// Adding an event, or changing one.
export function EventForm({
  event,
  locations,
  jobRoles,
  defaultDate,
  onSaved,
  onCancel,
}: {
  /// The event being changed; absent to add one.
  event?: PracticeEvent;
  locations: Location[];
  jobRoles: JobRole[];
  /// Where a new event starts: the first day on screen, or today if that is
  /// in the past.
  defaultDate: Date;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(event?.title ?? '');
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startsAt, setStartsAt] = useState(() => {
    if (event && !event.allDay) return inputValue(new Date(event.startsAt));
    const start = new Date(defaultDate);
    start.setHours(12, 0, 0, 0);
    return inputValue(start);
  });
  const [endsAt, setEndsAt] = useState(() => {
    if (event && !event.allDay) return inputValue(new Date(event.endsAt));
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
  const [place, setPlace] = useState(event?.place ?? '');
  const [audience, setAudience] = useState<EventAudience>(event?.audience ?? 'EVERYONE');
  const [jobRoleId, setJobRoleId] = useState(event?.jobRole?.id ?? '');
  const [locationId, setLocationId] = useState(event?.location?.id ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick the first of the list once it has arrived, so the select never shows
  // one thing while holding another.
  useEffect(() => {
    if (audience === 'JOB_ROLE' && !jobRoleId && jobRoles.length > 0) setJobRoleId(jobRoles[0].id);
    if (audience === 'LOCATION' && !locationId && locations.length > 0)
      setLocationId(locations[0].id);
  }, [audience, jobRoleId, locationId, jobRoles, locations]);

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
    const body: EventInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      place: place.trim() || undefined,
      allDay,
      audience,
      jobRoleId: audience === 'JOB_ROLE' ? jobRoleId : undefined,
      locationId: audience === 'LOCATION' ? locationId : undefined,
      ...(allDay
        ? { startDate, endDate }
        : // datetime-local is the viewer's wall clock; the API stores instants.
          { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }),
    };
    if (!allDay && new Date(endsAt) <= new Date(startsAt)) {
      setError('The event must end after it starts.');
      return;
    }
    if (allDay && endDate < startDate) {
      setError('The last day cannot be before the first.');
      return;
    }
    setBusy(true);
    try {
      if (event) await api.updateEvent(event.id, body);
      else await api.createEvent(body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that event.');
      setBusy(false);
    }
  }

  const field =
    'mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600';
  const label = 'block text-sm font-medium text-slate-700';

  return (
    <Card className="p-4">
      <form
        onSubmit={(form) => void submit(form)}
        className="grid gap-3 sm:grid-cols-2"
        aria-label={event ? 'Change event' : 'New event'}
      >
        <h2 className="text-base font-semibold text-slate-900 sm:col-span-2">
          {event ? 'Change event' : 'New event'}
        </h2>

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-title`} className={label}>
            What is it?
          </label>
          <input
            id={`${id}-title`}
            required
            minLength={2}
            maxLength={120}
            value={title}
            onChange={(change) => setTitle(change.target.value)}
            placeholder="Office meeting, Provider meeting, Wellness day…"
            className={field}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(change) => setAllDay(change.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          All day
        </label>

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
                Starts
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
                Ends
              </label>
              <input
                id={`${id}-ends`}
                type="datetime-local"
                required
                value={endsAt}
                onChange={(change) => setEndsAt(change.target.value)}
                className={field}
              />
            </div>
          </>
        )}

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

        <div>
          <label htmlFor={`${id}-audience`} className={label}>
            Who is it for?
          </label>
          <select
            id={`${id}-audience`}
            value={audience}
            onChange={(change) => setAudience(change.target.value as EventAudience)}
            className={field}
          >
            <option value="EVERYONE">Everyone</option>
            <option value="JOB_ROLE">One job role</option>
            <option value="LOCATION">One office</option>
          </select>
        </div>
        {audience === 'JOB_ROLE' && (
          <div>
            <label htmlFor={`${id}-role`} className={label}>
              Job role
            </label>
            <select
              id={`${id}-role`}
              required
              value={jobRoleId}
              onChange={(change) => setJobRoleId(change.target.value)}
              className={field}
            >
              {jobRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
            placeholder="What to bring, what it is about…"
            className={field}
          />
        </div>

        <p className="text-xs text-slate-500 sm:col-span-2">
          Everybody it is for sees it on their schedule and gets a notification; it reaches their
          phone if they sync their calendar. It does not count as work hours — anybody paid to be
          there clocks in as usual.
        </p>

        {error && (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="flex justify-end gap-2 sm:col-span-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Saving…' : event ? 'Save changes' : 'Add event'}
          </button>
        </div>
      </form>
    </Card>
  );
}
