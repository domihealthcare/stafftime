import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { CoverOptions, CoverRequestStatus } from '../lib/types';
import { buttonClass } from './ui';

/**
 * "Someone called out: ask who can cover" (October 2026, Dominguez — a
 * "smarter" idea), in an open shift's pop-up on the rota. Tick who to ask
 * — the good fits from "Who can cover this?" start ticked; the ones with a
 * catch are offered, unticked, with the catch — and they are asked by bell
 * and email. The first to say yes gets the shift; the manager is told, and
 * so are the others. Only the people asked hear about it.
 */
export function AskToCover({
  shiftId,
  cover,
  onTaken,
}: {
  shiftId: string;
  cover: CoverOptions | null;
  onTaken: () => void;
}) {
  const [status, setStatus] = useState<CoverRequestStatus | null | undefined>(undefined);
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .coverRequest(shiftId)
      .then((result) => live && setStatus(result.request))
      .catch(() => live && setStatus(null));
    return () => {
      live = false;
    };
  }, [shiftId]);

  const asked = new Set((status?.asks ?? []).map((ask) => ask.employee.id));
  const askable = (cover?.options ?? []).filter(
    (option) => option.fit !== 'cannot' && !option.current && !asked.has(option.employeeId),
  );

  function startChoosing() {
    setPicked(new Set(askable.filter((o) => o.fit === 'good').map((o) => o.employeeId)));
    setChoosing(true);
  }

  async function run(action: () => Promise<{ request: CoverRequestStatus | null }>) {
    setBusy(true);
    setProblem(null);
    try {
      const result = await action();
      setStatus(result.request);
      setChoosing(false);
      if (result.request?.state === 'covered') onTaken();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not do that just now.');
    } finally {
      setBusy(false);
    }
  }

  if (status === undefined || !cover) return null;
  const live = status?.state === 'open';

  return (
    <div
      className="mt-4 rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-200"
      data-testid="ask-to-cover"
    >
      <p className="text-sm font-medium text-amber-950">
        <span aria-hidden="true">📣 </span>Ask people to cover
      </p>

      {status && (
        <div className="mt-1 text-sm text-slate-800" data-testid="cover-asked">
          {status.state === 'covered' && status.takenBy ? (
            <p>
              {status.takenBy.preferredName ?? status.takenBy.firstName} {status.takenBy.lastName}{' '}
              said yes — the shift is theirs.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-600">
                Asked{' '}
                {new Date(status.createdAt).toLocaleString(undefined, {
                  timeZone: 'America/New_York',
                  weekday: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {status.state === 'stopped' && ' — stopped asking'}
                {status.state === 'started' && ' — the shift has started'}:
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {status.asks.map((ask) => (
                  <li key={ask.employee.id}>
                    {ask.employee.preferredName ?? ask.employee.firstName} {ask.employee.lastName}{' '}
                    <span className="text-slate-600">
                      — {ask.answer === null ? 'not answered yet' : ask.answer ? 'yes' : 'no'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {choosing ? (
        <div className="mt-2 space-y-1">
          {askable.length === 0 ? (
            <p className="text-sm text-slate-700">Nobody else here is free then.</p>
          ) : (
            askable.map((option) => (
              <label key={option.employeeId} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.has(option.employeeId)}
                  onChange={(event) =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(option.employeeId);
                      else next.delete(option.employeeId);
                      return next;
                    })
                  }
                  className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                />
                <span>
                  {option.name}
                  <span className="text-slate-600">
                    {' '}
                    — {option.fit === 'good' ? 'free' : (option.reasons[0]?.text ?? 'check first')}
                  </span>
                </span>
              </label>
            ))
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy || picked.size === 0}
              onClick={() => void run(() => api.askCover(shiftId, [...picked]))}
              className={buttonClass('primary', 'sm')}
            >
              {busy ? 'Asking…' : `Ask ${picked.size} ${picked.size === 1 ? 'person' : 'people'}`}
            </button>
            <button
              type="button"
              onClick={() => setChoosing(false)}
              className={buttonClass('secondary', 'sm')}
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-slate-600">
            They get a note on the bell and an email. The first to say yes gets the shift, published
            to them; you and the others are told. Nobody else sees it.
          </p>
        </div>
      ) : (
        status?.state !== 'covered' && (
          <div className="mt-2 flex flex-wrap gap-2">
            {(!status || live || status.state === 'stopped') && askable.length > 0 && (
              <button
                type="button"
                onClick={startChoosing}
                className={buttonClass('secondary', 'sm')}
              >
                {status && live ? 'Ask more people' : 'Choose who to ask'}
              </button>
            )}
            {live && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => api.stopCover(shiftId))}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Stop asking
              </button>
            )}
            {!status && askable.length === 0 && (
              <p className="text-sm text-slate-700">Nobody here is free then.</p>
            )}
          </div>
        )
      )}
      {problem && <p className="mt-2 text-sm text-rose-700">{problem}</p>}
    </div>
  );
}
