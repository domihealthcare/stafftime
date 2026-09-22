import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate, formatDate } from '../lib/format';
import type { Checklist, ChecklistTask, ChecklistTaskStatus } from '../lib/types';
import { Badge } from './ui';

const OWNER_LABEL: Record<ChecklistTask['owner'], string> = {
  EMPLOYEE: 'the new hire',
  MANAGER: 'a manager',
  ADMIN: 'the practice',
};

export function ChecklistTaskRow({
  task,
  canComplete,
  onChanged,
}: {
  task: ChecklistTask;
  canComplete: boolean;
  onChanged: (checklist: Checklist) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [note, setNote] = useState('');

  const overdue =
    task.status === 'PENDING' && task.dueAt !== null && task.dueAt.slice(0, 10) < today();

  async function setStatus(status: ChecklistTaskStatus, reason?: string) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.updateChecklistTask(task.id, status, reason));
      setSkipping(false);
      setNote('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-sm font-medium ${
                task.status === 'DONE'
                  ? 'text-slate-500 line-through'
                  : task.status === 'NOT_APPLICABLE'
                    ? 'text-slate-400 line-through'
                    : 'text-slate-900'
              }`}
            >
              {task.title}
            </span>
            {task.status === 'DONE' && <Badge tone="success">done</Badge>}
            {task.status === 'NOT_APPLICABLE' && <Badge>not applicable</Badge>}
            {overdue && <Badge tone="danger">overdue</Badge>}
          </div>

          {task.description && (
            <p className="mt-1 text-sm text-slate-600">{task.description}</p>
          )}

          <p className="mt-1 text-xs text-slate-500">
            For {OWNER_LABEL[task.owner]}
            {task.dueAt && ` · due ${formatCalendarDate(task.dueAt)}`}
            {task.completedAt &&
              task.completedBy &&
              ` · ${task.status === 'DONE' ? 'done' : 'skipped'} by ${
                task.completedBy.firstName
              } ${task.completedBy.lastName} on ${formatDate(task.completedAt)}`}
          </p>

          {task.note && (
            <p className="mt-1 text-xs italic text-slate-500">“{task.note}”</p>
          )}
        </div>

        {canComplete && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
            {task.status === 'PENDING' ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setStatus('DONE')}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  Mark done
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSkipping((open) => !open)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Not applicable
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setStatus('PENDING')}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Reopen
              </button>
            )}
          </div>
        )}
      </div>

      {skipping && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-600" htmlFor={`note-${task.id}`}>
            Why does it not apply?
          </label>
          <input
            id={`note-${task.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Non-clinical role"
            className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={busy || note.trim() === ''}
            onClick={() => void setStatus('NOT_APPLICABLE', note.trim())}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            Save
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </li>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
