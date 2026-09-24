import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  addDays,
  addMonths,
  formatTimeCompact,
  localDate,
  monthGrid,
  startOfMonth,
  startOfWeek,
  toLocalInputValue,
} from '../lib/format';
import { useIsManager, useSession } from '../lib/session';
import type {
  Coverage,
  CoverageDay,
  Employee,
  JobRole,
  Location,
  OvertimeWarning,
  PlanResult,
  PtoRequest,
  Shift,
} from '../lib/types';
import { CalendarLinkCard } from '../components/CalendarLinkCard';
import { PlanResultNotice } from '../components/PlanResultNotice';
import { RepeatShiftsForm } from '../components/RepeatShiftsForm';
import { RotaTable, type RotaGrouping } from '../components/RotaTable';
import { Alert, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { NeedsAttention } from '../components/NeedsAttention';

/// Where the week/month choice is remembered. Per browser, per person on that
/// browser — it never leaves the device and nothing depends on it.
const VIEW_KEY = 'domi.schedule.view';
const GROUPING_KEY = 'domi.schedule.grouping';

export function SchedulePage() {
  const isManager = useIsManager();
  const { employee: me } = useSession();
  /// Everyone together, by office, or by job role — remembered like the view.
  const [grouping, setGrouping] = useState<RotaGrouping>(() => {
    try {
      const saved = window.localStorage.getItem(GROUPING_KEY);
      return saved === 'location' || saved === 'role' ? saved : 'person';
    } catch {
      return 'person';
    }
  });
  const [locationFilter, setLocationFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [adding, setAdding] = useState(false);
  /// A week at a time to build a rota, a month at a time to see the shape of
  /// one. The week view is where shifts are added and removed; the month view
  /// is an overview, and a day in it is a way back to that week.
  ///
  /// Remembered, because whichever one you want you tend to want every time —
  /// a manager building rotas lives in the week, somebody checking their own
  /// shifts lives in the month, and neither should re-pick it after every trip
  /// to another screen. Browser storage can throw (private windows, blocked
  /// site data), so every touch of it is guarded and the default stands.
  const [view, setView] = useState<'week' | 'month'>(() => {
    try {
      return window.localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'week';
    } catch {
      return 'week';
    }
  });
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [timeOff, setTimeOff] = useState<PtoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [copying, setCopying] = useState(false);

  /// The days on screen. A month is shown as whole Monday-to-Sunday weeks, so
  /// every row has seven days and the month sits inside it — which means the
  /// range loaded is a little wider than the month itself.
  const days = useMemo(
    () =>
      view === 'week'
        ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
        : monthGrid(monthStart),
    [view, weekStart, monthStart],
  );

  const rangeStart = days[0];
  const rangeEnd = useMemo(() => addDays(days[days.length - 1], 1), [days]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftData, locationData, timeOffData] = await Promise.all([
        api.listShifts({ from: rangeStart.toISOString(), to: rangeEnd.toISOString() }),
        api.listLocations(),
        // Staff get only their own; managers everybody's. Both see it in the rota.
        api.listPto({ from: localDate(rangeStart), to: localDate(days[days.length - 1]) }),
      ]);
      setShifts(shiftData);
      setLocations(locationData);
      setTimeOff(timeOffData);

      // Only managers may list staff or read coverage.
      if (isManager) {
        const [staff, weekCoverage, roles] = await Promise.all([
          api.listEmployees(),
          api.coverage({
            from: localDate(rangeStart),
            to: localDate(days[days.length - 1]),
          }),
          api.jobRoles(),
        ]);
        setEmployees(staff);
        setCoverage(weekCoverage);
        setJobRoles(roles);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the schedule.');
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd, days, isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  /// Pulls the previous week forward. Drafts by default, so the manager checks
  /// it before staff see it.
  async function copyPreviousWeek() {
    setCopying(true);
    setError(null);
    try {
      const result = await api.copyWeek({
        fromWeekStart: addDays(weekStart, -7).toISOString().slice(0, 10),
        toWeekStart: weekStart.toISOString().slice(0, 10),
      });
      setPlanResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy that week.');
    } finally {
      setCopying(false);
    }
  }

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const shift of shifts) {
      const key = new Date(shift.startsAt).toDateString();
      map.set(key, [...(map.get(key) ?? []), shift]);
    }
    return map;
  }, [shifts]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeading
        title="Schedule"
        subtitle={isManager ? 'Build the week for both locations.' : 'Your upcoming shifts.'}
      />

      <NeedsAttention sections={['openShifts', 'unpublishedRota', 'shiftsForLeavers']} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            view === 'week'
              ? setWeekStart((current) => addDays(current, -7))
              : setMonthStart((current) => addMonths(current, -1))
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => {
            setWeekStart(startOfWeek(new Date()));
            setMonthStart(startOfMonth(new Date()));
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {view === 'week' ? 'This week' : 'This month'}
        </button>
        <button
          type="button"
          onClick={() =>
            view === 'week'
              ? setWeekStart((current) => addDays(current, 7))
              : setMonthStart((current) => addMonths(current, 1))
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Next →
        </button>

        <span className="ml-1 text-sm font-medium text-slate-700">
          {view === 'week'
            ? `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(
                weekStart,
                6,
              ).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
            : monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>

        {/* Switching keeps you where you were: a week in March goes to March,
            and picking a day in March goes back to that week — not to today. */}
        <div className="ml-auto flex rounded-lg border border-slate-300 bg-white p-0.5">
          {(['week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => {
                try {
                  window.localStorage.setItem(VIEW_KEY, option);
                } catch {
                  // A remembered preference is a convenience, not a feature.
                }
                if (option === 'month') {
                  setMonthStart(startOfMonth(weekStart));
                } else if (startOfMonth(weekStart).getTime() !== monthStart.getTime()) {
                  // Coming back to a different month than you left: land on its
                  // first week rather than on a week you are no longer looking at.
                  setWeekStart(startOfWeek(monthStart));
                }
                setView(option);
              }}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                view === option
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {option === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {isManager && planResult && (
        <div className="mb-4">
          <PlanResultNotice result={planResult} onDismiss={() => setPlanResult(null)} />
        </div>
      )}

      {isManager && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {view === 'week' && (
            <>
              <div
                className="flex rounded-lg border border-slate-300 bg-white p-0.5"
                role="group"
                aria-label="Show the rota"
              >
                {(
                  [
                    ['person', 'Everyone'],
                    ['location', 'By location'],
                    ['role', 'By job role'],
                  ] as const
                ).map(([option, label]) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={grouping === option}
                    onClick={() => {
                      setGrouping(option);
                      try {
                        window.localStorage.setItem(GROUPING_KEY, option);
                      } catch {
                        // A remembered preference is a convenience, not a feature.
                      }
                    }}
                    className={`rounded-md px-3 py-1 text-sm font-medium ${
                      grouping === option
                        ? 'bg-brand-50 text-brand-800'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                aria-label="Show location"
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">All locations</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Show job role"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">All job roles</option>
                {jobRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <span className="flex-1" />
          {view === 'week' && (
            <Link
              to={`/schedule/print?week=${localDate(weekStart)}${locationFilter ? `&location=${locationFilter}` : ''}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Print
            </Link>
          )}
          <button
            type="button"
            onClick={() => setPlanning((open) => !open)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {planning ? 'Close' : 'Repeating shifts'}
          </button>
          <button
            type="button"
            disabled={copying}
            onClick={() => void copyPreviousWeek()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {copying ? 'Copying…' : 'Copy last week into this one'}
          </button>
          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + Add shift
          </button>
        </div>
      )}

      {isManager && planning && (
        <div className="mb-6">
          <RepeatShiftsForm
            employees={employees}
            locations={locations}
            jobRoles={jobRoles}
            defaultFrom={weekStart.toISOString().slice(0, 10)}
            onCreated={(result) => {
              setPlanResult(result);
              setPlanning(false);
              void load();
            }}
          />
        </div>
      )}

      {isManager && adding && (
        <div className="mb-6">
          <NewShiftForm
            employees={employees}
            locations={locations}
            jobRoles={jobRoles}
            defaultDate={weekStart}
            onCreated={() => {
              setAdding(false);
              void load();
            }}
            onCancel={() => setAdding(false)}
            onError={setError}
          />
        </div>
      )}

      {/* The week grid is one column on a phone, so it reads as a list of days
          rather than seven squeezed columns. Its test id is how the phone
          checks tell it apart from the coverage strip above, which also shows
          weekday names. */}
      {loading ? (
        <Card className="p-6">
          <Spinner label="Loading schedule" />
        </Card>
      ) : view === 'month' ? (
        <MonthGrid
          days={days}
          monthStart={monthStart}
          shiftsByDay={shiftsByDay}
          showNames={isManager}
          onPickDay={(day) => {
            setWeekStart(startOfWeek(day));
            setView('week');
            try {
              window.localStorage.setItem(VIEW_KEY, 'week');
            } catch {
              // As above.
            }
          }}
        />
      ) : (
        <RotaTable
          days={days}
          shifts={shifts}
          employees={isManager ? employees : me ? [me] : []}
          locations={locations}
          jobRoles={jobRoles}
          coverage={isManager ? (coverage?.days ?? null) : null}
          timeOff={timeOff}
          overtimeThresholdHours={coverage?.overtimeThresholdHours ?? 40}
          grouping={grouping}
          locationFilter={locationFilter}
          roleFilter={roleFilter}
          canEdit={isManager}
          selfId={isManager ? undefined : me?.id}
          onChanged={() => void load()}
          onError={setError}
        />
      )}

      {/* The day-by-day strip is a week's worth of squares and only reads as
          one; a month of them would be a second, worse calendar next to the
          real one. The overtime warning is per-week either way, so it stays in
          both views — it is the part a manager acts on. */}
      {isManager && coverage && coverage.days.length > 0 && (
        <div className="mt-4">
          {view === 'week' ? (
            <CoverageStrip
              days={coverage.days}
              overtime={coverage.overtime}
              overtimeThresholdHours={coverage.overtimeThresholdHours}
            />
          ) : (
            (coverage.overtime.length > 0 || unavailableShifts(coverage.days).length > 0) && (
              <Card className="space-y-3 p-4">
                <h2 className="text-sm font-semibold text-slate-900">Worth a look this month</h2>
                {unavailableShifts(coverage.days).length > 0 && (
                  <AvailabilityNotice clashes={unavailableShifts(coverage.days)} />
                )}
                {coverage.overtime.length > 0 && (
                  <OvertimeNotice
                    overtime={coverage.overtime}
                    thresholdHours={coverage.overtimeThresholdHours}
                  />
                )}
              </Card>
            )
          )}
        </div>
      )}

      {!loading && shifts.length === 0 && !isManager && (
        <div className="mt-4">
          <EmptyState>Nothing scheduled for you this week.</EmptyState>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <CalendarLinkCard />
        <Link
          to="/availability"
          className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {isManager ? 'Availability — yours and the team’s' : 'When you can’t work'}
        </Link>
      </div>
    </div>
  );
}

/// The value the Employee list uses for "nobody yet — an open shift".
const OPEN_SHIFT = 'open';

function NewShiftForm({
  employees,
  locations,
  jobRoles,
  defaultDate,
  onCreated,
  onCancel,
  onError,
}: {
  employees: Employee[];
  locations: Location[];
  jobRoles: JobRole[];
  defaultDate: Date;
  onCreated: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [jobRoleId, setJobRoleId] = useState('');
  const [remote, setRemote] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [startsAt, setStartsAt] = useState(() => defaultInput(defaultDate, 9));
  const [endsAt, setEndsAt] = useState(() => defaultInput(defaultDate, 17));
  const [busy, setBusy] = useState(false);

  // Only offer locations the chosen employee is actually assigned to — the API
  // rejects anything else, and a disabled option explains why better than a 400.
  const selectedEmployee =
    employeeId === OPEN_SHIFT
      ? undefined
      : employees.find((employee) => employee.id === employeeId);
  const availableLocations = selectedEmployee
    ? locations.filter((location) =>
        selectedEmployee.locations.some((assignment) => assignment.locationId === location.id),
      )
    : locations;

  useEffect(() => {
    if (availableLocations.length > 0 && !availableLocations.some((l) => l.id === locationId)) {
      setLocationId(availableLocations[0].id);
    }
  }, [availableLocations, locationId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createShift({
        employeeId: employeeId === OPEN_SHIFT ? null : employeeId,
        locationId,
        jobRoleId: jobRoleId || null,
        isRemote: remote,
        // datetime-local gives local wall-clock time; the API stores UTC.
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        status: 'PUBLISHED',
      });
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not create that shift.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="employee" className="block text-sm font-medium text-slate-700">
            Employee
          </label>
          <select
            id="employee"
            required
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          >
            <option value="">Choose someone…</option>
            <option value={OPEN_SHIFT}>Nobody yet — an open shift to fill</option>
            {employees
              .filter((employee) => employee.employmentStatus === 'ACTIVE')
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                </option>
              ))}
          </select>
          {employeeId === OPEN_SHIFT && (
            <p className="mt-1 text-xs text-amber-800">
              It shows on the rota as an open shift, flagged until somebody is put in it.
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="shift-role" className="block text-sm font-medium text-slate-700">
            Job role{' '}
            <span className="font-normal text-slate-400">
              {employeeId === OPEN_SHIFT ? '(who should fill it)' : '(optional)'}
            </span>
          </label>
          <select
            id="shift-role"
            value={jobRoleId}
            onChange={(event) => setJobRoleId(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          >
            <option value="">{employeeId === OPEN_SHIFT ? 'Any role' : 'Not specified'}</option>
            {jobRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="shift-location" className="block text-sm font-medium text-slate-700">
            Location
          </label>
          <select
            id="shift-location"
            required
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          >
            {availableLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          {selectedEmployee && availableLocations.length === 0 && (
            <p className="mt-1 text-xs text-rose-600">
              This employee is not assigned to any location yet.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="starts" className="block text-sm font-medium text-slate-700">
            Starts
          </label>
          <input
            id="starts"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          />
        </div>

        <div>
          <label htmlFor="ends" className="block text-sm font-medium text-slate-700">
            Ends
          </label>
          <input
            id="ends"
            type="datetime-local"
            required
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-start gap-2 text-sm text-slate-700" htmlFor="shift-remote">
            <input
              id="shift-remote"
              type="checkbox"
              checked={remote}
              onChange={(event) => setRemote(event.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            <span>
              Work from home
              <span className="block text-xs text-slate-500">
                They can clock in from anywhere during it; no location is recorded.
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={busy || !employeeId || !locationId}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Create shift'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

function defaultInput(day: Date, hour: number): string {
  const date = new Date(day);
  date.setHours(hour, 0, 0, 0);
  return toLocalInputValue(date);
}

/// A week at a glance: hours covered, who is off, and the days with nobody on.
function CoverageStrip({
  days,
  overtime,
  overtimeThresholdHours,
}: {
  days: CoverageDay[];
  overtime: OvertimeWarning[];
  overtimeThresholdHours: number;
}) {
  const totalHours = Math.round(days.reduce((sum, day) => sum + day.staffedHours, 0) * 10) / 10;
  const openShifts = days.reduce((sum, day) => sum + day.openShifts, 0);
  // A day with only open shifts still has nobody on.
  const emptyDays = days.filter((day) => day.peopleScheduled === 0);
  const conflicts = days.flatMap((day) =>
    day.shifts.filter((shift) => shift.conflictsWithLeave).map((shift) => ({ day, shift })),
  );
  const unavailable = unavailableShifts(days);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Coverage this week</h2>
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{totalHours}</span> hours scheduled
          {openShifts > 0 && (
            <>
              {' · '}
              <span className="font-semibold text-amber-800">
                {openShifts} open shift{openShifts === 1 ? '' : 's'}
              </span>
            </>
          )}
        </span>
      </div>

      {emptyDays.length > 0 && (
        <p className="mt-3 text-sm text-amber-800">
          {emptyDays.length === 7
            ? 'Nobody is scheduled at all this week.'
            : `Nobody scheduled on ${emptyDays
                .map((day) =>
                  new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {
                    timeZone: 'UTC',
                    weekday: 'long',
                  }),
                )
                .join(', ')}.`}
        </p>
      )}

      {conflicts.length > 0 && (
        <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-inset ring-rose-200">
          <p className="font-medium">
            {conflicts.length} shift{conflicts.length === 1 ? '' : 's'} scheduled during approved
            leave
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {conflicts.slice(0, 5).map(({ day, shift }) => (
              <li key={shift.id}>
                {shift.employeeName} —{' '}
                {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {
                  timeZone: 'UTC',
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unavailable.length > 0 && (
        <div className="mt-3">
          <AvailabilityNotice clashes={unavailable} />
        </div>
      )}

      {overtime.length > 0 && (
        <div className="mt-3">
          <OvertimeNotice overtime={overtime} thresholdHours={overtimeThresholdHours} />
        </div>
      )}

      {days.some((day) => day.away.length > 0) && (
        <p className="mt-3 text-xs text-slate-500">
          Away this week:{' '}
          {[...new Set(days.flatMap((day) => day.away.map((person) => person.employeeName)))].join(
            ', ',
          )}
        </p>
      )}
    </Card>
  );
}

function unavailableShifts(days: CoverageDay[]) {
  return days.flatMap((day) =>
    day.shifts
      .filter((shift) => shift.unavailable)
      .map((shift) => ({ day, shift, reason: shift.unavailable! })),
  );
}

/**
 * Shifts on a time somebody said they cannot work.
 *
 * A warning, like overtime, not a refusal like a clash: the manager may have
 * asked, and the rota is theirs. What it must not be is silent.
 */
function AvailabilityNotice({
  clashes,
}: {
  clashes: { day: CoverageDay; shift: CoverageDay['shifts'][number]; reason: string }[];
}) {
  return (
    <div
      data-testid="availability-notice"
      className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
    >
      <p className="font-medium">
        {clashes.length === 1
          ? '1 shift is at a time someone said they can’t work'
          : `${clashes.length} shifts are at times people said they can’t work`}
      </p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {clashes.slice(0, 8).map(({ day, shift, reason }) => (
          <li key={shift.id}>
            <span className="font-medium">{shift.employeeName}</span> —{' '}
            {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {
              timeZone: 'UTC',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
            : {reason.replace(/^Not available/, 'not available')}
          </li>
        ))}
        {clashes.length > 8 && <li>…and {clashes.length - 8} more</li>}
      </ul>
    </div>
  );
}

/**
 * Who the rota puts past forty hours, and by how much.
 *
 * Shared by both views: the week strip shows it under the coverage squares, the
 * month view on its own. Overtime is a per-week question in either case, which
 * is why the same component serves both — a month view that quietly used a
 * different rule would be worse than one that said nothing.
 */
function OvertimeNotice({
  overtime,
  thresholdHours,
}: {
  overtime: OvertimeWarning[];
  /// From the server, not a constant here. The practice can move this line, and
  /// a warning that names the wrong number in confident words is worse than one
  /// that says nothing.
  thresholdHours: number;
}) {
  return (
    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
      <p className="font-medium">
        {overtime.length === 1
          ? `1 person is scheduled past ${thresholdHours} hours`
          : `${overtime.length} people are scheduled past ${thresholdHours} hours`}
      </p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {overtime.map((warning) => (
          <li key={`${warning.employeeId}-${warning.weekStart}`}>
            <span className="font-medium">{warning.employeeName}</span> — {warning.scheduledHours}{' '}
            hours in the week of{' '}
            {new Date(`${warning.weekStart}T00:00:00Z`).toLocaleDateString(undefined, {
              timeZone: 'UTC',
              month: 'short',
              day: 'numeric',
            })}
            , so {warning.overtimeHours} at overtime
            {/* The hours are totalled across the practice, so say when some of
                them are somewhere this screen is not showing — otherwise the
                number looks wrong to whoever is reading it. */}
            {warning.spansLocations && ' (including hours at another location)'}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-amber-800">
        Hours as scheduled, not as worked. Hourly staff only.
      </p>
    </div>
  );
}

/**
 * A month at a glance — who is on, and when.
 *
 * This is mostly a staff screen. A manager builds the rota a week at a time on
 * a laptop; an employee opens the month to see which days they are working, and
 * opens it on a phone. That shapes what each square holds: an employee sees
 * their own shifts, so one compact time per day is enough and fits at seven
 * columns even at 390px. A manager sees everybody, so the square lists first
 * names and says how many more there are.
 *
 * A day is still a link to its week, which is where shifts are added and
 * removed.
 */
function MonthGrid({
  days,
  monthStart,
  shiftsByDay,
  showNames,
  onPickDay,
}: {
  days: Date[];
  monthStart: Date;
  shiftsByDay: Map<string, Shift[]>;
  /// A manager sees whose shift it is; an employee is only ever shown their
  /// own, so the name would be their own name forty times.
  showNames: boolean;
  onPickDay: (day: Date) => void;
}) {
  const today = new Date().toDateString();
  // Three lines is what fits before a square starts scrolling on a laptop.
  const MAX_LINES = 3;

  return (
    <div data-testid="month-grid">
      {/* Weekday headings, from the grid itself rather than a hardcoded list,
          so they cannot drift out of step with the days below. */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {days.slice(0, 7).map((day) => (
          <p
            key={day.toISOString()}
            className="text-center text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            {day.toLocaleDateString(undefined, { weekday: 'narrow' })}
            <span className="hidden sm:inline">
              {day.toLocaleDateString(undefined, { weekday: 'short' }).slice(1)}
            </span>
          </p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayShifts = shiftsByDay.get(day.toDateString()) ?? [];

          // The days either side of the month are there to square off the grid.
          // They are shown, because a shift on the 1st matters whichever row it
          // lands in, but dimmed so the month still reads as a month.
          const outside = day.getMonth() !== monthStart.getMonth();
          const isToday = day.toDateString() === today;

          // Two renderings of the same shift. The full one is what the screen
          // reader and a laptop get; the short one is what fits in a column
          // about forty pixels wide, where "1pm–9pm" truncates to "1p…" and
          // tells nobody anything. The start time on its own still answers the
          // question an employee opened the month to ask — am I on at nine or
          // at one — and the rest is one tap away in the week.
          const described = dayShifts.map((shift) =>
            showNames
              ? (shift.employee?.firstName ?? 'Open')
              : `${formatTimeCompact(shift.startsAt)}–${formatTimeCompact(shift.endsAt)}`,
          );
          const shortened = dayShifts.map((shift) =>
            showNames ? (shift.employee?.firstName ?? 'Open') : formatTimeCompact(shift.startsAt),
          );

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onPickDay(day)}
              aria-label={`${day.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })} — ${
                dayShifts.length === 0
                  ? 'no shifts'
                  : `${dayShifts.length} shift${dayShifts.length === 1 ? '' : 's'}: ${described.join(', ')}`
              }`}
              className={`min-h-[72px] rounded-lg border p-1.5 text-left align-top transition hover:border-brand-400 hover:bg-brand-50 sm:min-h-[104px] sm:p-2 ${
                isToday ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200'
              } ${outside ? 'bg-slate-50 opacity-60' : 'bg-white'}`}
            >
              <span
                className={`block text-xs font-semibold sm:text-sm ${
                  isToday ? 'text-brand-800' : 'text-slate-900'
                }`}
              >
                {day.getDate()}
              </span>

              {dayShifts.length === 0 ? (
                <span className="mt-1 block text-[11px] text-slate-300 sm:text-xs">—</span>
              ) : (
                <span className="mt-0.5 block space-y-0.5">
                  {described.slice(0, MAX_LINES).map((line, index) => (
                    <span
                      key={`${line}-${index}`}
                      className="block truncate rounded bg-brand-50 px-1 text-[10px] leading-4 text-brand-900 sm:text-[11px] sm:leading-5"
                    >
                      <span className="sm:hidden">{shortened[index]}</span>
                      <span className="hidden sm:inline">{line}</span>
                    </span>
                  ))}
                  {described.length > MAX_LINES && (
                    <span className="block px-1 text-[10px] text-slate-500 sm:text-[11px]">
                      +{described.length - MAX_LINES} more
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Pick a day to open its week, where shifts are added and removed.
      </p>
    </div>
  );
}
