import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useConfirm } from '../components/ConfirmDialog';
import { DowntimeCheckSection } from '../components/DowntimeCheck';
import { DowntimeForms } from '../components/DowntimeForms';
import { DowntimeLogSection } from '../components/DowntimeLog';
import { DowntimeSetup } from '../components/DowntimeSetup';
import { Modal } from '../components/Modal';
import {
  Alert,
  Card,
  Field,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api, type Background } from '../lib/api';
import {
  CAUSE_OPTIONS,
  SYSTEM_OPTIONS,
  catchUpRule,
  contactsFor,
  downtimeChanged,
  likelyCause,
  minutesWords,
  practiceTimeWords,
  supportEmail,
} from '../lib/downtime';
import { atPracticeTime, formatPracticeDateTime, practiceDate } from '../lib/practice-time';
import { useIsManager, useSession } from '../lib/session';
import type {
  Downtime,
  DowntimeCause,
  DowntimeContact,
  DowntimeCurrent,
  DowntimeSystem,
  Location,
} from '../lib/types';
import { GuidePage } from './GuidePage';

type Tab = 'now' | 'procedures' | 'forms' | 'check' | 'log' | 'setup';

/**
 * Downtime (October 2026, Dominguez: "things that are needed or to do when
 * downtime happens (i.e. no access to EMR) ... activated by manager/admin and
 * then closed by them as well ... it should be clear and easy to use").
 *
 * **Now**: what is down, since when, and the updates; managers start one,
 * tick off who they called, post updates and close it. **What to do**: each
 * job's steps (a guide managers keep). **Forms**: the paper forms, printed.
 * **Monthly check**: the admin team's look at the stack. **Log** and
 * **Set-up**: managers'.
 */
export function DowntimePage() {
  const isManager = useIsManager();
  const [params, setParams] = useSearchParams();
  const [current, setCurrent] = useState<DowntimeCurrent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkAsked, setCheckAsked] = useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'now', label: 'Now' },
    { key: 'procedures', label: 'What to do' },
    { key: 'forms', label: 'Forms' },
    ...(checkAsked || isManager ? [{ key: 'check' as Tab, label: 'Monthly check' }] : []),
    ...(isManager
      ? [
          { key: 'log' as Tab, label: 'Log' },
          { key: 'setup' as Tab, label: 'Set-up' },
        ]
      : []),
  ];
  const asked = (params.get('tab') ?? 'now') as Tab;
  const tab = tabs.some((entry) => entry.key === asked) ? asked : 'now';

  /// `background` for the minute's look below: the screen asking by itself
  /// does not count as using the app (see `request`).
  const load = useCallback(async ({ background }: Background = {}) => {
    try {
      setCurrent(await api.downtimeCurrent({ background }));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the downtime.');
    }
  }, []);

  useEffect(() => {
    void load();
    api
      .myDowntimeCheck()
      .then((check) => setCheckAsked(check.asked))
      .catch(() => undefined);
    // Updates come in while it is on: look again every minute.
    const timer = window.setInterval(() => void load({ background: true }), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const choose = (next: Tab) => {
    const search = new URLSearchParams();
    if (next !== 'now') search.set('tab', next);
    setParams(search, { replace: false });
  };

  return (
    <div className="mx-auto max-w-4xl" data-testid="downtime-page">
      <PageHeading
        title="Downtime"
        subtitle="When eCW, the phones or the internet go down: what to do for your job, and the paper forms."
      />

      <nav
        aria-label="Downtime"
        className="mb-4 flex flex-wrap gap-1.5 border-b border-slate-200 pb-2"
      >
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-current={tab === entry.key ? 'page' : undefined}
            onClick={() => choose(entry.key)}
            className={`min-h-[40px] rounded-lg px-3 text-sm ${
              tab === entry.key
                ? 'bg-brand-600 font-semibold text-white'
                : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-100'
            }`}
          >
            {entry.label}
            {entry.key === 'now' && current && current.active.length > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                {current.active.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {tab === 'now' &&
        (current ? (
          <NowTab current={current} reload={load} onTab={choose} />
        ) : (
          !error && <Spinner label="Loading" />
        ))}
      {tab === 'procedures' && (
        <GuidePage
          slug="downtime"
          title="Downtime procedures"
          subtitle=""
          embedded
          initialGroup={current?.myGroup}
          key={current ? 'ready' : 'waiting'}
        />
      )}
      {tab === 'forms' && <DowntimeForms />}
      {tab === 'check' && <DowntimeCheckSection />}
      {tab === 'log' && isManager && <DowntimeLogSection />}
      {tab === 'setup' && isManager && <DowntimeSetup />}
    </div>
  );
}

// ------------------------------------------------------------------- now

function NowTab({
  current,
  reload,
  onTab,
}: {
  current: DowntimeCurrent;
  reload: () => Promise<void>;
  onTab: (tab: Tab) => void;
}) {
  const isManager = useIsManager();
  const [starting, setStarting] = useState(false);

  return (
    <div className="space-y-4">
      {isManager && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            Starting one tells everybody on shift there now or later today, by bell, email and
            phone.
          </p>
          <button
            type="button"
            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2"
            onClick={() => setStarting(true)}
          >
            Start a downtime
          </button>
        </div>
      )}

      {current.active.length === 0 && (
        <Card className="p-5" testId="downtime-none">
          <h2 className="text-base font-semibold text-slate-900">Nothing is down right now.</h2>
          <p className="mt-1 text-sm text-slate-700">
            If eCW, the phones or the internet stop working, tell a manager straight away. Until
            then, know{' '}
            <button
              type="button"
              className="font-medium text-brand-700 underline"
              onClick={() => onTab('procedures')}
            >
              what to do for your job
            </button>{' '}
            and where the paper forms are at your front desk.
          </p>
        </Card>
      )}

      {current.active.map((downtime) => (
        <ActiveDowntime
          key={downtime.id}
          downtime={downtime}
          contacts={current.contacts}
          reload={reload}
          onTab={onTab}
        />
      ))}

      {current.planned.length > 0 && (
        <section aria-label="Planned">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Planned
          </h2>
          <div className="space-y-3">
            {current.planned.map((downtime) => (
              <PlannedDowntime key={downtime.id} downtime={downtime} reload={reload} />
            ))}
          </div>
        </section>
      )}

      {starting && (
        <StartDowntimeDialog
          onClose={() => setStarting(false)}
          onStarted={async () => {
            setStarting(false);
            downtimeChanged();
            await reload();
          }}
        />
      )}
    </div>
  );
}

function Updates({ downtime }: { downtime: Downtime }) {
  if (downtime.updates.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-slate-900">Updates</h3>
      <ol className="mt-1 space-y-1.5" data-testid="downtime-updates">
        {[...downtime.updates].reverse().map((update) => (
          <li key={update.id} className="rounded-lg bg-white/70 p-2 text-sm text-slate-800">
            <span className="font-medium">{practiceTimeWords(update.createdAt)}</span>
            {update.by && <span className="text-slate-600"> · {update.by}</span>}
            <p className="mt-0.5 whitespace-pre-line">{update.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ActiveDowntime({
  downtime,
  contacts,
  reload,
  onTab,
}: {
  downtime: Downtime;
  contacts: DowntimeContact[];
  reload: () => Promise<void>;
  onTab: (tab: Tab) => void;
}) {
  const isManager = useIsManager();
  const [update, setUpdate] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [view, setView] = useState(downtime);
  useEffect(() => setView(downtime), [downtime]);

  const run = async (work: () => Promise<Downtime>) => {
    setWorking(true);
    setError(null);
    try {
      setView(await work());
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not save. Try again.');
      return false;
    } finally {
      setWorking(false);
    }
  };

  const relevant = contactsFor(view, contacts);

  return (
    <div
      className="rounded-xl border shadow-sm border-rose-300 bg-rose-50 p-5"
      data-testid="downtime-active"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-800">
            {view.planned ? 'Planned downtime, on now' : 'Downtime, on now'}
          </p>
          <h2 className="mt-0.5 text-xl font-bold text-rose-900">{view.headline}</h2>
          <p className="mt-1 text-sm text-rose-900">
            Since {practiceTimeWords(view.startsAt)} ({minutesWords(view.minutes)})
            {view.startedBy && <> · started by {view.startedBy}</>}
          </p>
        </div>
      </div>
      {view.note && <p className="mt-2 whitespace-pre-line text-sm text-slate-900">{view.note}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass('primary', 'sm')}
          onClick={() => onTab('procedures')}
        >
          What to do for your job
        </button>
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={() => onTab('forms')}
        >
          Print the forms
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-700">
        Nothing about a patient goes into Domi Staff or on your phone. Paper only, in the downtime
        folder.
      </p>

      <Updates downtime={view} />

      {isManager && (
        <div className="mt-4 space-y-4 border-t border-rose-200 pt-4">
          {relevant.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Who to contact</h3>
              <p className="text-xs text-slate-600">Tick each one once done; it goes in the log.</p>
              <ul className="mt-2 space-y-2" data-testid="downtime-contacts">
                {relevant.map((contact) => {
                  const made = view.contactsMade.find((entry) => entry.contactId === contact.id);
                  const mail = supportEmail(contact, view);
                  return (
                    <li key={contact.id} className="rounded-lg bg-white p-3 ring-1 ring-rose-200">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5 rounded border-slate-300 text-brand-600"
                          checked={Boolean(made)}
                          disabled={working}
                          onChange={(event) =>
                            void run(() =>
                              api.tickDowntimeContact(view.id, contact.id, event.target.checked),
                            )
                          }
                          aria-label={`Contacted ${[contact.label, contact.name].filter(Boolean).join(': ')}`}
                        />
                        <span className="min-w-0 flex-1 text-sm text-slate-800">
                          <span className="font-semibold">{contact.label}</span>
                          {contact.name && <>: {contact.name}</>}
                          {contact.detail && (
                            <span className="block text-slate-600">{contact.detail}</span>
                          )}
                          {made && (
                            <span className="block text-xs text-emerald-800">
                              Done {practiceTimeWords(made.doneAt)}
                              {made.by ? ` by ${made.by}` : ''}
                            </span>
                          )}
                        </span>
                      </label>
                      <div className="mt-2 flex flex-wrap gap-2 pl-8">
                        {contact.phone && (
                          <a
                            className={buttonClass('secondary', 'sm')}
                            href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
                          >
                            Call {contact.phone}
                          </a>
                        )}
                        {mail && (
                          <a className={buttonClass('secondary', 'sm')} href={mail}>
                            Email {contact.email}
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <Field
              label="Post an update"
              hint="Goes to everybody told about it, by bell, email and phone."
            >
              {(props) => (
                <textarea
                  {...props}
                  className={inputClass}
                  rows={2}
                  maxLength={1000}
                  placeholder="Support says about an hour."
                  value={update}
                  onChange={(event) => setUpdate(event.target.value)}
                />
              )}
            </Field>
            <div className="mt-2 flex flex-wrap justify-between gap-2">
              <button
                type="button"
                className={buttonClass('secondary', 'sm')}
                disabled={working || !update.trim()}
                onClick={async () => {
                  if (await run(() => api.postDowntimeUpdate(view.id, update))) setUpdate('');
                }}
              >
                Post update
              </button>
              <button
                type="button"
                className={buttonClass('primary', 'sm')}
                disabled={working}
                onClick={() => setEnding(true)}
              >
                It's back: close the downtime
              </button>
            </div>
          </div>
          {view.toldCount !== null && (
            <p className="text-xs text-slate-600">
              {view.toldCount} {view.toldCount === 1 ? 'person was' : 'people were'} told it
              started. People coming on shift later are told two hours before.
            </p>
          )}
          {error && <Alert>{error}</Alert>}
        </div>
      )}

      {ending && (
        <EndDowntimeDialog
          downtime={view}
          onClose={() => setEnding(false)}
          onEnded={async () => {
            setEnding(false);
            downtimeChanged();
            await reload();
          }}
        />
      )}
    </div>
  );
}

function PlannedDowntime({
  downtime,
  reload,
}: {
  downtime: Downtime;
  reload: () => Promise<void>;
}) {
  const isManager = useIsManager();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      className="rounded-xl border shadow-sm border-amber-300 bg-amber-50 p-4"
      data-testid="downtime-planned"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Planned</p>
      <h3 className="text-base font-semibold text-slate-900">{downtime.headline}</h3>
      <p className="text-sm text-slate-800">
        From {formatPracticeDateTime(downtime.startsAt)}
        {downtime.plannedEndsAt && <> to {practiceTimeWords(downtime.plannedEndsAt)}</>}
      </p>
      {downtime.note && <p className="mt-1 text-sm text-slate-800">{downtime.note}</p>}
      <p className="mt-1 text-xs text-slate-700">
        It starts by itself. The people working then are told the evening before, and again when it
        starts.
      </p>
      <Updates downtime={downtime} />
      {isManager && (
        <div className="mt-3">
          <button
            type="button"
            className={buttonClass('secondary', 'sm')}
            onClick={async () => {
              const yes = await confirm({
                title: 'Cancel this planned downtime?',
                body: 'Anybody already told about it hears it is not going ahead.',
                confirmLabel: 'Cancel it',
              });
              if (!yes) return;
              try {
                await api.cancelDowntime(downtime.id);
                await reload();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Could not cancel it.');
              }
            }}
          >
            Cancel it
          </button>
          {error && (
            <div className="mt-2">
              <Alert>{error}</Alert>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ starting

function StartDowntimeDialog({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: () => Promise<void>;
}) {
  const { employee } = useSession();
  const [offices, setOffices] = useState<Location[] | null>(null);
  const [systems, setSystems] = useState<DowntimeSystem[]>(['ECW']);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [touchedOffices, setTouchedOffices] = useState(false);
  const [note, setNote] = useState('');
  const [planned, setPlanned] = useState(false);
  const [day, setDay] = useState(practiceDate());
  const [from, setFrom] = useState('19:00');
  const [until, setUntil] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listLocations()
      .then((list) => {
        setOffices(list);
        // eCW is the same for both offices, so it starts on both.
        setLocationIds(list.map((office) => office.id));
      })
      .catch(() => setError('Could not load the offices.'));
  }, []);

  // Only the internet or the phones: start on their own office, until they choose.
  useEffect(() => {
    if (!offices || touchedOffices) return;
    if (systems.includes('ECW') || systems.length === 0) {
      setLocationIds(offices.map((office) => office.id));
    } else {
      const own =
        employee?.locations.find((entry) => entry.isPrimary)?.locationId ??
        employee?.locations[0]?.locationId;
      setLocationIds(own ? [own] : offices.map((office) => office.id));
    }
  }, [systems, offices, touchedOffices, employee]);

  const toggle = <T,>(list: T[], value: T, on: boolean) =>
    on ? [...new Set([...list, value])] : list.filter((entry) => entry !== value);

  const ready = systems.length > 0 && locationIds.length > 0 && (!planned || (day && from));

  const submit = async () => {
    setWorking(true);
    setError(null);
    try {
      await api.startDowntime({
        systems,
        locationIds,
        note: note.trim() || undefined,
        planned,
        ...(planned
          ? {
              startsAt: atPractice(day, from),
              plannedEndsAt: until ? atPractice(day, until) : undefined,
            }
          : {}),
      });
      await onStarted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'It did not start. Try again.');
      setWorking(false);
    }
  };

  return (
    <Modal title="Start a downtime" onClose={onClose} wide testId="start-downtime">
      {!offices ? (
        <Spinner label="Loading the offices" />
      ) : (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">What is down?</legend>
            <div className="mt-1 space-y-1.5">
              {SYSTEM_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-start gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-slate-300 text-brand-600"
                    checked={systems.includes(option.value)}
                    onChange={(event) =>
                      setSystems(toggle(systems, option.value, event.target.checked))
                    }
                  />
                  <span>
                    <span className="font-medium">{option.label}</span>
                    <span className="block text-xs text-slate-600">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Which office?</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
              {offices.map((office) => (
                <label key={office.id} className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-brand-600"
                    checked={locationIds.includes(office.id)}
                    onChange={(event) => {
                      setTouchedOffices(true);
                      setLocationIds(toggle(locationIds, office.id, event.target.checked));
                    }}
                  />
                  {office.name}
                </label>
              ))}
            </div>
            {systems.includes('ECW') && (
              <p className="mt-1 text-xs text-slate-600">
                eCW is the same for both offices, and the people working from home and on
                telemedicine are told with them.
              </p>
            )}
          </fieldset>

          <Field label="A note (optional)" hint="What you know: since when, what support said.">
            {(props) => (
              <textarea
                {...props}
                className={inputClass}
                rows={2}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            )}
          </Field>

          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300 text-brand-600"
              checked={planned}
              onChange={(event) => setPlanned(event.target.checked)}
            />
            <span>
              <span className="font-medium">Planned</span>: enter it ahead (an eCW upgrade in
              working hours). It starts by itself, and the people working then are told the evening
              before.
            </span>
          </label>
          {planned && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Day">
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    className={inputClass}
                    value={day}
                    onChange={(event) => setDay(event.target.value)}
                  />
                )}
              </Field>
              <Field label="From">
                {(props) => (
                  <input
                    {...props}
                    type="time"
                    className={inputClass}
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Until (optional)">
                {(props) => (
                  <input
                    {...props}
                    type="time"
                    className={inputClass}
                    value={until}
                    onChange={(event) => setUntil(event.target.value)}
                  />
                )}
              </Field>
            </div>
          )}

          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={buttonClass('secondary')} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={
                planned
                  ? buttonClass('primary')
                  : 'rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60'
              }
              disabled={!ready || working}
              onClick={() => void submit()}
            >
              {working
                ? 'Saving...'
                : planned
                  ? 'Save the planned downtime'
                  : 'Start it and tell staff'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/// "2026-10-28" at "19:00" on the practice's clock, as an instant.
function atPractice(day: string, time: string): string {
  // Noon that day is safely on it, whatever the browser's zone.
  return atPracticeTime(`${day}T12:00:00.000Z`, time);
}

// ------------------------------------------------------------- ending

function EndDowntimeDialog({
  downtime,
  onClose,
  onEnded,
}: {
  downtime: Downtime;
  onClose: () => void;
  onEnded: () => Promise<void>;
}) {
  const [cause, setCause] = useState<DowntimeCause>(likelyCause(downtime));
  const [causeNote, setCauseNote] = useState('');
  const [plan, setPlan] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minutes = (Date.now() - new Date(downtime.startsAt).getTime()) / 60_000;
  const rule = catchUpRule(minutes);

  const submit = async () => {
    setWorking(true);
    setError(null);
    try {
      await api.endDowntime(downtime.id, {
        cause,
        causeNote: causeNote.trim() || undefined,
        catchUpPlan: plan.trim() || undefined,
        catchUpDueOn: dueOn || undefined,
      });
      await onEnded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'It did not close. Try again.');
      setWorking(false);
    }
  };

  return (
    <Modal title="Close the downtime" onClose={onClose} wide testId="end-downtime">
      <div className="space-y-4">
        <p className="text-sm text-slate-800">
          <span className="font-semibold">{downtime.headline}</span>, for {minutesWords(minutes)}.
          Everybody told about it hears it is back.
        </p>
        <Field label="What caused it?">
          {(props) => (
            <select
              {...props}
              className={inputClass}
              value={cause}
              onChange={(event) => setCause(event.target.value as DowntimeCause)}
            >
              {CAUSE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="More about it (optional)"
          hint="For the log: what support said, what was fixed."
        >
          {(props) => (
            <textarea
              {...props}
              className={inputClass}
              rows={2}
              maxLength={500}
              value={causeNote}
              onChange={(event) => setCauseNote(event.target.value)}
            />
          )}
        </Field>
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
          <p className="font-semibold">Catching up</p>
          {rule === 'SAME_DAY' && <p>Under 4 hours: caught up before the end of today.</p>}
          {rule === 'NEXT_WORKING_DAY' && (
            <p>Under a day: caught up by the end of the next working day.</p>
          )}
          {rule === 'PLAN' && (
            <div className="mt-2 space-y-3">
              <p>Longer than a day: say how it will be caught up.</p>
              <Field label="The plan">
                {(props) => (
                  <textarea
                    {...props}
                    className={inputClass}
                    rows={3}
                    maxLength={1000}
                    placeholder="Front desk enters the sign-ins first, providers their notes by Friday."
                    value={plan}
                    onChange={(event) => setPlan(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Done by">
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    className={inputClass}
                    value={dueOn}
                    onChange={(event) => setDueOn(event.target.value)}
                  />
                )}
              </Field>
            </div>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass('secondary')} onClick={onClose}>
            Not yet
          </button>
          <button
            type="button"
            className={buttonClass('primary')}
            disabled={working || (rule === 'PLAN' && !plan.trim())}
            onClick={() => void submit()}
          >
            {working ? 'Closing...' : 'Close it and tell staff'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
