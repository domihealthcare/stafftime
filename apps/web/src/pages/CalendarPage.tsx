import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarLinkCard } from '../components/CalendarLinkCard';
import {
  ClosuresCard,
  EventChip,
  EventDialog,
  EventForm,
  eventsOnDay,
} from '../components/PracticeEvents';
import { ScheduleTabs } from '../components/ScheduleTabs';
import {
  loadMySchedule,
  myDay,
  MyDayChips,
  NO_SCHEDULE,
  type MySchedule,
} from '../components/MySchedule';
import { Alert, Card, PageHeading, Spinner, buttonClass } from '../components/ui';
import { api } from '../lib/api';
import { CALENDAR_KINDS, KIND_STYLE, officeShort, type CalendarKind } from '../lib/calendar-kinds';
import {
  addDays,
  addMonths,
  formatCalendarDate,
  localDate,
  monthGrid,
  parseDay,
  startOfMonth,
} from '../lib/format';
import { locale, t as translate, useT } from '../lib/i18n';
import { useIsManager, useSession } from '../lib/session';
import type { Employee, EventKind, JobRole, Location, PracticeEvent } from '../lib/types';
import { useIsPhone } from '../lib/use-is-phone';

/// Remembered per browser: a convenience, never relied on.
const VIEW_KEY = 'domi-staff:calendar-view';
const CHOSEN_KEY = 'domi-staff:calendar-kinds';

function remembered<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}

function remember(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A remembered preference is a convenience, not a feature.
  }
}

/// What a manager is adding or changing on this page.
interface FormState {
  event?: PracticeEvent;
  template?: PracticeEvent;
  kind?: EventKind;
  day?: Date;
}

/**
 * The practice calendar (October 2026, Dominguez: "a calendar that staff can
 * reference for multiple things — events, diagnostic schedule,
 * holidays/office closures"). Everything on one month, the way the practice
 * already kept it on paper: diagnostics with the office they are at, holidays,
 * closures, meetings, and pay days worked out from the pay period.
 *
 * Everybody sees it — the events meant for them, and every diagnostics date,
 * holiday and pay day. Managers and admins add and change entries here.
 */
export function CalendarPage() {
  const t = useT();
  const isManager = useIsManager();
  const { employee: me } = useSession();
  const isPhone = useIsPhone();
  const [searchParams, setSearchParams] = useSearchParams();
  const monthStart = useMemo(
    () => startOfMonth(parseDay(searchParams.get('month') ?? '') ?? new Date()),
    [searchParams],
  );
  const [view, setView] = useState<'month' | 'list'>(() =>
    remembered(VIEW_KEY, isPhone ? 'list' : 'month'),
  );
  /// The kinds picked to show; none picked is All (Dominguez, October 2026:
  /// "all, diagnostics, rep lunches, etc … choose multiple or choose one, or
  /// all").
  const [chosen, setChosen] = useState<CalendarKind[]>(() => {
    const saved = remembered<unknown>(CHOSEN_KEY, []);
    return Array.isArray(saved)
      ? saved.filter((kind): kind is CalendarKind => CALENDAR_KINDS.includes(kind))
      : [];
  });
  const isShown = (kind: CalendarKind) => chosen.length === 0 || chosen.includes(kind);
  const [office, setOffice] = useState('');

  const [events, setEvents] = useState<PracticeEvent[]>([]);
  const [payDays, setPayDays] = useState<string[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<PracticeEvent | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  /// Your own shifts and time off, for "My shifts".
  const [mine, setMine] = useState<MySchedule>(NO_SCHEDULE);

  const days = useMemo(() => monthGrid(monthStart), [monthStart]);
  const first = days[0];
  const last = days[days.length - 1];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [found, paid, offices] = await Promise.all([
        api.events(first.toISOString(), addDays(last, 1).toISOString()),
        api.payDays(localDate(first), localDate(last)),
        api.listLocations(),
      ]);
      setEvents(found);
      setPayDays(paid.payDays);
      setLocations(offices);
      setVersion((v) => v + 1);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('Could not load the calendar.'));
    } finally {
      setLoading(false);
    }
  }, [first, last]);

  useEffect(() => {
    void load();
  }, [load]);

  // Your own schedule. Not worth failing the calendar over.
  const myId = me?.id;
  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    loadMySchedule(myId, first, last)
      .then((found) => !cancelled && setMine(found))
      .catch(() => !cancelled && setMine(NO_SCHEDULE));
    return () => {
      cancelled = true;
    };
  }, [myId, first, last]);

  // Only managers add, and only adding to a meeting needs the staff list.
  useEffect(() => {
    if (!isManager) return;
    api
      .listEmployees()
      .then(setEmployees)
      .catch(() => setEmployees([]));
    api
      .jobRoles()
      .then(setJobRoles)
      .catch(() => setJobRoles([]));
  }, [isManager]);

  function goToMonth(month: Date) {
    setSearchParams({ month: localDate(month) }, { replace: true });
  }

  /// From All, a kind shows that kind alone; more can be added, and taking
  /// the last one off — or picking every one — is All again.
  function pickKind(kind: CalendarKind | 'ALL') {
    setChosen((was) => {
      let next: CalendarKind[];
      if (kind === 'ALL') next = [];
      else if (was.includes(kind)) next = was.filter((k) => k !== kind);
      else next = [...was, kind];
      if (next.length === CALENDAR_KINDS.length) next = [];
      remember(CHOSEN_KEY, next);
      return next;
    });
  }

  function chooseView(next: 'month' | 'list') {
    setView(next);
    remember(VIEW_KEY, next);
  }

  function openForm(next: FormState) {
    setAddMenu(false);
    setOpenEvent(null);
    setNotice(null);
    setForm(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /// What is shown: the kinds ticked, and — with an office chosen — what is
  /// at that office or shuts it, plus everything practice-wide.
  const shown = useMemo(
    () =>
      events.filter((event) => {
        if (chosen.length > 0 && !chosen.includes(event.kind)) return false;
        if (!office) return true;
        if (event.kind === 'DIAGNOSTIC' || event.kind === 'REP_LUNCH') {
          return event.atLocation?.id === office;
        }
        if (event.kind === 'CLOSURE' && event.audience === 'LOCATION') {
          return event.location?.id === office;
        }
        return true;
      }),
    [events, chosen, office],
  );
  const shownPayDays = isShown('PAY_DAY') ? payDays : [];
  const shownMine = isShown('MY_SHIFT') ? mine : NO_SCHEDULE;
  const hasMine = (key: string) => {
    const { shifts, off } = myDay(shownMine, me?.id, key);
    return shifts.length > 0 || off !== null;
  };

  const monthDays = days.filter((day) => day.getMonth() === monthStart.getMonth());
  const today = localDate(new Date());
  const monthName = monthStart.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeading
        title={t('Calendar')}
        subtitle={t(
          'Your shifts, diagnostics, rep lunches, holidays, closures, meetings and pay days.',
        )}
      />
      <ScheduleTabs />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToMonth(addMonths(monthStart, -1))}
            aria-label={t('Previous month')}
            className={buttonClass('secondary', 'sm')}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => goToMonth(new Date())}
            className={buttonClass('secondary', 'sm')}
          >
            {t('This month')}
          </button>
          <button
            type="button"
            onClick={() => goToMonth(addMonths(monthStart, 1))}
            aria-label={t('Next month')}
            className={buttonClass('secondary', 'sm')}
          >
            →
          </button>
        </div>
        <div
          className="flex rounded-lg border border-slate-300 bg-white p-0.5"
          role="group"
          aria-label={t('Show as')}
        >
          {(
            [
              ['month', 'Month'],
              ['list', 'List'],
            ] as const
          ).map(([option, label]) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => chooseView(option)}
              className={`rounded-md px-3 py-1 text-sm font-medium max-sm:py-2 ${
                view === option
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <select
          aria-label={t('Show office')}
          value={office}
          onChange={(change) => setOffice(change.target.value)}
          className="rounded-lg border border-slate-300 bg-white py-1.5 pl-2 pr-8 text-sm"
        >
          <option value="">{t('Both offices')}</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <Link
          to={`/schedule/calendar/print?${new URLSearchParams({
            month: localDate(monthStart),
            ...(chosen.length > 0 ? { kinds: chosen.join(',') } : {}),
            ...(office ? { office } : {}),
          }).toString()}`}
          className={buttonClass('secondary', 'sm')}
        >
          {t('Print')}
        </Link>
        {isManager && (
          <div className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={addMenu}
              onClick={() => setAddMenu((open) => !open)}
              className={buttonClass('primary', 'sm')}
            >
              + Add
            </button>
            {addMenu && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  tabIndex={-1}
                  onClick={() => setAddMenu(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                >
                  {(
                    [
                      ['DIAGNOSTIC', 'When a test is offered at an office'],
                      ['REP_LUNCH', 'A rep bringing lunch to an office'],
                      ['EVENT', 'A meeting or something on the calendar'],
                      ['HOLIDAY', 'A named day — the offices stay open'],
                      ['CLOSURE', 'An office shut, once or every year'],
                    ] as const
                  ).map(([kind, hint]) => (
                    <button
                      key={kind}
                      type="button"
                      role="menuitem"
                      aria-label={KIND_STYLE[kind].one}
                      onClick={() => openForm({ kind })}
                      className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="block text-sm font-medium text-slate-900">
                        <span aria-hidden="true">{KIND_STYLE[kind].emoji}</span>{' '}
                        {KIND_STYLE[kind].one}
                      </span>
                      <span className="block text-xs text-slate-500">{hint}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* What to show, which is also the key: All, or any one or more kinds. */}
      <div
        className="mb-4 flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={t('Show on the calendar')}
      >
        <span className="mr-1 text-xs font-medium text-slate-600">{t('Show:')}</span>
        {(['ALL', ...CALENDAR_KINDS] as const).map((kind) => {
          const on = kind === 'ALL' ? chosen.length === 0 : chosen.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() => pickKind(kind)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset max-sm:py-2 ${
                on
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {kind === 'ALL' ? (
                t('All')
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 rounded-full ring-1 ring-white ${KIND_STYLE[kind].dot}`}
                  />
                  {t(KIND_STYLE[kind].label)}
                </>
              )}
              {on && <span aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>

      {isManager && form && (
        <div className="mb-6">
          <EventForm
            key={
              form.event?.id ??
              `new-${form.kind ?? ''}-${form.template?.id ?? ''}-${form.day?.getTime() ?? ''}`
            }
            event={form.event}
            template={form.template}
            initialKind={form.kind}
            employees={employees}
            locations={locations}
            jobRoles={jobRoles}
            defaultDate={form.day ?? newEntryDay(monthStart)}
            onSaved={(created) => {
              setForm(null);
              setNotice(created > 1 ? `Saved — ${created} dates are on the calendar.` : 'Saved.');
              void load();
            }}
            onCancel={() => setForm(null)}
          />
        </div>
      )}

      {notice && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200"
        >
          {notice}
        </p>
      )}

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <h2
        className="mb-3 text-2xl font-bold text-slate-900 sm:text-3xl"
        data-testid="calendar-month"
      >
        {monthName}
      </h2>

      {loading && events.length === 0 ? (
        <Spinner />
      ) : view === 'month' ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
            {days.slice(0, 7).map((day) => (
              <div key={day.getDay()} className="py-2">
                <span className="sm:hidden">
                  {day.toLocaleDateString(locale(), { weekday: 'narrow' })}
                </span>
                <span className="max-sm:hidden">
                  {day.toLocaleDateString(locale(), { weekday: 'short' })}
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = localDate(day);
              const outside = day.getMonth() !== monthStart.getMonth();
              const dayEvents = eventsOnDay(shown, key);
              const paid = shownPayDays.includes(key);
              return (
                <div
                  key={key}
                  data-testid={`calendar-day-${key}`}
                  className={`min-h-[84px] border-b border-r border-slate-200 p-1 sm:min-h-[120px] sm:p-1.5 ${
                    outside ? 'bg-slate-50' : 'bg-white'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold sm:text-sm ${
                        key === today
                          ? 'rounded-full bg-brand-600 px-1.5 text-white'
                          : outside
                            ? 'text-slate-400'
                            : 'text-slate-900'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {isManager && (
                      <button
                        type="button"
                        onClick={() => openForm({ day })}
                        aria-label={`Add on ${formatCalendarDate(key, { year: false })}`}
                        className="rounded px-1 text-sm leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 max-sm:hidden"
                      >
                        ＋
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <MyDayChips
                      schedule={shownMine}
                      employeeId={me?.id}
                      day={key}
                      events={events}
                      compact={isPhone}
                    />
                    {paid && <PayDayChip compact={isPhone} />}
                    {dayEvents.map((event) =>
                      isPhone ? (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => setOpenEvent(event)}
                          aria-label={event.title}
                          className={`block w-full truncate rounded px-0.5 text-left text-[10px] font-medium leading-4 ring-1 ring-inset ${KIND_STYLE[event.kind].chip}`}
                        >
                          <span aria-hidden="true">{KIND_STYLE[event.kind].emoji}</span>
                          {(event.kind === 'DIAGNOSTIC' || event.kind === 'REP_LUNCH') &&
                          event.atLocation
                            ? ` ${officeShort(event.atLocation.name)}`
                            : ''}
                        </button>
                      ) : (
                        <EventChip key={event.id} event={event} day={key} onOpen={setOpenEvent} />
                      ),
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="p-0" testId="calendar-list">
          <ul className="divide-y divide-slate-100">
            {monthDays
              .map((day) => localDate(day))
              .filter(
                (key) =>
                  hasMine(key) || shownPayDays.includes(key) || eventsOnDay(shown, key).length > 0,
              )
              .map((key) => (
                <li
                  key={key}
                  data-testid={`calendar-list-${key}`}
                  className={`flex gap-3 px-3 py-2.5 sm:px-4 ${key < today ? 'opacity-60' : ''}`}
                >
                  <div className="w-24 shrink-0 text-sm">
                    <span
                      className={`font-semibold ${key === today ? 'text-brand-700' : 'text-slate-900'}`}
                    >
                      {formatCalendarDate(key, { year: false })}
                    </span>
                    {key === today && (
                      <span className="block text-xs text-brand-700">{t('Today')}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <MyDayChips
                      schedule={shownMine}
                      employeeId={me?.id}
                      day={key}
                      events={events}
                    />
                    {shownPayDays.includes(key) && <PayDayChip />}
                    {eventsOnDay(shown, key).map((event) => (
                      <EventChip key={event.id} event={event} day={key} onOpen={setOpenEvent} />
                    ))}
                  </div>
                </li>
              ))}
          </ul>
          {monthDays.every(
            (day) =>
              !hasMine(localDate(day)) &&
              !shownPayDays.includes(localDate(day)) &&
              eventsOnDay(shown, localDate(day)).length === 0,
          ) && (
            <p className="px-4 py-6 text-sm text-slate-500">
              {t('Nothing on in {month}.', { month: monthName })}
            </p>
          )}
        </Card>
      )}

      {payDays.length === 0 && isShown('PAY_DAY') && !loading && (
        <p className="mt-2 text-xs text-slate-500">
          {t('Pay days appear once a pay period is set in Practice settings.')}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ClosuresCard
          initialYear={monthStart.getFullYear()}
          canEdit={isManager}
          version={version}
          onAdd={(kind) => openForm({ kind })}
          onOpen={setOpenEvent}
          onChanged={() => void load()}
        />
        <CalendarLinkCard />
      </div>

      {openEvent && (
        <EventDialog
          event={openEvent}
          canEdit={isManager}
          onClose={() => setOpenEvent(null)}
          onEdit={() => openForm({ event: openEvent })}
          onDuplicate={
            openEvent.kind !== 'CLOSURE' && openEvent.kind !== 'HOLIDAY'
              ? () => openForm({ template: openEvent })
              : undefined
          }
          onRemoved={() => {
            setOpenEvent(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

/// Pay day: worked out, not entered, so there is nothing to open. In a
/// phone's month the words are for screen readers only; there is no room.
function PayDayChip({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const style = KIND_STYLE.PAY_DAY;
  return (
    <span
      data-testid="payday-chip"
      className={`block truncate rounded-md px-1.5 py-1 text-xs font-semibold leading-tight ring-1 ring-inset ${style.chip}`}
    >
      <span aria-hidden="true">{style.emoji}</span>
      <span className={compact ? 'sr-only' : undefined}> {t('Pay day')}</span>
    </span>
  );
}

/// Where a new entry starts: the first of the month on screen, unless that has passed.
function newEntryDay(monthStart: Date): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return monthStart < today ? today : monthStart;
}
