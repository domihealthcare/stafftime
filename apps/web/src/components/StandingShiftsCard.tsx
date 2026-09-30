import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import {
  displayName,
  formatCalendarDate,
  localDate,
  WEEK_ORDER,
  WEEKDAY_NAMES,
} from '../lib/format';
import type { Employee, JobRole, Location, StandingShift } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import {
  PlaceSelect,
  WORK_FROM_HOME,
  WorkFromHomeNote,
  homeOfficeOf,
  placeToShift,
} from './PlaceSelect';
import { Alert, Card } from './ui';
import { JobRoleSelect } from './JobRoleSelect';
import { WeekdayToggles } from './WeekdayToggles';
import { WeeklyScheduleEditor } from './WeeklyScheduleEditor';

/// "Mondays and Thursdays", Sunday first as the calendar reads.
function whichDays(days: number[]): string {
  const names = WEEK_ORDER.filter((day) => days.includes(day)).map(
    (day) => `${WEEKDAY_NAMES[day - 1]}s`,
  );
  if (names.length === 7) return 'Every day';
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/// "08:30" → "8:30 AM".
function clock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * The regular shifts with no end date — "Rosa, every Monday, 8 to 4" — and
 * stop them or change them from a date on (asked for by Dominguez,
 * September 2026). Each keeps the rota filled eight weeks ahead, every night,
 * until then. Managers and admins only.
 */
export function StandingShiftsCard({
  version,
  employees,
  locations,
  jobRoles,
  onChanged,
  bare = false,
}: {
  /// Inside another card (the Schedule's tabs): no card of its own.
  bare?: boolean;
  /// Bumped when a repeat is made elsewhere on the page, to re-fetch.
  version: number;
  employees: Employee[];
  locations: Location[];
  jobRoles: JobRole[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [standing, setStanding] = useState<StandingShift[] | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [editing, setEditing] = useState<StandingShift | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [place, setPlace] = useState('');
  const [jobRoleId, setJobRoleId] = useState('');
  const [openCount, setOpenCount] = useState(1);
  const [fromDate, setFromDate] = useState(() => localDate(new Date()));
  const [lastDate, setLastDate] = useState(() => localDate(new Date()));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /// Whose usual week is open for setting, if anybody's.
  const [weekOf, setWeekOf] = useState('');
  const weekPerson = employees.find((e) => e.id === weekOf);
  const weekBox = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api
      .standingShifts()
      .then(setStanding)
      .catch(() => setStanding([]));
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const who = (item: StandingShift) =>
    item.employee
      ? displayName(item.employee)
      : `Open shift${item.openCount > 1 ? ` ×${item.openCount}` : ''}${item.jobRole ? ` — ${item.jobRole.name}` : ''}`;

  const person = (item: StandingShift) =>
    item.employeeId ? employees.find((e) => e.id === item.employeeId) : undefined;

  function startEdit(item: StandingShift) {
    setEditing(item);
    setStopping(null);
    setResult(null);
    setError(null);
    setDays(item.daysOfWeek);
    setStartTime(item.startTime);
    setEndTime(item.endTime);
    setPlace(item.isRemote ? WORK_FROM_HOME : item.locationId);
    setJobRoleId(item.jobRole?.id ?? '');
    setOpenCount(item.openCount);
    setFromDate(localDate(new Date()));
  }

  async function saveEdit() {
    if (!editing) return;
    const { locationId, isRemote } = placeToShift(place, homeOfficeOf(person(editing)));
    const sure = await confirm({
      title: `Change ${who(editing)}’s regular shift?`,
      body: (
        <p>
          From {formatCalendarDate(fromDate, { year: false })} on, it becomes {whichDays(days)},{' '}
          {clock(startTime)}–{clock(endTime)}. Shifts from then are replaced
          {editing.employee ? ', and they are told' : ''}. Earlier ones stay as they are.
        </p>
      ),
      confirmLabel: 'Yes, change it',
      cancelLabel: 'Not yet',
    });
    if (!sure) return;
    setBusy(true);
    setError(null);
    try {
      const done = await api.updateStandingShift(editing.id, {
        locationId,
        isRemote,
        jobRoleId: jobRoleId || null,
        ...(editing.employeeId ? {} : { openCount }),
        startTime,
        endTime,
        daysOfWeek: [...days].sort(),
        from: fromDate,
      });
      setResult(
        `Changed from ${formatCalendarDate(done.from, { year: false })}. ${done.created} ${
          done.created === 1 ? 'shift' : 'shifts'
        } written${done.skipped.length ? `, ${done.skipped.length} skipped (a clash or leave)` : ''}.`,
      );
      setEditing(null);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change it.');
    } finally {
      setBusy(false);
    }
  }

  async function stop(item: StandingShift) {
    const sure = await confirm({
      title: `Stop ${who(item)}’s regular shift?`,
      body: (
        <p>
          {whichDays(item.daysOfWeek)}, {clock(item.startTime)}–{clock(item.endTime)} at{' '}
          {item.location.name}. The last one is on or before{' '}
          {formatCalendarDate(lastDate, { year: false })}; the shifts after that come off the rota
          {item.employee ? ', and they are told' : ''}. Shifts already worked stay.
        </p>
      ),
      confirmLabel: 'Yes, stop it',
      cancelLabel: 'Keep it going',
    });
    if (!sure) return;
    setBusy(true);
    setError(null);
    try {
      const done = await api.stopStandingShift(item.id, lastDate);
      setResult(
        `Stopped after ${formatCalendarDate(done.lastDate, { year: false })}. ${done.removed} ${
          done.removed === 1 ? 'shift' : 'shifts'
        } taken off the rota.`,
      );
      setStopping(null);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stop it.');
    } finally {
      setBusy(false);
    }
  }

  const running = (standing ?? []).filter((item) => !item.endsOn);
  const ending = (standing ?? []).filter((item) => item.endsOn);

  return (
    <Wrap bare={bare} testId="standing-shifts-card">
      {!bare && (
        <h2 className="text-sm font-semibold text-slate-900">
          <span aria-hidden="true">🔁</span> Regular shifts
        </h2>
      )}
      <p className={`text-xs text-slate-500 ${bare ? '' : 'mt-0.5'}`}>
        Repeating shifts with no end date. Each keeps the rota filled eight weeks ahead until it is
        stopped. The quickest way to make them is somebody&rsquo;s{' '}
        <span className="font-medium">usual week</span>, below — every day at once.
      </p>

      <div ref={weekBox} className="mt-3 rounded-lg bg-slate-50 p-3" data-testid="usual-week">
        <label className="block text-sm text-slate-700">
          <span className="block text-xs font-medium">Set somebody&rsquo;s usual week</span>
          <select
            value={weekOf}
            onChange={(event) => setWeekOf(event.target.value)}
            className="mt-0.5 w-full rounded-lg border-slate-300 py-1.5 text-sm shadow-sm sm:max-w-xs"
          >
            <option value="">Choose a person…</option>
            {employees
              .filter((e) => e.employmentStatus !== 'TERMINATED')
              .sort((a, b) => displayName(a).localeCompare(displayName(b)))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {displayName(e)}
                </option>
              ))}
          </select>
        </label>
        {weekPerson && (
          <div className="mt-3">
            <WeeklyScheduleEditor
              key={weekPerson.id}
              person={weekPerson}
              locations={locations}
              jobRoles={jobRoles}
              onSaved={() => {
                load();
                onChanged();
              }}
            />
          </div>
        )}
      </div>

      {standing === null ? null : standing.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">None yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {[...running, ...ending].map((item) => (
            <li key={item.id} className="py-2 text-sm" data-testid="standing-shift">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium text-slate-900">{who(item)}</span>
                <span className="text-slate-600">
                  {whichDays(item.daysOfWeek)}, {clock(item.startTime)}–{clock(item.endTime)} ·{' '}
                  {item.location.name}
                  {item.isRemote ? ' · from home' : ''}
                  {item.status === 'DRAFT' ? ' · as drafts' : ''}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  Since {formatCalendarDate(item.startsOn, { year: false })}
                  {item.endsOn
                    ? ` · ends ${formatCalendarDate(item.endsOn, { year: false })}`
                    : ' · no end date'}
                </span>
                {!item.endsOn && stopping !== item.id && editing?.id !== item.id && (
                  <span className="flex gap-2">
                    {item.employeeId && (
                      <button
                        type="button"
                        onClick={() => {
                          setWeekOf(item.employeeId!);
                          setEditing(null);
                          setStopping(null);
                          weekBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Their week…
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit…
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStopping(item.id);
                        setEditing(null);
                        setLastDate(localDate(new Date()));
                        setResult(null);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Stop…
                    </button>
                  </span>
                )}
              </div>
              {editing?.id === item.id && (
                <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">
                  <fieldset>
                    <legend className="text-xs font-medium text-slate-700">Days</legend>
                    <WeekdayToggles days={days} onChange={setDays} />
                  </fieldset>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className="text-sm text-slate-700">
                      <span className="block text-xs font-medium">Starts</span>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        className="mt-0.5 w-full rounded-lg border-slate-300 py-1.5 text-sm shadow-sm"
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      <span className="block text-xs font-medium">Ends</span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(event) => setEndTime(event.target.value)}
                        className="mt-0.5 w-full rounded-lg border-slate-300 py-1.5 text-sm shadow-sm"
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      <span className="block text-xs font-medium">Location</span>
                      <PlaceSelect
                        id={`standing-place-${item.id}`}
                        value={place}
                        onChange={setPlace}
                        offices={
                          person(item)
                            ? locations.filter((l) =>
                                person(item)!.locations.some((a) => a.locationId === l.id),
                              )
                            : locations
                        }
                        allowHome={Boolean(item.employeeId)}
                        className="mt-0.5 w-full rounded-lg border-slate-300 py-1.5 text-sm shadow-sm"
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      <span className="block text-xs font-medium">Job role</span>
                      <JobRoleSelect
                        id={`standing-role-${item.id}`}
                        value={jobRoleId}
                        onChange={setJobRoleId}
                        jobRoles={jobRoles}
                        personId={item.employeeId ?? undefined}
                        open={!item.employeeId}
                        className="mt-0.5 w-full rounded-lg border-slate-300 py-1.5 text-sm shadow-sm"
                      />
                    </label>
                  </div>
                  {place === WORK_FROM_HOME && <WorkFromHomeNote />}
                  {!item.employeeId && (
                    <label className="block text-sm text-slate-700">
                      <span className="block text-xs font-medium">How many each day</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={openCount}
                        onChange={(event) =>
                          setOpenCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))
                        }
                        className="mt-0.5 w-24 rounded-lg border-slate-300 py-1.5 text-sm shadow-sm"
                      />
                    </label>
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-sm text-slate-700">
                      <span className="block text-xs font-medium">Change applies from</span>
                      <input
                        type="date"
                        min={localDate(new Date())}
                        value={fromDate}
                        onChange={(event) => setFromDate(event.target.value)}
                        className="mt-0.5 rounded-lg border-slate-300 py-1.5 text-sm shadow-sm"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={
                        busy || !fromDate || days.length === 0 || !place || endTime <= startTime
                      }
                      onClick={() => void saveEdit()}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                      {busy ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="px-2 py-1.5 text-sm text-slate-600 hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {stopping === item.id && (
                <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2">
                  <label className="text-sm text-slate-700">
                    <span className="block text-xs font-medium">Last day it runs</span>
                    <input
                      type="date"
                      value={lastDate}
                      onChange={(event) => setLastDate(event.target.value)}
                      className="mt-0.5 rounded-lg border-slate-300 py-1.5 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || !lastDate}
                    onClick={() => void stop(item)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                  >
                    {busy ? 'Stopping…' : 'Stop it'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStopping(null)}
                    className="px-2 py-1.5 text-sm text-slate-600 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}
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
    </Wrap>
  );
}

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
