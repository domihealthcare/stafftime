import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useIsManager, useSession } from '../lib/session';
import type { ConflictingShift, Employee, PtoRequest, PtoStatus, PtoType } from '../lib/types';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';

const TYPE_LABELS: Record<PtoType, string> = {
  VACATION: 'Vacation',
  SICK: 'Sick',
  PERSONAL: 'Personal',
  BEREAVEMENT: 'Bereavement',
  UNPAID: 'Unpaid',
  OTHER: 'Other',
};

const STATUS_TONE: Record<PtoStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  DENIED: 'danger',
  CANCELLED: 'neutral',
};

export function TimeOffPage() {
  const { employee } = useSession();
  const isManager = useIsManager();
  const [requests, setRequests] = useState<PtoRequest[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'ALL' | PtoStatus>('PENDING');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestData, staffData] = await Promise.all([
        api.listPto(),
        isManager ? api.listEmployees() : Promise.resolve([]),
      ]);
      setRequests(requestData);
      setStaff(staffData);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load time off.');
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === 'ALL') {
      return requests;
    }
    return requests.filter((request) => request.status === filter);
  }, [requests, filter]);

  const pendingForMe = requests.filter(
    (request) => request.status === 'PENDING' && request.employeeId !== employee?.id,
  ).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading
        title="Time off"
        subtitle={
          isManager
            ? 'Requests from the team, and your own.'
            : 'Your time off requests.'
        }
      />

      {isManager && pendingForMe > 0 && (
        <div className="mb-4">
          <Alert tone="warning">
            {pendingForMe} request{pendingForMe === 1 ? '' : 's'} waiting on a decision.
          </Alert>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {(['PENDING', 'APPROVED', 'DENIED', 'ALL'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => setFilter(choice)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                filter === choice
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {choice === 'ALL' ? 'All' : choice.charAt(0) + choice.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showForm ? 'Cancel' : '+ Request time off'}
        </button>
      </div>

      {showForm && (
        <div className="mb-4">
          <RequestForm
            staff={isManager ? staff : []}
            onCreated={() => {
              setShowForm(false);
              void load();
            }}
          />
        </div>
      )}

      {loading ? (
        <Card className="p-6">
          <Spinner label="Loading requests" />
        </Card>
      ) : visible.length === 0 ? (
        <EmptyState>
          {filter === 'PENDING'
            ? 'Nothing waiting on a decision.'
            : 'No requests to show.'}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {visible.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              isManager={isManager}
              isMine={request.employeeId === employee?.id}
              onChanged={() => void load()}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({
  request,
  isManager,
  isMine,
  onChanged,
  onError,
}: {
  request: PtoRequest;
  isManager: boolean;
  isMine: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState('');
  const [conflicts, setConflicts] = useState<ConflictingShift[] | null>(null);

  // A manager deciding on a request needs to know what is already scheduled.
  useEffect(() => {
    if (!isManager || isMine || request.status !== 'PENDING') {
      return;
    }
    let cancelled = false;
    api
      .ptoConflicts(request.id)
      .then((found) => !cancelled && setConflicts(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isManager, isMine, request.id, request.status]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  // A manager may decide anyone's request but their own.
  const canDecide = isManager && !isMine && request.status === 'PENDING';
  const canCancel =
    (isMine || isManager) && ['PENDING', 'APPROVED'].includes(request.status);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">
              {formatRange(request.startDate, request.endDate, request.isHalfDay)}
            </span>
            <Badge tone={STATUS_TONE[request.status]}>
              {request.status.charAt(0) + request.status.slice(1).toLowerCase()}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {TYPE_LABELS[request.type]} · {request.days} day{request.days === 1 ? '' : 's'}
            {request.employee && !isMine && (
              <> · {request.employee.preferredName ?? request.employee.firstName}{' '}
                {request.employee.lastName}</>
            )}
          </p>
          {request.notes && (
            <p className="mt-2 text-sm text-slate-700">&ldquo;{request.notes}&rdquo;</p>
          )}
          {request.reviewNote && (
            <p className="mt-2 text-sm text-slate-600">
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

        <div className="flex flex-wrap items-center gap-2">
          {canDecide && !denying && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => api.reviewPto(request.id, 'APPROVED'))}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {busy ? '…' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDenying(true)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Deny
              </button>
            </>
          )}
          {canCancel && !denying && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => api.cancelPto(request.id))}
              className="text-sm font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50"
            >
              {isMine ? 'Withdraw' : 'Cancel'}
            </button>
          )}
        </div>
      </div>

      {conflicts && conflicts.length > 0 && request.status === 'PENDING' && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="font-medium">
            {conflicts.length} shift{conflicts.length === 1 ? '' : 's'} already scheduled in
            those dates
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {conflicts.slice(0, 4).map((shift) => (
              <li key={shift.id}>
                {new Date(shift.startsAt).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                ·{' '}
                {new Date(shift.startsAt).toLocaleTimeString(undefined, {
                  hour: 'numeric',
                  minute: '2-digit',
                })}{' '}
                · {shift.location.name}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Approving does not remove them — reassign the cover.</p>
        </div>
      )}

      {denying && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <label
            htmlFor={`reason-${request.id}`}
            className="block text-sm font-medium text-slate-700"
          >
            Reason for denying
          </label>
          <input
            id={`reason-${request.id}`}
            type="text"
            autoFocus
            maxLength={500}
            placeholder="Both MAs are already off that week"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          />
          <p className="mt-1 text-xs text-slate-500">
            Shown to {request.employee?.firstName ?? 'the employee'}.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || reason.trim().length < 1}
              onClick={() => void act(() => api.reviewPto(request.id, 'DENIED', reason.trim()))}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Deny request'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDenying(false);
                setReason('');
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function RequestForm({
  staff,
  onCreated,
}: {
  staff: Employee[];
  onCreated: () => void;
}) {
  const [type, setType] = useState<PtoType>('VACATION');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [notes, setNotes] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // One date is the common case; the end mirrors the start until changed.
  const effectiveEnd = endDate || startDate;
  const singleDay = Boolean(startDate) && effectiveEnd === startDate;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api.createPto({
        type,
        startDate,
        endDate: effectiveEnd,
        isHalfDay: singleDay ? isHalfDay : false,
        notes: notes.trim() || undefined,
        employeeId: employeeId || undefined,
      });
      onCreated();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not send that request.');
    } finally {
      setBusy(false);
    }
  }

  const field =
    'mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600';

  return (
    <Card className="p-5">
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {staff.length > 0 && (
          <div>
            <label htmlFor="pto-employee" className="block text-sm font-medium text-slate-700">
              For
            </label>
            <select
              id="pto-employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className={field}
            >
              <option value="">Myself</option>
              {staff
                .filter((person) => person.employmentStatus === 'ACTIVE')
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.firstName} {person.lastName}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              File on someone&rsquo;s behalf when they phone in rather than using the app.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="pto-type" className="block text-sm font-medium text-slate-700">
            Type
          </label>
          <select
            id="pto-type"
            value={type}
            onChange={(event) => setType(event.target.value as PtoType)}
            className={field}
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pto-start" className="block text-sm font-medium text-slate-700">
              First day
            </label>
            <input
              id="pto-start"
              type="date"
              required
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                if (endDate && event.target.value > endDate) {
                  setEndDate('');
                }
              }}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="pto-end" className="block text-sm font-medium text-slate-700">
              Last day
            </label>
            <input
              id="pto-end"
              type="date"
              min={startDate || undefined}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={field}
            />
            <p className="mt-1 text-xs text-slate-500">
              Leave empty for a single day.
            </p>
          </div>
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

        <div>
          <label htmlFor="pto-notes" className="block text-sm font-medium text-slate-700">
            Notes <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id="pto-notes"
            type="text"
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={field}
          />
        </div>

        {problem && <Alert>{problem}</Alert>}

        <button
          type="submit"
          disabled={busy || !startDate}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto sm:px-6"
        >
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </Card>
  );
}

/// "Tue 3 Nov", or "3–7 Nov" for a range. Dates are plain calendar days, so
/// they are parsed as UTC to stop a timezone shifting them a day.
function formatRange(start: string, end: string, isHalfDay: boolean): string {
  const format = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

  if (start === end) {
    return isHalfDay ? `${format(start)} (half day)` : format(start);
  }
  return `${format(start)} – ${format(end)}`;
}
