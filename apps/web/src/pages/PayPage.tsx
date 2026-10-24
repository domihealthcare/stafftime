import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../components/ConfirmDialog';
import { EmploymentHistoryCard, formatPay } from '../components/EmploymentHistoryCard';
import { Modal } from '../components/Modal';
import { LockPayButton } from '../components/PinGate';
import { Alert, Badge, Card, Field, PageHeading, buttonClass, inputClass } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { atPracticeTime, formatPracticeDateTime, practiceDate } from '../lib/practice-time';
import { useIsManager, useSession } from '../lib/session';
import type {
  LeavingKind,
  PayOverview,
  PayPerson,
  PayRaise,
  PayRaiseStatus,
  PayRateUnit,
  RaiseDecisionInput,
} from '../lib/types';

export const RAISE_STATUS_LABELS: Record<PayRaiseStatus, string> = {
  REQUESTED: 'Asked for',
  MEETING_SET: 'Meeting set',
  OFFERED: 'Offered',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
};

const RAISE_STATUS_TONE: Record<
  PayRaiseStatus,
  'neutral' | 'info' | 'warning' | 'success' | 'danger'
> = {
  REQUESTED: 'warning',
  MEETING_SET: 'info',
  OFFERED: 'info',
  APPROVED: 'success',
  DECLINED: 'danger',
  WITHDRAWN: 'neutral',
};

export const LEAVING_KIND_LABELS: Record<LeavingKind, string> = {
  RESIGNED: 'Resigned',
  LET_GO: 'Let go',
  LAID_OFF: 'Laid off',
  RETIRED: 'Retired',
  END_OF_CONTRACT: 'End of contract',
  OTHER: 'Other',
};

const OPEN: PayRaiseStatus[] = ['REQUESTED', 'MEETING_SET', 'OFFERED'];

/// "24.50" or "$24.50" or "52,000" to a number, or null for blank, or NaN.
function parseRate(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text.replace(/[$,\s]/g, ''));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : Number.NaN;
}

/**
 * Pay & raises (October 2026, Dominguez: "i want to stop having to use this
 * excel workflow and have a workflow within the staff portal to address the
 * staff pay / raise / etc."). For the people an admin chose to see the rota's
 * cost, behind their PIN. Everybody's pay now and what is coming up; a raise
 * from the ask, through a meeting, to an offer and a decision; and, for
 * people who have left, why and when they were last paid, with their exit
 * checklist. Providers are left out for now, as from the rota's cost.
 */
export function PayPage() {
  const { employee } = useSession();
  const [overview, setOverview] = useState<PayOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'current' | 'former'>('current');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () =>
    api
      .pay()
      .then((found) => {
        setOverview(found);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load pay.'));

  useEffect(() => {
    void load();
  }, []);

  const words = search.trim().toLowerCase();
  const matches = (person: { name: string; jobRoles: string[] }) =>
    !words || `${person.name} ${person.jobRoles.join(' ')}`.toLowerCase().includes(words);
  const current = overview?.current.filter(matches) ?? [];
  const former = overview?.former.filter(matches) ?? [];

  if (employee && !employee.canSeeRotaCost) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeading title="Pay & raises" />
        <Alert tone="info">
          Pay is only for the people an admin has chosen to see the rota’s cost.
        </Alert>
      </div>
    );
  }

  const raisesOpen = overview?.current.filter((person) => person.openRaise).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PageHeading
          title="Pay & raises"
          subtitle="Everybody's pay, each raise from the ask to the decision, and why people left. It sets the rota's cost. Providers are left out for now."
        />
        <LockPayButton />
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Who" className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              ['current', `Current staff${overview ? ` (${overview.current.length})` : ''}`],
              ['former', `Former staff${overview ? ` (${overview.former.length})` : ''}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`tap rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or job role"
          aria-label="Search"
          className={`${inputClass} max-w-xs`}
        />
        {raisesOpen > 0 && (
          <span className="text-sm text-amber-800" data-testid="raises-open">
            {raisesOpen} raise{raisesOpen === 1 ? '' : 's'} still open
          </span>
        )}
      </div>

      {overview && tab === 'current' && (
        <Card className="overflow-hidden">
          {current.length === 0 ? (
            <p className="p-4 text-sm text-slate-600">Nobody to show.</p>
          ) : (
            <ul className="divide-y divide-slate-100" aria-label="Current staff">
              {current.map((person) => (
                <li key={person.id} data-testid="pay-row">
                  <button
                    type="button"
                    onClick={() => setOpenId(person.id)}
                    className="grid w-full gap-1 px-4 py-3 text-left hover:bg-slate-50 sm:grid-cols-[1.4fr_1fr_1.2fr_1fr] sm:items-center sm:gap-3"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900">{person.name}</span>
                      <span className="block text-xs text-slate-600">
                        {person.position?.value ?? (person.jobRoles.join(', ') || 'No job role')}
                      </span>
                    </span>
                    <span className="text-sm">
                      {person.pay ? (
                        <>
                          <span className="font-semibold">
                            {formatPay(person.pay.rate, person.pay.unit)}
                          </span>
                          <span className="block text-xs text-slate-600">
                            since {formatCalendarDate(person.pay.since)}
                          </span>
                        </>
                      ) : (
                        <span className="text-amber-800">
                          No pay on file
                          <span className="block text-xs text-slate-600">Press to enter it</span>
                        </span>
                      )}
                    </span>
                    <span className="text-sm">
                      {person.upcoming && (
                        <span className="text-slate-800">
                          <Badge tone="warning">Coming up</Badge>{' '}
                          {formatPay(person.upcoming.rate, person.upcoming.unit)} from{' '}
                          {formatCalendarDate(person.upcoming.effectiveOn, { year: false })}
                        </span>
                      )}
                    </span>
                    <span className="text-sm">
                      {person.openRaise && (
                        <span>
                          <Badge tone={RAISE_STATUS_TONE[person.openRaise.status]}>
                            Raise: {RAISE_STATUS_LABELS[person.openRaise.status]}
                          </Badge>
                          {person.openRaise.meetingAt && (
                            <span className="block text-xs text-slate-600">
                              Meeting {formatPracticeDateTime(person.openRaise.meetingAt)}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {overview && tab === 'former' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            The exit checklist starts by itself when somebody is marked as left on the Staff screen:
            keys, EMR, Domi Staff, WhatsApp and the rest. Its steps are kept under Manage, Staff,
            Onboarding &amp; Offboarding.
          </p>
          {former.length === 0 ? (
            <Card className="p-4 text-sm text-slate-600">Nobody to show.</Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="Former staff">
              {former.map((person) => (
                <li key={person.id}>
                  <Card className="p-4" testId="former-row">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{person.name}</p>
                        <p className="text-xs text-slate-600">
                          {person.terminationDate
                            ? `Last day ${formatCalendarDate(person.terminationDate)}`
                            : 'Last day not recorded'}
                          {person.hireDate && ` · started ${formatCalendarDate(person.hireDate)}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenId(person.id)}
                        className={buttonClass('secondary', 'sm')}
                        aria-label={`Open ${person.name}`}
                      >
                        Open
                      </button>
                    </div>
                    <dl className="mt-2 grid gap-1 text-sm">
                      <Row term="Last position">{person.lastPosition?.value ?? '-'}</Row>
                      <Row term="Last pay">
                        {person.lastPay ? formatPay(person.lastPay.rate, person.lastPay.unit) : '-'}
                      </Row>
                      <Row term="Why they left">
                        {[
                          person.leaving.kind ? LEAVING_KIND_LABELS[person.leaving.kind] : null,
                          person.leaving.reason,
                        ]
                          .filter(Boolean)
                          .join(': ') || '-'}
                      </Row>
                      <Row term="Last paycheck">
                        {person.leaving.lastPaycheckOn
                          ? formatCalendarDate(person.leaving.lastPaycheckOn)
                          : '-'}
                      </Row>
                      <Row term="Exit checklist">
                        <ExitChecklistLine
                          employeeId={person.id}
                          progress={person.exitChecklist}
                          lastDay={person.terminationDate}
                          onStarted={() => void load()}
                        />
                      </Row>
                    </dl>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {openId && (
        <PayPersonDialog
          employeeId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-600">{term}</dt>
      <dd className="text-right text-slate-900">{children}</dd>
    </div>
  );
}

/// "14 of 22 done", a link to it for managers, or a way to start one.
function ExitChecklistLine({
  employeeId,
  progress,
  lastDay,
  onStarted,
}: {
  employeeId: string;
  progress: PayPerson['exitChecklist'];
  lastDay: string | null;
  onStarted: () => void;
}) {
  const isManager = useIsManager();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (progress) {
    const text = progress.completed ? 'All done' : `${progress.done} of ${progress.total} done`;
    return isManager ? (
      <Link
        to={`/checklists?person=${employeeId}`}
        className="text-brand-700 underline"
        data-testid="exit-checklist"
      >
        {text}
      </Link>
    ) : (
      <span data-testid="exit-checklist">{text}</span>
    );
  }
  if (!isManager) return <span>Not started</span>;
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        className="tap text-brand-700 underline"
        onClick={async () => {
          setBusy(true);
          try {
            const templates = await api.checklistTemplates('OFFBOARDING');
            const template = templates.find((one) => one.isDefault) ?? templates[0];
            if (!template) {
              setProblem('There is no offboarding template yet.');
              return;
            }
            await api.startChecklist({
              employeeId,
              kind: 'OFFBOARDING',
              templateId: template.id,
              ...(lastDay ? { anchorDate: lastDay } : {}),
            });
            onStarted();
          } catch (err) {
            setProblem(err instanceof ApiError ? err.message : 'Could not start it.');
          } finally {
            setBusy(false);
          }
        }}
      >
        Start the exit checklist
      </button>
      {problem && <span className="text-xs text-rose-700">{problem}</span>}
    </span>
  );
}

function PayPersonDialog({
  employeeId,
  onClose,
  onChanged,
}: {
  employeeId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [person, setPerson] = useState<PayPerson | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .payPerson(employeeId)
      .then(setPerson)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load it.'));
  }, [employeeId]);

  const changed = (next: PayPerson) => {
    setPerson(next);
    onChanged();
  };

  return (
    <Modal title={person ? person.name : 'Pay'} onClose={onClose} wide testId="pay-person">
      {error && <Alert>{error}</Alert>}
      {person && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {[
              person.jobRoles.join(', ') || null,
              person.payType === 'SALARY' ? 'Salaried' : 'Hourly',
              person.hireDate ? `started ${formatCalendarDate(person.hireDate)}` : null,
              person.terminationDate ? `left ${formatCalendarDate(person.terminationDate)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {!person.terminationDate && <RaisesSection person={person} onChanged={changed} />}
          {person.terminationDate && <LeavingSection person={person} onChanged={changed} />}
          <EmploymentHistoryCard<PayPerson>
            employeeId={person.id}
            record={person}
            hireDate={person.hireDate}
            payType={person.payType}
            openPayForm
            onChanged={changed}
            calls={{
              add: (id, input) => api.addPayChange(id, input),
              update: (id, input) => api.updatePayChange(id, input),
              remove: (id) => api.removePayChange(id),
            }}
          />
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ raises

function RaisesSection({
  person,
  onChanged,
}: {
  person: PayPerson;
  onChanged: (person: PayPerson) => void;
}) {
  const confirm = useConfirm();
  const open = person.raises.find((raise) => OPEN.includes(raise.status)) ?? null;
  const past = person.raises.filter((raise) => raise !== open);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (call: () => Promise<PayPerson>) => {
    try {
      onChanged(await call());
      setProblem(null);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that.');
    }
  };

  return (
    <Card className="p-4" testId="raises">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Raise</h2>
        {!open && !asking && (
          <button
            type="button"
            className={buttonClass('secondary', 'sm')}
            onClick={() => setAsking(true)}
          >
            + Raise asked for
          </button>
        )}
      </div>
      {problem && (
        <div className="mt-2">
          <Alert>{problem}</Alert>
        </div>
      )}
      {asking && (
        <RaiseRequestForm
          currentUnit={person.current.pay?.unit ?? 'HOURLY'}
          onCancel={() => setAsking(false)}
          onSave={async (input) => {
            onChanged(await api.requestRaise(person.id, input));
            setAsking(false);
          }}
        />
      )}
      {open && (
        <OpenRaise
          raise={open}
          person={person}
          onRun={run}
          onWithdraw={async () => {
            const sure = await confirm({
              title: 'Mark this raise as withdrawn?',
              body: 'For when they no longer want it. A meeting still to come is taken off the calendar, which tells them.',
              confirmLabel: 'Yes, withdrawn',
              cancelLabel: 'Keep it open',
            });
            if (sure) await run(() => api.withdrawRaise(open.id));
          }}
        />
      )}
      {!open && !asking && past.length === 0 && (
        <p className="mt-2 text-sm text-slate-600">
          No raises recorded. When somebody asks for one, press <strong>+ Raise asked for</strong>,
          then set a meeting, and record the offer and the answer.
        </p>
      )}
      {past.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-slate-700">
            Earlier raises ({past.length})
          </summary>
          <ul className="mt-2 space-y-2" aria-label="Earlier raises">
            {past.map((raise) => (
              <li
                key={raise.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm"
              >
                <span>
                  <Badge tone={RAISE_STATUS_TONE[raise.status]}>
                    {RAISE_STATUS_LABELS[raise.status]}
                  </Badge>{' '}
                  asked {formatCalendarDate(raise.requestedOn)}
                  {raise.newRate !== null && raise.newUnit && (
                    <>
                      {' '}
                      · {formatPay(raise.newRate, raise.newUnit)}
                      {raise.effectiveOn && ` from ${formatCalendarDate(raise.effectiveOn)}`}
                    </>
                  )}
                  {raise.note && <span className="block text-slate-600">{raise.note}</span>}
                  {raise.status === 'APPROVED' && !raise.payChangeKept && (
                    <span className="block text-xs text-amber-800">
                      The pay change it made has since been removed from the history.
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="tap text-xs text-slate-600 underline"
                  onClick={async () => {
                    const sure = await confirm({
                      title: 'Remove this raise?',
                      body: 'For one entered by mistake. Any pay change it made stays in the history below, where it can be removed on its own.',
                      confirmLabel: 'Yes, remove it',
                      cancelLabel: 'Keep it',
                    });
                    if (sure) await run(() => api.removeRaise(raise.id));
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

const STEPS: { label: string; reached: (raise: PayRaise) => boolean }[] = [
  { label: 'Asked for', reached: () => true },
  { label: 'Meeting', reached: (raise) => raise.meeting !== null },
  { label: 'Offered', reached: (raise) => raise.status === 'OFFERED' },
  { label: 'Decided', reached: () => false },
];

function OpenRaise({
  raise,
  person,
  onRun,
  onWithdraw,
}: {
  raise: PayRaise;
  person: PayPerson;
  onRun: (call: () => Promise<PayPerson>) => Promise<void>;
  onWithdraw: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState<'meeting' | RaiseDecisionInput['outcome'] | null>(null);

  return (
    <div className="mt-3 space-y-3" data-testid="open-raise">
      <ol className="flex flex-wrap gap-1 text-xs" aria-label="Steps">
        {STEPS.map((step) => (
          <li
            key={step.label}
            className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${
              step.reached(raise)
                ? 'bg-brand-50 text-brand-800 ring-brand-200'
                : 'bg-white text-slate-500 ring-slate-200'
            }`}
          >
            {step.reached(raise) ? '✓ ' : ''}
            {step.label}
          </li>
        ))}
      </ol>
      <dl className="grid gap-1 text-sm">
        <Row term="Asked for">
          {formatCalendarDate(raise.requestedOn)}
          {raise.askedRate !== null && raise.askedUnit && (
            <> · {formatPay(raise.askedRate, raise.askedUnit)}</>
          )}
        </Row>
        <Row term="Pay now">
          {person.current.pay ? formatPay(person.current.pay.rate, person.current.pay.unit) : '-'}
        </Row>
        {raise.meeting && (
          <Row term="Meeting">
            <span data-testid="raise-meeting">
              {formatPracticeDateTime(raise.meeting.startsAt)}
            </span>
          </Row>
        )}
        {raise.status === 'OFFERED' && raise.newRate !== null && raise.newUnit && (
          <Row term="Offered">
            {formatPay(raise.newRate, raise.newUnit)}
            {raise.newPosition && ` as ${raise.newPosition}`}
          </Row>
        )}
        {raise.note && <Row term="Note">{raise.note}</Row>}
      </dl>

      {form === null && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass('secondary', 'sm')}
            onClick={() => setForm('meeting')}
          >
            {raise.meeting ? 'Move the meeting' : 'Set a meeting'}
          </button>
          {raise.meeting && (
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              onClick={async () => {
                const sure = await confirm({
                  title: 'Take the meeting off?',
                  body: 'It comes off the calendar, which tells them.',
                  confirmLabel: 'Yes, take it off',
                  cancelLabel: 'Keep it',
                });
                if (sure) await onRun(() => api.cancelRaiseMeeting(raise.id));
              }}
            >
              Take the meeting off
            </button>
          )}
          {raise.status !== 'OFFERED' && (
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              onClick={() => setForm('OFFERED')}
            >
              Make an offer
            </button>
          )}
          <button
            type="button"
            className={buttonClass('primary', 'sm')}
            onClick={() => setForm('APPROVED')}
          >
            {raise.status === 'OFFERED' ? 'Accepted: approve it' : 'Approve'}
          </button>
          <button
            type="button"
            className={buttonClass('secondary', 'sm')}
            onClick={() => setForm('DECLINED')}
          >
            {raise.status === 'OFFERED' ? 'Turned down' : 'Decline'}
          </button>
          <button
            type="button"
            className="tap text-sm text-slate-600 underline"
            onClick={() => void onWithdraw()}
          >
            They withdrew it
          </button>
        </div>
      )}

      {form === 'meeting' && (
        <MeetingForm
          personName={person.name}
          onCancel={() => setForm(null)}
          onSave={async (input) => {
            await onRun(() => api.setRaiseMeeting(raise.id, input));
            setForm(null);
          }}
        />
      )}
      {form !== null && form !== 'meeting' && (
        <DecisionForm
          outcome={form}
          raise={raise}
          person={person}
          onCancel={() => setForm(null)}
          onSave={async (input) => {
            await onRun(() => api.decideRaise(raise.id, input));
            setForm(null);
          }}
        />
      )}
    </div>
  );
}

function RaiseRequestForm({
  currentUnit,
  onSave,
  onCancel,
}: {
  currentUnit: PayRateUnit;
  onSave: (input: {
    requestedOn: string;
    askedRate: number | null;
    askedUnit: PayRateUnit | null;
    note: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [requestedOn, setRequestedOn] = useState(practiceDate());
  const [rate, setRate] = useState('');
  const [unit, setUnit] = useState<PayRateUnit>(currentUnit);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <form
      aria-label="Raise asked for"
      className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const asked = parseRate(rate);
        if (Number.isNaN(asked)) {
          setProblem('The amount is in dollars, like 24.50.');
          return;
        }
        setBusy(true);
        setProblem(null);
        try {
          await onSave({
            requestedOn,
            askedRate: asked,
            askedUnit: asked === null ? null : unit,
            note: note.trim() || null,
          });
        } catch (err) {
          setProblem(err instanceof ApiError ? err.message : 'Could not save that.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Asked on">
          {(props) => (
            <input
              {...props}
              type="date"
              required
              value={requestedOn}
              onChange={(event) => setRequestedOn(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Amount asked for" hint="Optional.">
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="decimal"
              placeholder="24.50"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <UnitField value={unit} onChange={setUnit} />
      </div>
      <Field label="Note (optional)">
        {(props) => (
          <input
            {...props}
            type="text"
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      {problem && <Alert>{problem}</Alert>}
      <FormButtons busy={busy} label="Save" onCancel={onCancel} />
    </form>
  );
}

function MeetingForm({
  personName,
  onSave,
  onCancel,
}: {
  personName: string;
  onSave: (input: {
    startsAt: string;
    endsAt: string;
    place: string | null;
    createMeetLink: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [day, setDay] = useState(practiceDate());
  const [start, setStart] = useState('12:00');
  const [end, setEnd] = useState('12:30');
  const [place, setPlace] = useState('');
  const [meet, setMeet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <form
      aria-label="Meeting"
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setProblem(null);
        // Noon UTC is always the same day in New Jersey.
        const onDay = `${day}T12:00:00.000Z`;
        try {
          await onSave({
            startsAt: atPracticeTime(onDay, start),
            endsAt: atPracticeTime(onDay, end),
            place: place.trim() || null,
            createMeetLink: meet,
          });
        } catch (err) {
          setProblem(err instanceof ApiError ? err.message : 'Could not set it.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-slate-600">
        It goes on the calendar for {personName} and you as a check-in. The calendar never says what
        it is about.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Day">
          {(props) => (
            <input
              {...props}
              type="date"
              required
              min={practiceDate()}
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="From">
          {(props) => (
            <input
              {...props}
              type="time"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="To">
          {(props) => (
            <input
              {...props}
              type="time"
              required
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
      </div>
      <Field label="Where (optional)">
        {(props) => (
          <input
            {...props}
            type="text"
            maxLength={200}
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            placeholder="North Bergen, the back office"
            className={inputClass}
          />
        )}
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={meet} onChange={(event) => setMeet(event.target.checked)} />
        Create a Google Meet link
      </label>
      {problem && <Alert>{problem}</Alert>}
      <FormButtons busy={busy} label="Set the meeting" onCancel={onCancel} />
    </form>
  );
}

function DecisionForm({
  outcome,
  raise,
  person,
  onSave,
  onCancel,
}: {
  outcome: RaiseDecisionInput['outcome'];
  raise: PayRaise;
  person: PayPerson;
  onSave: (input: RaiseDecisionInput) => Promise<void>;
  onCancel: () => void;
}) {
  const startRate = raise.newRate ?? raise.askedRate;
  const [rate, setRate] = useState(startRate === null ? '' : String(startRate));
  const [unit, setUnit] = useState<PayRateUnit>(
    raise.newUnit ?? raise.askedUnit ?? person.current.pay?.unit ?? 'HOURLY',
  );
  const [position, setPosition] = useState(raise.newPosition ?? '');
  const [effectiveOn, setEffectiveOn] = useState(raise.effectiveOn ?? practiceDate());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const needsPay = outcome !== 'DECLINED';

  const title =
    outcome === 'OFFERED'
      ? 'The offer'
      : outcome === 'APPROVED'
        ? 'Approve the raise'
        : raise.status === 'OFFERED'
          ? 'They turned it down'
          : 'Decline the raise';

  return (
    <form
      aria-label={title}
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const value = needsPay ? parseRate(rate) : null;
        if (needsPay && (value === null || Number.isNaN(value))) {
          setProblem('Give the new pay in dollars, like 24.50.');
          return;
        }
        setBusy(true);
        setProblem(null);
        try {
          await onSave({
            outcome,
            newRate: value,
            newUnit: value === null ? null : unit,
            newPosition: needsPay ? position.trim() || null : null,
            effectiveOn: outcome === 'APPROVED' ? effectiveOn : null,
            note: note.trim() || null,
          });
        } catch (err) {
          setProblem(err instanceof ApiError ? err.message : 'Could not save that.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {needsPay && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="New pay">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="24.50"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <UnitField value={unit} onChange={setUnit} />
            {outcome === 'APPROVED' && (
              <Field label="Starts on" hint="Past or still to come.">
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    required
                    value={effectiveOn}
                    onChange={(event) => setEffectiveOn(event.target.value)}
                    className={inputClass}
                  />
                )}
              </Field>
            )}
          </div>
          <Field label="New position (optional)" hint="Only if the raise comes with a new title.">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={100}
                value={position}
                onChange={(event) => setPosition(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        </>
      )}
      <Field label="Note (optional)">
        {(props) => (
          <input
            {...props}
            type="text"
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      {outcome === 'APPROVED' && (
        <p className="text-xs text-slate-600">
          The new pay goes into the history from that day, and the rota’s cost uses it from then.
          ADP is not changed: enter it there too.
        </p>
      )}
      {problem && <Alert>{problem}</Alert>}
      <FormButtons
        busy={busy}
        label={
          outcome === 'OFFERED' ? 'Save the offer' : outcome === 'APPROVED' ? 'Approve' : 'Save'
        }
        onCancel={onCancel}
      />
    </form>
  );
}

function UnitField({
  value,
  onChange,
}: {
  value: PayRateUnit;
  onChange: (unit: PayRateUnit) => void;
}) {
  return (
    <Field label="Per">
      {(props) => (
        <select
          {...props}
          value={value}
          onChange={(event) => onChange(event.target.value as PayRateUnit)}
          className={inputClass}
        >
          <option value="HOURLY">Hour</option>
          <option value="YEARLY">Year</option>
        </select>
      )}
    </Field>
  );
}

function FormButtons({
  busy,
  label,
  onCancel,
}: {
  busy: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
        {busy ? 'Saving…' : label}
      </button>
      <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- leaving

function LeavingSection({
  person,
  onChanged,
}: {
  person: PayPerson;
  onChanged: (person: PayPerson) => void;
}) {
  const [kind, setKind] = useState<LeavingKind | ''>(person.leaving.kind ?? '');
  const [reason, setReason] = useState(person.leaving.reason ?? '');
  const [paycheck, setPaycheck] = useState(person.leaving.lastPaycheckOn ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <Card className="p-4" testId="leaving">
      <h2 className="text-base font-semibold text-slate-900">Leaving</h2>
      <dl className="mt-2 grid gap-1 text-sm">
        <Row term="Last day">
          {person.terminationDate ? formatCalendarDate(person.terminationDate) : '-'}
        </Row>
        <Row term="Last position">{person.current.position?.value ?? '-'}</Row>
        <Row term="Last pay">
          {person.current.pay ? formatPay(person.current.pay.rate, person.current.pay.unit) : '-'}
        </Row>
        <Row term="Exit checklist">
          <ExitChecklistLine
            employeeId={person.id}
            progress={person.exitChecklist}
            lastDay={person.terminationDate}
            onStarted={() => void api.payPerson(person.id).then(onChanged)}
          />
        </Row>
      </dl>
      <form
        aria-label="Leaving details"
        className="mt-3 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setProblem(null);
          setSaved(false);
          try {
            onChanged(
              await api.updateLeaving(person.id, {
                kind: kind || null,
                reason: reason.trim() || null,
                lastPaycheckOn: paycheck || null,
              }),
            );
            setSaved(true);
          } catch (err) {
            setProblem(err instanceof ApiError ? err.message : 'Could not save that.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="How they left">
            {(props) => (
              <select
                {...props}
                value={kind}
                onChange={(event) => setKind(event.target.value as LeavingKind | '')}
                className={inputClass}
              >
                <option value="">Not recorded</option>
                {Object.entries(LEAVING_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Last paycheck">
            {(props) => (
              <input
                {...props}
                type="date"
                value={paycheck}
                onChange={(event) => setPaycheck(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        </div>
        <Field label="Reason" hint="A line, for the practice's own record. No documents.">
          {(props) => (
            <input
              {...props}
              type="text"
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        {problem && <Alert>{problem}</Alert>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            {busy ? 'Saving…' : 'Save leaving details'}
          </button>
          {saved && <span className="text-sm text-emerald-700">Saved.</span>}
        </div>
        {person.leaving.updatedBy && person.leaving.updatedAt && (
          <p className="text-xs text-slate-500">
            Last changed by {person.leaving.updatedBy},{' '}
            {formatPracticeDateTime(person.leaving.updatedAt)}
          </p>
        )}
      </form>
    </Card>
  );
}
