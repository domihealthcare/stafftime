import { useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate, formatDate } from '../lib/format';
import { useIsAdmin } from '../lib/session';
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
  const isAdmin = useIsAdmin();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [note, setNote] = useState('');
  // Most tasks are just ticked off. A file picker on every row is noise, so it
  // only shows where a document is actually wanted — or on request.
  const [attaching, setAttaching] = useState(false);

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

  async function attach(file: File) {
    setBusy(true);
    setError(null);
    try {
      await api.uploadChecklistDocument(task.id, file);
      onChanged(await api.checklist(task.checklistId));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That file did not upload.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function saveFile(documentId: string) {
    setError(null);
    try {
      const { blob, filename } = await api.downloadChecklistDocument(documentId);
      // There is no openable URL for a document, so the blob is handed to the
      // browser as a one-off link that is revoked straight away.
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That file could not be opened.');
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
            {task.requiresDocument && task.documents.length === 0 && (
              <Badge tone="warning">needs a document</Badge>
            )}
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

          {task.documents.length > 0 && (
            <ul className="mt-2 space-y-1">
              {task.documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => void saveFile(doc.id)}
                    className="font-medium text-brand-700 underline hover:text-brand-900"
                  >
                    {doc.filename}
                  </button>
                  <span className="text-slate-400">{formatSize(doc.sizeBytes)}</span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={async () => {
                        await api.deleteChecklistDocument(doc.id);
                        onChanged(await api.checklist(task.checklistId));
                      }}
                      className="text-slate-400 hover:text-rose-700"
                    >
                      remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canComplete && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
            {task.status === 'PENDING' ? (
              <>
                {task.requiresDocument || attaching ? (
                  <input
                    ref={fileInput}
                    type="file"
                    aria-label={`Attach a document to “${task.title}”`}
                    accept="application/pdf,image/png,image/jpeg"
                    className="max-w-full text-xs text-slate-600 sm:w-44"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void attach(file);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAttaching(true)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    Attach a file
                  </button>
                )}
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
