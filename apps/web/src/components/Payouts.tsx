import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, api } from '../lib/api';
import { centsText, money, parseCents } from '../lib/cme';
import { formatCalendarDate } from '../lib/format';
import { practiceDate } from '../lib/practice-time';
import { useSession } from '../lib/session';
import type { Payout, PayoutList, ReimbursementMethod } from '../lib/types';
import { Modal } from './Modal';
import { Alert, Badge, Card, Field, buttonClass, inputClass } from './ui';

export const METHOD_LABELS: Record<ReimbursementMethod, string> = {
  PAPER_CHECK: 'Paper check',
  CASH: 'Cash',
  DIRECT_DEPOSIT: 'Direct deposit',
  OTHER: 'Another way',
};

/**
 * The payroll prompt (November 2026, Dominguez: reimbursements "should not be
 * part of payroll - though should prompt the person running payroll (usually
 * angelica d) that there is an unpaid reimbursement (which she should have the
 * option to defer or it was addressed (i.e. via paper check for instance)) this
 * should be for CME as well"). Every approved expense and CME request not paid
 * back yet: **Paid** records the day, amount and how, **Not this time** puts it
 * off until the next payroll. On the Export screen and the Expenses screen.
 * Shows nothing when there is nothing to pay.
 */
export function UnpaidReimbursements({ onChanged }: { onChanged?: () => void }) {
  const me = useSession().employee?.id ?? null;
  const [list, setList] = useState<PayoutList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState<Payout | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDeferred, setShowDeferred] = useState(false);

  const load = useCallback(() => {
    api
      .payouts()
      .then(setList)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the reimbursements.'),
      );
  }, []);
  useEffect(load, [load]);

  const changed = (message: string) => {
    setNotice(message);
    load();
    onChanged?.();
  };

  const act = async (payout: Payout, step: 'defer' | 'undefer') => {
    setBusy(payout.id);
    setError(null);
    try {
      if (step === 'defer') {
        const { deferredUntil } = await api.deferPayout(payout.kind, payout.id);
        changed(
          `${payout.person.name}'s is put off until ${formatCalendarDate(deferredUntil ?? '')}.`,
        );
      } else {
        await api.undeferPayout(payout.kind, payout.id);
        changed(`${payout.person.name}'s is back on the list.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  if (!list) return error ? <Alert>{error}</Alert> : null;
  if (list.due.length === 0 && list.deferred.length === 0) return null;
  const total = list.due.reduce((sum, payout) => sum + payout.amountCents, 0);

  return (
    <Card className="mb-4 border-l-4 border-amber-400 p-5" testId="unpaid-reimbursements">
      <h2 className="text-sm font-semibold text-slate-900">
        {list.due.length === 0
          ? 'Reimbursements to pay'
          : `${list.due.length} ${list.due.length === 1 ? 'reimbursement' : 'reimbursements'} to pay, ${money(total)}`}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Approved expenses and CME are never part of payroll or this export. Pay each another way (a
        paper check, say) and record it, or press <strong>Not this time</strong> to be asked again
        at the next payroll ({formatCalendarDate(list.nextPayroll)}).
      </p>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mt-3">
          <Alert tone="success">
            <span role="status">{notice}</span>
          </Alert>
        </div>
      )}
      {list.due.length === 0 && <p className="mt-3 text-sm text-slate-600">Nothing to pay now.</p>}
      <ul className="mt-3 divide-y divide-slate-100">
        {list.due.map((payout) => (
          <li
            key={`${payout.kind}-${payout.id}`}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
            data-testid="payout"
          >
            <PayoutLine payout={payout} />
            {payout.employeeId === me ? (
              <span className="text-xs text-slate-500">Yours: somebody else records it</span>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  className={buttonClass('primary', 'sm')}
                  onClick={() => {
                    setNotice(null);
                    setPaying(payout);
                  }}
                >
                  Paid…
                </button>
                <button
                  type="button"
                  className={buttonClass('secondary', 'sm')}
                  disabled={busy === payout.id}
                  onClick={() => void act(payout, 'defer')}
                >
                  Not this time
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {list.deferred.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="tap text-sm font-medium text-brand-700 underline"
            aria-expanded={showDeferred}
            onClick={() => setShowDeferred((open) => !open)}
          >
            {showDeferred ? 'Hide' : 'Show'} the {list.deferred.length} put off until later
          </button>
          {showDeferred && (
            <ul className="mt-2 divide-y divide-slate-100">
              {list.deferred.map((payout) => (
                <li
                  key={`${payout.kind}-${payout.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                  data-testid="payout-deferred"
                >
                  <PayoutLine payout={payout} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">
                      Until {formatCalendarDate(payout.deferredUntil ?? '')}
                    </span>
                    {payout.employeeId !== me && (
                      <button
                        type="button"
                        className={buttonClass('secondary', 'sm')}
                        disabled={busy === payout.id}
                        onClick={() => void act(payout, 'undefer')}
                      >
                        Bring it back
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {paying && (
        <PaidDialog
          payout={paying}
          onClose={() => setPaying(null)}
          onPaid={(how) => {
            setPaying(null);
            changed(
              `Recorded: ${paying.person.name}, ${money(paying.amountCents)} by ${METHOD_LABELS[
                how
              ].toLowerCase()}. They have been told.`,
            );
          }}
        />
      )}
    </Card>
  );
}

function PayoutLine({ payout }: { payout: Payout }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-slate-900">
        {payout.person.name} <span className="font-normal text-slate-600">- {payout.what}</span>
      </p>
      <p className="text-xs text-slate-600">
        <Badge tone={payout.kind === 'cme' ? 'info' : 'neutral'}>
          {payout.kind === 'cme' ? 'CME' : 'Expense'}
        </Badge>{' '}
        <strong>{money(payout.amountCents)}</strong>
        {payout.approvedAt && <> · approved {formatCalendarDate(payout.approvedAt)}</>} ·{' '}
        <Link to={payout.link} className="text-brand-700 underline">
          open
        </Link>
      </p>
    </div>
  );
}

/// The day, the amount and how it was paid: never through payroll.
export function PaidDialog({
  payout,
  onClose,
  onPaid,
}: {
  payout: Payout;
  onClose: () => void;
  onPaid: (how: ReimbursementMethod) => void;
}) {
  const [paidOn, setPaidOn] = useState(practiceDate());
  const [amount, setAmount] = useState(centsText(payout.amountCents));
  const [how, setHow] = useState<ReimbursementMethod>('PAPER_CHECK');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const paidCents = parseCents(amount);
    if (paidCents === null) return setError('Give the amount, like 42.10.');
    if (!paidOn) return setError('Give the day it was paid.');
    setSaving(true);
    setError(null);
    try {
      await api.payoutPaid(payout.kind, payout.id, {
        paidOn,
        paidCents,
        how,
        note: note.trim() || undefined,
      });
      onPaid(how);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record it.');
      setSaving(false);
    }
  };

  return (
    <Modal title="Paid outside payroll" onClose={onClose} testId="payout-paid">
      <p className="text-sm text-slate-600">
        {payout.person.name} - {payout.what}. They are told once it is recorded.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="How was it paid?">
          {(props) => (
            <select
              {...props}
              className={inputClass}
              value={how}
              onChange={(event) => setHow(event.target.value as ReimbursementMethod)}
            >
              {(Object.keys(METHOD_LABELS) as ReimbursementMethod[]).map((key) => (
                <option key={key} value={key}>
                  {METHOD_LABELS[key]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Day paid">
          {(props) => (
            <input
              {...props}
              type="date"
              className={inputClass}
              max={practiceDate()}
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          )}
        </Field>
        <Field label="Amount paid ($)">
          {(props) => (
            <input
              {...props}
              inputMode="decimal"
              className={inputClass}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
        </Field>
        <Field label="Note (optional)" hint='Like "Check #1042". Never a patient’s name.'>
          {(props) => (
            <input
              {...props}
              className={inputClass}
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={buttonClass('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={saving}>
            {saving ? 'Saving…' : 'Record it'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
