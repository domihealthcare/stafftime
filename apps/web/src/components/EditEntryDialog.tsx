import { useState } from 'react';
import { api } from '../lib/api';
import { toLocalInputValue } from '../lib/format';
import type { TimeEntry } from '../lib/types';
import { Alert } from './ui';

/**
 * Manager correction of a punch.
 *
 * A reason is mandatory — the API requires it and, more to the point, it is the
 * record that resolves a payroll dispute later. The dialog says plainly that the
 * edit is recorded against the manager's name.
 */
export function EditEntryDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimeEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clockInAt, setClockInAt] = useState(toLocalInputValue(new Date(entry.clockInAt)));
  const [clockOutAt, setClockOutAt] = useState(
    entry.clockOutAt ? toLocalInputValue(new Date(entry.clockOutAt)) : '',
  );
  const [editReason, setEditReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outBeforeIn =
    clockOutAt !== '' && new Date(clockOutAt).getTime() <= new Date(clockInAt).getTime();
  const canSave = editReason.trim().length >= 3 && !outBeforeIn;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.editTimeEntry(entry.id, {
        clockInAt: new Date(clockInAt).toISOString(),
        clockOutAt: clockOutAt ? new Date(clockOutAt).toISOString() : undefined,
        editReason,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that correction.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-entry-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 id="edit-entry-title" className="text-lg font-semibold text-slate-900">
          Correct time entry
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {entry.employee
            ? `${entry.employee.firstName} ${entry.employee.lastName}`
            : 'This employee'}
          {entry.location ? ` · ${entry.location.name}` : ''}
        </p>

        <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3">
          <div>
            <label htmlFor="edit-in" className="block text-sm font-medium text-slate-700">
              Clocked in
            </label>
            <input
              id="edit-in"
              type="datetime-local"
              required
              step="1"
              value={clockInAt}
              onChange={(event) => setClockInAt(event.target.value)}
              className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
            />
          </div>

          <div>
            <label htmlFor="edit-out" className="block text-sm font-medium text-slate-700">
              Clocked out
            </label>
            <input
              id="edit-out"
              type="datetime-local"
              step="1"
              value={clockOutAt}
              onChange={(event) => setClockOutAt(event.target.value)}
              className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
            />
            <p className="mt-1 text-xs text-slate-500">
              Leave empty for a missing punch — it stays flagged for review.
            </p>
            {outBeforeIn && (
              <p className="mt-1 text-xs text-rose-600">
                Clock-out must be after clock-in.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="edit-reason" className="block text-sm font-medium text-slate-700">
              Reason
            </label>
            <input
              id="edit-reason"
              type="text"
              required
              minLength={3}
              maxLength={500}
              placeholder="e.g. Forgot to clock out at end of shift"
              value={editReason}
              onChange={(event) => setEditReason(event.target.value)}
              className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
            />
          </div>

          {error && <Alert>{error}</Alert>}

          <p className="text-xs text-slate-500">
            This correction is recorded against your name and shown on the timesheet.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={busy || !canSave}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save correction'}
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
