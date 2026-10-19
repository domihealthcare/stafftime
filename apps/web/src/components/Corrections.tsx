import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatDate, formatTime } from '../lib/format';
import { useT } from '../lib/i18n';
import { atPracticeTime, practiceClockOf } from '../lib/practice-time';
import type { CorrectionRequest, TimeEntry } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Modal } from './Modal';
import { Alert, Card, buttonClass, inputClass } from './ui';

/**
 * "Ask for a correction" (October 2026, Dominguez - a "smarter" idea): on
 * their own Timesheet, somebody asks for an entry's times to be fixed, saying
 * why; a manager approves it (an ordinary edit, with the reason) or declines
 * it. Also the note an entry carries when they said they were running late.
 */

/// Under an entry: "said they'd be late", and a correction still waiting.
export function EntryNotes({ entry, mine }: { entry: TimeEntry; mine: boolean }) {
  const t = useT();
  const late = entry.shift?.runningLate;
  const waiting = entry.correctionRequests?.[0];
  if (!late && !waiting) return null;
  return (
    <>
      {late && (
        <p className="text-xs text-slate-500" data-testid="running-late-note">
          <span className="font-medium">{t('Running late:')}</span>{' '}
          {mine
            ? t('you said about {n} minutes', { n: String(late.minutes) })
            : t('said about {n} minutes', { n: String(late.minutes) })}
        </p>
      )}
      {waiting && (
        <p className="text-xs text-amber-800" data-testid="correction-waiting">
          <span className="font-medium">{t('Correction asked for:')}</span>{' '}
          {t('in {start}, out {end} - waiting for a manager', {
            start: formatTime(waiting.clockInAt),
            end: formatTime(waiting.clockOutAt),
          })}{' '}
          · “{waiting.reason}”
        </p>
      )}
    </>
  );
}

/// The staff's button: only for their own closed entry with nothing waiting.
export function AskCorrectionButton({ entry, onAsk }: { entry: TimeEntry; onAsk: () => void }) {
  const t = useT();
  if (!entry.clockOutAt || (entry.correctionRequests?.length ?? 0) > 0) return null;
  return (
    <button
      type="button"
      onClick={onAsk}
      className="tap whitespace-nowrap text-xs font-medium text-brand-700 hover:text-brand-900"
    >
      {t('Ask to fix')}
    </button>
  );
}

const plusDays = (iso: string, days: number) =>
  new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

export function AskCorrectionDialog({
  entry,
  onClose,
  onSent,
}: {
  entry: TimeEntry;
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useT();
  const [start, setStart] = useState(practiceClockOf(entry.clockInAt));
  const [end, setEnd] = useState(
    entry.clockOutAt && !entry.autoClockedOutAt ? practiceClockOf(entry.clockOutAt) : '',
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const clockInAt = atPracticeTime(entry.clockInAt, start);
    // A finish earlier in the day than the start is the next morning.
    let clockOutAt = atPracticeTime(entry.clockInAt, end);
    if (clockOutAt <= clockInAt) clockOutAt = atPracticeTime(plusDays(entry.clockInAt, 1), end);
    try {
      await api.askCorrection(entry.id, { clockInAt, clockOutAt, reason: reason.trim() });
      onSent();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : t('That did not save.'));
      setBusy(false);
    }
  }

  return (
    <Modal title={t('Ask for a correction')} onClose={onClose} testId="ask-correction">
      <form onSubmit={(event) => void send(event)} className="space-y-3">
        <p className="text-sm text-slate-700">
          {formatDate(entry.clockInAt)} ·{' '}
          {t('now in {start}, out {end}', {
            start: formatTime(entry.clockInAt),
            end: entry.clockOutAt ? formatTime(entry.clockOutAt) : '-',
          })}
        </p>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="font-medium text-slate-700">{t('Clocked in')}</span>
            <input
              type="time"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className={`mt-1 ${inputClass} w-auto`}
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">{t('Clocked out')}</span>
            <input
              type="time"
              required
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className={`mt-1 ${inputClass} w-auto`}
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('What happened?')}</span>
          <textarea
            required
            minLength={3}
            maxLength={500}
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('Forgot to clock out - left at 5:00 pm')}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <p className="text-xs text-slate-600">
          {t('A manager looks at it and approves it or says why not. You are told either way.')}
        </p>
        {problem && <Alert>{problem}</Alert>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || !end || reason.trim().length < 3}
            className={buttonClass('primary', 'md')}
          >
            {busy ? t('Sending…') : t('Send')}
          </button>
          <button type="button" onClick={onClose} className={buttonClass('secondary', 'md')}>
            {t('Cancel')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/// For managers, at the top of the Timesheet: the corrections waiting.
export function CorrectionsToDecide({
  selfId,
  refreshKey,
  onChanged,
}: {
  selfId?: string;
  refreshKey: number;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [waiting, setWaiting] = useState<CorrectionRequest[]>([]);
  const [declining, setDeclining] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setWaiting(await api.corrections());
    } catch {
      setWaiting([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function act(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setProblem(null);
    try {
      await action();
      setDeclining(null);
      setWhy('');
      await load();
      onChanged();
    } catch (cause) {
      // Hours already sent to payroll need a deliberate yes, as for Edit.
      if (cause instanceof ApiError && cause.status === 409 && /payroll/i.test(cause.message)) {
        const sure = await confirm({
          title: 'These hours already went to payroll',
          body: `${cause.message} Correct them anyway? They are flagged until a later payroll run.`,
          confirmLabel: 'Correct them anyway',
          cancelLabel: 'Leave it',
          tone: 'neutral',
        });
        if (sure) {
          try {
            await api.approveCorrection(id, true);
            await load();
            onChanged();
          } catch (again) {
            setProblem(again instanceof ApiError ? again.message : 'That did not work.');
          }
        }
      } else {
        setProblem(cause instanceof ApiError ? cause.message : 'That did not work.');
      }
    } finally {
      setBusy(null);
    }
  }

  if (waiting.length === 0) return null;

  return (
    <Card className="mb-4 p-4" testId="corrections-to-decide">
      <h2 className="text-sm font-semibold text-slate-900">
        Corrections asked for ({waiting.length})
      </h2>
      {problem && (
        <div className="mt-2">
          <Alert>{problem}</Alert>
        </div>
      )}
      <ul className="mt-2 divide-y divide-slate-100">
        {waiting.map((request) => {
          const own = request.employee.id === selfId;
          return (
            <li key={request.id} className="py-2 text-sm">
              <p className="text-slate-900">
                <span className="font-medium">
                  {request.employee.preferredName ?? request.employee.firstName}{' '}
                  {request.employee.lastName}
                </span>{' '}
                · {formatDate(request.timeEntry.clockInAt)}
              </p>
              <p className="text-slate-700">
                Now {formatTime(request.timeEntry.clockInAt)} –{' '}
                {request.timeEntry.clockOutAt ? formatTime(request.timeEntry.clockOutAt) : '-'}
                {request.timeEntry.autoClockedOutAt ? ' (clocked out at midnight)' : ''} → asked for{' '}
                <strong>
                  {formatTime(request.clockInAt)} – {formatTime(request.clockOutAt)}
                </strong>
              </p>
              <p className="text-slate-600">“{request.reason}”</p>
              {own ? (
                <p className="mt-1 text-xs text-slate-500">Yours - another manager decides it.</p>
              ) : declining === request.id ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    aria-label="Why not"
                    value={why}
                    maxLength={500}
                    onChange={(event) => setWhy(event.target.value)}
                    placeholder="Why not, for them"
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    disabled={busy !== null || why.trim().length < 3}
                    onClick={() =>
                      void act(request.id, () => api.declineCorrection(request.id, why.trim()))
                    }
                    className={buttonClass('secondary', 'sm')}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeclining(null)}
                    className="text-sm text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void act(request.id, () => api.approveCorrection(request.id))}
                    className={buttonClass('primary', 'sm')}
                  >
                    {busy === request.id ? 'Saving…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setDeclining(request.id);
                      setWhy('');
                    }}
                    className={buttonClass('secondary', 'sm')}
                  >
                    Decline…
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
