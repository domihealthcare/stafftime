import { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { UnpaidReimbursements, methodWords } from '../components/Payouts';
import {
  Alert,
  Badge,
  Card,
  Field,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { centsText, money, parseCents } from '../lib/cme';
import { formatCalendarDate } from '../lib/format';
import { practiceDate } from '../lib/practice-time';
import { useSession } from '../lib/session';
import type {
  ExpenseApprover,
  ExpenseKind,
  ExpenseMine,
  ExpenseRequest,
  PersonName,
} from '../lib/types';

const KIND_LABELS: Record<ExpenseKind, string> = {
  SUPPLIES: 'Supplies',
  MILEAGE: 'Mileage',
  TRAINING: 'Training or courses',
  MEALS: 'Meals',
  TRAVEL: 'Travel',
  OTHER: 'Other',
};

const STATUS = {
  PENDING: { label: 'Waiting for a decision', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  DECLINED: { label: 'Not approved', tone: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
} as const;

const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

/**
 * Expense reimbursements (November 2026, Dominguez): anybody asks to be paid
 * back for their own money spent for the practice; what kind it was is
 * optional; the receipt is emailed to the approvers (he and Angelica
 * Dominguez to start, a list kept here by the people on it), who approve once
 * it arrives or decline with a reason. Never part of payroll: once approved it
 * is on the payroll prompt (here and on the Export screen) until somebody
 * records how it was paid or puts it off.
 */
export function ExpensesPage() {
  const { employee } = useSession();
  const isApprover = employee?.canApproveExpenses === true;
  const [mine, setMine] = useState<ExpenseMine | null>(null);
  const [everyone, setEveryone] = useState<ExpenseRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [managingList, setManagingList] = useState(false);
  const [deciding, setDeciding] = useState<{ request: ExpenseRequest; approve: boolean } | null>(
    null,
  );
  const confirm = useConfirm();
  // Bumped to make the payroll prompt read again after a decision here.
  const [payoutsKey, setPayoutsKey] = useState(0);

  const load = useCallback(() => {
    api
      .myExpenses()
      .then(setMine)
      .catch((err) => setError(errorText(err, 'Could not load your expenses.')));
    if (isApprover) {
      api
        .allExpenses()
        .then((all) => setEveryone(all.requests))
        .catch((err) => setError(errorText(err, 'Could not load the expenses.')));
    }
  }, [isApprover]);
  useEffect(load, [load]);

  const done = (message: string) => {
    setNotice(message);
    setPayoutsKey((key) => key + 1);
    load();
  };

  const withdraw = async (request: ExpenseRequest) => {
    const ok = await confirm({
      title: 'Withdraw this request?',
      body: `${request.description}, ${money(request.amountCents)}. It will be withdrawn from review.`,
      confirmLabel: 'Yes, withdraw',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.withdrawExpense(request.id);
      done('Withdrawn.');
    } catch (err) {
      setError(errorText(err, 'Could not withdraw it.'));
    }
  };

  if (!mine || (isApprover && !everyone)) {
    return (
      <div className="max-w-4xl">
        <PageHeading title="Expense reimbursements" />
        {error ? <Alert>{error}</Alert> : <Spinner />}
      </div>
    );
  }

  const waiting = (everyone ?? []).filter((request) => request.status === 'PENDING');
  const decided = (everyone ?? []).filter((request) => request.status !== 'PENDING');

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeading
        title="Expense reimbursements"
        subtitle="Submit business expenses you paid for personally. Approved reimbursements are paid separately from payroll."
      />
      {error && <Alert>{error}</Alert>}
      {notice && (
        <Alert tone="success">
          <span role="status">{notice}</span>
        </Alert>
      )}

      {isApprover && (
        <section className="space-y-4" aria-labelledby="to-decide">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="to-decide" className="text-lg font-semibold text-slate-900">
              Awaiting decision{waiting.length > 0 ? ` (${waiting.length})` : ''}
            </h2>
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              onClick={() => setManagingList(true)}
            >
              Manage approvers
            </button>
          </div>
          {waiting.length === 0 ? (
            <p className="text-sm text-slate-600">No requests are awaiting a decision.</p>
          ) : (
            <div className="space-y-3">
              {waiting.map((request) => (
                <Card key={request.id} className="p-4" testId="expense-to-decide">
                  <RequestDetails request={request} showPerson />
                  {request.employeeId === employee?.id ? (
                    <p className="mt-3 text-xs text-slate-600">
                      Your own request: another approver decides it.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass('primary', 'sm')}
                        onClick={() => setDeciding({ request, approve: true })}
                      >
                        Approve…
                      </button>
                      <button
                        type="button"
                        className={buttonClass('secondary', 'sm')}
                        onClick={() => setDeciding({ request, approve: false })}
                      >
                        Decline…
                      </button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
          <UnpaidReimbursements key={payoutsKey} onChanged={load} />
        </section>
      )}

      <section className="space-y-3" aria-labelledby="your-expenses">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="your-expenses" className="text-lg font-semibold text-slate-900">
            Your requests
          </h2>
          <button
            type="button"
            className={buttonClass('primary')}
            onClick={() => {
              setNotice(null);
              setAsking(true);
            }}
          >
            + New reimbursement request
          </button>
        </div>
        {mine.requests.length === 0 ? (
          <p className="text-sm text-slate-600">
            You have not submitted any reimbursement requests.
          </p>
        ) : (
          mine.requests.map((request) => (
            <Card key={request.id} className="p-4" testId="my-expense">
              <RequestDetails request={request} />
              {request.status === 'PENDING' && (
                <button
                  type="button"
                  className="tap mt-2 text-sm font-medium text-rose-700 underline"
                  onClick={() => void withdraw(request)}
                >
                  Withdraw
                </button>
              )}
            </Card>
          ))
        )}
      </section>

      {isApprover && decided.length > 0 && (
        <details className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            Completed ({decided.length})
          </summary>
          <div className="mt-3 divide-y divide-slate-100">
            {decided.map((request) => (
              <div key={request.id} className="py-3">
                <RequestDetails request={request} showPerson />
              </div>
            ))}
          </div>
        </details>
      )}

      {asking && (
        <AskDialog
          approvers={mine.approvers}
          onClose={() => setAsking(false)}
          onSent={() => {
            setAsking(false);
            done('Request submitted. The approvers have been notified.');
          }}
        />
      )}
      {deciding && (
        <DecideDialog
          request={deciding.request}
          approve={deciding.approve}
          onClose={() => setDeciding(null)}
          onDone={(message) => {
            setDeciding(null);
            done(message);
          }}
        />
      )}
      {managingList && <ApproversDialog onClose={() => setManagingList(false)} />}
    </div>
  );
}

function RequestDetails({
  request,
  showPerson = false,
}: {
  request: ExpenseRequest;
  showPerson?: boolean;
}) {
  const status = STATUS[request.status];
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {showPerson && <>{request.person.name} - </>}
            {request.description}
          </p>
          <p className="text-sm text-slate-600">
            {money(request.amountCents)} · paid {formatCalendarDate(request.spentOn)}
            {request.kind && <> · {KIND_LABELS[request.kind]}</>}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {request.note && <p className="mt-1 text-sm text-slate-700">“{request.note}”</p>}
      {request.status === 'APPROVED' && (
        <p className="mt-1 text-sm text-slate-700">
          {request.approvedCents !== null && request.approvedCents !== request.amountCents
            ? `${money(request.approvedCents)} approved`
            : 'Approved'}
          {request.decidedBy && <> by {request.decidedBy.name}</>}
          {request.paidOn ? (
            <>
              . Reimbursed {money(request.paidCents ?? 0)} on {formatCalendarDate(request.paidOn)}
              {request.paidHow && <> by {methodWords(request.paidHow)}</>}
              {request.paidNote && <> ({request.paidNote})</>}.
            </>
          ) : (
            <>. Payment pending.</>
          )}
        </p>
      )}
      {request.decisionNote && request.status !== 'PENDING' && (
        <p className="mt-1 text-sm text-slate-700">
          {request.status === 'DECLINED' && request.decidedBy && <>{request.decidedBy.name}: </>}“
          {request.decisionNote}”
        </p>
      )}
    </div>
  );
}

/// A new reimbursement request. The receipt goes by email, never here.
function AskDialog({
  approvers,
  onClose,
  onSent,
}: {
  approvers: ExpenseApprover[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<ExpenseKind | ''>('');
  const [spentOn, setSpentOn] = useState(practiceDate());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [receiptEmailed, setReceiptEmailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cents = parseCents(amount);
  const emails = approvers.map((person) => person.email);
  const subject = `Receipt: ${description.trim() || 'expense'}${
    cents ? `, ${money(cents)}` : ''
  }${spentOn ? `, ${formatCalendarDate(spentOn)}` : ''}`;
  const mailto = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}`;

  const send = async () => {
    if (description.trim().length < 3) return setError('Enter a description.');
    if (!cents) return setError('Enter the amount, for example 42.10.');
    if (!spentOn) return setError('Give the day you paid.');
    if (!receiptEmailed)
      return setError('Email the receipt to the approvers, then confirm it below.');
    setSaving(true);
    setError(null);
    try {
      await api.askForExpense({
        description: description.trim(),
        kind: kind || null,
        spentOn,
        amountCents: cents,
        note: note.trim() || undefined,
        receiptEmailed,
      });
      onSent();
    } catch (err) {
      setError(errorText(err, 'Could not send it.'));
      setSaving(false);
    }
  };

  return (
    <Modal title="New reimbursement request" onClose={onClose} testId="expense-ask" wide>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Field label="Description" hint="Never a patient's name.">
          {(props) => (
            <input
              {...props}
              className={inputClass}
              maxLength={300}
              placeholder="Printer ink for the front desk"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Amount ($)">
            {(props) => (
              <input
                {...props}
                inputMode="decimal"
                className={inputClass}
                placeholder="42.10"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            )}
          </Field>
          <Field label="Date of purchase">
            {(props) => (
              <input
                {...props}
                type="date"
                className={inputClass}
                max={practiceDate()}
                value={spentOn}
                onChange={(event) => setSpentOn(event.target.value)}
              />
            )}
          </Field>
          <Field label="Category (optional)">
            {(props) => (
              <select
                {...props}
                className={inputClass}
                value={kind}
                onChange={(event) => setKind(event.target.value as ExpenseKind | '')}
              >
                <option value="">Not specified</option>
                {(Object.keys(KIND_LABELS) as ExpenseKind[]).map((key) => (
                  <option key={key} value={key}>
                    {KIND_LABELS[key]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Notes (optional)">
          {(props) => (
            <textarea
              {...props}
              rows={2}
              className={inputClass}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>

        <div className="rounded-lg bg-amber-50 p-3 text-sm text-slate-800 ring-1 ring-amber-200">
          <p className="font-semibold">Receipt required</p>
          {approvers.length === 0 ? (
            <p className="mt-1">
              No approvers have been set up yet. Please ask a manager where to send the receipt.
            </p>
          ) : (
            <>
              <p className="mt-1">
                Email a photo or PDF of the receipt to{' '}
                {approvers.map((person, index) => (
                  <span key={person.id}>
                    {index > 0 && (index === approvers.length - 1 ? ' and ' : ', ')}
                    {person.name} ({person.email})
                  </span>
                ))}
                . Receipts are not uploaded to Domi Staff.
              </p>
              <a
                href={mailto}
                className={`${buttonClass('secondary', 'sm')} mt-2 inline-flex`}
                data-testid="email-receipt"
              >
                Email the receipt
              </a>
            </>
          )}
          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={receiptEmailed}
              onChange={(event) => setReceiptEmailed(event.target.checked)}
            />
            <span>I have emailed the receipt to the approvers.</span>
          </label>
        </div>

        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={buttonClass('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={saving}>
            {saving ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DecideDialog({
  request,
  approve,
  onClose,
  onDone,
}: {
  request: ExpenseRequest;
  approve: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [amount, setAmount] = useState(centsText(request.amountCents));
  const [note, setNote] = useState('');
  const [receiptReceived, setReceiptReceived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    if (approve) {
      const approvedCents = parseCents(amount);
      if (approvedCents === null) return setError('Enter the amount, for example 42.10.');
      if (!receiptReceived) return setError('Confirm that the receipt was received.');
      setSaving(true);
      try {
        await api.approveExpense(request.id, {
          approvedCents,
          note: note.trim() || undefined,
          receiptReceived,
        });
        onDone(
          `Approved. ${request.person.name} has been notified; the reimbursement is now pending payment.`,
        );
      } catch (err) {
        setError(errorText(err, 'Could not approve it.'));
        setSaving(false);
      }
    } else {
      if (note.trim().length < 3) return setError('Enter a reason for the employee.');
      setSaving(true);
      try {
        await api.declineExpense(request.id, note.trim());
        onDone(`Declined. ${request.person.name} has been notified with the reason.`);
      } catch (err) {
        setError(errorText(err, 'Could not decline it.'));
        setSaving(false);
      }
    }
  };

  return (
    <Modal
      title={approve ? 'Approve reimbursement request' : 'Decline reimbursement request'}
      onClose={onClose}
      testId="expense-decide"
    >
      <p className="text-sm text-slate-700">
        {request.person.name} - {request.description}, {money(request.amountCents)}.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {approve && (
          <Field label="Amount approved ($)">
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
        )}
        <Field label={approve ? 'Note to the employee (optional)' : 'Reason for declining'}>
          {(props) => (
            <textarea
              {...props}
              rows={2}
              className={inputClass}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
        {approve && (
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={receiptReceived}
              onChange={(event) => setReceiptReceived(event.target.checked)}
            />
            <span>The receipt was received by email.</span>
          </label>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={buttonClass('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={saving}>
            {saving ? 'Saving…' : approve ? 'Approve' : 'Decline'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/// Who approves: kept by the people on the list, like the invoices list.
function ApproversDialog({ onClose }: { onClose: () => void }) {
  const me = useSession().employee?.id;
  const [list, setList] = useState<{ holders: PersonName[]; others: PersonName[] } | null>(null);
  const [chosen, setChosen] = useState('');
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    api
      .expenseApprovers()
      .then(setList)
      .catch((err) => setError(errorText(err, 'Could not load the list.')));
  }, []);

  const nameOf = (person: PersonName) =>
    `${person.preferredName ?? person.firstName} ${person.lastName}`;

  const add = async () => {
    if (!chosen) return;
    try {
      setList(await api.addExpenseApprover(chosen));
      setChosen('');
    } catch (err) {
      setError(errorText(err, 'Could not add them.'));
    }
  };

  const remove = async (person: PersonName) => {
    const ok = await confirm({
      title: `Take ${nameOf(person)} off the list?`,
      body: 'They will no longer see or decide expense requests.',
      confirmLabel: 'Yes, take them off',
      cancelLabel: 'Keep them',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setList(await api.removeExpenseApprover(person.id));
    } catch (err) {
      setError(errorText(err, 'Could not take them off.'));
    }
  };

  return (
    <Modal title="Expense approvers" onClose={onClose} testId="expense-approvers">
      <p className="text-sm text-slate-600">
        They see everybody's requests, approve or decline them, and receive the receipts by email.
        Only the people on this list can change it, and nobody takes themselves off.
      </p>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {!list ? (
        <Spinner />
      ) : (
        <>
          <ul className="mt-3 divide-y divide-slate-100">
            {list.holders.map((person) => (
              <li key={person.id} className="flex items-center justify-between py-2 text-sm">
                <span>{nameOf(person)}</span>
                {person.id !== me && (
                  <button
                    type="button"
                    className="tap text-rose-700 underline"
                    onClick={() => void remove(person)}
                  >
                    Take off
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <select
              aria-label="Add somebody"
              className={inputClass}
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
            >
              <option value="">Add somebody…</option>
              {list.others.map((person) => (
                <option key={person.id} value={person.id}>
                  {nameOf(person)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={buttonClass('primary', 'sm')}
              disabled={!chosen}
              onClick={() => void add()}
            >
              Add
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
