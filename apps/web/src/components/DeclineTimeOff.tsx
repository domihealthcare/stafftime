import { useId, useState } from 'react';
import { AI_NOTE, useAiOn } from '../lib/ai';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { PTO_TYPE_LABELS } from '../lib/time-off';
import type { PtoRequest } from '../lib/types';
import { Modal } from './Modal';
import { buttonClass } from './ui';

/**
 * Declining time off, with the reason the person will read (October 2026).
 * The Schedule's Decline used to send none, which the server refuses — a
 * decline needs a reason — so it failed; now the Schedule and the Time off
 * screen both use this. With the AI helpers on, **Help me word it** turns a
 * few words into a kind reason to edit (`POST /pto/:id/decline-wording`).
 */
export function useDeclineTimeOff() {
  const [pending, setPending] = useState<{
    request: PtoRequest;
    resolve: (declined: boolean) => void;
  } | null>(null);

  /// Opens the pop-up; true once it has been declined, false if cancelled.
  function decline(request: PtoRequest): Promise<boolean> {
    return new Promise<boolean>((resolve) =>
      setPending({
        request,
        resolve: (declined) => {
          setPending(null);
          resolve(declined);
        },
      }),
    );
  }

  const dialog = pending ? (
    <DeclineDialog request={pending.request} onDone={pending.resolve} />
  ) : null;
  return { decline, dialog };
}

const MAX_REASON = 500;

function DeclineDialog({
  request,
  onDone,
}: {
  request: PtoRequest;
  onDone: (declined: boolean) => void;
}) {
  const id = useId();
  const aiOn = useAiOn();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'wording' | 'saving' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const first = request.employee
    ? (request.employee.preferredName ?? request.employee.firstName)
    : 'them';
  const when =
    request.startDate === request.endDate
      ? formatCalendarDate(request.startDate)
      : `${formatCalendarDate(request.startDate)} – ${formatCalendarDate(request.endDate)}`;

  async function word() {
    setBusy('wording');
    setProblem(null);
    try {
      const { reason: worded } = await api.declineWording(request.id, reason.trim());
      if (worded) setReason(worded);
      else setProblem('Could not word that one — write it in your own words.');
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not word that just now.');
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('saving');
    setProblem(null);
    try {
      await api.reviewPto(request.id, 'DENIED', reason.trim());
      onDone(true);
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not save that decision.');
      setBusy(null);
    }
  }

  return (
    <Modal
      title={`Decline ${first}'s request?`}
      testId="decline-time-off"
      onClose={() => onDone(false)}
    >
      <p className="text-sm text-slate-700">
        {PTO_TYPE_LABELS[request.type]}, {when}. {first} is told straight away, with the reason.
      </p>
      <label htmlFor={`${id}-reason`} className="mt-3 block text-sm font-medium text-slate-700">
        The reason {first} will read
      </label>
      <textarea
        id={`${id}-reason`}
        autoFocus
        rows={4}
        maxLength={MAX_REASON}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Both MAs are already off that week"
        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      />
      {aiOn && (
        <div className="mt-1">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void word()}
            className="text-sm font-medium text-brand-700 hover:text-brand-900 disabled:opacity-60"
          >
            {busy === 'wording' ? 'Wording it…' : '✨ Help me word it'}
          </button>
          <p className="mt-0.5 text-xs text-slate-500">
            Uses what you typed (or, if nothing, how many would be off — never who). {AI_NOTE}
          </p>
        </div>
      )}
      {problem && <p className="mt-2 text-sm text-rose-700">{problem}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onDone(false)}
          className={buttonClass('secondary', 'md')}
        >
          Keep it waiting
        </button>
        <button
          type="button"
          disabled={busy !== null || reason.trim() === ''}
          onClick={() => void save()}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {busy === 'saving' ? 'Declining…' : 'Decline it'}
        </button>
      </div>
    </Modal>
  );
}
