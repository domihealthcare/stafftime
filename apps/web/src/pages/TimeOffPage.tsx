import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { ClashNote } from '../components/TimeOffClashes';
import { formatCalendarDate, formatClock } from '../lib/format';
import { useIsAdmin, useIsManager, useSession } from '../lib/session';
import type {
  ConflictingShift,
  Employee,
  PtoBalance,
  PtoPolicy,
  PtoRequest,
  PtoStatus,
  PtoType,
  Shift,
} from '../lib/types';
import { PTO_TYPE_LABELS, REQUESTABLE_PTO_TYPES, hasNone, ptoTypeLabel } from '../lib/time-off';
import { locale, plural, t as tNow, useT } from '../lib/i18n';
import { PtoBalanceCard } from '../components/PtoBalanceCard';
import { PtoPolicyEditor } from '../components/PtoPolicyEditor';
import { useConfirm } from '../components/ConfirmDialog';
import { atPracticeTime, practiceClockOf } from '../lib/practice-time';
import { useApproveTimeOff } from '../components/ApproveTimeOff';
import { useDeclineTimeOff } from '../components/DeclineTimeOff';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeading,
  Spinner,
  buttonClass,
} from '../components/ui';

const TYPE_LABELS: Record<PtoType, string> = PTO_TYPE_LABELS;

const STATUS_TONE: Record<PtoStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  DENIED: 'danger',
  CANCELLED: 'neutral',
};

export function TimeOffPage() {
  const t = useT();
  const { employee } = useSession();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const [requests, setRequests] = useState<PtoRequest[]>([]);
  const [balance, setBalance] = useState<PtoBalance | null>(null);
  const [policy, setPolicy] = useState<PtoPolicy | null>(null);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "+ Request time off" on the Schedule and Home lands here with the form open.
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(() => searchParams.get('request') === '1');
  const [filter, setFilter] = useState<'ALL' | PtoStatus>('PENDING');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestData, staffData, balanceData, policyData] = await Promise.all([
        api.listPto(),
        isManager ? api.listEmployees() : Promise.resolve([]),
        api.ptoBalance(),
        api.ptoPolicy(),
      ]);
      setRequests(requestData);
      setStaff(staffData);
      setBalance(balanceData);
      setPolicy(policyData);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tNow('Could not load time off.'));
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

  const summary = (
    <>
      {balance && (
        <div className="mb-4">
          <PtoBalanceCard balance={balance} />
        </div>
      )}

      {policy && (
        <div className="mb-4">
          <PtoPolicyEditor
            policy={policy}
            canEdit={isAdmin}
            onSaved={(updated) => {
              setPolicy(updated);
              // Balances are derived from the policy, so reload them.
              void load();
            }}
          />
        </div>
      )}
    </>
  );

  return (
    <div className="max-w-3xl">
      <PageHeading
        title={isManager ? 'Time off requests' : t('Time off')}
        subtitle={isManager ? 'Everybody’s requests, and your own.' : t('Your time off requests.')}
      />

      {!isManager && summary}

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
              {t(choice === 'ALL' ? 'All' : choice.charAt(0) + choice.slice(1).toLowerCase())}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          className={buttonClass('primary', 'md')}
        >
          {showForm ? t('Cancel') : t('+ Request time off')}
        </button>
      </div>

      {showForm && (
        <div className="mb-4">
          <RequestForm
            staff={isManager ? staff : []}
            balance={balance}
            forId={isManager ? (searchParams.get('for') ?? '') : ''}
            startOn={searchParams.get('date') ?? ''}
            onCreated={() => {
              setShowForm(false);
              void load();
            }}
          />
        </div>
      )}

      {loading ? (
        <Card className="p-6">
          <Spinner label={t('Loading requests')} />
        </Card>
      ) : visible.length === 0 ? (
        <EmptyState>
          {filter === 'PENDING' ? t('Nothing waiting on a decision.') : t('No requests to show.')}
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

      {/* Everybody's balances moved to the Dashboard and the rules to Practice
          settings (October 2026, Dominguez); a manager's own balance stays. */}
      {isManager && (
        <div className="mt-8">
          {balance && <PtoBalanceCard balance={balance} />}
          <p className="mt-3 text-sm text-slate-600" data-testid="time-off-moved">
            Everybody&rsquo;s balances, with Adjust, are on the{' '}
            <Link to="/dashboard" className="font-medium text-brand-700 hover:text-brand-900">
              Dashboard
            </Link>
            ; the time off rules are in{' '}
            <Link to="/settings" className="font-medium text-brand-700 hover:text-brand-900">
              Practice settings
            </Link>
            .
          </p>
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
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictingShift[] | null>(null);
  const confirm = useConfirm();
  const approveTimeOff = useApproveTimeOff();
  const declineTimeOff = useDeclineTimeOff();

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
      onError(err instanceof ApiError ? err.message : tNow('That did not work.'));
    } finally {
      setBusy(false);
    }
  }

  // A manager may decide anyone's request but their own.
  const canDecide = isManager && !isMine && request.status === 'PENDING';
  const canCancel = (isMine || isManager) && ['PENDING', 'APPROVED'].includes(request.status);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">
              {formatRange(request.startDate, request.endDate, request.isHalfDay)}
            </span>
            <Badge tone={STATUS_TONE[request.status]}>
              {t(request.status.charAt(0) + request.status.slice(1).toLowerCase())}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {ptoTypeLabel(request.type)} · {plural(request.days, '{n} day', '{n} days')}
            {request.employee && !isMine && (
              <>
                {' '}
                · {request.employee.preferredName ?? request.employee.firstName}{' '}
                {request.employee.lastName}
              </>
            )}
            {request.recordedBy && <> · {t('recorded after the fact')}</>}
          </p>
          {request.notes && (
            <p className="mt-2 text-sm text-slate-700">&ldquo;{request.notes}&rdquo;</p>
          )}
          {request.reviewNote && (
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium">
                {request.reviewedBy
                  ? `${request.reviewedBy.firstName} ${request.reviewedBy.lastName}`
                  : t('Manager')}
                :
              </span>{' '}
              {request.reviewNote}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canDecide && (
            <>
              <button
                type="button"
                disabled={busy}
                // Asks about the shifts it lands on first, if there are any.
                onClick={() => void act(() => approveTimeOff.approve(request))}
                className={buttonClass('primary', 'sm')}
              >
                {busy ? '…' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  // Asks for the reason they will read.
                  if (await declineTimeOff.decline(request)) onChanged();
                }}
                className={buttonClass('secondary', 'sm')}
              >
                Deny
              </button>
            </>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const range = formatRange(request.startDate, request.endDate, request.isHalfDay);
                const sure = await confirm({
                  title: isMine ? t('Withdraw this request?') : 'Cancel this time off?',
                  body: isMine
                    ? t('{type}, {range}. You would need to ask again.', {
                        type: ptoTypeLabel(request.type),
                        range,
                      })
                    : `${request.employee ? `${request.employee.preferredName ?? request.employee.firstName}’s ` : ''}${TYPE_LABELS[request.type].toLowerCase()}, ${range}.${request.status === 'APPROVED' ? ' It is already approved, so they may be counting on it.' : ''}`,
                  confirmLabel: isMine ? t('Yes, withdraw it') : 'Yes, cancel it',
                  cancelLabel: t('Keep it'),
                });
                if (sure) await act(() => api.cancelPto(request.id));
              }}
              className="text-sm font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50"
            >
              {isMine ? t('Withdraw') : t('Cancel')}
            </button>
          )}
        </div>
      </div>

      {canDecide && <ClashNote requestId={request.id} employeeId={request.employeeId} />}

      {conflicts && conflicts.length > 0 && request.status === 'PENDING' && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="font-medium">
            {conflicts.length} shift{conflicts.length === 1 ? '' : 's'} already scheduled in those
            dates
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

      {approveTimeOff.dialog}
      {declineTimeOff.dialog}
    </Card>
  );
}

function RequestForm({
  staff,
  balance,
  forId = '',
  startOn = '',
  onCreated,
}: {
  staff: Employee[];
  balance: PtoBalance | null;
  /// Who it starts for — a staff profile's "Request time off for …" (`?for=`).
  forId?: string;
  /// The day it starts on — a right-click on the Schedule (`?date=`).
  startOn?: string;
  onCreated: () => void;
}) {
  const t = useT();
  // Sick first, unless the person's own sick days are known to be used up:
  // then PTO (Dominguez, September 2026). Once they pick, it is theirs.
  const [chosenType, setType] = useState<PtoType | null>(null);
  const [startDate, setStartDate] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(startOn) ? startOn : '',
  );
  const [endDate, setEndDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [notes, setNotes] = useState('');
  const [employeeId, setEmployeeId] = useState(forId);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Their shifts in those days, said before they ask (October 2026,
  // Dominguez — making the app smarter): staff see their own published ones,
  // a manager filing for somebody that person's.
  const { employee: me } = useSession();
  const whoseId = employeeId || me?.id || '';
  const [onRota, setOnRota] = useState<Shift[]>([]);
  useEffect(() => {
    setOnRota([]);
    const last = endDate || startDate;
    if (!whoseId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || last < startDate) return;
    let cancelled = false;
    const dayAfter = new Date(`${last}T12:00:00Z`);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    api
      .listShifts({
        employeeId: whoseId,
        from: atPracticeTime(`${startDate}T12:00:00Z`, '00:00'),
        to: atPracticeTime(dayAfter.toISOString(), '00:00'),
      })
      .then(
        (rows) =>
          !cancelled &&
          setOnRota(
            rows.filter(
              (shift) =>
                shift.status !== 'CANCELLED' && new Date(shift.startsAt).getTime() > Date.now(),
            ),
          ),
      )
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [whoseId, startDate, endDate]);
  const forName =
    employeeId && employeeId !== me?.id
      ? (staff.find((person) => person.id === employeeId)?.firstName ?? 'They')
      : null;

  // …and only if they get PTO at all.
  const sickUsedUp =
    employeeId === '' &&
    balance !== null &&
    balance.sick.remaining <= 0 &&
    !hasNone(balance.vacation);
  const type: PtoType = chosenType ?? (sickUsedUp ? 'VACATION' : 'SICK');

  // One date is the common case; the end mirrors the start until changed.
  const effectiveEnd = endDate || startDate;
  const singleDay = Boolean(startDate) && effectiveEnd === startDate;

  // A rough count so the form can warn before submitting. The server is the
  // authority; this is only to stop a surprise.
  const requestedDays = startDate
    ? singleDay && isHalfDay
      ? 0.5
      : Math.round(
          (new Date(`${effectiveEnd}T00:00:00Z`).getTime() -
            new Date(`${startDate}T00:00:00Z`).getTime()) /
            86_400_000,
        ) + 1
    : 0;

  const bucket =
    type === 'SICK' ? 'sick' : type === 'VACATION' || type === 'PERSONAL' ? 'vacation' : null;

  // The balance on screen is for one policy year, so it can only speak to a
  // request inside that year. Booking next June against this year's remaining
  // days would be plainly wrong.
  const inBalanceYear =
    balance !== null && startDate >= balance.yearStart && effectiveEnd <= balance.yearEnd;

  // Only for the person's own request: a manager filing for someone else is
  // looking at their own balance, which would mislead.
  const isOwnRequest = employeeId === '';
  const showBalance =
    bucket !== null && balance !== null && isOwnRequest && requestedDays > 0 && inBalanceYear;
  const showOtherYearNote =
    bucket !== null && balance !== null && isOwnRequest && requestedDays > 0 && !inBalanceYear;
  const remainingAfter = showBalance
    ? Math.round((balance[bucket].remaining - requestedDays) * 10) / 10
    : 0;

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
      setProblem(err instanceof ApiError ? err.message : t('Could not send that request.'));
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
            {t('Type')}
          </label>
          <select
            id="pto-type"
            value={type}
            onChange={(event) => setType(event.target.value as PtoType)}
            className={field}
          >
            {REQUESTABLE_PTO_TYPES.map((value) => (
              <option key={value} value={value}>
                {ptoTypeLabel(value)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pto-start" className="block text-sm font-medium text-slate-700">
              {t('First day')}
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
              {t('Last day')}
            </label>
            <input
              id="pto-end"
              type="date"
              min={startDate || undefined}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={field}
            />
            <p className="mt-1 text-xs text-slate-500">{t('Leave empty for a single day.')}</p>
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
            {t('Half day')}
          </label>
        )}

        <div>
          <label htmlFor="pto-notes" className="block text-sm font-medium text-slate-700">
            {t('Notes')} <span className="font-normal text-slate-500">{t('(optional)')}</span>
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

        {onRota.length > 0 && (
          <div
            role="note"
            data-testid="time-off-on-rota"
            className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-inset ring-amber-200"
          >
            <p>{forName ? `${forName} is on the rota then:` : t('You’re on the rota then:')}</p>
            <ul className="mt-1 list-disc pl-5">
              {onRota.map((shift) => (
                <li key={shift.id}>
                  {new Date(shift.startsAt).toLocaleDateString(locale(), {
                    timeZone: 'America/New_York',
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                  , {formatClock(practiceClockOf(shift.startsAt))}–
                  {formatClock(practiceClockOf(shift.endsAt))}
                  {shift.isRemote
                    ? ` · ${t('working from home')}`
                    : ` · ${shift.location?.name ?? ''}`}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              {forName
                ? 'When it is approved you can take them off the rota or leave them as open shifts.'
                : t('Your manager will sort those out when they decide — you’ll be told.')}
            </p>
          </div>
        )}

        {showOtherYearNote && (
          <p className="text-sm text-slate-600">
            {plural(requestedDays, '{n} day', '{n} days')} ·{' '}
            {t('falls outside the {year} policy year, so it does not come off the balance above.', {
              year: balance.policyYear,
            })}
          </p>
        )}

        {showBalance &&
          (remainingAfter < 0 ? (
            <Alert tone="warning">
              {t(
                bucket === 'sick'
                  ? 'That is {days}, which puts you {over} over your sick allowance. You can still ask — a manager decides.'
                  : 'That is {days}, which puts you {over} over your PTO allowance. You can still ask — a manager decides.',
                {
                  days: plural(requestedDays, '{n} day', '{n} days'),
                  over: Math.abs(remainingAfter),
                },
              )}
            </Alert>
          ) : (
            <p className="text-sm text-slate-600">
              {plural(requestedDays, '{n} day', '{n} days')} ·{' '}
              {t('{n} left afterwards.', { n: remainingAfter })}
            </p>
          ))}

        {problem && <Alert>{problem}</Alert>}

        <button
          type="submit"
          disabled={busy || !startDate}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto sm:px-6"
        >
          {busy ? t('Sending…') : t('Send request')}
        </button>
      </form>
    </Card>
  );
}

/// "Tue 3 Nov", or "3–7 Nov" for a range. Dates are plain calendar days, so
/// they are parsed as UTC to stop a timezone shifting them a day.
function formatRange(start: string, end: string, isHalfDay: boolean): string {
  // No year: a time-off request is always about the near future.
  const format = (value: string) => formatCalendarDate(value, { year: false });

  if (start === end) {
    return isHalfDay ? tNow('{date} (half day)', { date: format(start) }) : format(start);
  }
  return `${format(start)} – ${format(end)}`;
}
