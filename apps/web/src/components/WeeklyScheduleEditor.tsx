import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../lib/api';
import {
  displayName,
  formatCalendarDate,
  formatClock,
  localDate,
  WEEK_ORDER,
  WEEKDAY_NAMES,
} from '../lib/format';
import type {
  Employee,
  JobRole,
  Location,
  StandingShift,
  WeeklyScheduleResult,
} from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { JobRoleSelect, rolesHeldBy } from './JobRoleSelect';
import { PlaceSelect, WORK_FROM_HOME, homeOfficeOf, placeToShift } from './PlaceSelect';
import { Alert, buttonClass } from './ui';
import { isEveryWeek } from '../lib/repeat-pattern';

/// One day of the usual week, as the grid holds it.
interface DayRow {
  works: boolean;
  startTime: string;
  endTime: string;
  /// An office id, or Work from home.
  place: string;
  jobRoleId: string;
}

type Week = Record<number, DayRow>;

const FIELD =
  'w-full rounded-lg border-slate-300 py-1.5 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600';

function hoursOf(row: DayRow): number {
  const [sh, sm] = row.startTime.split(':').map(Number);
  const [eh, em] = row.endTime.split(':').map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm)) / 60;
}

/// Their regular shifts still running, read back as a week. A day two of
/// them cover is shown once, and said. Every day's job role is one of theirs
/// (`held`, their first by default), as the server insists.
function weekFrom(
  standing: StandingShift[],
  fallbackPlace: string,
  held: string[],
): { week: Week; doubled: number[] } {
  const roleFor = (jobRoleId?: string) =>
    jobRoleId && held.includes(jobRoleId) ? jobRoleId : (held[0] ?? '');
  const week: Week = {};
  const doubled: number[] = [];
  for (const day of WEEK_ORDER) {
    week[day] = {
      works: false,
      startTime: '09:00',
      endTime: '17:00',
      place: fallbackPlace,
      jobRoleId: roleFor(),
    };
  }
  for (const series of standing) {
    for (const day of series.daysOfWeek) {
      if (week[day].works) {
        doubled.push(day);
        continue;
      }
      week[day] = {
        works: true,
        startTime: series.startTime,
        endTime: series.endTime,
        place: series.isRemote ? WORK_FROM_HOME : series.locationId,
        jobRoleId: roleFor(series.jobRole?.id),
      };
    }
  }
  return { week, doubled };
}

/**
 * Somebody's usual week, set in one go (asked for by Dominguez, September
 * 2026): each day off, or hours, a place and which of their job roles.
 * Saved as their regular shifts with no end date, which keep the rota filled
 * eight weeks ahead; days with the same hours and place share one.
 *
 * Before this, a salaried person working "Mondays 12 to 8 at North Bergen,
 * Tuesdays 9 to 5 at West New York" needed a repeating shift made for each
 * day. It is on the Staff editor and under Schedule → Regular shifts.
 */
export function WeeklyScheduleEditor({
  person,
  locations,
  jobRoles,
  onSaved,
  onDirtyChange,
}: {
  person: Employee;
  locations: Location[];
  jobRoles: JobRole[];
  /// Shifts were written or taken off; the rota should be fetched again.
  onSaved?: () => void;
  /// For a surrounding editor that asks before closing on unsaved changes.
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const confirm = useConfirm();
  const offices = useMemo(
    () => locations.filter((l) => person.locations.some((a) => a.locationId === l.id)),
    [locations, person.locations],
  );
  const homeOffice = homeOfficeOf(person);
  const held = useMemo(() => rolesHeldBy(person.id, jobRoles), [person.id, jobRoles]);
  const heldIds = held.map((role) => role.id).join();
  // Keyed on ids, not the arrays: the Staff screen fetches its lists again
  // after a photo or PIN change, and that must not wipe edits in progress.
  const firstOffice = offices[0]?.id ?? '';
  const [saved, setSaved] = useState<{ week: Week; doubled: number[] } | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [from, setFrom] = useState(() => localDate(new Date()));
  const [asDrafts, setAsDrafts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<WeeklyScheduleResult | null>(null);

  const load = useCallback(() => {
    api
      .standingShifts()
      .then((all) => {
        // Their usual week is the every-week ones; the first Saturday of the
        // month runs beside it and is not changed from here.
        const theirs = all.filter((s) => s.employeeId === person.id && !s.endsOn && isEveryWeek(s));
        const read = weekFrom(theirs, homeOffice || firstOffice, heldIds ? heldIds.split(',') : []);
        setSaved(read);
        setWeek(read.week);
      })
      .catch(() => setProblem('Could not load their regular shifts.'));
  }, [person.id, homeOffice, firstOffice, heldIds]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty =
    week !== null && saved !== null && JSON.stringify(week) !== JSON.stringify(saved.week);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  if (!week || !saved) {
    return problem ? <Alert>{problem}</Alert> : <p className="text-sm text-slate-500">Loading…</p>;
  }

  const working = WEEK_ORDER.filter((day) => week[day].works);
  const total = working.reduce((sum, day) => sum + hoursOf(week[day]), 0);
  const badDays = working.filter(
    (day) => week[day].endTime <= week[day].startTime || !week[day].place,
  );
  const name = displayName(person);

  function change(day: number, patch: Partial<DayRow>) {
    setWeek((current) =>
      current ? { ...current, [day]: { ...current[day], ...patch } } : current,
    );
    setResult(null);
  }

  /// This day's hours and place on every other working day.
  function copyToOthers(day: number) {
    setWeek((current) => {
      if (!current) return current;
      const next = { ...current };
      for (const other of WEEK_ORDER) {
        if (other !== day && next[other].works) next[other] = { ...current[day] };
      }
      return next;
    });
    setResult(null);
  }

  async function save() {
    if (!week) return;
    const sure = await confirm({
      title: `Save ${name}’s usual week?`,
      body: (
        <div className="space-y-2">
          <p>From {formatCalendarDate(from, { year: false })} on:</p>
          {working.length === 0 ? (
            <p>No regular shifts — the ones they have stop.</p>
          ) : (
            <ul className="list-disc pl-5">
              {working.map((day) => (
                <li key={day}>
                  {WEEKDAY_NAMES[day - 1]}s, {formatClock(week[day].startTime)}–
                  {formatClock(week[day].endTime)}
                  {week[day].place === WORK_FROM_HOME
                    ? ', from home'
                    : `, ${locations.find((l) => l.id === week[day].place)?.name ?? ''}`}
                </li>
              ))}
            </ul>
          )}
          <p>
            Days that change are replaced on the rota from then
            {asDrafts ? '' : ', and they are told'}. Days that stay the same are left as they are,
            and so is anything already worked.
          </p>
        </div>
      ),
      confirmLabel: 'Yes, save it',
      cancelLabel: 'Not yet',
    });
    if (!sure) return;
    setBusy(true);
    setProblem(null);
    try {
      const done = await api.setWeeklySchedule(person.id, {
        from,
        status: asDrafts ? 'DRAFT' : 'PUBLISHED',
        days: working.map((day) => {
          const { locationId, isRemote } = placeToShift(week[day].place, homeOffice);
          return {
            dayOfWeek: day,
            locationId,
            isRemote,
            jobRoleId: week[day].jobRoleId || null,
            startTime: week[day].startTime,
            endTime: week[day].endTime,
          };
        }),
      });
      setResult(done);
      onSaved?.();
      load();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save their week.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="weekly-schedule">
      {offices.length === 0 ? (
        <Alert tone="warning">Give them an office first — a shift has to be somewhere.</Alert>
      ) : (
        <>
          {held.length === 0 && (
            <p className="mb-2 text-xs text-amber-700" data-testid="no-job-role">
              They are not in any job role yet, so their shifts will have none. Add them to one on
              Staff to put it on their shifts.
            </p>
          )}
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {WEEK_ORDER.map((day) => {
              const row = week[day];
              const dayName = WEEKDAY_NAMES[day - 1];
              return (
                <li key={day} className="px-3 py-2" data-testid={`week-day-${day}`}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        checked={row.works}
                        onChange={(event) => change(day, { works: event.target.checked })}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                      />
                      {dayName}
                      {!row.works && <span className="font-normal text-slate-500">— off</span>}
                    </label>
                    {row.works && working.length > 1 && (
                      <button
                        type="button"
                        onClick={() => copyToOthers(day)}
                        title="Use these hours and this place on every other ticked day"
                        className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                      >
                        Same on all ticked days
                      </button>
                    )}
                  </div>
                  {row.works && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[8.5rem_8.5rem_1fr_1fr]">
                      <input
                        type="time"
                        aria-label={`${dayName} starts`}
                        value={row.startTime}
                        onChange={(event) => change(day, { startTime: event.target.value })}
                        className={FIELD}
                      />
                      <input
                        type="time"
                        aria-label={`${dayName} ends`}
                        value={row.endTime}
                        onChange={(event) => change(day, { endTime: event.target.value })}
                        className={FIELD}
                      />
                      <PlaceSelect
                        id={`week-place-${person.id}-${day}`}
                        label={`${dayName} place`}
                        value={row.place}
                        onChange={(place) => change(day, { place })}
                        offices={offices}
                        allowHome
                        className={FIELD}
                      />
                      {held.length > 0 && (
                        <JobRoleSelect
                          id={`week-role-${person.id}-${day}`}
                          label={`${dayName} job role`}
                          value={row.jobRoleId}
                          onChange={(jobRoleId) => change(day, { jobRoleId })}
                          jobRoles={jobRoles}
                          personId={person.id}
                          className={FIELD}
                        />
                      )}
                      {row.endTime <= row.startTime && (
                        <p className="col-span-full text-xs text-amber-700">
                          It has to end after it starts. An overnight shift goes in a day at a time.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-2 text-sm text-slate-600" data-testid="week-total">
            {working.length === 0
              ? 'No regular days.'
              : `${working.length} ${working.length === 1 ? 'day' : 'days'}, ${
                  Math.round(total * 100) / 100
                } hours a week.`}
          </p>
          {saved.doubled.length > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              They had two regular shifts on{' '}
              {[...new Set(saved.doubled)].map((d) => `${WEEKDAY_NAMES[d - 1]}s`).join(' and ')};
              only the first is shown. Saving keeps just what is above.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-700">
              <span className="block text-xs font-medium">Starting</span>
              <input
                type="date"
                min={localDate(new Date())}
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="mt-0.5 rounded-lg border-slate-300 py-1.5 text-sm shadow-sm"
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={asDrafts}
                onChange={(event) => setAsDrafts(event.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              New shifts as drafts, to publish later
            </label>
            <button
              type="button"
              disabled={busy || !dirty || !from || badDays.length > 0}
              onClick={() => void save()}
              className={buttonClass('primary', 'md')}
            >
              {busy ? 'Saving…' : 'Save their week'}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setWeek(saved.week);
                  setResult(null);
                }}
                className="pb-2 text-sm text-slate-600 hover:underline"
              >
                Undo changes
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Kept eight weeks ahead on the rota, every night, with no end date. A one-off change — a
            day off, a swap — is made on the Schedule as usual.
          </p>
        </>
      )}

      {problem && (
        <div className="mt-2">
          <Alert>{problem}</Alert>
        </div>
      )}
      {result && <SavedNotice result={result} />}
    </div>
  );
}

function SavedNotice({ result }: { result: WeeklyScheduleResult }) {
  const parts = [
    `${result.created} ${result.created === 1 ? 'shift' : 'shifts'} put on the rota`,
    ...(result.removed > 0
      ? [`${result.removed} ${result.removed === 1 ? 'shift' : 'shifts'} taken off`]
      : []),
  ];
  return (
    <div className="mt-3" role="status">
      <Alert tone={result.skipped.length > 0 || result.overtime.length > 0 ? 'info' : 'success'}>
        <p className="font-medium">
          Saved from {formatCalendarDate(result.from, { year: false })}. {parts.join(', ')}.
        </p>
        {result.skipped.length > 0 && (
          <p className="mt-1 text-sm">
            {result.skipped.length} {result.skipped.length === 1 ? 'day was' : 'days were'} left off
            — they already had a shift then, or were on approved leave:{' '}
            {result.skipped
              .slice(0, 6)
              .map((skip) => formatCalendarDate(skip.date, { year: false }))
              .join('; ')}
            {result.skipped.length > 6 ? '…' : ''}
          </p>
        )}
        {result.overtime.length > 0 && (
          <p className="mt-1 text-sm font-medium text-rose-800" data-testid="week-overtime">
            ⚠ Over the overtime line in {result.overtime.length === 1 ? 'the week' : 'the weeks'} of{' '}
            {result.overtime
              .map((w) => formatCalendarDate(w.weekStart, { year: false }))
              .join(', ')}
            .
          </p>
        )}
      </Alert>
    </div>
  );
}
