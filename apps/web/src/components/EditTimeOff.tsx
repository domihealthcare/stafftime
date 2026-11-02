import { useEffect, useId, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { plural, useT } from '../lib/i18n';
import { practiceDate } from '../lib/practice-time';
import { PTO_TYPE_LABELS, REQUESTABLE_PTO_TYPES, daysLeft, ptoTypeLabel } from '../lib/time-off';
import type { PtoBalance, PtoRequest, PtoRequestPart, PtoType } from '../lib/types';
import { Modal } from './Modal';
import { buttonClass, inputClass } from './ui';

/**
 * Editing time off (2 November 2026, Dominguez: "I need to be able to edit
 * PTO/SICK - can have notes option for a reason - can say who it is altered
 * by"). For managers and admins, never their own: the kind, the dates, a
 * half day and a note the person reads. Saved with who changed it, and the
 * person is told on the bell and by email (`PATCH /pto/:id`).
 */
export function EditTimeOffDialog({
  request,
  onDone,
}: {
  request: PtoRequest;
  onDone: (saved: boolean) => void;
}) {
  const id = useId();
  const [type, setType] = useState<PtoType>(request.type);
  const [startDate, setStartDate] = useState(request.startDate);
  const [endDate, setEndDate] = useState(request.endDate);
  const [isHalfDay, setIsHalfDay] = useState(request.isHalfDay);
  const [note, setNote] = useState('');
  const [balance, setBalance] = useState<PtoBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = request.employee
    ? `${request.employee.preferredName ?? request.employee.firstName} ${request.employee.lastName}`
    : 'Their';
  const first = request.employee
    ? (request.employee.preferredName ?? request.employee.firstName)
    : 'They';

  // What they have left, so a manager paying a day past it knows.
  useEffect(() => {
    let cancelled = false;
    api
      .ptoBalance(request.employeeId)
      .then((found) => !cancelled && setBalance(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [request.employeeId]);

  const single = startDate === endDate;
  // An older kind (Personal, Bereavement) stays choosable while it is that.
  const kinds: PtoType[] = REQUESTABLE_PTO_TYPES.includes(
    request.type as (typeof REQUESTABLE_PTO_TYPES)[number],
  )
    ? [...REQUESTABLE_PTO_TYPES]
    : [request.type, ...REQUESTABLE_PTO_TYPES];
  const changed =
    type !== request.type ||
    startDate !== request.startDate ||
    endDate !== request.endDate ||
    (single && isHalfDay) !== request.isHalfDay ||
    note.trim() !== '';
  const left =
    balance && type === 'SICK'
      ? { label: 'Sick', allowance: balance.sick }
      : balance && type === 'VACATION'
        ? { label: 'PTO', allowance: balance.vacation }
        : null;

  async function save() {
    if (!startDate || !endDate) {
      setProblem('Give both the first and the last day.');
      return;
    }
    if (endDate < startDate) {
      setProblem('The last day cannot be before the first day.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await api.editPto(request.id, {
        ...(type !== request.type ? { type } : {}),
        ...(startDate !== request.startDate ? { startDate } : {}),
        ...(endDate !== request.endDate ? { endDate } : {}),
        ...((single && isHalfDay) !== request.isHalfDay ? { isHalfDay: single && isHalfDay } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onDone(true);
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'That did not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit ${name}'s time off`} onClose={() => onDone(false)} testId="edit-time-off">
      <div className="space-y-3">
        <div>
          <label htmlFor={`${id}-kind`} className="block text-sm font-medium text-slate-700">
            Kind
          </label>
          <select
            id={`${id}-kind`}
            value={type}
            onChange={(event) => setType(event.target.value as PtoType)}
            className={`mt-1 w-full ${inputClass}`}
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {PTO_TYPE_LABELS[kind]}
              </option>
            ))}
          </select>
          {left && (
            <p className="mt-1 text-xs text-slate-600" data-testid="edit-time-off-left">
              {first} has {daysLeft(left.allowance)} of {left.allowance.available}{' '}
              {left.label === 'Sick' ? 'sick' : 'PTO'} days left. What you set here counts as paid,
              even past that.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-start`} className="block text-sm font-medium text-slate-700">
              First day
            </label>
            <input
              id={`${id}-start`}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={`mt-1 w-full ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor={`${id}-end`} className="block text-sm font-medium text-slate-700">
              Last day
            </label>
            <input
              id={`${id}-end`}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={`mt-1 w-full ${inputClass}`}
            />
          </div>
        </div>
        {single && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isHalfDay}
              onChange={(event) => setIsHalfDay(event.target.checked)}
              className="rounded border-slate-300"
            />
            Half day
          </label>
        )}
        <div>
          <label htmlFor={`${id}-note`} className="block text-sm font-medium text-slate-700">
            Note <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id={`${id}-note`}
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Called out sick, so this is Sick, not PTO"
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-slate-600">
            {first} is told about the change, with your name and this note.
          </p>
        </div>
        {problem && (
          <p role="alert" className="text-sm text-rose-700">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onDone(false)}
            className={buttonClass('secondary', 'sm')}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !changed}
            onClick={() => void save()}
            className={buttonClass('primary', 'sm')}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The parts of a request a card shows under its dates (November 2026): that
 * it is unpaid because it was past the balance, the other part of a request
 * split into paid and unpaid days, what approving one still waiting would
 * split off, and who changed it and why. For the person and for managers.
 */
export function TimeOffDetails({ request }: { request: PtoRequest }) {
  const t = useT();
  const [allChanges, setAllChanges] = useState(false);
  const changes = request.changes ?? [];
  const shownChanges = allChanges ? changes : changes.slice(0, 1);
  // Still unpaid: a part a manager has since made Sick again says nothing.
  const unpaidParts = (request.splitParts ?? []).filter(
    (part) => part.status !== 'CANCELLED' && part.type === 'UNPAID',
  );
  const balanceOf = (type: PtoType | null | undefined) => (type === 'SICK' ? t('sick') : t('PTO'));

  return (
    <>
      {request.unpaidPastBalanceOf && (
        <p
          data-testid="unpaid-past-balance"
          className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          {request.splitFrom
            ? t('Unpaid: past the {balance} balance. The paid part is {range}.', {
                balance: balanceOf(request.unpaidPastBalanceOf),
                range: partRange(request.splitFrom),
              })
            : t('Unpaid: past the {balance} balance.', {
                balance: balanceOf(request.unpaidPastBalanceOf),
              })}
        </p>
      )}
      {unpaidParts.map((part) => (
        <p
          key={part.id}
          data-testid="split-unpaid-part"
          className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          {t('Then {days} unpaid, {range}: past the {balance} balance.', {
            days: plural(part.days, '{n} day', '{n} days'),
            range: partRange(part),
            balance: balanceOf(request.type),
          })}
        </p>
      ))}
      {request.status === 'PENDING' && request.approvalSplit && (
        <p
          data-testid="approval-split"
          className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          {request.approvalSplit.paidDays > 0
            ? t(
                'Past the balance: once approved, {paid} are paid as {kind} and {unpaid} are unpaid, from {date}.',
                {
                  paid: plural(request.approvalSplit.paidDays, '{n} day', '{n} days'),
                  kind: ptoTypeLabel(request.type),
                  unpaid: plural(request.approvalSplit.unpaidDays, '{n} day', '{n} days'),
                  date: formatCalendarDate(request.approvalSplit.unpaidFrom, { year: false }),
                },
              )
            : t('Past the balance: nothing is left, so once approved all of it is unpaid.')}
        </p>
      )}
      {shownChanges.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-600" data-testid="time-off-changes">
          {shownChanges.map((change) => (
            <li key={change.id}>
              <span className="font-medium text-slate-700">
                {t('Changed by {name} on {date}', {
                  name: change.changedBy
                    ? `${change.changedBy.firstName} ${change.changedBy.lastName}`
                    : t('a manager'),
                  date: formatCalendarDate(practiceDate(new Date(change.changedAt)), {
                    year: false,
                  }),
                })}
                :
              </span>{' '}
              {change.summary}
              {change.note && <> &ldquo;{change.note}&rdquo;</>}
            </li>
          ))}
          {changes.length > 1 && (
            <li>
              <button
                type="button"
                onClick={() => setAllChanges((open) => !open)}
                className="font-medium text-brand-700 hover:text-brand-900"
              >
                {allChanges
                  ? t('Show the latest only')
                  : plural(
                      changes.length - 1,
                      'Show {n} earlier change',
                      'Show {n} earlier changes',
                    )}
              </button>
            </li>
          )}
        </ul>
      )}
    </>
  );
}

function partRange(part: Pick<PtoRequestPart, 'startDate' | 'endDate' | 'isHalfDay'>): string {
  const format = (value: string) => formatCalendarDate(value, { year: false });
  if (part.startDate === part.endDate) return format(part.startDate);
  return `${format(part.startDate)} to ${format(part.endDate)}`;
}
