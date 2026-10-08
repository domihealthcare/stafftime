import { useEffect, useState } from 'react';
import { formatCalendarDate, localDate } from '../lib/format';
import { ApiError, api } from '../lib/api';
import { PTO_TYPE_LABELS, REQUESTABLE_PTO_TYPES, hasNone } from '../lib/time-off';
import type {
  AllowanceBalance,
  PtoBalance,
  PtoPolicy,
  PtoRequest,
  PtoStatus,
  StaffBalance,
} from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Modal } from './Modal';
import { AdjustForm } from './StaffPtoBalances';
import { Alert, Badge, Card, Field, buttonClass, inputClass } from './ui';

const STATUS_TONE: Record<PtoStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  DENIED: 'danger',
  CANCELLED: 'neutral',
};

const STATUS_LABEL: Record<PtoStatus, string> = {
  APPROVED: 'Approved',
  PENDING: 'Waiting',
  DENIED: 'Denied',
  CANCELLED: 'Cancelled',
};

function range(request: PtoRequest): string {
  const from = formatCalendarDate(request.startDate);
  if (request.startDate === request.endDate) {
    return request.isHalfDay ? `${from} (half day)` : from;
  }
  return `${from} – ${formatCalendarDate(request.endDate)}`;
}

/**
 * Time off on a staff profile: a compact summary — what is left, what is
 * coming up, what is waiting — with everything else a tap away (October 2026,
 * Dominguez: "condense the time off list on their profile … maybe just a pop
 * up to further dive into it"):
 *
 * - **See all** — every request on file, in a pop-up; recorded ones can be
 *   removed there.
 * - **Record past time off** — writing down time off already taken (October
 *   2026): the back-log from before Domi Staff, or a sick day nobody asked
 *   for in the app. Approved from the start, it comes off the balance.
 * - **Adjust** — the same form as Time off → Staff balances (the days taken
 *   before Domi Staff, rollover, their own yearly amount or none), so it can
 *   be done from where the person is.
 */
export function StaffTimeOffCard({
  employeeId,
  firstName,
  isMe,
  balance,
  requests,
  onChanged,
}: {
  employeeId: string;
  firstName: string;
  isMe: boolean;
  balance: PtoBalance | null;
  requests: PtoRequest[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<'all' | 'record' | 'adjust' | null>(null);
  const today = localDate(new Date());
  const live = requests.filter((r) => r.status === 'APPROVED' || r.status === 'PENDING');
  const waiting = live.filter((r) => r.status === 'PENDING').length;
  const next = live
    .filter((r) => r.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const totalsBefore = balance ? balance.vacation.usedBefore + balance.sick.usedBefore : 0;

  return (
    <Card className="p-4" testId="staff-time-off">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Time off</h2>
        {!isMe && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOpen('adjust')}
              className={buttonClass('secondary', 'sm')}
            >
              Adjust balance
            </button>
            <button
              type="button"
              onClick={() => setOpen('record')}
              className={buttonClass('secondary', 'sm')}
            >
              + Record past time off
            </button>
          </div>
        )}
      </div>

      {balance && (
        <p className="mt-2 text-sm text-slate-700" data-testid="staff-time-off-balance">
          <AllowanceLine label="PTO" allowance={balance.vacation} />
          <span className="text-slate-400"> · </span>
          <AllowanceLine label="Sick" allowance={balance.sick} />
          <span className="text-xs text-slate-500"> — {balance.policyYear} policy year</span>
        </p>
      )}

      <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
        {next && (
          <li>
            <span className="text-slate-500">Next:</span> {range(next)} ·{' '}
            {PTO_TYPE_LABELS[next.type]}
            {next.status === 'PENDING' && ' (waiting on a decision)'}
          </li>
        )}
        {waiting > 0 && !(waiting === 1 && next?.status === 'PENDING') && (
          <li>
            {waiting} request{waiting === 1 ? '' : 's'} waiting on a decision
          </li>
        )}
      </ul>

      {requests.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No time off on file.</p>
      ) : (
        <button
          type="button"
          onClick={() => setOpen('all')}
          className="tap mt-2 text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          See all {requests.length} on file →
        </button>
      )}

      {open === 'all' && (
        <Modal
          title={`${firstName}’s time off`}
          wide
          testId="staff-time-off-all"
          onClose={() => setOpen(null)}
        >
          <TimeOffList firstName={firstName} requests={requests} onChanged={onChanged} />
        </Modal>
      )}
      {open === 'record' && (
        <Modal title="Record time off already taken" wide onClose={() => setOpen(null)}>
          <RecordForm
            employeeId={employeeId}
            totalsBefore={totalsBefore}
            onCancel={() => setOpen(null)}
            onRecorded={() => {
              setOpen(null);
              onChanged();
            }}
          />
        </Modal>
      )}
      {open === 'adjust' && (
        <Modal title={`Adjust ${firstName}’s time off`} wide onClose={() => setOpen(null)}>
          <AdjustBalance
            employeeId={employeeId}
            onDone={() => {
              setOpen(null);
              onChanged();
            }}
            onCancel={() => setOpen(null)}
          />
        </Modal>
      )}
    </Card>
  );
}

/// "PTO 12 of 15 left", or "No PTO".
function AllowanceLine({ label, allowance }: { label: string; allowance: AllowanceBalance }) {
  if (hasNone(allowance)) return <span>No {label}</span>;
  return (
    <span>
      {label}{' '}
      <strong className={allowance.remaining < 0 ? 'text-rose-700' : 'text-slate-900'}>
        {allowance.remaining}
      </strong>{' '}
      of {allowance.available} left
      {allowance.pending > 0 && (
        <span className="text-xs text-slate-500"> ({allowance.pending} asked for)</span>
      )}
    </span>
  );
}

/// Loads their row of Staff balances and the policy, then the same Adjust form.
function AdjustBalance({
  employeeId,
  onDone,
  onCancel,
}: {
  employeeId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [row, setRow] = useState<StaffBalance | null>(null);
  const [policy, setPolicy] = useState<PtoPolicy | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.staffPtoBalance(employeeId), api.ptoPolicy()])
      .then(([found, terms]) => {
        if (cancelled) return;
        setRow(found);
        setPolicy(terms);
      })
      .catch((err) => setProblem(err instanceof ApiError ? err.message : 'Could not load that.'));
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  if (problem) return <Alert>{problem}</Alert>;
  if (!row || !policy) return <p className="text-sm text-slate-600">Loading…</p>;
  return <AdjustForm row={row} policy={policy} onSaved={onDone} onCancel={onCancel} />;
}

/// Everything on file, newest first; recorded time off can be removed.
function TimeOffList({
  firstName,
  requests,
  onChanged,
}: {
  firstName: string;
  requests: PtoRequest[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [problem, setProblem] = useState<string | null>(null);
  const newestFirst = [...requests].sort((a, b) => b.startDate.localeCompare(a.startDate));

  async function remove(request: PtoRequest) {
    const sure = await confirm({
      title: 'Remove this recorded time off?',
      body: `${PTO_TYPE_LABELS[request.type]}, ${range(request)}. It comes off ${firstName}’s record and the ${request.days === 1 ? 'day goes' : 'days go'} back on their balance.`,
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    try {
      await api.removeRecordedPto(request.id);
      setProblem(null);
      onChanged();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not remove that.');
    }
  }

  return (
    <>
      {problem && (
        <div className="mb-3">
          <Alert>{problem}</Alert>
        </div>
      )}
      <ul className="divide-y divide-slate-100" aria-label="Time off on file">
        {newestFirst.map((request) => (
          <li
            key={request.id}
            className={`flex flex-wrap items-start justify-between gap-2 py-2 ${
              request.status === 'DENIED' || request.status === 'CANCELLED' ? 'opacity-70' : ''
            }`}
            data-testid="staff-time-off-entry"
          >
            <div className="min-w-0 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{range(request)}</span>
                <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
              </p>
              <p className="text-slate-600">
                {PTO_TYPE_LABELS[request.type]} · {request.days} day
                {request.days === 1 ? '' : 's'}
                {request.recordedBy && (
                  <>
                    {' '}
                    · recorded after the fact by {request.recordedBy.firstName}{' '}
                    {request.recordedBy.lastName}
                  </>
                )}
              </p>
              {request.notes && <p className="text-slate-700">&ldquo;{request.notes}&rdquo;</p>}
              {request.reviewNote && (
                <p className="text-slate-600">
                  <span className="font-medium">
                    {request.reviewedBy
                      ? `${request.reviewedBy.firstName} ${request.reviewedBy.lastName}`
                      : 'Manager'}
                    :
                  </span>{' '}
                  {request.reviewNote}
                </p>
              )}
            </div>
            {request.recordedBy && (
              <button
                type="button"
                onClick={() => void remove(request)}
                className={buttonClass('secondary', 'sm')}
                aria-label={`Remove the time off recorded for ${range(request)}`}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function RecordForm({
  employeeId,
  totalsBefore,
  onCancel,
  onRecorded,
}: {
  employeeId: string;
  /// Days already entered as a total under Staff balances → Adjust.
  totalsBefore: number;
  onCancel: () => void;
  onRecorded: () => void;
}) {
  const today = localDate(new Date());
  const [type, setType] = useState<(typeof REQUESTABLE_PTO_TYPES)[number]>('SICK');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const singleDay = startDate === endDate;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api.recordPto({
        employeeId,
        type,
        startDate,
        endDate,
        isHalfDay: singleDay && isHalfDay,
        comment: comment.trim() || undefined,
      });
      onRecorded();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not record that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-3"
      aria-label="Record time off already taken"
    >
      <p className="text-sm text-slate-700">
        For days already taken — before Domi Staff, or a day nobody asked for in the app. It is
        recorded as approved and comes off their balance. Nobody is notified.
      </p>
      {totalsBefore > 0 && (
        <Alert tone="warning">
          {totalsBefore} day{totalsBefore === 1 ? ' is' : 's are'} already entered as a total under
          Time off → Staff balances → Adjust (“taken before Domi Staff”). Recording the same days
          here as well counts them twice — take them out of that total if you list them here.
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Kind">
          {(props) => (
            <select
              {...props}
              value={type}
              onChange={(event) => setType(event.target.value as typeof type)}
              className={inputClass}
            >
              {REQUESTABLE_PTO_TYPES.map((value) => (
                <option key={value} value={value}>
                  {PTO_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="First day">
          {(props) => (
            <input
              {...props}
              type="date"
              required
              max={today}
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                if (event.target.value > endDate) setEndDate(event.target.value);
              }}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Last day">
          {(props) => (
            <input
              {...props}
              type="date"
              required
              min={startDate}
              max={today}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
      </div>
      {singleDay && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isHalfDay}
            onChange={(event) => setIsHalfDay(event.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          Half day
        </label>
      )}
      <Field label="Comment (optional)" hint="They can see this on their own Time off screen.">
        {(props) => (
          <input
            {...props}
            type="text"
            maxLength={500}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      {problem && <Alert>{problem}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
          {busy ? 'Recording…' : 'Record it'}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
          Cancel
        </button>
      </div>
    </form>
  );
}
