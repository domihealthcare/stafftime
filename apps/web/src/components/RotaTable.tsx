import { useDialog } from './useDialog';
import { REMOTE_COLOUR, locationColourFn, shiftChipStyle, tint } from '../lib/shift-colours';
import { useMemo, useState } from 'react';
import { birthdayName } from '../lib/birthday';
import { ApiError, api } from '../lib/api';
import {
  formatCalendarDate,
  formatTime,
  formatTimeCompact,
  localDate,
  toLocalInputValue,
} from '../lib/format';
import type {
  BirthdayEntry,
  CoverageDay,
  Employee,
  JobRole,
  Location,
  OvertimeWarning,
  OwnOvertimeWeek,
  PracticeEvent,
  PlanResult,
  PtoRequest,
  Shift,
} from '../lib/types';
import { PTO_TYPE_LABELS, timeOffOn } from '../lib/time-off';
import { jobRoleHex } from '../lib/job-role-colours';
import { atPlace, forRole, WORK_FROM_HOME_FILTER } from '../lib/shift-filters';
import { useConfirm } from './ConfirmDialog';
import { confirmOvertime, OvertimePreview, useOvertimeCheck } from './OvertimeAlerts';
import { Avatar } from './Avatar';
import {
  PlaceSelect,
  WORK_FROM_HOME,
  WorkFromHomeNote,
  homeOfficeOf,
  placeToShift,
} from './PlaceSelect';
import { JobRoleSelect } from './JobRoleSelect';
import { WeekdayToggles } from './WeekdayToggles';
import {
  ClosureWarning,
  closuresCovering,
  confirmClosure,
  EventChip,
  eventsOnDay,
  isClosure,
  useClosureCheck,
} from './PracticeEvents';
import { Alert, buttonClass } from './ui';

export type RotaGrouping = 'person' | 'location' | 'role';

interface Row {
  key: string;
  kind: 'person' | 'open';
  label: string;
  sublabel?: string;
  person?: Employee;
  /// Where a new shift added from this row goes, and for which job.
  locationId?: string;
  jobRoleId?: string | null;
  shifts: Shift[];
}

interface Section {
  key: string;
  title?: string;
  colour?: string;
  rows: Row[];
}

const hoursOf = (shift: Shift) =>
  (new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) / 3_600_000;

const round1 = (value: number) => Math.round(value * 10) / 10;

/// Whole days on from a "YYYY-MM-DD", in UTC so a clock change cannot move it.
function addDayKey(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The week as a rota: one row per person, one column per day — and, above
 * the people, a row of **open shifts** for each office: slots the practice
 * needs filled that nobody is on yet, flagged until somebody is.
 *
 * Grouped three ways: everyone together, by office, or by job role. The data
 * is the same; only the rows change.
 */
export function RotaTable({
  days,
  shifts,
  employees,
  locations,
  jobRoles,
  coverage,
  timeOff = [],
  birthdays = [],
  events = [],
  onOpenEvent,
  overtimeThresholdHours,
  overtime,
  ownWeeks,
  grouping,
  locationFilter,
  roleFilter,
  canEdit,
  onPersonMenu,
  showEmptyOpen,
  onShowEmptyOpen,
  selfId,
  onChanged,
  onPlanned,
  onError,
}: {
  days: Date[];
  shifts: Shift[];
  employees: Employee[];
  locations: Location[];
  jobRoles: JobRole[];
  coverage: CoverageDay[] | null;
  /// Time off in the week: approved blocks a day, a request waiting on a
  /// manager is flagged. Staff get only their own from the API.
  timeOff?: PtoRequest[];
  /// Colleagues' birthdays this week: a cake under the day, for everybody,
  /// and on the person's own row.
  birthdays?: BirthdayEntry[];
  /// Meetings and practice events this week: a row of their own above
  /// everybody's shifts. Never counted as hours.
  events?: PracticeEvent[];
  onOpenEvent?: (event: PracticeEvent) => void;
  overtimeThresholdHours: number;
  /// From the server, per person per week and across every location — so a
  /// row filtered to one office still shows the week as a whole.
  overtime?: OvertimeWarning[];
  /// For staff: their own weeks, from their published shifts.
  ownWeeks?: OwnOvertimeWeek[];
  grouping: RotaGrouping;
  locationFilter: string;
  roleFilter: string;
  canEdit: boolean;
  /// Right-click on a person or their shift: profile, schedule. Managers only.
  onPersonMenu?: (event: React.MouseEvent, person: { id: string; name: string }) => void;
  /// Open-shift rows with nothing in them stay out of the way until asked for
  /// (a row for every office and job role is a lot of empty table). Held by
  /// the page, because the table is rebuilt after every save.
  showEmptyOpen: boolean;
  onShowEmptyOpen: (show: boolean) => void;
  /// For staff: only their own row.
  selfId?: string;
  onChanged: () => void;
  /// A shift added from a cell as a repeating one: what was made and skipped.
  onPlanned?: (result: PlanResult) => void;
  onError: (message: string) => void;
}) {
  const [menu, setMenu] = useState<Shift | null>(null);
  const [adding, setAdding] = useState<{ row: Row; day: Date } | null>(null);

  const dayKeys = days.map((day) => localDate(day));
  const colourOf = useMemo(() => {
    return locationColourFn(locations);
  }, [locations]);

  const live = shifts.filter((shift) => shift.status !== 'CANCELLED');
  const weekEvents = events.filter((event) =>
    dayKeys.some((key) => eventsOnDay([event], key).length > 0),
  );

  /// Where each person's week stands against the overtime line.
  ///
  /// Overtime weeks start on the pay period's weekday, which need not be the
  /// Sunday the rota starts on, so the week on screen can touch two of them.
  /// A warning for any overtime week overlapping the days in view is shown;
  /// the latest first, as it holds most of them.
  const overtimeWeeks = (weekStarts: string[]) =>
    [...new Set(weekStarts)]
      .filter((start) => start <= dayKeys[dayKeys.length - 1] && addDayKey(start, 6) >= dayKeys[0])
      .sort()
      .reverse();
  const weekStanding = (personId: string) => {
    const candidates = overtimeWeeks([
      ...(overtime ?? []).filter((w) => w.employeeId === personId).map((w) => w.weekStart),
      ...(selfId ? (ownWeeks ?? []).map((w) => w.weekStart) : []),
    ]);
    for (const weekStart of candidates) {
      const over = overtime?.find((w) => w.employeeId === personId && w.weekStart === weekStart);
      if (over)
        return {
          level: 'over' as const,
          hours: over.scheduledHours,
          overBy: over.overtimeHours,
          weekStart,
        };
      const own = selfId ? ownWeeks?.find((w) => w.weekStart === weekStart) : undefined;
      if (own)
        return {
          level: 'over' as const,
          hours: own.scheduledHours,
          overBy: own.overtimeHours,
          weekStart,
        };
    }
    // No figures from the server yet (still loading): nothing, rather than
    // a guess from the row — the row's week and the overtime week need not
    // be the same seven days, so its sum could warn where the server would not.
    return null;
  };
  const warnings = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of coverage ?? []) {
      for (const shift of day.shifts) {
        if (shift.conflictsWithLeave) map.set(shift.id, 'Scheduled during approved leave');
        else if (shift.unavailable) map.set(shift.id, shift.unavailable);
      }
    }
    // A shift while its office is closed says so first: it is the likelier
    // mistake — a repeating rota running straight through Christmas.
    for (const shift of shifts) {
      const [closure] = closuresCovering(events, shift);
      if (closure) map.set(shift.id, `Office closed: ${closure.title}`);
    }
    return map;
  }, [coverage, shifts, events]);

  const membersOf = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const role of jobRoles) map.set(role.id, new Set(role.members.map((member) => member.id)));
    return map;
  }, [jobRoles]);
  const roleColourOfPerson = (id: string | null) => {
    if (!id) return null;
    const first = jobRoles.find((role) => membersOf.get(role.id)?.has(id));
    return first ? jobRoleHex(first.colour) : null;
  };
  const rolesOfPerson = (id: string) =>
    jobRoles.filter((role) => membersOf.get(role.id)?.has(id)).map((role) => role.name);

  // "Work from home" has no office rows: an open shift is always at an office.
  const fromHome = locationFilter === WORK_FROM_HOME_FILTER;
  const visibleLocations = locations.filter(
    (location) =>
      !fromHome &&
      location.isActive !== false &&
      (!locationFilter || location.id === locationFilter),
  );
  const workingFromHome = new Set(
    live.filter((shift) => shift.isRemote).map((shift) => shift.employeeId),
  );
  const roleMembers = membersOf.get(roleFilter) ?? new Set<string>();
  const visibleRoles = jobRoles.filter((role) => !roleFilter || role.id === roleFilter);

  const staff = employees
    .filter(
      (person) => person.employmentStatus === 'ACTIVE' || person.employmentStatus === 'ON_LEAVE',
    )
    .filter((person) => !roleFilter || membersOf.get(roleFilter)?.has(person.id))
    .filter((person) => !fromHome || workingFromHome.has(person.id))
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName));
  const worksAt = (person: Employee, locationId: string) =>
    person.locations.some((assignment) => assignment.locationId === locationId);

  const personRow = (person: Employee, only?: { locationId?: string }): Row => ({
    key: `p-${person.id}-${only?.locationId ?? ''}`,
    kind: 'person',
    label: `${person.preferredName ?? person.firstName} ${person.lastName}`,
    sublabel: rolesOfPerson(person.id).join(' · ') || undefined,
    person,
    locationId: only?.locationId,
    shifts: live.filter(
      (shift) =>
        shift.employeeId === person.id &&
        (!only?.locationId || shift.locationId === only.locationId) &&
        atPlace(shift, locationFilter) &&
        forRole(shift, roleFilter, roleMembers),
    ),
  });

  const openRow = (location: Location, role?: JobRole | null): Row => ({
    key: `o-${location.id}-${role?.id ?? 'any'}`,
    kind: 'open',
    label: 'Open shifts',
    sublabel: role ? `${location.name} · ${role.name}` : location.name,
    locationId: location.id,
    jobRoleId: role?.id ?? null,
    shifts: live.filter(
      (shift) =>
        shift.employeeId === null &&
        shift.locationId === location.id &&
        (role === undefined
          ? !roleFilter || shift.jobRoleId === roleFilter
          : (shift.jobRoleId ?? null) === (role?.id ?? null)),
    ),
  });

  const sections: Section[] = useMemo(() => {
    if (selfId) {
      const me = employees.find((person) => person.id === selfId);
      const mine = live.filter((shift) => shift.employeeId === selfId);
      return [
        {
          key: 'me',
          rows: [
            {
              key: 'me',
              kind: 'person',
              label: 'Your shifts',
              person: me,
              shifts: mine,
            },
          ],
        },
      ];
    }
    if (grouping === 'location' && fromHome) {
      return [
        {
          key: 'home',
          title: 'Work from home',
          rows: staff.map((person) => personRow(person)),
        },
      ];
    }
    if (grouping === 'location') {
      return visibleLocations.map((location) => ({
        key: location.id,
        title: location.name,
        colour: colourOf(location.id),
        rows: [
          openRow(location),
          ...staff
            .filter((person) => worksAt(person, location.id))
            .map((person) => personRow(person, { locationId: location.id })),
        ],
      }));
    }
    if (grouping === 'role') {
      const withRole: Section[] = visibleRoles.map((role) => ({
        key: role.id,
        title: role.name,
        colour: undefined,
        rows: [
          ...visibleLocations.map((location) => openRow(location, role)),
          ...staff
            .filter((person) => membersOf.get(role.id)?.has(person.id))
            .map((person) => personRow(person)),
        ],
      }));
      if (roleFilter) return withRole;
      const noRole = staff.filter((person) => rolesOfPerson(person.id).length === 0);
      return [
        ...withRole,
        {
          key: 'none',
          title: 'No job role',
          rows: [
            ...visibleLocations.map((location) => openRow(location, null)),
            ...noRole.map((person) => personRow(person)),
          ],
        },
      ];
    }
    return [
      {
        key: 'all',
        rows: [
          ...visibleLocations.map((location) => openRow(location)),
          ...staff
            .filter((person) => !locationFilter || fromHome || worksAt(person, locationFilter))
            .map((person) => personRow(person)),
        ],
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouping, shifts, employees, locations, jobRoles, locationFilter, roleFilter, selfId]);

  const openTotal = live.filter(
    (shift) =>
      shift.employeeId === null &&
      atPlace(shift, locationFilter) &&
      (!roleFilter || shift.jobRoleId === roleFilter),
  ).length;

  const dayOf = (shift: Shift) => localDate(new Date(shift.startsAt));

  return (
    <div>
      {canEdit && openTotal > 0 && (
        <div
          role="status"
          data-testid="open-shift-flag"
          className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          <span aria-hidden="true">⚠</span>
          <span>
            <strong>
              {openTotal} open shift{openTotal === 1 ? '' : 's'}
            </strong>{' '}
            this week nobody is on yet. Click one to put somebody in it.
          </span>
        </div>
      )}

      {canEdit &&
        sections.some((section) =>
          section.rows.some((row) => row.kind === 'open' && row.shifts.length === 0),
        ) && (
          <p className="mb-2 text-xs text-slate-600">
            Rows for open shifts show only when there are some.{' '}
            <button
              type="button"
              data-testid="open-rows-toggle"
              aria-pressed={showEmptyOpen}
              onClick={() => onShowEmptyOpen(!showEmptyOpen)}
              className="font-medium text-brand-700 underline"
            >
              {showEmptyOpen ? 'Hide the empty ones' : 'Show them to add one'}
            </button>
          </p>
        )}

      <RotaLegend locations={locations} colourOf={colourOf} jobRoles={jobRoles} />
      <div
        className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"
        data-testid="week-grid"
      >
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th
                scope="col"
                className="sticky left-0 z-10 w-48 bg-slate-50 px-3 py-2 font-medium text-slate-600"
              >
                {selfId ? 'Week' : 'Person'}
              </th>
              {days.map((day, index) => {
                const cov = coverage?.find((entry) => entry.date === dayKeys[index]);
                // Nobody on a day both offices are shut is the plan, not a gap.
                const shut = eventsOnDay(events, dayKeys[index]).some(
                  (event) => isClosure(event) && event.allDay && event.audience === 'EVERYONE',
                );
                const empty = cov && cov.peopleScheduled === 0 && !shut;
                const isToday = localDate(new Date()) === dayKeys[index];
                return (
                  <th
                    key={dayKeys[index]}
                    scope="col"
                    className={`px-2 py-2 align-top font-medium ${empty && !selfId ? 'bg-amber-50' : ''}`}
                  >
                    <span className={`block ${isToday ? 'text-brand-700' : 'text-slate-900'}`}>
                      {day.toLocaleDateString(undefined, { weekday: 'short' })}{' '}
                      {day.toLocaleDateString(undefined, { day: 'numeric' })}
                    </span>
                    {birthdays
                      .filter((entry) => entry.date === dayKeys[index])
                      .map((entry) => (
                        <span
                          key={entry.id}
                          data-testid={`birthday-${dayKeys[index]}`}
                          className="block text-xs font-normal text-amber-800"
                        >
                          <span aria-hidden="true">🎂</span> {birthdayName(entry)}
                        </span>
                      ))}
                    {cov && !selfId && (
                      <span
                        className="block text-xs font-normal tabular-nums text-slate-500"
                        data-testid={`day-cover-${dayKeys[index]}`}
                      >
                        {cov.peopleScheduled > 0 ? (
                          `${cov.staffedHours} h · ${cov.peopleScheduled} on`
                        ) : shut ? (
                          <span className="font-semibold text-slate-600">Closed</span>
                        ) : (
                          <span className="font-semibold text-amber-800">Nobody on</span>
                        )}
                        {cov.openShifts > 0 && (
                          <span className="block font-semibold text-amber-800">
                            {cov.openShifts} open
                          </span>
                        )}
                        {cov.away.length > 0 && (
                          <span className="block text-slate-500">{cov.away.length} off</span>
                        )}
                      </span>
                    )}
                  </th>
                );
              })}
              <th scope="col" className="px-3 py-2 text-right font-medium text-slate-600">
                Week
              </th>
            </tr>
            {/* Their own row, above the people, because an event is for a group
                rather than for one person — and it is not a shift. */}
            {weekEvents.length > 0 && (
              <tr className="border-b border-slate-200 bg-white" data-testid="rota-events-row">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-3 py-2 text-left align-top text-sm font-medium text-slate-700"
                >
                  <span aria-hidden="true">📅</span> Events
                </th>
                {dayKeys.map((key) => (
                  <td key={key} className="space-y-1 px-1.5 py-1.5 align-top">
                    {eventsOnDay(weekEvents, key).map((event) => (
                      <EventChip
                        key={event.id}
                        event={event}
                        day={key}
                        onOpen={(picked) => onOpenEvent?.(picked)}
                      />
                    ))}
                  </td>
                ))}
                <td className="px-3 py-2 text-right align-top text-xs text-slate-500">Not hours</td>
              </tr>
            )}
          </thead>

          {sections.map((section) => (
            <tbody
              key={section.key}
              data-testid={section.title ? `rota-section-${section.title}` : undefined}
            >
              {section.title && (
                <tr className="border-b border-slate-200 bg-slate-100/70">
                  <th
                    colSpan={days.length + 2}
                    scope="colgroup"
                    className="sticky left-0 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    <span className="inline-flex items-center gap-2">
                      {section.colour && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: section.colour }}
                          aria-hidden="true"
                        />
                      )}
                      {section.title}
                    </span>
                  </th>
                </tr>
              )}
              {section.rows.map((row, rowIndex) => {
                if (row.kind === 'open' && row.shifts.length === 0 && !showEmptyOpen) return null;
                /// Every other person is shaded, so the eye can stay on one row.
                const shaded =
                  row.kind === 'person' &&
                  section.rows.slice(0, rowIndex).filter((other) => other.kind === 'person')
                    .length %
                    2 ===
                    1;
                const total = round1(row.shifts.reduce((sum, shift) => sum + hoursOf(shift), 0));
                const standing =
                  row.kind === 'person' && row.person ? weekStanding(row.person.id) : null;
                const over = standing?.level === 'over';
                if (row.kind === 'open' && row.shifts.length === 0 && !canEdit) return null;
                return (
                  <tr
                    key={row.key}
                    data-testid={
                      row.kind === 'open' ? `open-row-${row.sublabel}` : `rota-row-${row.label}`
                    }
                    className={`border-b-2 border-slate-200 ${row.kind === 'open' ? (row.shifts.length > 0 ? 'bg-amber-50/60' : 'bg-slate-50/40') : over ? 'bg-rose-50/60' : shaded ? 'bg-slate-50' : 'bg-white'}`}
                  >
                    <th
                      scope="row"
                      onContextMenu={
                        onPersonMenu && row.person
                          ? (event) =>
                              onPersonMenu(event, {
                                id: row.person!.id,
                                name: `${row.person!.firstName} ${row.person!.lastName}`,
                              })
                          : undefined
                      }
                      className={`sticky left-0 z-10 px-3 py-2 text-left font-normal ${row.kind === 'open' ? (row.shifts.length > 0 ? 'bg-amber-50' : 'bg-slate-50') : over ? 'border-l-4 border-rose-600 bg-rose-50' : shaded ? 'bg-slate-50' : 'bg-white'}`}
                    >
                      <span className="flex items-center gap-2">
                        {row.person ? (
                          <Avatar person={row.person} size="sm" />
                        ) : (
                          <span
                            aria-hidden="true"
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${row.shifts.length > 0 ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-slate-500'}`}
                          >
                            ?
                          </span>
                        )}
                        <span className="min-w-0">
                          <span
                            className={`block truncate font-semibold ${row.kind === 'open' && row.shifts.length > 0 ? 'text-amber-900' : 'text-slate-900'}`}
                          >
                            {row.label}
                          </span>
                          {row.sublabel && (
                            <span className="block truncate text-xs text-slate-500">
                              {row.sublabel}
                            </span>
                          )}
                        </span>
                      </span>
                    </th>
                    {days.map((day, index) => {
                      const inCell = row.shifts
                        .filter((shift) => dayOf(shift) === dayKeys[index])
                        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
                      const off =
                        row.kind === 'person'
                          ? timeOffOn(timeOff, row.person?.id, dayKeys[index])
                          : null;
                      return (
                        <td
                          key={dayKeys[index]}
                          className="group relative px-1.5 py-1.5 align-top"
                          style={off?.status === 'APPROVED' ? OFF_HATCH : undefined}
                        >
                          <div className="flex flex-col gap-1">
                            {row.kind === 'person' &&
                              birthdays.some(
                                (entry) =>
                                  entry.id === row.person?.id && entry.date === dayKeys[index],
                              ) && (
                                <span
                                  data-testid="birthday-chip"
                                  className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200"
                                >
                                  <span aria-hidden="true">🎂</span> Birthday
                                </span>
                              )}
                            {off && <TimeOffChip request={off} />}
                            {inCell.map((shift) => (
                              <ShiftChip
                                key={shift.id}
                                shift={shift}
                                colour={colourOf(shift.locationId)}
                                roleColour={
                                  shift.jobRole
                                    ? jobRoleHex(shift.jobRole.colour)
                                    : roleColourOfPerson(shift.employeeId)
                                }
                                warning={warnings.get(shift.id)}
                                showLocation={grouping !== 'location'}
                                onOpen={canEdit ? () => setMenu(shift) : undefined}
                                onContextMenu={
                                  onPersonMenu && shift.employee
                                    ? (event) =>
                                        onPersonMenu(event, {
                                          id: shift.employee!.id,
                                          name: `${shift.employee!.firstName} ${shift.employee!.lastName}`,
                                        })
                                    : undefined
                                }
                              />
                            ))}
                            {canEdit && (
                              <button
                                type="button"
                                data-empty={inCell.length === 0 ? 'true' : undefined}
                                onClick={() => setAdding({ row, day })}
                                aria-label={`Add ${row.kind === 'open' ? `an open shift at ${row.sublabel}` : `a shift for ${row.label}`} on ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
                                // Quiet, so it does not compete with the shifts (Dominguez,
                                // 30 September 2026: it was too big) — still a full-width
                                // strip to hit, under the shifts rather than over them.
                                className={`flex w-full items-center justify-center rounded-md text-sm font-medium leading-none text-slate-400 hover:bg-brand-50 hover:text-brand-700 focus:text-brand-700 ${
                                  inCell.length === 0 ? 'min-h-8' : 'min-h-6'
                                }`}
                              >
                                ＋
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${over ? 'font-semibold text-rose-800' : 'text-slate-700'}`}
                    >
                      {row.kind === 'open' ? (
                        row.shifts.length > 0 ? (
                          `${row.shifts.length} open`
                        ) : (
                          ''
                        )
                      ) : (
                        <span className="inline-flex items-center justify-end gap-1.5">
                          {over && (
                            <span
                              data-testid="week-ot-flag"
                              title="Over the overtime line this week"
                              className="rounded bg-rose-600 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
                            >
                              OT
                            </span>
                          )}
                          {`${total} h`}
                        </span>
                      )}
                      {standing && (
                        <span
                          data-testid={`week-standing-${standing.level}`}
                          title={`${standing.hours} hours in the overtime week from ${formatCalendarDate(standing.weekStart, { year: false })} (it follows the pay period), every location — the overtime line is ${overtimeThresholdHours}`}
                          className="mt-1 block whitespace-nowrap rounded-full bg-rose-600 px-2 py-0.5 text-center text-xs font-semibold text-white"
                        >
                          ⚠ {standing.overBy} h overtime
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      {menu && (
        <ShiftDialog
          shift={menu}
          employees={employees}
          jobRoles={jobRoles}
          allShifts={live}
          warning={warnings.get(menu.id)}
          onClose={() => setMenu(null)}
          onChanged={() => {
            setMenu(null);
            onChanged();
          }}
          onError={onError}
        />
      )}
      {adding && (
        <QuickAddDialog
          row={adding.row}
          day={adding.day}
          off={
            adding.row.kind === 'person'
              ? timeOffOn(timeOff, adding.row.person?.id, localDate(adding.day))
              : null
          }
          locations={locations}
          jobRoles={jobRoles}
          onClose={() => setAdding(null)}
          onCreated={() => {
            setAdding(null);
            onChanged();
          }}
          onPlanned={onPlanned}
        />
      )}
    </div>
  );
}

/// A booked-off day, hatched so it reads as blocked even in black and white.
const OFF_HATCH: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgba(100,116,139,0.10) 0 6px, transparent 6px 12px)',
};

/// Time off in somebody's day. Approved is plain fact; a request nobody has
/// answered yet is a question, so it looks like one.
function TimeOffChip({ request }: { request: PtoRequest }) {
  const approved = request.status === 'APPROVED';
  const kind = PTO_TYPE_LABELS[request.type];
  const half = request.isHalfDay ? ' · half day' : '';
  return (
    <span
      data-testid="time-off"
      data-status={request.status}
      title={
        approved
          ? `Time off (${kind})${half}`
          : `Asked for time off (${kind})${half}, not decided yet`
      }
      className={`block rounded-md px-1.5 py-1 text-xs ${
        approved
          ? 'bg-slate-200/80 font-medium text-slate-700'
          : 'border border-dashed border-amber-400 bg-amber-50 text-amber-900'
      }`}
    >
      <span className="block">{approved ? 'Time off' : 'Asked off'}</span>
      <span className="block text-[11px] font-normal text-slate-600">
        {kind}
        {half}
      </span>
    </span>
  );
}

function ShiftChip({
  shift,
  colour,
  roleColour,
  warning,
  showLocation,
  onOpen,
  onContextMenu,
}: {
  shift: Shift;
  /// The office's colour: what fills the chip.
  colour: string;
  /// The job role's colour, as the outline — the shift's own role, or the
  /// person's first.
  roleColour: string | null;
  warning?: string;
  showLocation: boolean;
  onOpen?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const open = shift.employeeId === null;
  const draft = shift.status === 'DRAFT';
  const remote = Boolean(shift.isRemote);
  const label = `${formatTimeCompact(shift.startsAt)}–${formatTimeCompact(shift.endsAt)}`;
  const describe = [
    open ? 'Open shift' : shift.employee ? `${shift.employee.firstName}’s shift` : 'Shift',
    `${formatTime(shift.startsAt)}–${formatTime(shift.endsAt)}`,
    remote ? 'work from home' : shift.location?.name,
    shift.jobRole?.name,
    draft ? 'draft' : null,
    warning ? `warning: ${warning}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const place = remote ? 'Home' : shift.location?.name;
  const body = (
    <>
      <span className="flex items-center gap-1.5">
        <span className="font-medium tabular-nums">{label}</span>
        {warning && (
          <span aria-hidden="true" className="text-rose-600">
            ⚠
          </span>
        )}
      </span>
      {(open || showLocation || remote) && (
        <span className="mt-0.5 block truncate text-[11px] text-slate-600">
          {open
            ? [shift.jobRole?.name ?? 'Any role', remote ? 'Home' : null]
                .filter(Boolean)
                .join(' · ')
            : place}
        </span>
      )}
    </>
  );

  const base = remote ? REMOTE_COLOUR : colour;
  const style: React.CSSProperties = shiftChipStyle({ base, roleColour, open, draft });
  const className = `block w-full rounded-md border-2 px-1.5 py-1 text-left text-xs text-slate-900 ${
    open ? 'bg-amber-100 text-amber-950' : ''
  } ${draft ? 'border-dashed' : ''} ${warning ? 'ring-1 ring-inset ring-rose-400' : ''}`;

  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      onContextMenu={onContextMenu}
      aria-label={describe}
      style={style}
      className={`${className} hover:brightness-95`}
      data-testid={open ? 'open-shift' : 'shift-chip'}
      data-remote={remote ? 'true' : undefined}
    >
      {body}
    </button>
  ) : (
    <span
      className={className}
      style={style}
      title={describe}
      onContextMenu={onContextMenu}
      data-testid={open ? 'open-shift' : 'shift-chip'}
      data-remote={remote ? 'true' : undefined}
    >
      {body}
    </span>
  );
}

/// What the colours mean, once, above the rota.
export function RotaLegend({
  locations,
  colourOf,
  jobRoles,
}: {
  locations: Location[];
  colourOf: (id: string) => string;
  jobRoles: JobRole[];
}) {
  const swatch = (hex: string) => (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-5 rounded-sm"
      style={{ backgroundColor: tint(hex, '55') }}
    />
  );
  return (
    <details
      // Open on a screen wide enough to spare the room, closed on a phone.
      open={typeof window === 'undefined' || window.innerWidth >= 640}
      className="mb-2 text-xs text-slate-600"
      data-testid="rota-legend"
    >
      <summary className="mb-1 cursor-pointer select-none py-1 font-medium text-slate-700 max-sm:py-2">
        Key
      </summary>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="basis-full sm:basis-auto">Fill, the office:</span>
        {locations
          .filter((location) => location.isActive !== false)
          .map((location) => (
            <span key={location.id} className="inline-flex items-center gap-1.5">
              {swatch(colourOf(location.id))}
              {location.name}
            </span>
          ))}
        <span className="inline-flex items-center gap-1.5">
          {swatch(REMOTE_COLOUR)}
          Work from home
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-5 rounded-sm bg-amber-100 ring-1 ring-inset ring-amber-300"
          />
          Open shift
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-5 rounded-sm border border-dashed border-slate-400 bg-white"
          />
          Draft
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-5 rounded-sm ring-1 ring-inset ring-slate-300"
            style={OFF_HATCH}
          />
          Time off
        </span>
        <span className="basis-full sm:basis-auto">Outline, the job role:</span>
        {jobRoles.map((role) => (
          <span key={role.id} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-5 rounded-sm border-2 bg-white"
              style={{ borderColor: jobRoleHex(role.colour) }}
            />
            {role.name}
          </span>
        ))}
      </div>
    </details>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useDialog(onClose);
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        {...dialog}
        className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl outline-none"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/// What can be done to one shift: put somebody in it, take them off it,
/// publish it, or remove it.
function ShiftDialog({
  shift,
  employees,
  jobRoles,
  allShifts,
  warning,
  onClose,
  onChanged,
  onError,
}: {
  shift: Shift;
  employees: Employee[];
  jobRoles: JobRole[];
  allShifts: Shift[];
  warning?: string;
  onClose: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [person, setPerson] = useState(shift.employeeId ?? '');
  /// For a shift with no job role: which of the chosen person's it is for.
  const [asRole, setAsRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = useConfirm();
  const open = shift.employeeId === null;

  const members = new Set(
    jobRoles.find((role) => role.id === shift.jobRoleId)?.members.map((m) => m.id) ?? [],
  );
  const start = new Date(shift.startsAt).getTime();
  const end = new Date(shift.endsAt).getTime();
  const busyIds = new Set(
    allShifts
      .filter(
        (other) =>
          other.id !== shift.id &&
          other.employeeId &&
          new Date(other.startsAt).getTime() < end &&
          new Date(other.endsAt).getTime() > start,
      )
      .map((other) => other.employeeId as string),
  );
  // People who work at this office — and, for a shift with a job role, only
  // those in it: somebody's shift is always for one of their own roles.
  const candidates = employees
    .filter(
      (p) =>
        p.employmentStatus === 'ACTIVE' &&
        p.locations.some((a) => a.locationId === shift.locationId) &&
        (!shift.jobRoleId || members.has(p.id) || p.id === shift.employeeId),
    )
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  async function act(change: () => Promise<unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      await change();
      onChanged();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not change that shift.';
      setProblem(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  }

  const who = shift.employee ? `${shift.employee.firstName}’s` : 'this';
  const when = `${new Date(shift.startsAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}, ${formatTime(shift.startsAt)}–${formatTime(shift.endsAt)}`;
  const firstName = shift.employee?.preferredName ?? shift.employee?.firstName ?? 'they';

  // Checked as soon as somebody is picked, before Assign is pressed.
  const chosen = employees.find((p) => p.id === person);
  const chosenName = chosen ? `${chosen.preferredName ?? chosen.firstName} ${chosen.lastName}` : '';
  const proposed =
    chosen && person !== shift.employeeId
      ? {
          employeeId: person,
          locationId: shift.locationId,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          shiftId: shift.id,
        }
      : null;
  const overtimeCheck = useOvertimeCheck(proposed);

  async function assign() {
    if (!proposed) return;
    if (!(await confirmOvertime(confirm, proposed, chosenName))) return;
    await act(() =>
      api.updateShift(shift.id, {
        employeeId: person,
        ...(shift.jobRoleId ? {} : { jobRoleId: asRole || null }),
      }),
    );
  }

  async function remove() {
    const sure = await confirm({
      title: 'Remove this shift?',
      body: (
        <>
          <p>
            {open ? 'The open shift' : `${who} shift`} on {when}.
          </p>
          {shift.status === 'PUBLISHED' && !open && (
            <p className="mt-1">It is published, so {firstName} may already be counting on it.</p>
          )}
        </>
      ),
      confirmLabel: 'Yes, remove',
      cancelLabel: 'Keep it',
    });
    if (sure) await act(() => api.deleteShift(shift.id));
  }

  async function takeOff() {
    const sure = await confirm({
      title: `Take ${firstName} off this shift?`,
      body: (
        <>
          <p>{when}.</p>
          <p className="mt-1">
            The shift stays on the rota as an open shift until somebody else is put in it.
          </p>
        </>
      ),
      confirmLabel: 'Take them off',
      cancelLabel: 'Keep them on',
    });
    if (sure) await act(() => api.updateShift(shift.id, { employeeId: null }));
  }

  return (
    <Dialog
      title={
        open
          ? 'Open shift'
          : `${shift.employee?.firstName ?? ''} ${shift.employee?.lastName ?? ''}`.trim() || 'Shift'
      }
      onClose={onClose}
    >
      <p className="text-sm text-slate-700">{when}</p>
      <p className="text-sm text-slate-500">
        {shift.isRemote ? 'Work from home' : shift.location?.name}
        {shift.jobRole && ` · ${shift.jobRole.name}`}
        {shift.status === 'DRAFT' && ' · draft'}
      </p>
      {warning && (
        <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-sm text-rose-800">⚠ {warning}</p>
      )}
      {shift.seriesId && (
        <p className="mt-2 text-xs text-slate-500" data-testid="shift-is-regular">
          <span aria-hidden="true">🔁</span> Part of a regular shift with no end date. Changing or
          removing this one leaves the rest; to end them all, use Regular shifts below the rota.
        </p>
      )}

      <div className="mt-4">
        <label htmlFor="assign-person" className="block text-sm font-medium text-slate-800">
          {open ? 'Put somebody in it' : 'Who works it'}
        </label>
        <div className="mt-1 flex gap-2">
          <select
            id="assign-person"
            value={person}
            onChange={(event) => setPerson(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Choose someone…</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id} disabled={busyIds.has(p.id)}>
                {p.preferredName ?? p.firstName} {p.lastName}
                {busyIds.has(p.id) ? ' — already on then' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !person || person === shift.employeeId}
            onClick={() => void assign()}
            className={buttonClass('primary', 'sm')}
          >
            {open ? 'Assign' : 'Change'}
          </button>
        </div>
        {candidates.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">
            {shift.jobRoleId
              ? `Nobody in ${shift.jobRole?.name ?? 'that job role'} works at this office yet.`
              : 'Nobody works at this office yet.'}
          </p>
        )}
        {!shift.jobRoleId && chosen && person !== shift.employeeId && (
          <div className="mt-2 text-sm">
            <label htmlFor="assign-role" className="font-medium text-slate-800">
              As
            </label>
            <JobRoleSelect
              id="assign-role"
              value={asRole}
              onChange={setAsRole}
              jobRoles={jobRoles}
              personId={chosen.id}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        )}
        {proposed && (
          <div className="mt-2">
            <OvertimePreview check={overtimeCheck} name={chosenName} />
          </div>
        )}
      </div>

      {problem && (
        <div className="mt-3">
          <Alert>{problem}</Alert>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {!open && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void takeOff()}
            className={buttonClass('secondary', 'sm')}
          >
            Make it an open shift
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(() => api.updateShift(shift.id, { isRemote: !shift.isRemote }))}
          className={buttonClass('secondary', 'sm')}
        >
          {shift.isRemote ? 'Make it at the office' : 'Make it work from home'}
        </button>
        {shift.status === 'DRAFT' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => api.updateShift(shift.id, { status: 'PUBLISHED' }))}
            className={buttonClass('secondary', 'sm')}
          >
            Publish
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          aria-label={`Remove ${who} shift, ${formatTime(shift.startsAt)}–${formatTime(shift.endsAt)}`}
          className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        >
          Remove
        </button>
      </div>
    </Dialog>
  );
}

/// Adding a shift straight into a cell: for that person, or an open one for
/// that office — once, or repeating from that day (Dominguez, September 2026:
/// the + had no way to repeat, so a regular shift meant going to Repeating
/// shifts and starting again).
function QuickAddDialog({
  row,
  day,
  off,
  locations,
  jobRoles,
  onClose,
  onCreated,
  onPlanned,
}: {
  row: Row;
  day: Date;
  /// Their time off that day, if any — said before the shift is made.
  off: PtoRequest | null;
  locations: Location[];
  jobRoles: JobRole[];
  onClose: () => void;
  onCreated: () => void;
  onPlanned?: (result: PlanResult) => void;
}) {
  // A row inside an office's group adds to that office; otherwise any of the
  // person's offices.
  const offices = row.locationId
    ? locations.filter((location) => location.id === row.locationId)
    : row.person
      ? locations.filter((location) =>
          row.person!.locations.some((a) => a.locationId === location.id),
        )
      : locations;
  /// An office id, or Work from home.
  const [place, setPlace] = useState(row.locationId ?? offices[0]?.id ?? '');
  const { locationId, isRemote } = placeToShift(place, row.locationId ?? homeOfficeOf(row.person));
  const [jobRoleId, setJobRoleId] = useState(row.jobRoleId ?? '');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [publish, setPublish] = useState(true);
  const [repeat, setRepeat] = useState(false);
  /// 1 = Monday … 7 = Sunday; starts on the day that was clicked.
  const [repeatDays, setRepeatDays] = useState<number[]>(() => [((day.getDay() + 6) % 7) + 1]);
  const [until, setUntil] = useState(() => {
    const fourWeeks = new Date(day);
    fourWeeks.setDate(fourWeeks.getDate() + 27);
    return localDate(fourWeeks);
  });
  const [noEnd, setNoEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = useConfirm();

  const at = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const date = new Date(day);
    date.setHours(h, m, 0, 0);
    return date;
  };

  // Only a shift for somebody can put somebody into overtime.
  const proposed =
    row.person && locationId && /^\d\d:\d\d$/.test(start) && /^\d\d:\d\d$/.test(end) && end > start
      ? {
          employeeId: row.person.id,
          locationId,
          startsAt: at(start).toISOString(),
          endsAt: at(end).toISOString(),
        }
      : null;
  const overtimeCheck = useOvertimeCheck(proposed);
  // Open shifts too: nobody should be wanted while the office is shut.
  const closure =
    locationId && /^\d\d:\d\d$/.test(start) && /^\d\d:\d\d$/.test(end) && end > start
      ? { locationId, startsAt: at(start).toISOString(), endsAt: at(end).toISOString() }
      : null;
  const closures = useClosureCheck(closure);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      if (repeat) {
        // The same as Repeating shifts, starting on this day. What it makes,
        // skips and puts into overtime is reported afterwards, across every
        // week it touches, rather than asked about one day at a time here.
        const result = await api.repeatShifts({
          ...(row.person ? { employeeId: row.person.id } : { openCount: 1 }),
          jobRoleId: jobRoleId || undefined,
          isRemote,
          locationId,
          startTime: start,
          endTime: end,
          daysOfWeek: [...repeatDays].sort(),
          from: localDate(day),
          ...(noEnd ? {} : { until }),
          status: publish ? 'PUBLISHED' : 'DRAFT',
        });
        onPlanned?.(result);
        onCreated();
        return;
      }
      if (closure && !(await confirmClosure(confirm, closure))) return;
      if (proposed && !(await confirmOvertime(confirm, proposed, row.label))) return;
      await api.createShift({
        employeeId: row.person?.id ?? null,
        locationId,
        jobRoleId: jobRoleId || null,
        isRemote,
        startsAt: at(start).toISOString(),
        endsAt: at(end).toISOString(),
        status: publish ? 'PUBLISHED' : 'DRAFT',
      });
      onCreated();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not add that shift.');
    } finally {
      setBusy(false);
    }
  }

  const title = row.person ? `Shift for ${row.label}` : 'Open shift';
  const field = 'mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm';

  return (
    <Dialog title={title} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        {day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        <span className="sr-only"> {toLocalInputValue(day)}</span>
      </p>
      {off && (
        <p
          role="note"
          data-testid="quick-time-off"
          className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          {off.status === 'APPROVED'
            ? `${row.label} has approved time off this day.`
            : `${row.label} has asked for this day off; it is not decided yet.`}
        </p>
      )}
      <form onSubmit={(event) => void submit(event)} className="grid grid-cols-2 gap-3">
        <label className="text-sm" htmlFor="quick-start">
          <span className="font-medium text-slate-800">Starts</span>
          <input
            id="quick-start"
            type="time"
            required
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm" htmlFor="quick-end">
          <span className="font-medium text-slate-800">Ends</span>
          <input
            id="quick-end"
            type="time"
            required
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className={field}
          />
        </label>
        <div className="col-span-2 text-sm">
          <label htmlFor="quick-location" className="font-medium text-slate-800">
            Location
          </label>
          <PlaceSelect
            id="quick-location"
            value={place}
            onChange={setPlace}
            offices={offices}
            allowHome={Boolean(row.person)}
            className={field}
          />
          {place === WORK_FROM_HOME && <WorkFromHomeNote />}
        </div>
        <div className="col-span-2 text-sm">
          <label htmlFor="quick-role" className="font-medium text-slate-800">
            Job role
          </label>
          <JobRoleSelect
            id="quick-role"
            value={jobRoleId}
            onChange={setJobRoleId}
            jobRoles={jobRoles}
            personId={row.person?.id}
            open={!row.person}
            className={field}
          />
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700" htmlFor="quick-repeat">
            <input
              id="quick-repeat"
              type="checkbox"
              checked={repeat}
              onChange={(event) => setRepeat(event.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            Repeat this shift
          </label>
          {repeat && (
            <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
              <fieldset>
                <legend className="text-sm font-medium text-slate-800">Every</legend>
                <WeekdayToggles days={repeatDays} onChange={setRepeatDays} size="small" />
                {repeatDays.length === 0 && (
                  <p className="mt-1 text-xs text-rose-600">Pick at least one day.</p>
                )}
              </fieldset>
              {noEnd ? (
                <p className="text-sm text-slate-700">
                  From this day, with <strong>no end date</strong>.
                </p>
              ) : (
                <label className="block text-sm" htmlFor="quick-until">
                  <span className="font-medium text-slate-800">Until</span>
                  <input
                    id="quick-until"
                    type="date"
                    required
                    min={localDate(day)}
                    value={until}
                    onChange={(event) => setUntil(event.target.value)}
                    className={field}
                  />
                </label>
              )}
              <label
                className="flex items-start gap-2 text-sm text-slate-700"
                htmlFor="quick-no-end"
              >
                <input
                  id="quick-no-end"
                  type="checkbox"
                  checked={noEnd}
                  onChange={(event) => setNoEnd(event.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                />
                <span>
                  No end date — it keeps going
                  <span className="block text-xs text-slate-500">
                    Kept filled eight weeks ahead; stop it any time under Regular shifts.
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={publish}
            onChange={(event) => setPublish(event.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          Publish it now
        </label>
        {closures.length > 0 && (
          <div className="col-span-2">
            <ClosureWarning closures={closures} />
          </div>
        )}
        {!repeat && proposed && overtimeCheck && overtimeCheck.level !== 'ok' && (
          <div className="col-span-2">
            <OvertimePreview check={overtimeCheck} name={row.label} />
          </div>
        )}
        {problem && (
          <div className="col-span-2">
            <Alert>{problem}</Alert>
          </div>
        )}
        <div className="col-span-2 flex gap-2">
          <button
            type="submit"
            disabled={
              busy ||
              !locationId ||
              end <= start ||
              (repeat && (repeatDays.length === 0 || (!noEnd && !until)))
            }
            className={buttonClass('primary', 'md')}
          >
            {busy ? 'Adding…' : repeat ? 'Add the shifts' : 'Add shift'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}
