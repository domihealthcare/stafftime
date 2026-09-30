import { useState } from 'react';
import { api } from '../lib/api';
import { handEntryReasonLabel } from '../lib/hand-entry';
import { formatDate, formatTime } from '../lib/format';
import type { TimeEntry } from '../lib/types';
import { Alert } from './ui';
import { useDialog } from './useDialog';

/**
 * Saying somebody has found out why hours had to be entered by hand, which
 * takes them off the "Worth a look" list and the nightly email. What they
 * found is optional, but it is the point of looking.
 */
export function CheckHandEntryDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimeEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [finding, setFinding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.checkHandEntry(entry.id, finding);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  const dialog = useDialog(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-hand-entry-title"
        {...dialog}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl outline-none"
      >
        <h2 id="check-hand-entry-title" className="text-lg font-semibold text-slate-900">
          Looked into why
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {entry.employee ? `${entry.employee.firstName} ${entry.employee.lastName} · ` : ''}
          {formatDate(entry.clockInAt)}, {formatTime(entry.clockInAt)}
          {entry.clockOutAt ? `–${formatTime(entry.clockOutAt)}` : ''}
        </p>
        <p className="mt-2 text-sm text-slate-700">
          <span className="font-medium">{handEntryReasonLabel(entry.handEntryReason)}</span>
          {entry.handEntryNote ? `: “${entry.handEntryNote}”` : ''}
        </p>

        <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3">
          <div>
            <label htmlFor="check-finding" className="block text-sm font-medium text-slate-700">
              What you found <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="check-finding"
              type="text"
              maxLength={500}
              placeholder="e.g. Location was off for Safari — showed her how to turn it on"
              value={finding}
              onChange={(event) => setFinding(event.target.value)}
              className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
            />
          </div>

          {error && <Alert>{error}</Alert>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Mark as looked into'}
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
