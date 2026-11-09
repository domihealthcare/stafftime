import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/ConfirmDialog';
import { CoverDialog, OverrideForm } from '../components/call-routing/CoverDialog';
import { PhoneLineSettings } from '../components/call-routing/PhoneLineSettings';
import { RecentCalls } from '../components/call-routing/RecentCalls';
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
import { overrideRange, overrideTouches } from '../lib/call-routing';
import { addCalendarDays } from '../lib/dates';
import { formatCalendarDate } from '../lib/format';
import { canSeeOnCall, clockWords, entryWords, WEEKDAYS } from '../lib/on-call';
import { formatPracticeDateTime, practiceDate } from '../lib/practice-time';
import { useIsManager, useSession } from '../lib/session';
import { useIsPhone } from '../lib/use-is-phone';
import type {
  OnCallCover,
  OnCallDay,
  OnCallPerson,
  OnCallRota,
  OnCallSchedule,
  OnCallSwap,
} from '../lib/types';

/**
 * The provider on-call schedule (October 2026, Dominguez: "provider on call
 * schedule will def be needed"). Who takes the after-hours calls, a day at a
 * time - from the hand-over time (6 AM) to the same time next day. A usual pattern by
 * weekday with exceptions ("every weekend except the 4th"), changed for one
 * day by a manager, overridden for part of a day, or swapped between providers: one asks, the other says
 * yes. Providers, managers and admins only. Never hours or pay.
 */
export function OnCallPage() {
  const { employee } = useSession();
  const isManager = useIsManager();
  const [month, setMonth] = useState(() => practiceDate().slice(0, 7));
  const [schedule, setSchedule] = useState<OnCallSchedule | null>(null);
  const [swaps, setSwaps] = useState<OnCallSwap[]>([]);
  const [covers, setCovers] = useState<OnCallCover[]>([]);
  const [editing, setEditing] = useState<OnCallCover | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opened, setOpened] = useState<OnCallDay | null>(null);
  const [generation, setGeneration] = useState(0);
  const reload = () => setGeneration((n) => n + 1);

  const range = useMemo(() => monthRange(month), [month]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.onCall(range.from, range.to),
      api.onCallSwaps(),
      api.onCallCovers(range.from, range.to),
    ])
      .then(([found, swapList, coverList]) => {
        if (cancelled) return;
        setSchedule(found);
        setSwaps(swapList);
        setCovers(coverList);
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
    <div className="mx-auto max-w-6xl">
      <PageHeading
        title="On call"
        subtitle="Which provider takes the on-call line's calls. Each day’s turn runs from the hand-over time (6 AM) to the same time the next day."
      />
      <ScheduleTabs />
      <div className="space-y-5">
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
              covers={covers}
            />
            <OverridesList
              covers={covers}
              canEdit={isManager}
              onEdit={setEditing}
              onChanged={(message) => {
                setNotice(message);
                reload();
              }}
              onError={setError}
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
        <FoldedSection id="calls" title="Recent calls">
          <RecentCalls />
        </FoldedSection>
        {isManager && (
          <FoldedSection id="phone-line" title="Phone line settings">
            <PhoneLineSettings />
          </FoldedSection>
        )}
        {editing && schedule && (
          <CoverDialog
            date={editing.startsLocal.slice(0, 10)}
            cover={editing}
            providers={schedule.providers}
            onClose={() => setEditing(null)}
            onSaved={(message) => {
              setEditing(null);
              setNotice(message);
              reload();
            }}
          />
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
    </div>
  );
}

// ------------------------------------------------------- folded sections

/** A section that starts closed and opens when the address ends in its #id. */
function FoldedSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  const { hash } = useLocation();
  const wanted = hash === `#${id}`;
  const [open, setOpen] = useState(wanted);
  useEffect(() => {
    if (!wanted) return;
    setOpen(true);
    document.getElementById(id)?.scrollIntoView?.();
  }, [wanted, id]);
  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <summary className="cursor-pointer text-lg font-semibold text-slate-900">{title}</summary>
      {open && children}
    </details>
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
          ? `Done - you are on call ${days(gives(swap))}.`
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
                  {toMe ? 'you' : swap.partner.name} to take <strong>{days(gives(swap))}</strong>
                  {takes(swap).length > 0 && (
                    <>
                      {' '}
                      - and {fromMe ? 'you take' : 'takes'} <strong>{days(takes(swap))}</strong>{' '}
                      back
                    </>
                  )}
                  .{swap.note && <span className="text-slate-600"> “{swap.note}”</span>}
                  {fromMe && (
                    <span className="block text-xs text-slate-500">
                      Nothing changes until {swap.partner.name} says yes.
                    </span>
                  )}
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
  covers,
}: {
  month: string;
  onMonth: (month: string) => void;
  days: OnCallDay[];
  me: string | null;
  onOpen: (day: OnCallDay) => void;
  covers: OnCallCover[];
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
          {entry.employee ? shortName(entry.employee) : '-'}
        </span>
        {entry.backup && (
          <span className="text-xs text-slate-600">Backup: {shortName(entry.backup)}</span>
        )}
        {entry.source === 'SWAPPED' && <span className="text-xs text-amber-700">↔ swapped</span>}
        {entry.source === 'CHANGED' && <span className="text-xs text-amber-700">✎ changed</span>}
        {covers
          .filter((cover) => overrideTouches(cover, entry.date))
          .map((cover) => {
            const starts = cover.startsLocal.slice(0, 10) === entry.date;
            return (
              <span
                key={cover.id}
                data-testid={`override-mark-${entry.date}`}
                className="text-xs text-violet-700"
              >
                {starts
                  ? `${clockWords(cover.startsLocal.slice(11, 16))}-${clockWords(cover.endsLocal.slice(11, 16))}: ${shortName(cover.employee)}`
                  : `+ override: ${shortName(cover.employee)}`}
              </span>
            );
          })}
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
        Press a day to {me ? 'ask another provider to take yours, or ' : ''}see more. ↔ swapped
        between providers · ✎ changed by a manager · purple: an override for part of a day.
      </p>
    </section>
  );
}

const WEEKDAYS_SUNDAY_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// -------------------------------------------------------------- one day

type DayAction = 'ask' | 'change' | 'part';

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
  const canAsk = mine && future;
  // What can be done from here. With only one, it opens at once; with more,
  // the pop-up shows the choices first and only the chosen one's form, so
  // asking a colleague is never mistaken for changing the day (Dominguez,
  // November 2026).
  const actions: DayAction[] = [
    ...(canAsk ? (['ask'] as const) : []),
    ...(canChange ? (['change', 'part'] as const) : []),
  ];
  const [action, setAction] = useState<DayAction | null>(actions.length === 1 ? actions[0] : null);

  return (
    <Modal title={`On call ${day(entry.date)}`} onClose={onClose} testId="on-call-day">
      <p className="text-sm text-slate-700">
        <strong>{entry.employee ? entry.employee.name : 'Nobody is set'}</strong>, from{' '}
        {clockWords(entry.changesAt)} {day(entry.date)} to {clockWords(entry.changesAt)} the next
        day.
        {entry.source === 'SWAPPED' && ' Swapped between providers.'}
        {entry.source === 'CHANGED' && ' Changed by a manager.'}
      </p>
      {entry.backup && <p className="mt-1 text-sm text-slate-700">Backup: {entry.backup.name}</p>}
      {entry.note && <p className="mt-1 text-sm text-slate-600">“{entry.note}”</p>}

      {actions.length > 1 && action === null && (
        <div
          className="mt-4 space-y-2 border-t border-slate-100 pt-4"
          role="group"
          aria-label="What would you like to do?"
        >
          <p className="text-sm font-semibold text-slate-900">What would you like to do?</p>
          {actions.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => setAction(choice)}
              className="block w-full rounded-lg border border-slate-200 p-3 text-left hover:border-brand-400 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <span className="block text-sm font-semibold text-slate-900">
                {ACTION_WORDS[choice].label}
              </span>
              <span className="block text-xs text-slate-600">{ACTION_WORDS[choice].hint}</span>
            </button>
          ))}
        </div>
      )}

      {action && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {actions.length > 1 && (
            <button
              type="button"
              onClick={() => setAction(null)}
              className="tap mb-2 text-sm text-brand-700 underline"
            >
              ← Something else
            </button>
          )}
          {action === 'ask' && (
            <AskToTakeForm entry={entry} providers={providers} me={me} onDone={onDone} />
          )}
          {action === 'change' && (
            <ChangeDaysForm entry={entry} providers={providers} onDone={onDone} />
          )}
          {action === 'part' && (
            <>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Override part of the day
              </h3>
              <OverrideForm
                date={entry.date}
                cover={null}
                providers={providers}
                onCancel={() => (actions.length > 1 ? setAction(null) : onClose())}
                onSaved={onDone}
              />
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

const ACTION_WORDS: Record<DayAction, { label: string; hint: string }> = {
  ask: {
    label: 'Ask another provider to take it',
    hint: 'They are asked first. Nothing changes until they say yes.',
  },
  change: {
    label: 'Change who is on call',
    hint: 'Changes it straight away, for this day or several days in a row.',
  },
  part: {
    label: 'Change part of the day',
    hint: 'An override for some hours, like 6 PM to 6 AM.',
  },
};

/// The days within the next two months, to offer as more days to give or
/// take back.
function useComingDays() {
  const [found, setFound] = useState<OnCallDay[] | null>(null);
  useEffect(() => {
    const from = practiceDate();
    api
      .onCall(from, addCalendarDays(from, 62))
      .then((schedule) => setFound(schedule.days))
      .catch(() => setFound([]));
  }, []);
  return found;
}

function AskToTakeForm({
  entry,
  providers,
  me,
  onDone,
}: {
  entry: OnCallDay;
  providers: OnCallPerson[];
  me: string;
  onDone: (message: string) => void;
}) {
  const coming = useComingDays();
  const [partner, setPartner] = useState('');
  const [give, setGive] = useState<string[]>([entry.date]);
  const [take, setTake] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myDays = (coming ?? []).filter((d) => d.employee?.id === me).map((d) => d.date);
  if (!myDays.includes(entry.date)) myDays.unshift(entry.date);
  const theirDays = partner
    ? (coming ?? []).filter((d) => d.employee?.id === partner).map((d) => d.date)
    : [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!partner || give.length === 0) return;
    setBusy(true);
    setError(null);
    const gives = [...give].sort();
    const takes = [...take].sort();
    try {
      await api.askOnCallSwap({
        giveDate: gives[0],
        giveDates: gives,
        partnerId: partner,
        takeDate: takes[0] ?? null,
        takeDates: takes,
        note: note.trim() || undefined,
      });
      const name = providers.find((p) => p.id === partner)?.name ?? 'They';
      onDone(
        `Asked ${name} to take ${days(gives)}. Nothing changes until they say yes - you will hear when they answer.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not do that.');
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" aria-label="Ask to swap" onSubmit={(event) => void submit(event)}>
      <h3 className="text-sm font-semibold text-slate-900">Ask another provider to take it</h3>
      <p className="text-xs text-slate-600">
        This sends them a request. The schedule changes only when they press Yes, swap.
      </p>
      <Field label="Who">
        {(props) => (
          <select
            {...props}
            required
            value={partner}
            onChange={(event) => {
              setPartner(event.target.value);
              setTake([]);
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
      <DayTicks
        legend="Your days for them to take"
        hint="Tick as many as you need."
        dates={myDays}
        chosen={give}
        onChange={setGive}
        loading={coming === null}
        testId="swap-give-days"
      />
      {partner && (
        <DayTicks
          legend="And you take some of theirs back"
          hint="Optional - leave them all unticked and they simply cover."
          dates={theirDays}
          chosen={take}
          onChange={setTake}
          loading={coming === null}
          empty="They have no on-call days in the next two months."
          testId="swap-take-days"
        />
      )}
      <Field label="Note" hint="Optional.">
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
      <button
        type="submit"
        disabled={busy || !partner || give.length === 0}
        className={buttonClass('primary', 'sm')}
      >
        {busy ? 'Asking…' : 'Ask them'}
      </button>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}

/// A ticked list of on-call days.
function DayTicks({
  legend,
  hint,
  dates,
  chosen,
  onChange,
  loading,
  empty,
  testId,
}: {
  legend: string;
  hint: string;
  dates: string[];
  chosen: string[];
  onChange: (dates: string[]) => void;
  loading: boolean;
  empty?: string;
  testId: string;
}) {
  return (
    <fieldset data-testid={testId}>
      <legend className="text-sm font-medium text-slate-800">{legend}</legend>
      <p className="text-xs text-slate-500">{hint}</p>
      {loading ? (
        <p className="mt-1 text-xs text-slate-500">Loading your days…</p>
      ) : dates.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">{empty}</p>
      ) : (
        <div className="mt-1 grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
          {dates.map((date) => (
            <label key={date} className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                data-testid={`${testId}-${date}`}
                checked={chosen.includes(date)}
                onChange={(event) =>
                  onChange(
                    event.target.checked ? [...chosen, date] : chosen.filter((d) => d !== date),
                  )
                }
              />
              {day(date)}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function ChangeDaysForm({
  entry,
  providers,
  onDone,
}: {
  entry: OnCallDay;
  providers: OnCallPerson[];
  onDone: (message: string) => void;
}) {
  const [who, setWho] = useState(entry.employee?.id ?? '');
  const [backup, setBackup] = useState(entry.backup?.id ?? '');
  const [note, setNote] = useState(entry.note ?? '');
  const [until, setUntil] = useState(entry.date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = until && until > entry.date ? until : entry.date;
  const span = last === entry.date ? day(entry.date) : `${day(entry.date)} to ${day(last)}`;

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
    <form
      className="space-y-3"
      aria-label="Change this day"
      onSubmit={(event) => {
        event.preventDefault();
        void run(
          () =>
            api.setOnCallDay(entry.date, {
              employeeId: who || null,
              backupEmployeeId: who && backup && backup !== who ? backup : null,
              note: note.trim() || undefined,
              until: last,
            }),
          `Saved. ${span} changed.`,
        );
      }}
    >
      <h3 className="text-sm font-semibold text-slate-900">Change who is on call</h3>
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
      <Field
        label="Backup"
        hint="Optional. Rung instead when the provider on call has no number that can be dialled."
      >
        {(props) => (
          <select
            {...props}
            value={backup}
            onChange={(event) => setBackup(event.target.value)}
            className={inputClass}
          >
            <option value="">No backup</option>
            {providers
              .filter((p) => p.id !== who)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        )}
      </Field>
      <Field
        label="Last day"
        hint="Leave it on this day for one day, or pick a later day to change every day up to it."
      >
        {(props) => (
          <input
            {...props}
            type="date"
            min={entry.date}
            max={addCalendarDays(entry.date, 61)}
            value={until}
            onChange={(event) => setUntil(event.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      <Field label="Note" hint="Optional - “covering Dr. D’s vacation”.">
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
          {last === entry.date ? 'Save' : `Save ${datesBetweenCount(entry.date, last)} days`}
        </button>
        {(entry.source === 'CHANGED' || entry.source === 'SWAPPED' || last !== entry.date) && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () => api.setOnCallDay(entry.date, { employeeId: null, until: last }),
                `${span} back to the usual.`,
              )
            }
            className={buttonClass('secondary', 'sm')}
          >
            Back to the usual
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        This changes the schedule straight away. Whoever it moves from and to is told on the bell
        and by email.
      </p>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}

// --------------------------------------------------------------- pattern

interface DraftEntry {
  weekday: number;
  weekOfMonth: number;
  employeeId: string;
  backupEmployeeId: string;
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
              {entry ? entry.employee.name : '-'}
              {entry?.backup && (
                <span className="text-slate-500"> (Backup: {entry.backup.name})</span>
              )}
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
                `${entry.employee.name} on ${entryWords(entry.weekday, entry.weekOfMonth)}${
                  entry.backup ? ` (Backup: ${entry.backup.name})` : ''
                }`,
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
  const [changesAt, setChangesAt] = useState(from?.changesAt ?? '06:00');
  const [weekly, setWeekly] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7].map((weekday) => [
        weekday,
        from?.entries.find((e) => e.weekday === weekday && e.weekOfMonth === 0)?.employee.id ?? '',
      ]),
    ),
  );
  const [weeklyBackup, setWeeklyBackup] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7].map((weekday) => [
        weekday,
        from?.entries.find((e) => e.weekday === weekday && e.weekOfMonth === 0)?.backup?.id ?? '',
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
          backupEmployeeId: e.backup?.id ?? '',
        })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const entries = [
      ...Object.entries(weekly)
        .filter(([, employeeId]) => employeeId)
        .map(([weekday, employeeId]) => ({
          weekday: Number(weekday),
          weekOfMonth: 0,
          employeeId,
          backupEmployeeId: weeklyBackup[Number(weekday)] || null,
        })),
      ...exceptions
        .filter((e) => e.employeeId)
        .map((e) => ({ ...e, backupEmployeeId: e.backupEmployeeId || null })),
    ];
    setBusy(true);
    try {
      onSaved(await api.saveOnCallRota({ startsOn, changesAt, entries }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save it.');
      setBusy(false);
    }
  }

  const providerSelect = (
    value: string,
    onChange: (value: string) => void,
    label: string,
    none = 'Nobody',
    except = '',
  ) => (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    >
      <option value="">{none}</option>
      {providers
        .filter((p) => p.id !== except)
        .map((p) => (
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
          <div key={weekday} className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-slate-700">{WEEKDAYS[weekday]}s</span>
              {providerSelect(
                weekly[weekday] ?? '',
                (value) => setWeekly((current) => ({ ...current, [weekday]: value })),
                `${WEEKDAYS[weekday]}s`,
              )}
            </label>
            {weekly[weekday] && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Backup</span>
                {providerSelect(
                  weeklyBackup[weekday] ?? '',
                  (value) => setWeeklyBackup((current) => ({ ...current, [weekday]: value })),
                  `Backup for ${WEEKDAYS[weekday]}s`,
                  'No backup',
                  weekly[weekday],
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Except</h3>
        <p className="text-xs text-slate-500">
          A week of the month that goes to somebody else - the 4th Saturday and Sunday, say.
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
              {entry.employeeId && (
                <div className="flex min-w-[12rem] items-center gap-2">
                  <span className="text-sm text-slate-500">Backup</span>
                  {providerSelect(
                    entry.backupEmployeeId,
                    (value) =>
                      setExceptions((all) =>
                        all.map((e, i) => (i === index ? { ...e, backupEmployeeId: value } : e)),
                      ),
                    'Backup for this exception',
                    'No backup',
                    entry.employeeId,
                  )}
                </div>
              )}
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
            setExceptions((all) => [
              ...all,
              { weekday: 6, weekOfMonth: 4, employeeId: '', backupEmployeeId: '' },
            ])
          }
          className={`mt-2 ${buttonClass('secondary', 'sm')}`}
        >
          + Add an exception
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Turns hand over at"
          hint="Each turn runs from this time to the same time the next day (6 AM to start)."
        >
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

// -------------------------------------------------------------- overrides

function OverridesList({
  covers,
  canEdit,
  onEdit,
  onChanged,
  onError,
}: {
  covers: OnCallCover[];
  canEdit: boolean;
  onEdit: (cover: OnCallCover) => void;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const confirm = useConfirm();
  const now = Date.now();
  const live = covers.filter((cover) => Date.parse(cover.endsAt) > now);

  async function remove(cover: OnCallCover) {
    const sure = await confirm({
      title: `Remove the override for ${cover.employee.name}?`,
      body: 'The usual pattern takes over for that time again.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    try {
      await api.deleteOnCallCover(cover.id);
      onChanged('The override is removed.');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not remove it.');
    }
  }

  return (
    <section aria-labelledby="on-call-overrides" className="space-y-2">
      <h2 id="on-call-overrides" className="text-base font-semibold text-slate-900">
        Overrides
      </h2>
      {live.length === 0 ? (
        <EmptyState>
          No overrides this month.
          {canEdit && ' Press a day above and choose Change part of the day to add one.'}
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {live.map((cover) => (
            <li key={cover.id}>
              <Card className="flex flex-wrap items-center gap-3 p-3" testId={`cover-${cover.id}`}>
                <p className="min-w-0 flex-1 text-sm text-slate-800">
                  {overrideRange(cover.startsLocal, cover.endsLocal)}:{' '}
                  <strong>{cover.employee.name}</strong>
                  {cover.backup && <span> (backup {cover.backup.name})</span>}.
                  {cover.note && <span className="text-slate-600"> {cover.note}</span>}
                </p>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit(cover)}
                      className={buttonClass('secondary', 'sm')}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(cover)}
                      className="text-sm font-medium text-slate-500 hover:text-rose-700"
                    >
                      Remove
                    </button>
                  </>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- helpers

function monthRange(month: string) {
  const from = `${month}-01`;
  const next = shiftMonth(month, 1);
  return { from, to: addCalendarDays(`${next}-01`, -1) };
}

function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

/// The days a swap gives, and takes back (older swaps have only the one).
function gives(swap: OnCallSwap): string[] {
  return swap.giveDates?.length ? swap.giveDates : [swap.giveDate];
}

function takes(swap: OnCallSwap): string[] {
  return swap.takeDates?.length ? swap.takeDates : swap.takeDate ? [swap.takeDate] : [];
}

/// "Mon, Nov 9", "Mon, Nov 9 and Tue, Nov 10", or for four or more
/// "Mon, Nov 9 to Thu, Nov 12 (4 days)".
function days(dates: string[]): string {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length <= 1) return sorted.map(day).join('');
  if (sorted.length > 3) {
    return `${day(sorted[0])} to ${day(sorted[sorted.length - 1])} (${sorted.length} days)`;
  }
  return `${sorted.slice(0, -1).map(day).join(', ')} and ${day(sorted[sorted.length - 1])}`;
}

function datesBetweenCount(from: string, until: string): number {
  let count = 1;
  for (let d = from; d < until; d = addCalendarDays(d, 1)) count += 1;
  return count;
}

function day(date: string): string {
  return formatCalendarDate(date, { year: false });
}

/// "Dr. Dominguez" - short enough for a calendar square.
function shortName(person: OnCallPerson): string {
  return person.name.startsWith('Dr. ')
    ? `Dr. ${person.lastName}`
    : `${person.preferredName ?? person.firstName} ${person.lastName[0]}`;
}
