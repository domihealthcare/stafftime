import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { ClashNote } from './TimeOffClashes';
import { formatCalendarDate, localDate } from '../lib/format';
import { useIsManager, useSession } from '../lib/session';
import { PTO_TYPE_LABELS, hasNone } from '../lib/time-off';
import type { PtoBalance, PtoRequest } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Alert, buttonClass } from './ui';

/**
 * Time off on the Schedule, now that it has no tab of its own (October 2026,
 * Dominguez — option B). Staff see their days left and what they have asked
 * for, beside a button to ask; managers also get the requests waiting on them,
 * to approve or decline on the spot. Everything else — the full history,
 * everybody's balances, the policy — stays on the Time off screen (/time-off),
 * reached from here, from Home, and from Manage → Time off & balances.
 */

const range = (request: PtoRequest) =>
  request.startDate === request.endDate
    ? formatCalendarDate(request.startDate)
    : `${formatCalendarDate(request.startDate)} – ${formatCalendarDate(request.endDate)}`;

const name = (request: PtoRequest) =>
  request.employee
    ? `${request.employee.preferredName ?? request.employee.firstName} ${request.employee.lastName}`
    : 'Somebody';

/// "+ Request time off": the Time off screen with its form open.
export function RequestTimeOffButton() {
  return (
    <Link to="/time-off?request=1" className={buttonClass('primary', 'sm')}>
      + Request time off
    </Link>
  );
}

/// The requests a manager has to decide, with Approve and Decline. Nothing at
/// all when there are none.
export function RequestsToDecide({ onDecided }: { onDecided: () => void }) {
  const isManager = useIsManager();
  const { employee } = useSession();
  const confirm = useConfirm();
  const [requests, setRequests] = useState<PtoRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isManager) return;
    try {
      const pending = await api.listPto({ status: 'PENDING' });
      // Nobody decides their own.
      setRequests(pending.filter((request) => request.employeeId !== employee?.id));
    } catch {
      // Quietly: the Time off screen still has them.
    }
  }, [isManager, employee?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(request: PtoRequest, decision: 'APPROVED' | 'DENIED') {
    if (
      decision === 'DENIED' &&
      !(await confirm({
        title: `Decline ${name(request)}'s request?`,
        body: `${PTO_TYPE_LABELS[request.type]}, ${range(request)}. They are told straight away.`,
        confirmLabel: 'Decline it',
        cancelLabel: 'Keep it waiting',
        tone: 'danger',
      }))
    ) {
      return;
    }
    setBusy(request.id);
    setError(null);
    try {
      await api.reviewPto(request.id, decision);
      await load();
      onDecided();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that decision.');
    } finally {
      setBusy(null);
    }
  }

  if (!isManager || requests.length === 0) return null;

  return (
    <section
      aria-label="Time-off requests to decide"
      data-testid="requests-to-decide"
      className="mb-4 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-300"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-amber-950">
          {requests.length} time-off request{requests.length === 1 ? '' : 's'} to decide
        </h2>
        <Link to="/time-off" className="text-sm font-medium text-brand-700 hover:text-brand-900">
          Time off &amp; balances →
        </Link>
      </div>
      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul className="mt-2 divide-y divide-amber-200">
        {requests.map((request) => (
          <li
            key={request.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          >
            <span className="min-w-0">
              <span className="font-medium text-slate-900">{name(request)}</span>
              <span className="text-slate-700">
                {' '}
                — {PTO_TYPE_LABELS[request.type]}, {range(request)}
                {request.isHalfDay ? ' (half day)' : ''}
              </span>
              {request.notes && (
                <span className="block text-xs text-slate-600">“{request.notes}”</span>
              )}
              <ClashNote requestId={request.id} employeeId={request.employeeId} />
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide(request, 'APPROVED')}
                className={buttonClass('primary', 'sm')}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide(request, 'DENIED')}
                className={buttonClass('secondary', 'sm')}
              >
                Decline
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/// One line about somebody's own time off: days left, and what is coming up
/// or waiting. For everybody, managers included — their own.
export function YourTimeOff({ refreshKey }: { refreshKey: number }) {
  const { employee } = useSession();
  const [balance, setBalance] = useState<PtoBalance | null>(null);
  const [mine, setMine] = useState<PtoRequest[]>([]);

  useEffect(() => {
    if (!employee) return;
    let cancelled = false;
    const today = localDate(new Date());
    Promise.all([api.ptoBalance(), api.listPto({ employeeId: employee.id })])
      .then(([found, requests]) => {
        if (cancelled) return;
        setBalance(found);
        setMine(
          requests
            .filter(
              (request) =>
                request.endDate >= today &&
                (request.status === 'PENDING' || request.status === 'APPROVED'),
            )
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .slice(0, 3),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [employee, refreshKey]);

  if (!balance) return null;

  return (
    <section
      aria-label="Your time off"
      data-testid="your-time-off"
      className="mb-4 rounded-xl bg-white p-3 text-sm ring-1 ring-inset ring-slate-200"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold text-slate-900">Your time off</span>
        {!hasNone(balance.vacation) && (
          <span className="text-slate-700">
            PTO <span className="font-semibold">{balance.vacation.remaining}</span> days left
          </span>
        )}
        <span className="text-slate-700">
          Sick <span className="font-semibold">{balance.sick.remaining}</span> days left
        </span>
        <Link
          to="/time-off"
          className="ml-auto text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          All your time off →
        </Link>
      </div>
      {mine.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-slate-600">
          {mine.map((request) => (
            <li key={request.id}>
              {range(request)} — {PTO_TYPE_LABELS[request.type]}
              {request.status === 'PENDING' ? (
                <span className="text-amber-800"> · waiting for a manager</span>
              ) : (
                <span className="text-emerald-700"> · approved</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
