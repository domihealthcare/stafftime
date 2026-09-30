import { useMemo, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { HAND_ENTRY_REASONS } from '../lib/hand-entry';
import { localDate } from '../lib/format';
import type { Employee, HandEntryReason } from '../lib/types';
import { Alert } from './ui';
import { useDialog } from './useDialog';

const field =
  'mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600';

/**
 * A manager entering a day that has no punch at all (Dominguez, September
 * 2026). Correcting a punch that exists is the Correct button; this is for
 * when there is nothing to correct.
 *
 * Every one of these is listed — Timesheet banner and nightly email — until
 * somebody other than the manager who entered it has looked into why it was
 * needed, so the form asks for the reason up front and says so.
 */
export function AddHoursDialog({
  employees,
  selfId,
  onClose,
  onSaved,
}: {
  employees: Employee[];
  /// The manager's own hours are added by somebody else.
  selfId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const people = useMemo(
    () =>
      employees
        .filter((person) => person.id !== selfId)
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
        ),
    [employees, selfId],
  );

  const [employeeId, setEmployeeId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [day, setDay] = useState(() => localDate(new Date()));
  const [start, setStart] = useState('');
  const [finish, setFinish] = useState('');
  const [reason, setReason] = useState<HandEntryReason | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /// Set when the server refuses because the day's pay period already went
  /// to payroll. Adding the hours is still allowed, but somebody says they know.
  const [exportedWarning, setExportedWarning] = useState<string | null>(null);

  const person = people.find((candidate) => candidate.id === employeeId);
  const offices = person?.locations ?? [];

  function choosePerson(id: string) {
    setEmployeeId(id);
    const chosen = people.find((candidate) => candidate.id === id);
    // Most people work at one office; pick it for them.
    const theirs = chosen?.locations ?? [];
    setLocationId(
      theirs.length === 1
        ? theirs[0].locationId
        : (theirs.find((office) => office.isPrimary)?.locationId ?? ''),
    );
    setExportedWarning(null);
  }

  const clockIn = day && start ? new Date(`${day}T${start}`) : null;
  const clockOut = day && finish ? new Date(`${day}T${finish}`) : null;
  const finishBeforeStart = clockIn !== null && clockOut !== null && clockOut <= clockIn;
  const hours =
    clockIn && clockOut && !finishBeforeStart
      ? (clockOut.getTime() - clockIn.getTime()) / 3_600_000
      : null;
  const canSave =
    employeeId !== '' &&
    locationId !== '' &&
    hours !== null &&
    reason !== '' &&
    note.trim().length >= 3;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || !clockIn || !clockOut || !reason) return;
    setBusy(true);
    setError(null);
    try {
      await api.addHours({
        employeeId,
        locationId,
        clockInAt: clockIn.toISOString(),
        clockOutAt: clockOut.toISOString(),
        reason,
        note: note.trim(),
        acknowledgeExported: exportedWarning !== null ? true : undefined,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_EXPORTED') {
        setExportedWarning(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Could not add those hours.');
      }
    } finally {
      setBusy(false);
    }
  }

  const chosenReason = HAND_ENTRY_REASONS.find((option) => option.value === reason);

  const dialog = useDialog(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-hours-title"
        {...dialog}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl outline-none"
      >
        <h2 id="add-hours-title" className="text-lg font-semibold text-slate-900">
          Add hours
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          For a day with no punch at all. To fix a punch that is there, use Correct on it instead.
        </p>

        <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3">
          <div>
            <label htmlFor="add-person" className="block text-sm font-medium text-slate-700">
              Who
            </label>
            <select
              id="add-person"
              required
              value={employeeId}
              onChange={(event) => choosePerson(event.target.value)}
              className={field}
            >
              <option value="">Choose somebody…</option>
              {people.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.firstName} {candidate.lastName}
                  {candidate.employmentStatus === 'TERMINATED' ? ' (has left)' : ''}
                </option>
              ))}
            </select>
          </div>

          {person && offices.length === 0 && (
            <p className="text-xs text-rose-600">
              {person.firstName} is not at either office yet. Add one on the Staff screen first.
            </p>
          )}

          {offices.length > 1 && (
            <div>
              <label htmlFor="add-office" className="block text-sm font-medium text-slate-700">
                Office
              </label>
              <select
                id="add-office"
                required
                value={locationId}
                onChange={(event) => {
                  setLocationId(event.target.value);
                  setExportedWarning(null);
                }}
                className={field}
              >
                <option value="">Choose an office…</option>
                {offices.map((office) => (
                  <option key={office.locationId} value={office.locationId}>
                    {office.location.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="add-day" className="block text-sm font-medium text-slate-700">
              Day
            </label>
            <input
              id="add-day"
              type="date"
              required
              max={localDate(new Date())}
              value={day}
              onChange={(event) => {
                setDay(event.target.value);
                setExportedWarning(null);
              }}
              className={field}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-start" className="block text-sm font-medium text-slate-700">
                Started
              </label>
              <input
                id="add-start"
                type="time"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="add-finish" className="block text-sm font-medium text-slate-700">
                Finished
              </label>
              <input
                id="add-finish"
                type="time"
                required
                value={finish}
                onChange={(event) => setFinish(event.target.value)}
                className={field}
              />
            </div>
          </div>
          {finishBeforeStart ? (
            <p className="text-xs text-rose-600">The finish must be after the start.</p>
          ) : (
            hours !== null && <p className="text-xs text-slate-500">{hours.toFixed(2)} hours</p>
          )}

          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">Why by hand?</legend>
            <div className="mt-1 space-y-1">
              {HAND_ENTRY_REASONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="radio"
                    name="add-reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                    className="border-slate-300 text-brand-600 focus:ring-brand-600"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {chosenReason?.hint && (
              <p className="mt-1 text-xs text-slate-500">{chosenReason.hint}</p>
            )}
          </fieldset>

          <div>
            <label htmlFor="add-note" className="block text-sm font-medium text-slate-700">
              What happened
            </label>
            <input
              id="add-note"
              type="text"
              required
              minLength={3}
              maxLength={500}
              placeholder="e.g. Phone said location was turned off"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={field}
            />
          </div>

          {error && <Alert>{error}</Alert>}

          {exportedWarning && (
            <Alert tone="warning">
              {exportedWarning} Press the button again to add them anyway.
            </Alert>
          )}

          <p className="text-xs text-slate-500">
            Recorded against your name. It stays on the Timesheet&rsquo;s &ldquo;Worth a look&rdquo;
            list and in the nightly email until another manager has looked into why it was needed.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={busy || !canSave}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Adding…' : exportedWarning ? 'Add them anyway' : 'Add hours'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
