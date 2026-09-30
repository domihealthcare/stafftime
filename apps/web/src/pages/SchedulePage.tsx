import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  addDays,
  addMonths,
  displayName,
  formatTimeCompact,
  localDate,
  monthGrid,
  startOfMonth,
  startOfWeek,
  toLocalInputValue,
} from '../lib/format';
import { birthdayName, birthdaysByDay } from '../lib/birthday';
import { atPlace, forRole, WORK_FROM_HOME_FILTER } from '../lib/shift-filters';
import { useIsManager, useSession } from '../lib/session';
import type {
  BirthdayEntry,
  Coverage,
  CoverageDay,
  Employee,
  JobRole,
  Location,
  OvertimeWarning,
  OwnOvertimeWeek,
  PlanResult,
  PracticeEvent,
  PtoRequest,
  Shift,
} from '../lib/types';
import { CalendarLinkCard } from '../components/CalendarLinkCard';
import {
  ClosuresCard,
  ClosureWarning,
  confirmClosure,
  EventDialog,
  EventForm,
  eventsOnDay,
  isClosure,
  useClosureCheck,
} from '../components/PracticeEvents';
import { JobRoleSelect } from '../components/JobRoleSelect';
import { PersonPicker } from '../components/PersonPicker';
import { PlanResultNotice } from '../components/PlanResultNotice';
import {
  PlaceSelect,
  WORK_FROM_HOME,
  WorkFromHomeNote,
  homeOfficeOf,
  placeToShift,
} from '../components/PlaceSelect';
import { RepeatShiftsForm } from '../components/RepeatShiftsForm';
import { usePersonMenu } from '../components/PersonMenu';
import { RotaLegend, RotaTable, type RotaGrouping } from '../components/RotaTable';
import { REMOTE_COLOUR, locationColourFn, shiftChipStyle } from '../lib/shift-colours';
import { jobRoleHex } from '../lib/job-role-colours';
import { StandingShiftsCard } from '../components/StandingShiftsCard';
import { Alert, Card, EmptyState, PageHeading, Spinner, buttonClass } from '../components/ui';
import { NeedsAttention } from '../components/NeedsAttention';
import { useConfirm } from '../components/ConfirmDialog';
import {
  confirmOvertime,
  MyOvertimeNotice,
  OvertimePreview,
  useOvertimeCheck,
} from '../components/OvertimeAlerts';

/// Where the week/month choice is remembered. Per browser, per person on that
/// browser — it never leaves the device and nothing depends on it.
const VIEW_KEY = 'domi.schedule.view';
const GROUPING_KEY = 'domi.schedule.grouping';

export function SchedulePage() {
  const isManager = useIsManager();
  const { employee: me } = useSession();
  /// Everyone together, by office, or by job role — remembered like the view.
  const [grouping, setGrouping] = useState<RotaGrouping>(() => {
    try {
      const saved = window.localStorage.getItem(GROUPING_KEY);
      return saved === 'location' || saved === 'role' ? saved : 'person';
    } catch {
      return 'person';
    }
  });
  const [locationFilter, setLocationFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  /// The month view, one person's shifts only ('' for everyone). Kept while
  /// moving between months, so a manager can page through somebody's autumn.
  const [personFilter, setPersonFilter] = useState('');
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [adding, setAdding] = useState(false);
  /// A week at a time to build a rota, a month at a time to see the shape of
  /// one. The week view is where shifts are added and removed; the month view
  /// is an overview, and a day in it is a way back to that week.
  ///
  /// Remembered, because whichever one you want you tend to want every time —
  /// a manager building rotas lives in the week, somebody checking their own
  /// shifts lives in the month, and neither should re-pick it after every trip
  /// to another screen. Browser storage can throw (private windows, blocked
  /// site data), so every touch of it is guarded and the default stands.
  const [view, setView] = useState<'week' | 'month'>(() => {
    try {
      return window.localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'week';
    } catch {
      return 'week';
    }
  });
  // A notification about an event links to the week it is in: ?week=2026-10-14.
  const [searchParams] = useSearchParams();
  const askedWeek = searchParams.get('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(parseDay(askedWeek) ?? new Date()));
  const [monthStart, setMonthStart] = useState(() =>
    startOfMonth(parseDay(askedWeek) ?? new Date()),
  );
  // …and again when a notification is chosen while already on this screen.
  useEffect(() => {
    const day = parseDay(askedWeek);
    if (!day) return;
    setWeekStart(startOfWeek(day));
    setMonthStart(startOfMonth(day));
  }, [askedWeek]);
  // Right-clicking somebody: "See schedule" is their month, on its own.
  const personMenu = usePersonMenu({
    onSeeSchedule: (person) => {
      setPersonFilter(person.id);
      setView('month');
      try {
        window.localStorage.setItem(VIEW_KEY, 'month');
      } catch {
        // As above.
      }
    },
  });
  // …and the Directory's version of it arrives as ?person=id.
  const askedPerson = searchParams.get('person');
  useEffect(() => {
    if (!askedPerson) return;
    setPersonFilter(askedPerson);
    setView('month');
  }, [askedPerson]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [timeOff, setTimeOff] = useState<PtoRequest[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [events, setEvents] = useState<PracticeEvent[]>([]);
  /// The event whose details are open, and the one being added or changed
  /// (no `event` for a new one, which starts as `kind`).
  const [openEvent, setOpenEvent] = useState<PracticeEvent | null>(null);
  const [eventForm, setEventForm] = useState<{
    event?: PracticeEvent;
    kind?: PracticeEvent['kind'];
  } | null>(null);
  /// "7 dates added", after a repeating event is saved.
  const [eventNotice, setEventNotice] = useState<string | null>(null);
  /// Bumped on every load, so the holidays card re-reads after a change.
  const [eventsVersion, setEventsVersion] = useState(0);
  /// Your own weeks over or close to the overtime line (staff).
  const [ownWeeks, setOwnWeeks] = useState<OwnOvertimeWeek[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [recurringTab, setRecurringTab] = useState<'shifts' | 'closures'>('shifts');

  const closuresCard = (bare: boolean) => (
    <ClosuresCard
      bare={bare}
      initialYear={(view === 'week' ? weekStart : monthStart).getFullYear()}
      canEdit={isManager}
      version={eventsVersion}
      onAdd={() => {
        setEventForm({ kind: 'CLOSURE' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
      onOpen={setOpenEvent}
      onChanged={() => void load()}
    />
  );

  /// One place to start anything new: the rest of the forms close so only
  /// the one asked for is open.
  function openAdd(what: 'shift' | 'repeat' | 'event' | 'closure') {
    setAddMenu(false);
    setAdding(what === 'shift');
    setPlanning(what === 'repeat');
    setEventForm(what === 'event' ? {} : what === 'closure' ? { kind: 'CLOSURE' } : null);
    if (what !== 'shift') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  /// Bumped when a regular shift (no end date) is made, to refresh their list.
  const [standingVersion, setStandingVersion] = useState(0);
  const [copying, setCopying] = useState(false);

  /// The days on screen. A month is shown as whole Sunday-to-Saturday weeks, so
  /// every row has seven days and the month sits inside it — which means the
  /// range loaded is a little wider than the month itself.
  const days = useMemo(
    () =>
      view === 'week'
        ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
        : monthGrid(monthStart),
    [view, weekStart, monthStart],
  );

  const rangeStart = days[0];
  const rangeEnd = useMemo(() => addDays(days[days.length - 1], 1), [days]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftData, locationData, timeOffData, eventData] = await Promise.all([
        api.listShifts({ from: rangeStart.toISOString(), to: rangeEnd.toISOString() }),
        api.listLocations(),
        // Staff get only their own; managers everybody's. Both see it in the rota.
        api.listPto({ from: localDate(rangeStart), to: localDate(days[days.length - 1]) }),
        // Staff get the ones for them; managers every one, to look after.
        api.events(rangeStart.toISOString(), rangeEnd.toISOString()),
      ]);
      setShifts(shiftData);
      setLocations(locationData);
      setTimeOff(timeOffData);
      setEvents(eventData);
      setEventsVersion((version) => version + 1);
      // Colleagues' birthdays, for everybody: a cake on the day. Not worth
      // failing the schedule over.
      api
        .birthdays(localDate(rangeStart), localDate(days[days.length - 1]))
        .then(setBirthdays)
        .catch(() => setBirthdays([]));

      // Only managers may list staff or read coverage.
      if (isManager) {
        const [staff, weekCoverage, roles] = await Promise.all([
          api.listEmployees(),
          api.coverage({
            from: localDate(rangeStart),
            to: localDate(days[days.length - 1]),
          }),
          api.jobRoles(),
        ]);
        setEmployees(staff);
        setCoverage(weekCoverage);
        setJobRoles(roles);
      } else {
        setOwnWeeks(await api.myOvertime().catch(() => []));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the schedule.');
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd, days, isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  /// Pulls the previous week forward. Drafts by default, so the manager checks
  /// it before staff see it.
  async function copyPreviousWeek() {
    setCopying(true);
    setError(null);
    try {
      const result = await api.copyWeek({
        fromWeekStart: addDays(weekStart, -7).toISOString().slice(0, 10),
        toWeekStart: weekStart.toISOString().slice(0, 10),
      });
      setPlanResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy that week.');
    } finally {
      setCopying(false);
    }
  }

  // A published shift that is removed is kept as CANCELLED, so staff who saw
  // it have a record — but it is not on anymore. The week (RotaTable) always
  // left those out; the month showed them, so a removed shift was still there.
  //
  // The month narrows by the same office and job role filters as the week
  // (`lib/shift-filters.ts`): an office keeps the shifts at that office — not
  // work from home, which has its own choice; a job role keeps the shifts for
  // that role, not everything its people do. "MAs in North Bergen" is both.
  const roleMembers = useMemo(
    () => new Set(jobRoles.find((role) => role.id === roleFilter)?.members.map((m) => m.id)),
    [jobRoles, roleFilter],
  );
  const shiftsByDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const shift of shifts.filter(
      (candidate) =>
        candidate.status !== 'CANCELLED' &&
        (!personFilter || candidate.employeeId === personFilter) &&
        atPlace(candidate, locationFilter) &&
        forRole(candidate, roleFilter, roleMembers),
    )) {
      const key = new Date(shift.startsAt).toDateString();
      map.set(key, [...(map.get(key) ?? []), shift]);
    }
    return map;
  }, [shifts, personFilter, locationFilter, roleFilter, roleMembers]);

  /// Who can be picked in the month: everybody still here, and anybody who
  /// has left but still has a shift on screen, so it can be found and moved —
  /// narrowed to the office and job role chosen beside it.
  const pickablePeople = useMemo(() => {
    const onScreen = new Set(shifts.map((shift) => shift.employeeId));
    const fromHome = new Set(shifts.filter((s) => s.isRemote).map((s) => s.employeeId));
    return employees.filter(
      (person) =>
        person.id === personFilter ||
        ((person.employmentStatus === 'ACTIVE' ||
          person.employmentStatus === 'ON_LEAVE' ||
          onScreen.has(person.id)) &&
          (!roleFilter || roleMembers.has(person.id)) &&
          (!locationFilter ||
            (locationFilter === WORK_FROM_HOME_FILTER
              ? fromHome.has(person.id)
              : person.locations.some((assignment) => assignment.locationId === locationFilter)))),
    );
  }, [employees, shifts, personFilter, roleFilter, locationFilter, roleMembers]);
  const pickedPerson = employees.find((person) => person.id === personFilter) ?? null;
  /// What the month is narrowed to, in words: "Frankie Front-Desk",
  /// "Medical Assistant at North Bergen". Null when it shows everybody.
  const monthScope = useMemo(() => {
    const who = pickedPerson
      ? displayName(pickedPerson)
      : (jobRoles.find((role) => role.id === roleFilter)?.name ?? null);
    if (locationFilter === WORK_FROM_HOME_FILTER) {
      return who ? `${who}, working from home` : 'Working from home';
    }
    const where = locations.find((location) => location.id === locationFilter)?.name ?? null;
    if (!who && !where) return null;
    return who && where ? `${who} at ${where}` : (who ?? where);
  }, [pickedPerson, jobRoles, roleFilter, locations, locationFilter]);
  /// How many shifts that leaves in the month itself — not the days either
  /// side that square off the grid.
  const scopedShiftCount = useMemo(() => {
    let count = 0;
    for (const [key, dayShifts] of shiftsByDay) {
      if (new Date(key).getMonth() === monthStart.getMonth()) count += dayShifts.length;
    }
    return count;
  }, [shiftsByDay, monthStart]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeading
        title="Schedule"
        subtitle={isManager ? 'Build the week for both locations.' : 'Your upcoming shifts.'}
      />

      <NeedsAttention
        collapsible
        sections={['shiftsInClosures', 'openShifts', 'unpublishedRota', 'shiftsForLeavers']}
      />

      {!isManager && ownWeeks && ownWeeks.length > 0 && (
        <div className="mb-4">
          <MyOvertimeNotice weeks={ownWeeks} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            view === 'week'
              ? setWeekStart((current) => addDays(current, -7))
              : setMonthStart((current) => addMonths(current, -1))
          }
          className={buttonClass('secondary', 'sm')}
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => {
            setWeekStart(startOfWeek(new Date()));
            setMonthStart(startOfMonth(new Date()));
          }}
          className={buttonClass('secondary', 'sm')}
        >
          {view === 'week' ? 'This week' : 'This month'}
        </button>
        <button
          type="button"
          onClick={() =>
            view === 'week'
              ? setWeekStart((current) => addDays(current, 7))
              : setMonthStart((current) => addMonths(current, 1))
          }
          className={buttonClass('secondary', 'sm')}
        >
          Next →
        </button>

        {/* Switching keeps you where you were: a week in March goes to March,
            and picking a day in March goes back to that week — not to today. */}
        <div className="ml-auto flex rounded-lg border border-slate-300 bg-white p-0.5">
          {(['week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => {
                try {
                  window.localStorage.setItem(VIEW_KEY, option);
                } catch {
                  // A remembered preference is a convenience, not a feature.
                }
                if (option === 'month') {
                  setMonthStart(startOfMonth(weekStart));
                } else if (startOfMonth(weekStart).getTime() !== monthStart.getTime()) {
                  // Coming back to a different month than you left: land on its
                  // first week rather than on a week you are no longer looking at.
                  setWeekStart(startOfWeek(monthStart));
                }
                setView(option);
              }}
              className={`rounded-md px-3 py-1 text-sm font-medium max-sm:py-2.5 transition ${
                view === option
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {option === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Up here, above the rota, rather than under the coverage squares at the
          foot of the page: overtime is the warning a manager has to act on
          before the week is published, so it is the first thing on screen. */}
      {isManager && coverage && coverage.overtime.length > 0 && (
        <div className="mb-4">
          <OvertimeNotice
            overtime={coverage.overtime}
            thresholdHours={coverage.overtimeThresholdHours}
          />
        </div>
      )}

      {isManager && planResult && (
        <div className="mb-4">
          <PlanResultNotice result={planResult} onDismiss={() => setPlanResult(null)} />
        </div>
      )}

      {isManager && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {view === 'week' && (
            <>
              <div
                className="flex rounded-lg border border-slate-300 bg-white p-0.5"
                role="group"
                aria-label="Show the rota"
              >
                {(
                  [
                    ['person', 'Everyone'],
                    ['location', 'By location'],
                    ['role', 'By job role'],
                  ] as const
                ).map(([option, label]) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={grouping === option}
                    onClick={() => {
                      setGrouping(option);
                      try {
                        window.localStorage.setItem(GROUPING_KEY, option);
                      } catch {
                        // A remembered preference is a convenience, not a feature.
                      }
                    }}
                    className={`rounded-md px-3 py-1 text-sm font-medium max-sm:py-2.5 ${
                      grouping === option
                        ? 'bg-brand-50 text-brand-800'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          <select
            aria-label="Show location"
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white py-1.5 pl-2 pr-8 text-sm"
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
            <option value={WORK_FROM_HOME_FILTER}>Work from home</option>
          </select>
          <select
            aria-label="Show job role"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white py-1.5 pl-2 pr-8 text-sm"
          >
            <option value="">All job roles</option>
            {jobRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          {view === 'month' && (
            <PersonPicker
              label="Show person"
              value={personFilter}
              onChange={setPersonFilter}
              employees={pickablePeople}
              jobRoles={jobRoles}
            />
          )}
          <span className="flex-1" />
          {view === 'week' && (
            <Link
              to={`/schedule/print?week=${localDate(weekStart)}${locationFilter && locationFilter !== WORK_FROM_HOME_FILTER ? `&location=${locationFilter}` : ''}`}
              className={buttonClass('secondary', 'sm')}
            >
              Print
            </Link>
          )}
          <button
            type="button"
            disabled={copying}
            onClick={() => void copyPreviousWeek()}
            className={buttonClass('secondary', 'sm')}
          >
            {copying ? 'Copying…' : 'Copy last week into this one'}
          </button>
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
                      ['Shift', 'One shift for one person', 'shift'],
                      ['Repeating shifts', 'Days each week, with or without an end date', 'repeat'],
                      ['Event', 'A meeting or something on the calendar', 'event'],
                      ['Holiday or closure', 'An office shut, once or every year', 'closure'],
                    ] as const
                  ).map(([label, hint, what]) => (
                    <button
                      key={what}
                      type="button"
                      role="menuitem"
                      aria-label={label}
                      onClick={() => openAdd(what)}
                      className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="block text-sm font-medium text-slate-900">{label}</span>
                      <span className="block text-xs text-slate-500">{hint}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isManager && eventForm && (
        <div className="mb-6">
          <EventForm
            key={eventForm.event?.id ?? `new-${eventForm.kind ?? 'EVENT'}`}
            event={eventForm.event}
            initialKind={eventForm.kind}
            employees={employees}
            locations={locations}
            jobRoles={jobRoles}
            defaultDate={newEventDay(view === 'week' ? weekStart : monthStart)}
            onSaved={(created) => {
              setEventForm(null);
              setEventNotice(created > 1 ? `Saved — ${created} dates are on the schedule.` : null);
              void load();
            }}
            onCancel={() => setEventForm(null)}
          />
        </div>
      )}

      {eventNotice && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200"
        >
          {eventNotice}
        </p>
      )}

      {openEvent && (
        <EventDialog
          event={openEvent}
          canEdit={isManager}
          onClose={() => setOpenEvent(null)}
          onEdit={() => {
            setEventForm({ event: openEvent });
            setOpenEvent(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onRemoved={() => {
            setOpenEvent(null);
            void load();
          }}
        />
      )}

      {isManager && planning && (
        <div className="mb-6">
          <RepeatShiftsForm
            employees={employees}
            locations={locations}
            jobRoles={jobRoles}
            defaultFrom={weekStart.toISOString().slice(0, 10)}
            onCreated={(result) => {
              setPlanResult(result);
              setPlanning(false);
              if (result.standing) setStandingVersion((v) => v + 1);
              void load();
            }}
          />
        </div>
      )}

      {isManager && adding && (
        <div className="mb-6">
          <NewShiftForm
            employees={employees}
            locations={locations}
            jobRoles={jobRoles}
            defaultDate={weekStart}
            onCreated={() => {
              setAdding(false);
              void load();
            }}
            onCancel={() => setAdding(false)}
            onError={setError}
          />
        </div>
      )}

      {/* Which month or week this is, large, right above the calendar and under
          the buttons (Dominguez, September 2026) — it was a small label beside
          Previous and Next, easy to miss. */}
      <h2
        className="mb-3 text-2xl font-bold text-slate-900 sm:text-3xl"
        data-testid="schedule-period"
      >
        {view === 'week'
          ? `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(
              weekStart,
              6,
            ).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
          : monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </h2>

      {/* The week grid is one column on a phone, so it reads as a list of days
          rather than seven squeezed columns. Its test id is how the phone
          checks tell it apart from the coverage strip above, which also shows
          weekday names. */}
      {loading ? (
        <Card className="p-6">
          <Spinner label="Loading schedule" />
        </Card>
      ) : view === 'month' ? (
        <>
          {isManager && monthScope && (
            <p className="mb-2 text-sm text-slate-700" data-testid="month-person">
              Only <span className="font-semibold">{monthScope}</span>
              {scopedShiftCount === 0
                ? ' — no shifts this month.'
                : ` — ${scopedShiftCount} shift${scopedShiftCount === 1 ? '' : 's'} this month.`}
            </p>
          )}
          <RotaLegend
            locations={locations}
            colourOf={locationColourFn(locations)}
            jobRoles={jobRoles}
          />
          <MonthGrid
            colourOf={locationColourFn(locations)}
            days={days}
            monthStart={monthStart}
            shiftsByDay={shiftsByDay}
            events={events}
            birthdays={birthdaysByDay(birthdays)}
            // One person picked: their times, as staff see their own month.
            showNames={isManager && !personFilter}
            onPersonMenu={isManager ? personMenu.open : undefined}
            onPickDay={(day) => {
              setWeekStart(startOfWeek(day));
              setView('week');
              try {
                window.localStorage.setItem(VIEW_KEY, 'week');
              } catch {
                // As above.
              }
            }}
          />
        </>
      ) : (
        <RotaTable
          days={days}
          shifts={shifts}
          employees={isManager ? employees : me ? [me] : []}
          locations={locations}
          jobRoles={jobRoles}
          coverage={isManager ? (coverage?.days ?? null) : null}
          timeOff={timeOff}
          birthdays={birthdays}
          events={events}
          onOpenEvent={setOpenEvent}
          overtimeThresholdHours={coverage?.overtimeThresholdHours ?? 40}
          overtime={coverage?.overtime}
          ownWeeks={ownWeeks ?? undefined}
          grouping={grouping}
          locationFilter={locationFilter}
          roleFilter={roleFilter}
          canEdit={isManager}
          onPersonMenu={isManager ? personMenu.open : undefined}
          selfId={isManager ? undefined : me?.id}
          onChanged={() => void load()}
          onPlanned={(result) => {
            setPlanResult(result);
            if (result.standing) setStandingVersion((v) => v + 1);
          }}
          onError={setError}
        />
      )}

      {/* The day-by-day strip is a week's worth of squares and only reads as
          one; a month of them would be a second, worse calendar next to the
          real one. Overtime is per-week either way and sits at the top of the
          page in both views. */}
      {isManager && coverage && coverage.days.length > 0 && (
        <div className="mt-4">
          {view === 'week' ? (
            <CoverageStrip days={coverage.days} />
          ) : (
            unavailableShifts(coverage.days).length > 0 && (
              <Card className="space-y-3 p-4">
                <h2 className="text-sm font-semibold text-slate-900">Worth a look this month</h2>
                <AvailabilityNotice clashes={unavailableShifts(coverage.days)} />
              </Card>
            )
          )}
        </div>
      )}

      {!loading &&
        !shifts.some((shift) => shift.status !== 'CANCELLED') &&
        events.length === 0 &&
        !isManager && (
          <div className="mt-4">
            <EmptyState>Nothing scheduled for you this week.</EmptyState>
          </div>
        )}

      <div className="mt-6">
        {isManager ? (
          <Card className="p-4" testId="recurring-card">
            <div
              role="tablist"
              aria-label="Regular shifts and holidays"
              className="mb-3 flex gap-1"
            >
              {(
                [
                  ['shifts', '🔁 Regular shifts'],
                  ['closures', '🔒 Holidays and closures'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={recurringTab === id}
                  onClick={() => setRecurringTab(id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    recurringTab === id
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {recurringTab === 'shifts' ? (
              <StandingShiftsCard
                bare
                version={standingVersion}
                employees={employees}
                locations={locations}
                jobRoles={jobRoles}
                onChanged={() => void load()}
              />
            ) : (
              closuresCard(true)
            )}
          </Card>
        ) : (
          closuresCard(false)
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <CalendarLinkCard />
        <Link to="/availability" className={`inline-block ${buttonClass('secondary', 'md')}`}>
          {isManager ? 'Availability — yours and the team’s' : 'When you can’t work'}
        </Link>
      </div>
      {personMenu.menu}
    </div>
  );
}

/// The value the Employee list uses for "nobody yet — an open shift".
const OPEN_SHIFT = 'open';

function NewShiftForm({
  employees,
  locations,
  jobRoles,
  defaultDate,
  onCreated,
  onCancel,
  onError,
}: {
  employees: Employee[];
  locations: Location[];
  jobRoles: JobRole[];
  defaultDate: Date;
  onCreated: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [jobRoleId, setJobRoleId] = useState('');
  /// An office id, or Work from home.
  const [place, setPlace] = useState('');
  const [startsAt, setStartsAt] = useState(() => defaultInput(defaultDate, 9));
  const [endsAt, setEndsAt] = useState(() => defaultInput(defaultDate, 17));
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  // Only offer locations the chosen employee is actually assigned to — the API
  // rejects anything else, and a disabled option explains why better than a 400.
  const selectedEmployee =
    employeeId === OPEN_SHIFT
      ? undefined
      : employees.find((employee) => employee.id === employeeId);
  const availableLocations = selectedEmployee
    ? locations.filter((location) =>
        selectedEmployee.locations.some((assignment) => assignment.locationId === location.id),
      )
    : locations;

  const canWorkFromHome = Boolean(selectedEmployee);

  useEffect(() => {
    if (place === WORK_FROM_HOME && canWorkFromHome) return;
    if (availableLocations.length > 0 && !availableLocations.some((l) => l.id === place)) {
      setPlace(availableLocations[0].id);
    }
  }, [availableLocations, place, canWorkFromHome]);

  const { locationId, isRemote } = placeToShift(place, homeOfficeOf(selectedEmployee));

  // Checked while the form is filled in, so the warning is there before
  // Create is pressed; checked again, fresh, when it is.
  const startsIso = isoOrEmpty(startsAt);
  const endsIso = isoOrEmpty(endsAt);
  const proposed =
    selectedEmployee && locationId && startsIso && endsIso && endsIso > startsIso
      ? { employeeId: selectedEmployee.id, locationId, startsAt: startsIso, endsAt: endsIso }
      : null;
  const overtimeCheck = useOvertimeCheck(proposed);
  const who = selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : '';
  // Open shifts too: nobody should be wanted while the office is shut.
  const closure =
    locationId && startsIso && endsIso && endsIso > startsIso
      ? { locationId, startsAt: startsIso, endsAt: endsIso }
      : null;
  const closures = useClosureCheck(closure);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (closure && !(await confirmClosure(confirm, closure))) return;
    if (proposed && !(await confirmOvertime(confirm, proposed, who))) return;
    setBusy(true);
    try {
      await api.createShift({
        employeeId: employeeId === OPEN_SHIFT ? null : employeeId,
        locationId,
        jobRoleId: jobRoleId || null,
        isRemote,
        // datetime-local gives local wall-clock time; the API stores UTC.
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        status: 'PUBLISHED',
      });
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not create that shift.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="employee" className="block text-sm font-medium text-slate-700">
            Employee
          </label>
          <select
            id="employee"
            required
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          >
            <option value="">Choose someone…</option>
            <option value={OPEN_SHIFT}>Nobody yet — an open shift to fill</option>
            {employees
              .filter((employee) => employee.employmentStatus === 'ACTIVE')
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                </option>
              ))}
          </select>
          {employeeId === OPEN_SHIFT && (
            <p className="mt-1 text-xs text-amber-800">
              It shows on the rota as an open shift, flagged until somebody is put in it.
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="shift-role" className="block text-sm font-medium text-slate-700">
            Job role{' '}
            {employeeId === OPEN_SHIFT && (
              <span className="font-normal text-slate-500">(who should fill it)</span>
            )}
          </label>
          <JobRoleSelect
            id="shift-role"
            value={jobRoleId}
            onChange={setJobRoleId}
            jobRoles={jobRoles}
            personId={selectedEmployee?.id}
            open={employeeId === OPEN_SHIFT}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="shift-location" className="block text-sm font-medium text-slate-700">
            Location
          </label>
          <PlaceSelect
            id="shift-location"
            value={place}
            onChange={setPlace}
            offices={availableLocations}
            allowHome={canWorkFromHome}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          />
          {isRemote && <WorkFromHomeNote />}
          {selectedEmployee && availableLocations.length === 0 && (
            <p className="mt-1 text-xs text-rose-600">
              This employee is not assigned to any location yet.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="starts" className="block text-sm font-medium text-slate-700">
            Starts
          </label>
          <input
            id="starts"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          />
        </div>

        <div>
          <label htmlFor="ends" className="block text-sm font-medium text-slate-700">
            Ends
          </label>
          <input
            id="ends"
            type="datetime-local"
            required
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          />
        </div>

        {closures.length > 0 && (
          <div className="sm:col-span-2">
            <ClosureWarning closures={closures} />
          </div>
        )}
        {proposed && overtimeCheck && overtimeCheck.level !== 'ok' && (
          <div className="sm:col-span-2">
            <OvertimePreview check={overtimeCheck} name={who} />
          </div>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={busy || !employeeId || !locationId}
            className={buttonClass('primary', 'md')}
          >
            {busy ? 'Saving…' : 'Create shift'}
          </button>
          <button type="button" onClick={onCancel} className={buttonClass('secondary', 'md')}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

/// A half-typed datetime-local value is not a date yet; say nothing until it is.
function isoOrEmpty(value: string): string {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
}

function defaultInput(day: Date, hour: number): string {
  const date = new Date(day);
  date.setHours(hour, 0, 0, 0);
  return toLocalInputValue(date);
}

/// A week at a glance: hours covered, who is off, and the days with nobody on.
function CoverageStrip({ days }: { days: CoverageDay[] }) {
  const totalHours = Math.round(days.reduce((sum, day) => sum + day.staffedHours, 0) * 10) / 10;
  const openShifts = days.reduce((sum, day) => sum + day.openShifts, 0);
  // A day with only open shifts still has nobody on.
  const emptyDays = days.filter((day) => day.peopleScheduled === 0);
  const conflicts = days.flatMap((day) =>
    day.shifts.filter((shift) => shift.conflictsWithLeave).map((shift) => ({ day, shift })),
  );
  const unavailable = unavailableShifts(days);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Coverage this week</h2>
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{totalHours}</span> hours scheduled
          {openShifts > 0 && (
            <>
              {' · '}
              <span className="font-semibold text-amber-800">
                {openShifts} open shift{openShifts === 1 ? '' : 's'}
              </span>
            </>
          )}
        </span>
      </div>

      {emptyDays.length > 0 && (
        <p className="mt-3 text-sm text-amber-800">
          {emptyDays.length === 7
            ? 'Nobody is scheduled at all this week.'
            : `Nobody scheduled on ${emptyDays
                .map((day) =>
                  new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {
                    timeZone: 'UTC',
                    weekday: 'long',
                  }),
                )
                .join(', ')}.`}
        </p>
      )}

      {conflicts.length > 0 && (
        <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-inset ring-rose-200">
          <p className="font-medium">
            {conflicts.length} shift{conflicts.length === 1 ? '' : 's'} scheduled during approved
            leave
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {conflicts.slice(0, 5).map(({ day, shift }) => (
              <li key={shift.id}>
                {shift.employeeName} —{' '}
                {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {
                  timeZone: 'UTC',
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unavailable.length > 0 && (
        <div className="mt-3">
          <AvailabilityNotice clashes={unavailable} />
        </div>
      )}

      {days.some((day) => day.away.length > 0) && (
        <p className="mt-3 text-xs text-slate-500">
          Away this week:{' '}
          {[...new Set(days.flatMap((day) => day.away.map((person) => person.employeeName)))].join(
            ', ',
          )}
        </p>
      )}
    </Card>
  );
}

function unavailableShifts(days: CoverageDay[]) {
  return days.flatMap((day) =>
    day.shifts
      .filter((shift) => shift.unavailable)
      .map((shift) => ({ day, shift, reason: shift.unavailable! })),
  );
}

/**
 * Shifts on a time somebody said they cannot work.
 *
 * A warning, like overtime, not a refusal like a clash: the manager may have
 * asked, and the rota is theirs. What it must not be is silent.
 */
function AvailabilityNotice({
  clashes,
}: {
  clashes: { day: CoverageDay; shift: CoverageDay['shifts'][number]; reason: string }[];
}) {
  return (
    <div
      data-testid="availability-notice"
      className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
    >
      <p className="font-medium">
        {clashes.length === 1
          ? '1 shift is at a time someone said they can’t work'
          : `${clashes.length} shifts are at times people said they can’t work`}
      </p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {clashes.slice(0, 8).map(({ day, shift, reason }) => (
          <li key={shift.id}>
            <span className="font-medium">{shift.employeeName}</span> —{' '}
            {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {
              timeZone: 'UTC',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
            : {reason.replace(/^Not available/, 'not available')}
          </li>
        ))}
        {clashes.length > 8 && <li>…and {clashes.length - 8} more</li>}
      </ul>
    </div>
  );
}

/**
 * Who the rota puts past the overtime line, and by how much.
 *
 * Only people actually over it. "Close to overtime" is said inside the form
 * while a shift is being added or assigned, and not left standing here once
 * it is saved (Dominguez, September 2026).
 *
 * Shown at the top of the schedule in both views. Overtime is a per-week
 * question either way, which is why one component serves both — a month view
 * that quietly used a different rule would be worse than one that said nothing.
 */
function OvertimeNotice({
  overtime,
  thresholdHours,
}: {
  overtime: OvertimeWarning[];
  /// From the server, not a constant here. The practice can move this line, and
  /// a warning that names the wrong number in confident words is worse than one
  /// that says nothing.
  thresholdHours: number;
}) {
  const week = (weekStart: string) =>
    new Date(`${weekStart}T00:00:00Z`).toLocaleDateString(undefined, {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    });

  return (
    <div data-testid="overtime-notice" className="space-y-2">
      {overtime.length > 0 && (
        <div className="rounded-xl border-l-4 border-rose-600 bg-rose-50 p-4 text-sm text-rose-900 shadow-sm ring-1 ring-inset ring-rose-200">
          <p className="text-base font-semibold">
            ⚠{' '}
            {overtime.length === 1
              ? `1 person is scheduled past ${thresholdHours} hours`
              : `${overtime.length} people are scheduled past ${thresholdHours} hours`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {overtime.map((warning) => (
              <li key={`${warning.employeeId}-${warning.weekStart}`}>
                <span className="font-semibold">{warning.employeeName}</span> —{' '}
                {warning.scheduledHours} hours in the week of {week(warning.weekStart)}, so{' '}
                <span className="font-semibold">{warning.overtimeHours} at overtime</span>
                {/* The hours are totalled across the practice, so say when some of
                    them are somewhere this screen is not showing — otherwise the
                    number looks wrong to whoever is reading it. */}
                {warning.spansLocations && ' (including hours at another location)'}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-rose-800">
            Hours as scheduled, not as worked. Hourly staff only. Staff are told when a published
            rota puts them over.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A month at a glance — who is on, and when.
 *
 * This is mostly a staff screen. A manager builds the rota a week at a time on
 * a laptop; an employee opens the month to see which days they are working, and
 * opens it on a phone. That shapes what each square holds: an employee sees
 * their own shifts, so one compact time per day is enough and fits at seven
 * columns even at 390px. A manager sees everybody, so the square lists first
 * names and says how many more there are.
 *
 * A day is still a link to its week, which is where shifts are added and
 * removed.
 */
function MonthGrid({
  colourOf,
  days,
  monthStart,
  shiftsByDay,
  events,
  birthdays,
  showNames,
  onPersonMenu,
  onPickDay,
}: {
  /// Right-click on somebody's shift: their profile, their schedule. Managers only.
  onPersonMenu?: (event: React.MouseEvent, person: { id: string; name: string }) => void;
  /// An office's colour, the same as the week's.
  colourOf: (locationId: string) => string;
  days: Date[];
  monthStart: Date;
  shiftsByDay: Map<string, Shift[]>;
  /// Meetings and practice events: a line each above the shifts.
  events: PracticeEvent[];
  /// YYYY-MM-DD → whose birthday it is.
  birthdays: Map<string, BirthdayEntry[]>;
  /// A manager sees whose shift it is; an employee is only ever shown their
  /// own, so the name would be their own name forty times.
  showNames: boolean;
  onPickDay: (day: Date) => void;
}) {
  const today = new Date().toDateString();
  // On a phone a square is forty pixels wide, so it shows three and counts the
  // rest. From `sm` up the square grows to list every shift — a manager reads
  // the month to see who is on, and "+4 more" answers nothing.
  const MAX_LINES = 3;

  return (
    <div data-testid="month-grid">
      {/* Weekday headings, from the grid itself rather than a hardcoded list,
          so they cannot drift out of step with the days below. */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {days.slice(0, 7).map((day) => (
          <p
            key={day.toISOString()}
            className="text-center text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            {day.toLocaleDateString(undefined, { weekday: 'narrow' })}
            <span className="hidden sm:inline">
              {day.toLocaleDateString(undefined, { weekday: 'short' }).slice(1)}
            </span>
          </p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayShifts = shiftsByDay.get(day.toDateString()) ?? [];
          const cakes = (birthdays.get(localDate(day)) ?? []).map(birthdayName);
          const dayEvents = eventsOnDay(events, localDate(day));

          // The days either side of the month are there to square off the grid.
          // They are shown, because a shift on the 1st matters whichever row it
          // lands in, but dimmed so the month still reads as a month.
          const outside = day.getMonth() !== monthStart.getMonth();
          const isToday = day.toDateString() === today;

          // Two renderings of the same shift. The full one is what the screen
          // reader and a laptop get; the short one is what fits in a column
          // about forty pixels wide, where "1pm–9pm" truncates to "1p…" and
          // tells nobody anything. The start time on its own still answers the
          // question an employee opened the month to ask — am I on at nine or
          // at one — and the rest is one tap away in the week.
          const described = dayShifts.map((shift) =>
            showNames
              ? `${shift.employee?.firstName ?? 'Open'} ${formatTimeCompact(shift.startsAt)}–${formatTimeCompact(shift.endsAt)}`
              : `${formatTimeCompact(shift.startsAt)}–${formatTimeCompact(shift.endsAt)}`,
          );
          const shortened = dayShifts.map((shift) =>
            showNames ? (shift.employee?.firstName ?? 'Open') : formatTimeCompact(shift.startsAt),
          );

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onPickDay(day)}
              aria-label={`${day.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })} — ${
                dayShifts.length === 0
                  ? 'no shifts'
                  : `${dayShifts.length} shift${dayShifts.length === 1 ? '' : 's'}: ${described.join(', ')}`
              }${cakes.length > 0 ? ` — birthday: ${cakes.join(', ')}` : ''}${
                dayEvents.length > 0
                  ? ` — event${dayEvents.length === 1 ? '' : 's'}: ${dayEvents.map((event) => event.title).join(', ')}`
                  : ''
              }`}
              className={`flex min-h-[72px] flex-col justify-start rounded-lg border p-1.5 text-left align-top transition hover:border-brand-400 hover:bg-brand-50 sm:min-h-[104px] sm:p-2 ${
                isToday ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200'
              } ${outside ? 'bg-slate-50 opacity-60' : 'bg-white'}`}
            >
              <span
                className={`block text-xs font-semibold sm:text-sm ${
                  isToday ? 'text-brand-800' : 'text-slate-900'
                }`}
              >
                {day.getDate()}
              </span>
              {cakes.length > 0 && (
                <span
                  data-testid={`month-birthday-${localDate(day)}`}
                  className="block truncate text-[10px] leading-4 text-amber-800 sm:text-[11px]"
                >
                  <span aria-hidden="true">🎂</span>{' '}
                  <span className="hidden sm:inline">{cakes.join(', ')}</span>
                </span>
              )}
              {/* Tapping the day opens its week, where the event can be read in full. */}
              {dayEvents.map((event) => (
                <span
                  key={event.id}
                  data-testid={`month-${isClosure(event) ? 'closure' : 'event'}-${localDate(day)}`}
                  className={`mt-0.5 block truncate rounded px-1 text-[10px] font-medium leading-4 ring-1 ring-inset sm:text-[11px] sm:leading-5 ${
                    isClosure(event)
                      ? 'bg-slate-200 text-slate-900 ring-slate-400'
                      : 'bg-indigo-50 text-indigo-950 ring-indigo-200'
                  }`}
                >
                  <span aria-hidden="true">{isClosure(event) ? '🔒' : '📅'}</span>
                  <span className="hidden sm:inline"> {event.title}</span>
                </span>
              ))}

              {dayShifts.length === 0 ? (
                <span className="mt-1 block text-[11px] text-slate-300 sm:text-xs">—</span>
              ) : (
                <span className="mt-0.5 block space-y-0.5">
                  {dayShifts.map((shift, index) => {
                    const remote = shift.isRemote === true;
                    const open = !shift.employee;
                    const base = remote ? REMOTE_COLOUR : colourOf(shift.locationId);
                    const roleColour = shift.jobRole ? jobRoleHex(shift.jobRole.colour) : null;
                    const draft = shift.status === 'DRAFT';
                    return (
                      <span
                        key={shift.id}
                        title={[
                          described[index],
                          remote ? 'work from home' : shift.location?.name,
                          shift.jobRole?.name,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        onContextMenu={
                          onPersonMenu && shift.employee
                            ? (event) =>
                                onPersonMenu(event, {
                                  id: shift.employee!.id,
                                  name: `${shift.employee!.firstName} ${shift.employee!.lastName}`,
                                })
                            : undefined
                        }
                        style={shiftChipStyle({ base, roleColour, open, draft })}
                        className={`block truncate rounded border-2 px-1 text-[10px] leading-4 text-slate-900 sm:text-[11px] sm:leading-5 ${
                          open ? 'bg-amber-100 text-amber-950' : ''
                        } ${draft ? 'border-dashed' : ''} ${
                          index >= MAX_LINES ? 'hidden sm:block' : ''
                        }`}
                      >
                        <span className="sm:hidden">{shortened[index]}</span>
                        <span className="hidden sm:inline">{described[index]}</span>
                      </span>
                    );
                  })}
                  {described.length > MAX_LINES && (
                    <span className="block px-1 text-[10px] text-slate-600 sm:hidden">
                      +{described.length - MAX_LINES} more
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Pick a day to open its week, where shifts are added and removed.
      </p>
    </div>
  );
}

/// "2026-10-14" as that day at local midnight, or null for anything else.
function parseDay(value: string | null): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(day.getTime()) ? null : day;
}

/// Where a new event starts: the first day on screen, unless that has passed.
function newEventDay(firstOnScreen: Date): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return firstOnScreen < today ? today : firstOnScreen;
}
