import { useState } from 'react';
import { formatCalendarDate, localDate } from '../lib/format';
import { ApiError, api } from '../lib/api';
import { PTO_TYPE_LABELS, REQUESTABLE_PTO_TYPES } from '../lib/time-off';
import type { PtoBalance, PtoRequest, PtoStatus } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { PtoBalanceCard } from './PtoBalanceCard';
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
 * Time off on a staff profile: this year's balance, everything on file, and —
 * for an admin — writing down time off already taken (October 2026,
 * Dominguez): the back-log from before Domi Staff, or a sick day nobody asked
 * for in the app. A recorded day is approved from the start and comes off the
 * balance like any other.
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
  const confirm = useConfirm();
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const newestFirst = [...requests].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const totalsBefore = balance ? balance.vacation.usedBefore + balance.sick.usedBefore : 0;

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
    <Card className="p-4" testId="staff-time-off">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Time off</h2>
        {!recording && !isMe && (
          <button
            type="button"
            onClick={() => setRecording(true)}
            className={buttonClass('secondary', 'sm')}
          >
            + Record time off already taken
          </button>
        )}
      </div>

      {balance && (
        <div className="mt-3">
          <PtoBalanceCard balance={balance} title="This year’s balance" />
        </div>
      )}

      {problem && (
        <div className="mt-3">
          <Alert>{problem}</Alert>
        </div>
      )}

      {recording && (
        <div className="mt-4">
          <RecordForm
            employeeId={employeeId}
            totalsBefore={totalsBefore}
            onCancel={() => setRecording(false)}
            onRecorded={() => {
              setRecording(false);
              onChanged();
            }}
          />
        </div>
      )}

      {newestFirst.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">No time off on file.</p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Time off on file">
          {newestFirst.map((request) => (
            <li
              key={request.id}
              className={`rounded-lg border border-slate-200 p-3 ${
                request.status === 'DENIED' || request.status === 'CANCELLED' ? 'opacity-70' : ''
              }`}
              data-testid="staff-time-off-entry"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-900">{range(request)}</span>
                    <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
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
                  {request.notes && (
                    <p className="mt-1 text-sm text-slate-700">&ldquo;{request.notes}&rdquo;</p>
                  )}
                  {request.reviewNote && (
                    <p className="mt-1 text-sm text-slate-600">
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
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
