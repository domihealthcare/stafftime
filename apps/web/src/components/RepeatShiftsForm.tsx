import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { Employee, JobRole, Location, PlanResult } from '../lib/types';
import { Alert, Card } from './ui';

const WEEKDAYS = [
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
  { value: 7, short: 'Sun' },
];

/// Builds a rota in one go — the alternative being a manager creating forty
/// shifts by hand.
/// The Employee list's value for open shifts — slots nobody is on yet.
const OPEN = 'open';

export function RepeatShiftsForm({
  employees,
  locations,
  jobRoles,
  defaultFrom,
  onCreated,
}: {
  employees: Employee[];
  locations: Location[];
  jobRoles: JobRole[];
  defaultFrom: string;
  onCreated: (result: PlanResult) => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [jobRoleId, setJobRoleId] = useState('');
  const [openCount, setOpenCount] = useState(1);
  const [locationId, setLocationId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [from, setFrom] = useState(defaultFrom);
  const [until, setUntil] = useState('');
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Only the locations this person is assigned to — the API rejects the rest.
  const selected =
    employeeId === OPEN ? undefined : employees.find((employee) => employee.id === employeeId);
  const available = selected
    ? locations.filter((location) =>
        selected.locations.some((assignment) => assignment.locationId === location.id),
      )
    : locations;

  useEffect(() => {
    if (available.length > 0 && !available.some((l) => l.id === locationId)) {
      setLocationId(available[0].id);
    }
  }, [available, locationId]);

  // Default to four weeks out: long enough to be useful, short enough to review.
  useEffect(() => {
    if (!until && from) {
      const end = new Date(`${from}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 27);
      setUntil(end.toISOString().slice(0, 10));
    }
  }, [from, until]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onCreated(
        await api.repeatShifts({
          ...(employeeId === OPEN ? { openCount } : { employeeId }),
          jobRoleId: jobRoleId || undefined,
          locationId,
          startTime,
          endTime,
          daysOfWeek: [...days].sort(),
          from,
          until,
          status: publish ? 'PUBLISHED' : 'DRAFT',
        }),
      );
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not plan those shifts.');
    } finally {
      setBusy(false);
    }
  }

  const field =
    'mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600';
  const ready = employeeId && locationId && days.length > 0 && from && until;

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-slate-900">Repeating shifts</h3>
      <p className="mt-0.5 text-sm text-slate-600">
        One rota line at a time — days, hours, and how far ahead.
      </p>

      <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="repeat-employee" className="block text-sm font-medium text-slate-700">
              Employee
            </label>
            <select
              id="repeat-employee"
              required
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className={field}
            >
              <option value="">Choose someone…</option>
              <option value={OPEN}>Nobody yet — open shifts to fill</option>
              {employees
                .filter((employee) => employee.employmentStatus === 'ACTIVE')
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="repeat-location" className="block text-sm font-medium text-slate-700">
              Location
            </label>
            <select
              id="repeat-location"
              required
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              className={field}
            >
              {available.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="repeat-role" className="block text-sm font-medium text-slate-700">
              Job role{' '}
              <span className="font-normal text-slate-400">
                {employeeId === OPEN ? '(who should fill them)' : '(optional)'}
              </span>
            </label>
            <select
              id="repeat-role"
              value={jobRoleId}
              onChange={(event) => setJobRoleId(event.target.value)}
              className={field}
            >
              <option value="">{employeeId === OPEN ? 'Any role' : 'Not specified'}</option>
              {jobRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          {employeeId === OPEN && (
            <div>
              <label htmlFor="repeat-count" className="block text-sm font-medium text-slate-700">
                How many each day
              </label>
              <input
                id="repeat-count"
                type="number"
                min={1}
                max={10}
                value={openCount}
                onChange={(event) =>
                  setOpenCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))
                }
                className={field}
              />
            </div>
          )}
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Days</legend>
          <div className="mt-1 flex flex-wrap gap-1">
            {WEEKDAYS.map((day) => {
              const on = days.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setDays((current) =>
                      current.includes(day.value)
                        ? current.filter((value) => value !== day.value)
                        : [...current, day.value],
                    )
                  }
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    on
                      ? 'bg-brand-600 text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
          {days.length === 0 && (
            <p className="mt-1 text-xs text-rose-600">Pick at least one day.</p>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="repeat-start" className="block text-sm font-medium text-slate-700">
              Starts
            </label>
            <input
              id="repeat-start"
              type="time"
              required
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="repeat-end" className="block text-sm font-medium text-slate-700">
              Ends
            </label>
            <input
              id="repeat-end"
              type="time"
              required
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={field}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Local time at the office. Stays the same through a clock change.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="repeat-from" className="block text-sm font-medium text-slate-700">
              From
            </label>
            <input
              id="repeat-from"
              type="date"
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="repeat-until" className="block text-sm font-medium text-slate-700">
              Until
            </label>
            <input
              id="repeat-until"
              type="date"
              required
              min={from}
              value={until}
              onChange={(event) => setUntil(event.target.value)}
              className={field}
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={publish}
            onChange={(event) => setPublish(event.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          <span>
            Publish straight away
            <span className="block text-xs text-slate-500">
              Otherwise they are saved as drafts for you to review first.
            </span>
          </span>
        </label>

        {problem && <Alert>{problem}</Alert>}

        <button
          type="submit"
          disabled={busy || !ready}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto sm:px-6"
        >
          {busy ? 'Planning…' : 'Create the shifts'}
        </button>
      </form>
    </Card>
  );
}
