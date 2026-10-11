import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { ScheduleTabs } from '../components/ScheduleTabs';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { canSeeOnCall, clockWords, entryWords, WEEKDAYS } from '../lib/on-call';
import { formatPracticeDateTime, practiceDate } from '../lib/practice-time';
import { useIsManager, useSession } from '../lib/session';
import { useIsPhone } from '../lib/use-is-phone';
import type { OnCallDay, OnCallPerson, OnCallRota, OnCallSchedule, OnCallSwap } from '../lib/types';

/**
 * The provider on-call schedule (October 2026, Dominguez: "provider on call
 * schedule will def be needed"). Who takes the after-hours calls, a day at a
 * time — noon to noon, the answering service's day. A usual pattern by
 * weekday with exceptions ("every weekend except the 4th"), changed for one
 * day by a manager, or swapped between providers: one asks, the other says
 * yes. Providers, managers and admins only. Never hours or pay.
 */
export function OnCallPage() {
  const { employee } = useSession();
  const isManager = useIsManager();
  const [month, setMonth] = useState(() => practiceDate().slice(0, 7));
  const [schedule, setSchedule] = useState<OnCallSchedule | null>(null);
  const [swaps, setSwaps] = useState<OnCallSwap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opened, setOpened] = useState<OnCallDay | null>(null);
  const [generation, setGeneration] = useState(0);
  const reload = () => setGeneration((n) => n + 1);

  const range = useMemo(() => monthRange(month), [month]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.onCall(range.from, range.to), api.onCallSwaps()])
      .then(([found, swapList]) => {
        if (cancelled) return;
        setSchedule(found);
        setSwaps(swapList);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load it.');
      });
    return () => {
      cancelled = true;
    };
  }, [range, generation]);

  if (!canSeeOnCall(employee)) {
    return (
      <div className="max-w-3xl">
        <PageHeading title="On call" />
        <Alert tone="info">The on-call schedule is for providers and managers.</Alert>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      <ScheduleTabs />
      <PageHeading
        title="On call"
        subtitle="Which provider takes the after-hours calls. Each day’s turn runs from noon to noon the next day."
      />
      {error && <Alert>{error}</Alert>}
      {notice && (
        <Alert tone="success">
          <span role="status">{notice}</span>
        </Alert>
      )}
      {!schedule ? (
        error ? null : (
          <Spinner />
        )
      ) : (
        <>
          <NowCard schedule={schedule} me={employee?.id ?? null} />
          <SwapList
            swaps={swaps}
            me={employee?.id ?? ''}
            onChanged={(message) => {
              setNotice(message);
              reload();
            }}
            onError={setError}
          />
          <MonthView
            month={month}
            onMonth={setMonth}
            days={schedule.days}
            me={employee?.id ?? null}
            onOpen={setOpened}
          />
          <PatternCard
            providers={schedule.providers}
            canEdit={isManager}
            onSaved={(message) => {
              setNotice(message);
              reload();
            }}
          />
          <p className="text-sm text-slate-600">
            Put your own on-call days on your phone: <strong>Schedule → Calendar</strong> →{' '}
            <strong>Separate calendars</strong> → <strong>My on call</strong>.
          </p>
        </>
      )}
      {opened && schedule && (
        <DayDialog
          day={opened}
          providers={schedule.providers}
          me={employee?.id ?? ''}
          canChange={isManager}
          onClose={() => setOpened(null)}
          onDone={(message) => {
            setOpened(null);
            setNotice(message);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- now

function NowCard({ schedule, me }: { schedule: OnCallSchedule; me: string | null }) {
  const { now } = schedule;
  const mine = now.employee?.id === me;
  return (
    <Card className="flex items-center gap-4 p-4" testId="on-call-now">
      {now.employee ? <Avatar person={now.employee} size="lg" /> : null}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">On call now</p>
        <p className="text-lg font-semibold text-slate-900">
          {now.employee ? (mine ? 'You' : now.employee.name) : 'Nobody is set'}
        </p>
        <p className="text-sm text-slate-600">until {formatPracticeDateTime(now.until)}</p>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ swaps

function SwapList({
  swaps,
  me,
  onChanged,
  onError,
}: {
  swaps: OnCallSwap[];
  me: string;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const pending = swaps.filter((swap) => swap.status === 'PENDING');
  if (pending.length === 0) return null;

  async function answer(swap: OnCallSwap, how: 'accept' | 'decline' | 'cancel') {
    try {
      await api.answerOnCallSwap(swap.id, how);
      onChanged(
        how === 'accept'
          ? `Done — you are on call ${day(swap.giveDate)}.`
          : how === 'decline'
            ? 'Said no. They have been told.'
            : 'Taken back.',
      );
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not do that.');
    }
  }

  return (
    <section aria-labelledby="on-call-swaps" className="space-y-2">
      <h2 id="on-call-swaps" className="text-base font-semibold text-slate-900">
        Swaps waiting for an answer
      </h2>
      <ul className="space-y-2">
        {pending.map((swap) => {
          const toMe = swap.partner.id === me;
          const fromMe = swap.requester.id === me;
          return (
            <li key={swap.id}>
              <Card className="flex flex-wrap items-center gap-3 p-3" testId={`swap-${swap.id}`}>
                <p className="flex-1 text-sm text-slate-800">
                  {fromMe ? 'You asked' : swap.requester.name + ' asks'}{' '}
                  {toMe ? 'you' : swap.partner.name} to take <strong>{day(swap.giveDate)}</strong>
                  {swap.takeDate && (
                    <>
                      {' '}
                      — and {fromMe ? 'you take' : 'takes'} <strong>{day(swap.takeDate)}</strong>{' '}
                      back
                    </>
                  )}
                  .{swap.note && <span className="text-slate-600"> “{swap.note}”</span>}
                </p>
                {toMe && (
                  <>
                    <button
                      type="button"
                      onClick={() => void answer(swap, 'accept')}
                      className={buttonClass('primary', 'sm')}
                    >
                      Yes, swap
                    </button>
                    <button
                      type="button"
                      onClick={() => void answer(swap, 'decline')}
                      className={buttonClass('secondary', 'sm')}
                    >
                      No, I can’t
                    </button>
                  </>
                )}
                {fromMe && (
                  <button
                    type="button"
                    onClick={() => void answer(swap, 'cancel')}
                    className={buttonClass('secondary', 'sm')}
                  >
                    Take it back
                  </button>
                )}
                {!toMe && !fromMe && <Badge tone="warning">Waiting for {swap.partner.name}</Badge>}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ month

function MonthView({
  month,
  onMonth,
  days,
  me,
  onOpen,
}: {
  month: string;
  onMonth: (month: string) => void;
  days: OnCallDay[];
  me: string | null;
  onOpen: (day: OnCallDay) => void;
}) {
  const isPhone = useIsPhone();
  const today = practiceDate();
  const heading = new Date(`${month}-01T12:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
  const lead = new Date(`${month}-01T12:00:00Z`).getUTCDay(); // Sunday first

  const cell = (entry: OnCallDay) => {
    const mine = entry.employee?.id === me;
    return (
      <button
        type="button"
        key={entry.date}
        onClick={() => onOpen(entry)}
        data-testid={`on-call-${entry.date}`}
        className={`flex min-h-[4.5rem] w-full flex-col items-start rounded-lg p-2 text-left ring-1 ring-inset hover:ring-brand-400 ${
          entry.date === today ? 'ring-2 ring-brand-600' : 'ring-slate-200'
        } ${mine ? 'bg-brand-50' : 'bg-white'}`}
      >
        <span className="text-xs text-slate-500">
          {isPhone
            ? formatCalendarDate(entry.date, { year: false })
            : Number(entry.date.slice(8, 10))}
        </span>
        <span className="text-sm font-medium text-slate-900">
          {entry.employee ? shortName(entry.employee) : '—'}
        </span>
        {entry.source === 'SWAPPED' && <span className="text-xs text-amber-700">↔ swapped</span>}
        {entry.source === 'CHANGED' && <span className="text-xs text-amber-700">✎ changed</span>}
      </button>
    );
  };

  return (
    <section aria-labelledby="on-call-month" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onMonth(shiftMonth(month, -1))}
          className={buttonClass('secondary', 'sm')}
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => onMonth(practiceDate().slice(0, 7))}
          className={buttonClass('secondary', 'sm')}
        >
          This month
        </button>
        <button
          type="button"
          onClick={() => onMonth(shiftMonth(month, 1))}
          className={buttonClass('secondary', 'sm')}
        >
          Next →
        </button>
      </div>
      <h2 id="on-call-month" className="text-2xl font-semibold text-slate-900">
        {heading}
      </h2>
      {isPhone ? (
        <ul className="space-y-1.5">
          {days.map((entry) => (
            <li key={entry.date}>{cell(entry)}</li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS_SUNDAY_FIRST.map((name) => (
            <div key={name} className="px-1 text-xs font-medium text-slate-500">
              {name}
            </div>
          ))}
          {Array.from({ length: lead }, (_, index) => (
            <div key={`lead-${index}`} />
          ))}
          {days.map(cell)}
        </div>
      )}
      <p className="text-xs text-slate-500">
        Press a day to {me ? 'ask to swap one of yours, or ' : ''}see more. ↔ swapped between
        providers · ✎ changed by a manager.
      </p>
    </section>
  );
}

const WEEKDAYS_SUNDAY_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// -------------------------------------------------------------- one day

function DayDialog({
  day: entry,
  providers,
  me,
  canChange,
  onClose,
  onDone,
}: {
  day: OnCallDay;
  providers: OnCallPerson[];
  me: string;
  canChange: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const mine = entry.employee?.id === me;
  const future = entry.date >= practiceDate();
  const [who, setWho] = useState(entry.employee?.id ?? '');
  const [note, setNote] = useState(entry.note ?? '');
  const [swapNote, setSwapNote] = useState('');
  const [partner, setPartner] = useState('');
  const [takeDate, setTakeDate] = useState('');
  const [partnerDays, setPartnerDays] = useState<OnCallDay[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Their days in the next two months, to offer one back.
  useEffect(() => {
    if (!partner) {
      setPartnerDays([]);
      return;
    }
    const from = practiceDate();
    const to = addDays(from, 62);
    api
      .onCall(from, to)
      .then((found) => setPartnerDays(found.days.filter((d) => d.employee?.id === partner)))
      .catch(() => setPartnerDays([]));
  }, [partner]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not do that.');
      setBusy(false);
    }
  }

  return (
    <Modal title={`On call ${day(entry.date)}`} onClose={onClose} testId="on-call-day">
      <p className="text-sm text-slate-700">
        <strong>{entry.employee ? entry.employee.name : 'Nobody is set'}</strong>, from{' '}
        {clockWords(entry.changesAt)} {day(entry.date)} to {clockWords(entry.changesAt)} the next
        day.
        {entry.source === 'SWAPPED' && ' Swapped between providers.'}
        {entry.source === 'CHANGED' && ' Changed by a manager.'}
      </p>
      {entry.note && <p className="mt-1 text-sm text-slate-600">“{entry.note}”</p>}

      {mine && future && (
        <form
          className="mt-4 space-y-3 border-t border-slate-100 pt-4"
          aria-label="Ask to swap"
          onSubmit={(event) => {
            event.preventDefault();
            if (!partner) return;
            void run(
              () =>
                api.askOnCallSwap({
                  giveDate: entry.date,
                  partnerId: partner,
                  takeDate: takeDate || null,
                  note: swapNote.trim() || undefined,
                }),
              'Asked. They have been told, and you will hear when they answer.',
            );
          }}
        >
          <h3 className="text-sm font-semibold text-slate-900">Ask another provider to take it</h3>
          <Field label="Who">
            {(props) => (
              <select
                {...props}
                required
                value={partner}
                onChange={(event) => {
                  setPartner(event.target.value);
                  setTakeDate('');
                }}
                className={inputClass}
              >
                <option value="">Choose a provider…</option>
                {providers
                  .filter((p) => p.id !== me)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          {partner && (
            <Field label="And you take one of theirs" hint="Optional — or they simply cover.">
              {(props) => (
                <select
                  {...props}
                  value={takeDate}
                  onChange={(event) => setTakeDate(event.target.value)}
                  className={inputClass}
                >
                  <option value="">No, just cover</option>
                  {partnerDays.map((d) => (
                    <option key={d.date} value={d.date}>
                      {day(d.date)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label="Note" hint="Optional.">
            {(props) => (
              <input
                {...props}
                maxLength={200}
                value={swapNote}
                onChange={(event) => setSwapNote(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <button
            type="submit"
            disabled={busy || !partner}
            className={buttonClass('primary', 'sm')}
          >
            {busy ? 'Asking…' : 'Ask them'}
          </button>
        </form>
      )}

      {canChange && (
        <form
          className="mt-4 space-y-3 border-t border-slate-100 pt-4"
          aria-label="Change this day"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                api.setOnCallDay(entry.date, {
                  employeeId: who || null,
                  note: note.trim() || undefined,
                }),
              `Saved. ${day(entry.date)} is changed.`,
            );
          }}
        >
          <h3 className="text-sm font-semibold text-slate-900">Change this day</h3>
          <Field label="On call">
            {(props) => (
              <select
                {...props}
                value={who}
                onChange={(event) => setWho(event.target.value)}
                className={inputClass}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Note" hint="Optional — “covering Dr. D’s vacation”.">
            {(props) => (
              <input
                {...props}
                maxLength={200}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !who} className={buttonClass('primary', 'sm')}>
              Save
            </button>
            {(entry.source === 'CHANGED' || entry.source === 'SWAPPED') && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api.setOnCallDay(entry.date, { employeeId: null }),
                    `${day(entry.date)} is back to the usual.`,
                  )
                }
                className={buttonClass('secondary', 'sm')}
              >
                Back to the usual
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Whoever it moves from and to is told on the bell and by email.
          </p>
        </form>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Modal>
  );
}

// --------------------------------------------------------------- pattern

interface DraftEntry {
  weekday: number;
  weekOfMonth: number;
  employeeId: string;
}

function PatternCard({
  providers,
  canEdit,
  onSaved,
}: {
  providers: OnCallPerson[];
  canEdit: boolean;
  onSaved: (message: string) => void;
}) {
  const confirm = useConfirm();
  const [rotas, setRotas] = useState<OnCallRota[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .onCallRotas()
      .then(setRotas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load it.'));
  }, []);
  useEffect(load, [load]);

  if (!rotas) return null;
  const inForce = rotas.find((rota) => rota.inForce) ?? null;
  const later = rotas.filter((rota) => !rota.inForce);

  return (
    <Card className="p-4" testId="on-call-pattern">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">The usual pattern</h2>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={buttonClass('secondary', 'sm')}
          >
            {inForce ? 'Change it' : 'Set it'}
          </button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {editing ? (
        <PatternEditor
          from={inForce ?? later[0] ?? null}
          providers={providers}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setRotas(saved);
            setEditing(false);
            onSaved('Saved. The providers have been told.');
          }}
        />
      ) : (
        <>
          {inForce ? (
            <PatternWords rota={inForce} />
          ) : (
            <EmptyState>No usual pattern yet.</EmptyState>
          )}
          {later.map((rota) => (
            <div key={rota.startsOn} className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-sm font-medium text-slate-900">From {day(rota.startsOn)}:</p>
              <PatternWords rota={rota} />
              {canEdit && (
                <button
                  type="button"
                  onClick={async () => {
                    const sure = await confirm({
                      title: `Take back the pattern from ${day(rota.startsOn)}?`,
                      body: 'The one in force now carries on.',
                      confirmLabel: 'Yes, take it back',
                      cancelLabel: 'Keep it',
                    });
                    if (!sure) return;
                    try {
                      setRotas(await api.removeOnCallRota(rota.startsOn));
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : 'Could not do that.');
                    }
                  }}
                  className="mt-1 text-sm font-medium text-slate-500 hover:text-rose-700"
                >
                  Take it back
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

function PatternWords({ rota }: { rota: OnCallRota }) {
  const every = rota.entries.filter((entry) => entry.weekOfMonth === 0);
  const except = rota.entries.filter((entry) => entry.weekOfMonth !== 0);
  return (
    <div className="mt-2 text-sm text-slate-700" data-testid="pattern-words">
      <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
        {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
          const entry = every.find((e) => e.weekday === weekday);
          return (
            <li key={weekday}>
              <span className="inline-block w-24 text-slate-500">{WEEKDAYS[weekday]}</span>
              {entry ? entry.employee.name : '—'}
            </li>
          );
        })}
      </ul>
      {except.length > 0 && (
        <p className="mt-2">
          Except:{' '}
          {except
            .map(
              (entry) =>
                `${entry.employee.name} on ${entryWords(entry.weekday, entry.weekOfMonth)}`,
            )
            .join('; ')}
          .
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Turns hand over at {clockWords(rota.changesAt)}. Weekends are counted by their Saturday: the
        4th weekend is the 4th Saturday and the Sunday after it.
      </p>
    </div>
  );
}

function PatternEditor({
  from,
  providers,
  onCancel,
  onSaved,
}: {
  from: OnCallRota | null;
  providers: OnCallPerson[];
  onCancel: () => void;
  onSaved: (rotas: OnCallRota[]) => void;
}) {
  const [startsOn, setStartsOn] = useState(practiceDate());
  const [changesAt, setChangesAt] = useState(from?.changesAt ?? '12:00');
  const [weekly, setWeekly] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7].map((weekday) => [
        weekday,
        from?.entries.find((e) => e.weekday === weekday && e.weekOfMonth === 0)?.employee.id ?? '',
      ]),
    ),
  );
  const [exceptions, setExceptions] = useState<DraftEntry[]>(
    () =>
      from?.entries
        .filter((e) => e.weekOfMonth !== 0)
        .map((e) => ({
          weekday: e.weekday,
          weekOfMonth: e.weekOfMonth,
          employeeId: e.employee.id,
        })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const entries: DraftEntry[] = [
      ...Object.entries(weekly)
        .filter(([, employeeId]) => employeeId)
        .map(([weekday, employeeId]) => ({ weekday: Number(weekday), weekOfMonth: 0, employeeId })),
      ...exceptions.filter((e) => e.employeeId),
    ];
    setBusy(true);
    try {
      onSaved(await api.saveOnCallRota({ startsOn, changesAt, entries }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save it.');
      setBusy(false);
    }
  }

  const providerSelect = (value: string, onChange: (value: string) => void, label: string) => (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    >
      <option value="">Nobody</option>
      {providers.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <form
      onSubmit={(event) => void save(event)}
      className="mt-3 space-y-4"
      aria-label="The usual pattern"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {[1, 2, 3, 4, 5, 6, 7].map((weekday) => (
          <label key={weekday} className="flex items-center gap-2 text-sm">
            <span className="w-24 shrink-0 text-slate-700">{WEEKDAYS[weekday]}s</span>
            {providerSelect(
              weekly[weekday] ?? '',
              (value) => setWeekly((current) => ({ ...current, [weekday]: value })),
              `${WEEKDAYS[weekday]}s`,
            )}
          </label>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Except</h3>
        <p className="text-xs text-slate-500">
          A week of the month that goes to somebody else — the 4th Saturday and Sunday, say.
          Weekends are counted by their Saturday.
        </p>
        <ul className="mt-2 space-y-2">
          {exceptions.map((entry, index) => (
            <li
              key={index}
              className="flex flex-wrap items-center gap-2"
              data-testid="pattern-exception"
            >
              <select
                aria-label="Which week"
                value={entry.weekOfMonth}
                onChange={(event) =>
                  setExceptions((all) =>
                    all.map((e, i) =>
                      i === index ? { ...e, weekOfMonth: Number(event.target.value) } : e,
                    ),
                  )
                }
                className={`${inputClass} w-28`}
              >
                <option value={1}>1st</option>
                <option value={2}>2nd</option>
                <option value={3}>3rd</option>
                <option value={4}>4th</option>
                <option value={-1}>Last</option>
              </select>
              <select
                aria-label="Which day"
                value={entry.weekday}
                onChange={(event) =>
                  setExceptions((all) =>
                    all.map((e, i) =>
                      i === index ? { ...e, weekday: Number(event.target.value) } : e,
                    ),
                  )
                }
                className={`${inputClass} w-36`}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((weekday) => (
                  <option key={weekday} value={weekday}>
                    {WEEKDAYS[weekday]}
                  </option>
                ))}
              </select>
              <span className="text-sm text-slate-600">→</span>
              <div className="min-w-[12rem] flex-1">
                {providerSelect(
                  entry.employeeId,
                  (value) =>
                    setExceptions((all) =>
                      all.map((e, i) => (i === index ? { ...e, employeeId: value } : e)),
                    ),
                  'Who',
                )}
              </div>
              <button
                type="button"
                onClick={() => setExceptions((all) => all.filter((_, i) => i !== index))}
                className="text-sm font-medium text-slate-500 hover:text-rose-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setExceptions((all) => [...all, { weekday: 6, weekOfMonth: 4, employeeId: '' }])
          }
          className={`mt-2 ${buttonClass('secondary', 'sm')}`}
        >
          + Add an exception
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Turns hand over at" hint="The answering service’s day: noon to noon.">
          {(props) => (
            <input
              {...props}
              type="time"
              required
              value={changesAt}
              onChange={(event) => setChangesAt(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="From" hint="Today or later. Days before stay as they were.">
          {(props) => (
            <input
              {...props}
              type="date"
              required
              min={practiceDate()}
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
          {busy ? 'Saving…' : 'Save the pattern'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- helpers

function monthRange(month: string) {
  const from = `${month}-01`;
  const next = shiftMonth(month, 1);
  return { from, to: addDays(`${next}-01`, -1) };
}

function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function day(date: string): string {
  return formatCalendarDate(date, { year: false });
}

/// "Dr. Dominguez" — short enough for a calendar square.
function shortName(person: OnCallPerson): string {
  return person.name.startsWith('Dr. ')
    ? `Dr. ${person.lastName}`
    : `${person.preferredName ?? person.firstName} ${person.lastName[0]}`;
}
