import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
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
import {
  STATUS_WORDS,
  afterWords,
  centsText,
  datesWords,
  money,
  parseCents,
  yearWords,
} from '../lib/cme';
import { practiceDate } from '../lib/practice-time';
import { useIsManager, useSession } from '../lib/session';
import type { CmeFormat, CmeMine, CmeOverview, CmeRequest, CmeYear } from '../lib/types';

const STATUS_TONE = {
  PENDING: 'warning',
  APPROVED: 'success',
  DECLINED: 'danger',
  WITHDRAWN: 'neutral',
} as const;

/**
 * CME (October 2026, Dominguez: "a CME reimbursement submission form for
 * providers for managers to approve ... it's to approve a cme activity/event",
 * with a yearly allowance for each provider). Providers ask about an activity
 * and what it will cost; managers and admins approve it (at that amount or
 * another), or decline it with a reason, record it paid back, and set each
 * provider's allowance. Going past the allowance warns, never refuses. No
 * receipts or certificates here: those stay outside the app.
 */
export function CmePage() {
  const isManager = useIsManager();
  const { employee } = useSession();
  const [mine, setMine] = useState<CmeMine | null>(null);
  const [overview, setOverview] = useState<CmeOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(() => {
    api
      .myCme()
      .then(setMine)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load CME.'));
    if (isManager) {
      api
        .cmeOverview()
        .then(setOverview)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load CME.'));
    }
  }, [isManager]);
  useEffect(load, [load]);

  const done = (message: string) => {
    setNotice(message);
    load();
  };

  if (!mine || (isManager && !overview)) {
    return (
      <div className="max-w-5xl">
        <PageHeading title="CME" />
        {error ? <Alert>{error}</Alert> : <Spinner />}
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeading
        title="CME"
        subtitle={
          isManager
            ? 'Continuing medical education: providers ask for an activity or event to be approved, with what it will cost, and managers decide.'
            : 'Ask for a CME activity or event to be approved, with what it will cost the practice to pay back.'
        }
      />
      {error && <Alert>{error}</Alert>}
      {notice && (
        <Alert tone="success">
          <span role="status">{notice}</span>
        </Alert>
      )}

      {mine.isProvider && (
        <YourCme
          mine={mine}
          onAsk={() => {
            setNotice(null);
            setAsking(true);
          }}
          onDone={done}
          onError={setError}
        />
      )}
      {!mine.isProvider && !isManager && <Alert tone="info">CME requests are for providers.</Alert>}

      {isManager && overview && (
        <ManagersCme overview={overview} me={employee?.id ?? null} onDone={done} />
      )}

      {asking && (
        <AskDialog
          mine={mine}
          onClose={() => setAsking(false)}
          onSent={() => {
            setAsking(false);
            done('Sent. The managers have been told, and you will hear back here.');
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------- providers

function YourCme({
  mine,
  onAsk,
  onDone,
  onError,
}: {
  mine: CmeMine;
  onAsk: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const confirm = useConfirm();
  async function withdraw(request: CmeRequest) {
    const yes = await confirm({
      title: 'Withdraw this request?',
      body: `${request.title} will no longer be waiting for a decision. You can ask again.`,
      confirmLabel: 'Yes, withdraw',
      cancelLabel: 'Keep it',
    });
    if (!yes) return;
    try {
      await api.withdrawCme(request.id);
      onDone('Withdrawn.');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not withdraw it.');
    }
  }

  return (
    <Card className="p-5" testId="your-cme">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Your CME</h2>
        <button type="button" className={buttonClass('primary', 'sm')} onClick={onAsk}>
          + Ask for a CME activity
        </button>
      </div>
      <ul className="mt-2 space-y-0.5 text-sm text-slate-700" data-testid="your-cme-allowance">
        {mine.years.map((year) => (
          <li key={year.year}>
            <strong>{year.year}</strong> · {yearWords(year)}
            {year.waitingCents > 0 && ` · ${money(year.waitingCents)} waiting for a decision`}
          </li>
        ))}
      </ul>
      {mine.requests.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Nothing asked for yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {mine.requests.map((request) => (
            <li key={request.id} className="rounded-lg border border-slate-200 p-3">
              <RequestSummary request={request} />
              {request.status === 'PENDING' && (
                <button
                  type="button"
                  className={`${buttonClass('secondary', 'sm')} mt-2`}
                  onClick={() => void withdraw(request)}
                >
                  Withdraw
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/// The year a request falls in, for the allowance, made up when there is
/// nothing yet that year.
function yearFor(mine: CmeMine, date: string): CmeYear | undefined {
  const year = Number(date.slice(0, 4));
  if (!year) return undefined;
  return (
    mine.years.find((found) => found.year === year) ?? {
      year,
      allowanceCents: mine.allowanceCents,
      usedCents: 0,
      waitingCents: 0,
      leftCents: mine.allowanceCents,
    }
  );
}

function AskDialog({
  mine,
  onClose,
  onSent,
}: {
  mine: CmeMine;
  onClose: () => void;
  onSent: () => void;
}) {
  const [title, setTitle] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [format, setFormat] = useState<CmeFormat>('IN_PERSON');
  const [place, setPlace] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [credits, setCredits] = useState('');
  const [costs, setCosts] = useState({ registration: '', travel: '', lodging: '', other: '' });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = {
    registration: parseCents(costs.registration),
    travel: parseCents(format === 'IN_PERSON' ? costs.travel : ''),
    lodging: parseCents(format === 'IN_PERSON' ? costs.lodging : ''),
    other: parseCents(costs.other),
  };
  const bad = Object.values(cents).some((value) => value === null);
  const total = bad ? 0 : Object.values(cents).reduce<number>((sum, v) => sum + (v ?? 0), 0);
  const after = startsOn ? afterWords(yearFor(mine, startsOn), total) : null;
  const pastAllowance = !!after && after.startsWith('goes');

  async function send() {
    setError(null);
    if (bad) {
      setError('Write each cost as dollars, like 450 or 450.00.');
      return;
    }
    const creditsNumber = credits.trim() === '' ? null : Number(credits);
    if (creditsNumber !== null && !(creditsNumber >= 0)) {
      setError('Credits are a number, like 12.5.');
      return;
    }
    setBusy(true);
    try {
      await api.askForCme({
        title: title.trim(),
        organizer: organizer.trim() || undefined,
        format,
        place: format === 'IN_PERSON' ? place.trim() || undefined : undefined,
        startsOn,
        endsOn: endsOn || startsOn,
        credits: creditsNumber,
        registrationCents: cents.registration ?? 0,
        travelCents: cents.travel ?? 0,
        lodgingCents: cents.lodging ?? 0,
        otherCents: cents.other ?? 0,
        reason: reason.trim() || undefined,
      });
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send it.');
      setBusy(false);
    }
  }

  const cost = (key: keyof typeof costs, label: string) => (
    <Field label={label}>
      {(props) => (
        <input
          {...props}
          inputMode="decimal"
          placeholder="$0"
          value={costs[key]}
          onChange={(event) => setCosts((current) => ({ ...current, [key]: event.target.value }))}
          className={inputClass}
        />
      )}
    </Field>
  );

  return (
    <Modal title="Ask for a CME activity" onClose={onClose} wide testId="cme-ask">
      <form
        className="space-y-4"
        aria-label="CME activity"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Field label="Activity or event" hint="The course, conference or program.">
          {(props) => (
            <input
              {...props}
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Who runs it" hint="Optional: AAFP, a medical school, a society.">
          {(props) => (
            <input
              {...props}
              maxLength={200}
              value={organizer}
              onChange={(event) => setOrganizer(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">How</legend>
          <div className="mt-1 flex flex-wrap gap-4 text-sm text-slate-800">
            {(
              [
                ['IN_PERSON', 'In person'],
                ['ONLINE', 'Online'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="cme-format"
                  checked={format === value}
                  onChange={() => setFormat(value)}
                  className="border-slate-300 text-brand-600 focus:ring-brand-600"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {format === 'IN_PERSON' && (
          <Field label="Where" hint="Optional: the city or venue.">
            {(props) => (
              <input
                {...props}
                maxLength={200}
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="First day">
            {(props) => (
              <input
                {...props}
                type="date"
                required
                value={startsOn}
                onChange={(event) => {
                  setStartsOn(event.target.value);
                  if (!endsOn || endsOn < event.target.value) setEndsOn(event.target.value);
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
                min={startsOn || undefined}
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="CME credits" hint="Optional.">
            {(props) => (
              <input
                {...props}
                inputMode="decimal"
                value={credits}
                onChange={(event) => setCredits(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">What it will cost</legend>
          <div className="mt-1 grid gap-3 sm:grid-cols-4">
            {cost('registration', 'Registration')}
            {format === 'IN_PERSON' && cost('travel', 'Travel')}
            {format === 'IN_PERSON' && cost('lodging', 'Lodging')}
            {cost('other', 'Other')}
          </div>
          <p className="mt-2 text-sm text-slate-800" data-testid="cme-total">
            Total <strong>{money(total)}</strong>
            {after && `, which ${after}`}.
          </p>
          {pastAllowance && (
            <p className="mt-1 text-sm text-amber-800">You can still ask: a manager decides.</p>
          )}
        </fieldset>
        <Field label="Why this one" hint="Optional: what it is for, in a line or two.">
          {(props) => (
            <textarea
              {...props}
              rows={2}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <p className="text-xs text-slate-500">
          Days away from the office? Ask for the time off as well, under{' '}
          <Link to="/time-off?request=1" className="font-medium text-brand-700 underline">
            Time off
          </Link>
          . Keep the receipts and certificate yourself: they are not kept here.
        </p>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            Send for approval
          </button>
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/// One request: what, when, how much, and how it stands.
function RequestSummary({ request, showWho = false }: { request: CmeRequest; showWho?: boolean }) {
  const costs = [
    ['Registration', request.registrationCents],
    ['Travel', request.travelCents],
    ['Lodging', request.lodgingCents],
    ['Other', request.otherCents],
  ].filter(([, cents]) => (cents as number) > 0) as [string, number][];
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {showWho && <span className="font-semibold text-slate-900">{request.provider.name}</span>}
        <span className={showWho ? 'text-slate-900' : 'font-semibold text-slate-900'}>
          {request.title}
        </span>
        <Badge tone={STATUS_TONE[request.status]}>{STATUS_WORDS[request.status]}</Badge>
        {request.reimbursedOn && <Badge tone="success">Paid back</Badge>}
      </div>
      <p className="mt-0.5 text-slate-600">
        {datesWords(request.startsOn, request.endsOn)}
        {' · '}
        {request.format === 'ONLINE' ? 'Online' : (request.place ?? 'In person')}
        {request.organizer && ` · ${request.organizer}`}
        {request.credits !== null && ` · ${request.credits} credits`}
      </p>
      <p className="mt-0.5 text-slate-800">
        Asked <strong>{money(request.askedCents)}</strong>
        {costs.length > 1 &&
          ` (${costs.map(([label, cents]) => `${label.toLowerCase()} ${money(cents)}`).join(', ')})`}
        {request.status === 'APPROVED' &&
          request.approvedCents !== null &&
          request.approvedCents !== request.askedCents &&
          ` · approved ${money(request.approvedCents)}`}
        {request.reimbursedOn &&
          request.reimbursedCents !== null &&
          ` · paid back ${money(request.reimbursedCents)} on ${datesWords(request.reimbursedOn, request.reimbursedOn)}`}
      </p>
      {request.reason && <p className="mt-0.5 text-slate-600">“{request.reason}”</p>}
      {request.decisionNote && (
        <p className="mt-0.5 text-slate-700">
          {request.decidedBy ? `${request.decidedBy.name}: ` : ''}“{request.decisionNote}”
        </p>
      )}
    </div>
  );
}

// -------------------------------------------------------------- managers

function ManagersCme({
  overview,
  me,
  onDone,
}: {
  overview: CmeOverview;
  me: string | null;
  onDone: (message: string) => void;
}) {
  const [deciding, setDeciding] = useState<{
    request: CmeRequest;
    how: 'approve' | 'decline';
  } | null>(null);
  const [paying, setPaying] = useState<CmeRequest | null>(null);
  const waiting = overview.requests
    .filter((request) => request.status === 'PENDING')
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const toPay = overview.requests.filter(
    (request) => request.status === 'APPROVED' && !request.reimbursedOn,
  );
  const earlier = overview.requests.filter(
    (request) => request.status !== 'PENDING' && !toPay.includes(request),
  );
  const provider = (id: string) => overview.providers.find((person) => person.id === id);
  /// The provider's year for a request, for "leaves" or "goes past".
  const yearOf = (request: CmeRequest) => {
    const person = provider(request.employeeId);
    const year = Number(request.startsOn.slice(0, 4));
    if (!person) return undefined;
    return year === overview.year
      ? person.thisYear
      : year === overview.year + 1
        ? person.nextYear
        : undefined;
  };

  return (
    <>
      <Card className="p-5" testId="cme-waiting">
        <h2 className="text-lg font-semibold text-slate-900">Waiting for a decision</h2>
        {waiting.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {waiting.map((request) => {
              const after = afterWords(yearOf(request), request.askedCents);
              return (
                <li key={request.id} className="rounded-lg border border-slate-200 p-3">
                  <RequestSummary request={request} showWho />
                  {after && (
                    <p
                      className={`mt-1 text-sm ${
                        after.startsWith('goes') ? 'text-amber-800' : 'text-slate-600'
                      }`}
                    >
                      Approving it {after}.
                    </p>
                  )}
                  {request.employeeId === me ? (
                    <p className="mt-2 text-sm text-slate-500">
                      Yours: another manager decides it.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass('primary', 'sm')}
                        onClick={() => setDeciding({ request, how: 'approve' })}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className={buttonClass('secondary', 'sm')}
                        onClick={() => setDeciding({ request, how: 'decline' })}
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {toPay.length > 0 && (
        <Card className="p-5" testId="cme-to-pay">
          <h2 className="text-lg font-semibold text-slate-900">Approved, to pay back</h2>
          <p className="mt-1 text-sm text-slate-600">
            Once the practice has paid it back, record the day and the amount.
          </p>
          <ul className="mt-3 space-y-3">
            {toPay.map((request) => (
              <li key={request.id} className="rounded-lg border border-slate-200 p-3">
                <RequestSummary request={request} showWho />
                {request.employeeId !== me && (
                  <button
                    type="button"
                    className={`${buttonClass('secondary', 'sm')} mt-2`}
                    onClick={() => setPaying(request)}
                  >
                    Mark paid back
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AllowancesCard overview={overview} onDone={onDone} />

      {earlier.length > 0 && (
        <details
          className="rounded-xl border border-slate-200 bg-white p-5"
          data-testid="cme-earlier"
        >
          <summary className="cursor-pointer text-base font-semibold text-slate-900">
            Earlier requests ({earlier.length})
          </summary>
          <ul className="mt-3 space-y-3">
            {earlier.map((request) => (
              <li key={request.id} className="rounded-lg border border-slate-200 p-3">
                <RequestSummary request={request} showWho />
              </li>
            ))}
          </ul>
        </details>
      )}

      {deciding && (
        <DecideDialog
          request={deciding.request}
          how={deciding.how}
          after={afterWords(yearOf(deciding.request), deciding.request.askedCents)}
          onClose={() => setDeciding(null)}
          onDone={(message) => {
            setDeciding(null);
            onDone(message);
          }}
        />
      )}
      {paying && (
        <PaidDialog
          request={paying}
          onClose={() => setPaying(null)}
          onDone={(message) => {
            setPaying(null);
            onDone(message);
          }}
        />
      )}
    </>
  );
}

function DecideDialog({
  request,
  how,
  after,
  onClose,
  onDone,
}: {
  request: CmeRequest;
  how: 'approve' | 'decline';
  after: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [amount, setAmount] = useState(centsText(request.askedCents));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approving = how === 'approve';

  async function submit() {
    setError(null);
    const cents = parseCents(amount);
    if (approving && (cents === null || amount.trim() === '')) {
      setError('Write the amount as dollars, like 1250 or 1250.00.');
      return;
    }
    if (!approving && note.trim().length < 3) {
      setError('Say why, for them.');
      return;
    }
    setBusy(true);
    try {
      if (approving) {
        await api.approveCme(request.id, {
          approvedCents: cents ?? request.askedCents,
          note: note.trim() || undefined,
        });
        onDone(`Approved. ${request.provider.name} has been told.`);
      } else {
        await api.declineCme(request.id, note.trim());
        onDone(`Declined. ${request.provider.name} has been told.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not do that.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={approving ? 'Approve this CME request' : 'Decline this CME request'}
      onClose={onClose}
      testId="cme-decide"
    >
      <RequestSummary request={request} showWho />
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {approving && (
          <Field label="Amount approved" hint="What was asked, or change it.">
            {(props) => (
              <input
                {...props}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        )}
        {approving && after && (
          <p
            className={`text-sm ${after.startsWith('goes') ? 'text-amber-800' : 'text-slate-600'}`}
          >
            At what was asked, it {after}.
          </p>
        )}
        <Field
          label={approving ? 'Note' : 'Why not'}
          hint={approving ? 'Optional; they will read it.' : 'They will read it.'}
        >
          {(props) => (
            <textarea
              {...props}
              rows={2}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            {approving ? 'Approve' : 'Decline'}
          </button>
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PaidDialog({
  request,
  onClose,
  onDone,
}: {
  request: CmeRequest;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [day, setDay] = useState(practiceDate());
  const [amount, setAmount] = useState(centsText(request.approvedCents ?? request.askedCents));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const cents = parseCents(amount);
    if (cents === null || amount.trim() === '') {
      setError('Write the amount as dollars, like 1250 or 1250.00.');
      return;
    }
    setBusy(true);
    try {
      await api.cmeReimbursed(request.id, { reimbursedOn: day, reimbursedCents: cents });
      onDone(`Recorded as paid back. ${request.provider.name} has been told.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record it.');
      setBusy(false);
    }
  }

  return (
    <Modal title="Mark paid back" onClose={onClose} testId="cme-paid">
      <RequestSummary request={request} showWho />
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paid on">
            {(props) => (
              <input
                {...props}
                type="date"
                required
                max={practiceDate()}
                value={day}
                onChange={(event) => setDay(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="Amount paid">
            {(props) => (
              <input
                {...props}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            Save
          </button>
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/// Each provider's yearly allowance, and how much of it is used.
function AllowancesCard({
  overview,
  onDone,
}: {
  overview: CmeOverview;
  onDone: (message: string) => void;
}) {
  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      overview.providers.map((person) => [
        person.id,
        person.allowanceCents === null ? '' : centsText(person.allowanceCents),
      ]),
    ),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(id: string, name: string) {
    setError(null);
    const text = typed[id] ?? '';
    const cents = text.trim() === '' ? null : parseCents(text);
    if (text.trim() !== '' && cents === null) {
      setError('Write the allowance as dollars, like 2000, or leave it blank for none.');
      return;
    }
    setBusy(id);
    try {
      await api.setCmeAllowance(id, cents);
      onDone(cents === null ? `No allowance for ${name}.` : `Allowance saved for ${name}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save it.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5" testId="cme-allowances">
      <h2 className="text-lg font-semibold text-slate-900">Allowances</h2>
      <p className="mt-1 text-sm text-slate-600">
        Each provider’s CME allowance for a calendar year, by when the activity starts. Approved
        requests count against it, at what was paid back once they have been. Leave it blank for
        none. Going past it warns; it never stops a request.
      </p>
      {overview.providers.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nobody is in a provider job role yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {overview.providers.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
              <span className="min-w-[10rem] font-medium text-slate-900">{person.name}</span>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                A year
                <input
                  inputMode="decimal"
                  aria-label={`CME allowance a year for ${person.name}`}
                  placeholder="None"
                  value={typed[person.id] ?? ''}
                  onChange={(event) =>
                    setTyped((current) => ({ ...current, [person.id]: event.target.value }))
                  }
                  className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy === person.id}
                className={buttonClass('secondary', 'sm')}
                onClick={() => void save(person.id, person.name)}
              >
                Save
              </button>
              <span className="text-sm text-slate-600">
                {overview.year}: {yearWords(person.thisYear)}
                {person.thisYear.waitingCents > 0 &&
                  ` · ${money(person.thisYear.waitingCents)} waiting`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}
