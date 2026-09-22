import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { addDays, formatTime, startOfWeek, toLocalInputValue } from '../lib/format';
import { useIsManager } from '../lib/session';
import type { Employee, Location, Shift } from '../lib/types';
import { CalendarLinkCard } from '../components/CalendarLinkCard';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';

export function SchedulePage() {
  const isManager = useIsManager();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftData, locationData] = await Promise.all([
        api.listShifts({ from: weekStart.toISOString(), to: weekEnd.toISOString() }),
        api.listLocations(),
      ]);
      setShifts(shiftData);
      setLocations(locationData);

      // Only managers may list staff; employees just see their own schedule.
      if (isManager) {
        setEmployees(await api.listEmployees());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the schedule.');
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd, isManager]);

  useEffect(() => {
    void load();
  }, [load]);

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

      <div className="mb-4">
        <CalendarLinkCard />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setWeekStart((current) => addDays(current, -7))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(startOfWeek(new Date()))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          This week
        </button>
        <button
          type="button"
          onClick={() => setWeekStart((current) => addDays(current, 7))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Next →
        </button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
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

      {loading ? (
        <Card className="p-6">
          <Spinner label="Loading schedule" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
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
