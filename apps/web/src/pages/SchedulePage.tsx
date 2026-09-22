import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  addDays,
  addMonths,
  formatTime,
  localDate,
  monthGrid,
  startOfMonth,
  startOfWeek,
  toLocalInputValue,
} from '../lib/format';
import { useIsManager } from '../lib/session';
import type {
  Coverage,
  CoverageDay,
  Employee,
  Location,
  OvertimeWarning,
  PlanResult,
  Shift,
} from '../lib/types';
import { CalendarLinkCard } from '../components/CalendarLinkCard';
import { PlanResultNotice } from '../components/PlanResultNotice';
import { RepeatShiftsForm } from '../components/RepeatShiftsForm';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { NeedsAttention } from '../components/NeedsAttention';

export function SchedulePage() {
  const isManager = useIsManager();
  /// A week at a time to build a rota, a month at a time to see the shape of
  /// one. The week view is where shifts are added and removed; the month view
  /// is an overview, and a day in it is a way back to that week.
  const [view, setView] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
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
      const [shiftData, locationData] = await Promise.all([
        api.listShifts({ from: rangeStart.toISOString(), to: rangeEnd.toISOString() }),
        api.listLocations(),
      ]);
      setShifts(shiftData);
      setLocations(locationData);

      // Only managers may list staff or read coverage.
      if (isManager) {
        const [staff, weekCoverage] = await Promise.all([
          api.listEmployees(),
          api.coverage({
            from: localDate(rangeStart),
            to: localDate(days[days.length - 1]),
          }),
        ]);
        setEmployees(staff);
        setCoverage(weekCoverage);
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

      <NeedsAttention sections={['unpublishedRota', 'shiftsForLeavers']} />

      <div className="mb-4">
        <CalendarLinkCard />
      </div>

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
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPlanning((open) => !open)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {planning ? 'Close' : 'Repeating shifts'}
          </button>
          <button
            type="button"
            disabled={copying}
            onClick={() => void copyPreviousWeek()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {copying ? 'Copying…' : 'Copy last week into this one'}
          </button>
        </div>
      )}

      {isManager && planning && (
        <div className="mb-6">
          <RepeatShiftsForm
            employees={employees}
            locations={locations}
            defaultFrom={weekStart.toISOString().slice(0, 10)}
            onCreated={(result) => {
              setPlanResult(result);
              setPlanning(false);
              void load();
            }}
          />
        </div>
      )}

      {/* The day-by-day strip is a week's worth of squares and only reads as
          one; a month of them would be a second, worse calendar next to the
          real one. The overtime warning is per-week either way, so it stays in
          both views — it is the part a manager acts on. */}
      {isManager && coverage && coverage.days.length > 0 && (
        <div className="mb-6">
          {view === 'week' ? (
            <CoverageStrip days={coverage.days} overtime={coverage.overtime} />
          ) : (
            coverage.overtime.length > 0 && (
              <Card className="p-4">
                <h2 className="mb-2 text-sm font-semibold text-slate-900">
                  Overtime this month
                </h2>
                <OvertimeNotice overtime={coverage.overtime} />
              </Card>
            )
          )}
        </div>
      )}

      {isManager && (
        <div className="mb-6">
          <NewShiftForm
            employees={employees}
            locations={locations}
            defaultDate={weekStart}
            onCreated={() => void load()}
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
          onPickDay={(day) => {
            setWeekStart(startOfWeek(day));
            setView('week');
          }}
        />
      ) : (
        <div
          data-testid="week-grid"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7"
        >
          {days.map((day) => {
            const dayShifts = shiftsByDay.get(day.toDateString()) ?? [];
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <Card key={day.toISOString()} className={isToday ? 'ring-2 ring-brand-500' : ''}>
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {day.toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="space-y-2 p-2">
                  {dayShifts.length === 0 ? (
                    <p className="px-1 py-3 text-center text-xs text-slate-400">No shifts</p>
                  ) : (
                    dayShifts.map((shift) => (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        canDelete={isManager}
                        onDeleted={() => void load()}
                        onError={setError}
                      />
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && shifts.length === 0 && !isManager && (
        <div className="mt-4">
          <EmptyState>Nothing scheduled for you this week.</EmptyState>
        </div>
      )}
    </div>
  );
}

function ShiftCard({
  shift,
  canDelete,
  onDeleted,
  onError,
}: {
  shift: Shift;
  canDelete: boolean;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api.deleteShift(shift.id);
      onDeleted();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not remove that shift.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-slate-50 p-2 text-xs">
      <p className="font-medium tabular-nums text-slate-900">
        {formatTime(shift.startsAt)}–{formatTime(shift.endsAt)}
      </p>
      {shift.employee && (
        <p className="mt-0.5 truncate text-slate-700">
          {shift.employee.firstName} {shift.employee.lastName}
        </p>
      )}
      {shift.location && <p className="truncate text-slate-500">{shift.location.name}</p>}
      <div className="mt-1.5 flex items-center justify-between gap-1">
        <Badge tone={shift.status === 'PUBLISHED' ? 'success' : 'neutral'}>
          {shift.status === 'PUBLISHED' ? 'Published' : shift.status.toLowerCase()}
        </Badge>
        {canDelete && shift.status !== 'CANCELLED' && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
          >
            {busy ? '…' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  );
}

function NewShiftForm({
  employees,
  locations,
  defaultDate,
  onCreated,
  onError,
}: {
  employees: Employee[];
  locations: Location[];
  defaultDate: Date;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [startsAt, setStartsAt] = useState(() => defaultInput(defaultDate, 9));
  const [endsAt, setEndsAt] = useState(() => defaultInput(defaultDate, 17));
  const [busy, setBusy] = useState(false);

  // Only offer locations the chosen employee is actually assigned to — the API
  // rejects anything else, and a disabled option explains why better than a 400.
  const selectedEmployee = employees.find((employee) => employee.id === employeeId);
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
        employeeId,
        locationId,
        // datetime-local gives local wall-clock time; the API stores UTC.
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        status: 'PUBLISHED',
      });
      onCreated();
      setOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not create that shift.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        + Add shift
      </button>
    );
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
            {employees
              .filter((employee) => employee.employmentStatus === 'ACTIVE')
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
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
            onClick={() => setOpen(false)}
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
}: {
  days: CoverageDay[];
  overtime: OvertimeWarning[];
}) {
  const totalHours = Math.round(days.reduce((sum, day) => sum + day.staffedHours, 0) * 10) / 10;
  const emptyDays = days.filter((day) => day.shifts.length === 0);
  const conflicts = days.flatMap((day) =>
    day.shifts.filter((shift) => shift.conflictsWithLeave).map((shift) => ({ day, shift })),
  );

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Coverage this week</h2>
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{totalHours}</span> hours scheduled
        </span>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const empty = day.shifts.length === 0;
          return (
            <div
              key={day.date}
              className={`rounded-lg px-1 py-2 text-center ${
                empty ? 'bg-amber-50 ring-1 ring-inset ring-amber-200' : 'bg-slate-50'
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {
                  timeZone: 'UTC',
                  weekday: 'short',
                })}
              </p>
              <p
                className={`mt-0.5 text-lg font-semibold tabular-nums ${
                  empty ? 'text-amber-800' : 'text-slate-900'
                }`}
              >
                {day.staffedHours || '—'}
              </p>
              <p className="text-xs text-slate-500">
                {day.peopleScheduled > 0
                  ? `${day.peopleScheduled} on`
                  : 'nobody'}
              </p>
              {day.away.length > 0 && (
                <p className="mt-0.5 text-xs text-slate-500">{day.away.length} off</p>
              )}
            </div>
          );
        })}
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
            {conflicts.length} shift{conflicts.length === 1 ? '' : 's'} scheduled during
            approved leave
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

      {overtime.length > 0 && (
        <div className="mt-3">
          <OvertimeNotice overtime={overtime} />
        </div>
      )}

      {days.some((day) => day.away.length > 0) && (
        <p className="mt-3 text-xs text-slate-500">
          Away this week:{' '}
          {[
            ...new Set(days.flatMap((day) => day.away.map((person) => person.employeeName))),
          ].join(', ')}
        </p>
      )}
    </Card>
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
function OvertimeNotice({ overtime }: { overtime: OvertimeWarning[] }) {
  return (
    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
      <p className="font-medium">
        {overtime.length === 1
          ? '1 person is scheduled past 40 hours'
          : `${overtime.length} people are scheduled past 40 hours`}
      </p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {overtime.map((warning) => (
          <li key={`${warning.employeeId}-${warning.weekStart}`}>
            <span className="font-medium">{warning.employeeName}</span> —{' '}
            {warning.scheduledHours} hours in the week of{' '}
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
 * A month at a glance: how many people are on each day, and for how long.
 *
 * Counts rather than shift cards, on purpose. Seven columns on a phone is about
 * fifty pixels each, which fits a number and nothing else — and a month view is
 * for spotting the shape of a rota (the empty Tuesday, the week everybody is
 * on) rather than for reading who is doing what. A day is a link back to its
 * week, which is where the detail and the editing live.
 */
function MonthGrid({
  days,
  monthStart,
  shiftsByDay,
  onPickDay,
}: {
  days: Date[];
  monthStart: Date;
  shiftsByDay: Map<string, Shift[]>;
  onPickDay: (day: Date) => void;
}) {
  const today = new Date().toDateString();

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
          const hours =
            Math.round(
              dayShifts.reduce(
                (sum, shift) =>
                  sum +
                  (new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) /
                    3_600_000,
                0,
              ) * 10,
            ) / 10;

          // The days either side of the month are there to square off the grid.
          // They are shown, because a shift on the 1st matters whichever row it
          // lands in, but dimmed so the month still reads as a month.
          const outside = day.getMonth() !== monthStart.getMonth();
          const isToday = day.toDateString() === today;

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
                  : `${dayShifts.length} shift${dayShifts.length === 1 ? '' : 's'}, ${hours} hours`
              }`}
              className={`min-h-[72px] rounded-lg border p-1.5 text-left transition hover:border-brand-400 hover:bg-brand-50 sm:min-h-[92px] sm:p-2 ${
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
                <>
                  <span className="mt-1 block text-[11px] font-medium text-slate-700 sm:text-xs">
                    {dayShifts.length} on
                  </span>
                  <span className="block text-[11px] text-slate-500 sm:text-xs">{hours}h</span>
                </>
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
