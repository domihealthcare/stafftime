import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { PTO_TYPE_LABELS } from '../lib/time-off';
import type { PastBalanceFix } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Alert, buttonClass } from './ui';

/**
 * Time off approved past the balance before 2 November 2026, when it was
 * approved whole and "Approved" hid the unpaid days (Dominguez: "fix the old
 * approved requests that went past the balance"). Managers see each one and
 * what splitting it does - the days still covered stay as asked, the rest
 * become Unpaid - and put them all right in one press. Each person is told.
 * Shows nothing once there are none.
 */
export function PastBalanceFixes({ onDone }: { onDone: () => void }) {
  const confirm = useConfirm();
  const [fixes, setFixes] = useState<PastBalanceFix[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setFixes(await api.pastBalanceFixes());
    } catch {
      setFixes([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function splitThem() {
    if (!fixes || fixes.length === 0) return;
    const sure = await confirm({
      title: `Split ${fixes.length === 1 ? 'this request' : `these ${fixes.length} requests`} into paid and unpaid days?`,
      body: 'The days their balance still covered stay as they were; the rest become a separate Unpaid part. Each person is told on the bell and by email, and the request shows who changed it.',
      confirmLabel: 'Yes, split them',
      cancelLabel: 'Not now',
    });
    if (!sure) return;
    setBusy(true);
    setProblem(null);
    try {
      const { split } = await api.splitPastBalance(fixes.map((fix) => fix.id));
      setDone(split);
      await load();
      onDone();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done !== null && fixes?.length === 0) {
    return (
      <div className="mb-4" data-testid="past-balance-fixed">
        <Alert tone="success">
          {done === 1 ? '1 request was' : `${done} requests were`} split into paid and unpaid days.
          Each person has been told.
        </Alert>
      </div>
    );
  }
  if (!fixes || fixes.length === 0) return null;

  const name = (fix: PastBalanceFix) =>
    `${fix.employee.preferredName ?? fix.employee.firstName} ${fix.employee.lastName}`;
  const range = (from: string, to: string) =>
    from === to
      ? formatCalendarDate(from, { year: false })
      : `${formatCalendarDate(from, { year: false })} to ${formatCalendarDate(to, { year: false })}`;

  return (
    <section
      aria-label="Approved time off past the balance"
      data-testid="past-balance-fixes"
      className="mb-4 rounded-xl bg-amber-50 p-4 text-sm ring-1 ring-inset ring-amber-300"
    >
      <h2 className="font-semibold text-amber-950">
        {fixes.length === 1
          ? '1 approved request went past the balance'
          : `${fixes.length} approved requests went past the balance`}
      </h2>
      <p className="mt-1 text-amber-900">
        Approved before unpaid days were split off, so they show as fully paid. Splitting them keeps
        the days the balance still covered and makes the rest Unpaid, as approving does now.
      </p>
      <ul className="mt-3 divide-y divide-amber-200">
        {fixes.map((fix) => (
          <li key={fix.id} className="py-2" data-testid={`past-balance-fix-${fix.id}`}>
            <span className="font-medium text-slate-900">{name(fix)}</span>
            <span className="text-slate-700">
              {' '}
              · {PTO_TYPE_LABELS[fix.type]}, {range(fix.startDate, fix.endDate)}
            </span>
            <div className="text-amber-900">
              {fix.paid
                ? `${fix.paidDays} ${fix.paidDays === 1 ? 'day' : 'days'} ${PTO_TYPE_LABELS[fix.type]}, ${range(fix.paid.startDate, fix.paid.endDate)}; then ${fix.unpaidDays} ${fix.unpaidDays === 1 ? 'day' : 'days'} Unpaid, ${range(fix.unpaid.startDate, fix.unpaid.endDate)}`
                : `All ${fix.unpaidDays} ${fix.unpaidDays === 1 ? 'day' : 'days'} Unpaid: nothing was left`}
            </div>
          </li>
        ))}
      </ul>
      {problem && (
        <p role="alert" className="mt-2 text-rose-700">
          {problem}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void splitThem()}
        className={`mt-3 ${buttonClass('primary', 'sm')}`}
      >
        {busy ? 'Splitting…' : 'Split them into paid and unpaid days'}
      </button>
    </section>
  );
}
