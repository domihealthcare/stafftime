import { useMemo, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatTime, formatTimeCompact, localDate, toLocalInputValue } from '../lib/format';
import type { CoverageDay, Employee, JobRole, Location, PtoRequest, Shift } from '../lib/types';
import { PTO_TYPE_LABELS, timeOffOn } from '../lib/time-off';
import { jobRoleHex } from '../lib/job-role-colours';
import { Avatar } from './Avatar';
import { Alert } from './ui';

export type RotaGrouping = 'person' | 'location' | 'role';

/// Location marks, in the order the colour-blind-checked palette validates them.
const LOCATION_COLOURS = ['#2a78d6', '#eb6834', '#1baf7a', '#e87ba4', '#008300', '#4a3aa7'];

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
  overtimeThresholdHours,
  grouping,
  locationFilter,
  roleFilter,
  canEdit,
  selfId,
  onChanged,
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
  overtimeThresholdHours: number;
  grouping: RotaGrouping;
  locationFilter: string;
  roleFilter: string;
  canEdit: boolean;
  /// For staff: only their own row.
  selfId?: string;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [menu, setMenu] = useState<Shift | null>(null);
  const [adding, setAdding] = useState<{ row: Row; day: Date } | null>(null);

  const dayKeys = days.map((day) => localDate(day));
  const colourOf = useMemo(() => {
    const map = new Map(
      locations.map((location, i) => [location.id, LOCATION_COLOURS[i % LOCATION_COLOURS.length]]),
    );
    return (id: string) => map.get(id) ?? '#94a3b8';
  }, [locations]);

  const live = shifts.filter((shift) => shift.status !== 'CANCELLED');
  const warnings = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of coverage ?? []) {
      for (const shift of day.shifts) {
        if (shift.conflictsWithLeave) map.set(shift.id, 'Scheduled during approved leave');
        else if (shift.unavailable) map.set(shift.id, shift.unavailable);
      }
    }
    return map;
  }, [coverage]);

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

  const visibleLocations = locations.filter(
    (location) =>
      location.isActive !== false && (!locationFilter || location.id === locationFilter),
  );
  const visibleRoles = jobRoles.filter((role) => !roleFilter || role.id === roleFilter);

  const staff = employees
    .filter(
      (person) => person.employmentStatus === 'ACTIVE' || person.employmentStatus === 'ON_LEAVE',
    )
    .filter((person) => !roleFilter || membersOf.get(roleFilter)?.has(person.id))
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
        (!locationFilter || shift.locationId === locationFilter),
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
            .filter((person) => !locationFilter || worksAt(person, locationFilter))
            .map((person) => personRow(person)),
        ],
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouping, shifts, employees, locations, jobRoles, locationFilter, roleFilter, selfId]);

  const openTotal = live.filter(
    (shift) =>
      shift.employeeId === null &&
      (!locationFilter || shift.locationId === locationFilter) &&
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
                const empty = cov && cov.peopleScheduled === 0;
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
                    {cov && !selfId && (
                      <span
                        className="block text-xs font-normal tabular-nums text-slate-500"
                        data-testid={`day-cover-${dayKeys[index]}`}
                      >
                        {cov.peopleScheduled > 0 ? (
                          `${cov.staffedHours} h · ${cov.peopleScheduled} on`
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
              {section.rows.map((row) => {
                const total = round1(row.shifts.reduce((sum, shift) => sum + hoursOf(shift), 0));
                const over = row.kind === 'person' && !selfId && total > overtimeThresholdHours;
                if (row.kind === 'open' && row.shifts.length === 0 && !canEdit) return null;
                return (
                  <tr
                    key={row.key}
                    data-testid={
                      row.kind === 'open' ? `open-row-${row.sublabel}` : `rota-row-${row.label}`
                    }
                    className={`border-b border-slate-100 ${row.kind === 'open' ? (row.shifts.length > 0 ? 'bg-amber-50/60' : 'bg-slate-50/40') : 'hover:bg-slate-50/60'}`}
                  >
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 px-3 py-2 text-left font-normal ${row.kind === 'open' ? (row.shifts.length > 0 ? 'bg-amber-50' : 'bg-slate-50') : 'bg-white'}`}
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
                              />
                            ))}
                            {canEdit && (
                              <button
                                type="button"
                                data-empty={inCell.length === 0 ? 'true' : undefined}
                                onClick={() => setAdding({ row, day })}
                                aria-label={`Add ${row.kind === 'open' ? `an open shift at ${row.sublabel}` : `a shift for ${row.label}`} on ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
                                className={
                                  inCell.length === 0
                                    ? 'w-full rounded-md py-1 text-center text-slate-300 hover:bg-slate-100 hover:text-slate-600 focus:text-slate-600'
                                    : 'absolute right-0.5 top-0.5 rounded bg-white/90 px-1 text-xs leading-4 text-slate-500 opacity-0 shadow-sm ring-1 ring-slate-200 hover:text-slate-900 focus:opacity-100 group-hover:opacity-100'
                                }
                              >
                                ＋
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${over ? 'font-semibold text-amber-800' : 'text-slate-700'}`}
                    >
                      {row.kind === 'open'
                        ? row.shifts.length > 0
                          ? `${row.shifts.length} open`
                          : ''
                        : `${total} h`}
                      {over && (
                        <span className="block text-xs font-normal">
                          over {overtimeThresholdHours}
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

/// Working from home wears the palette's violet, apart from both offices.
const REMOTE_COLOUR = '#4a3aa7';

/// A colour at low strength, as a background tint behind dark text.
const tint = (hex: string, alpha: string) => `${hex}${alpha}`;

function ShiftChip({
  shift,
  colour,
  roleColour,
  warning,
  showLocation,
  onOpen,
}: {
  shift: Shift;
  /// The office's colour: the chip's tint.
  colour: string;
  /// The job role's colour, as a stripe down the left edge — the shift's own
  /// role, or the person's first.
  roleColour: string | null;
  warning?: string;
  showLocation: boolean;
  onOpen?: () => void;
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
  const style: React.CSSProperties = open
    ? { borderLeftColor: roleColour ?? '#d97706' }
    : {
        backgroundColor: draft ? '#ffffff' : tint(base, '1f'),
        borderLeftColor: roleColour ?? base,
        ...(draft ? { borderColor: tint(base, '99') } : {}),
      };
  const className = `block w-full rounded-md border-l-4 px-1.5 py-1 text-left text-xs text-slate-900 ${
    open
      ? 'bg-amber-100 text-amber-950 ring-1 ring-inset ring-amber-300'
      : draft
        ? 'border border-l-4 border-dashed'
        : ''
  } ${warning ? 'ring-1 ring-inset ring-rose-400' : ''}`;

  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
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
      data-testid={open ? 'open-shift' : 'shift-chip'}
      data-remote={remote ? 'true' : undefined}
    >
      {body}
    </span>
  );
}

/// What the colours mean, once, above the rota.
function RotaLegend({
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
      className="inline-block h-3 w-5 rounded-sm border-l-4"
      style={{ backgroundColor: tint(hex, '1f'), borderLeftColor: hex }}
    />
  );
  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600"
      data-testid="rota-legend"
    >
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
      <span className="basis-full sm:basis-auto">Stripe on the left, the job role:</span>
      {jobRoles.map((role) => (
        <span key={role.id} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-1 rounded-sm"
            style={{ backgroundColor: jobRoleHex(role.colour) }}
          />
          {role.name}
        </span>
      ))}
    </div>
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
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl"
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
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
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
  // People who work at this office, the ones in the shift's job role first.
  const candidates = employees
    .filter(
      (p) =>
        p.employmentStatus === 'ACTIVE' &&
        p.locations.some((a) => a.locationId === shift.locationId),
    )
    .sort(
      (a, b) =>
        Number(members.has(b.id)) - Number(members.has(a.id)) ||
        a.firstName.localeCompare(b.firstName),
    );

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
        {shift.isRemote ? `Work from home (${shift.location?.name ?? ''})` : shift.location?.name}
        {shift.jobRole && ` · ${shift.jobRole.name}`}
        {shift.status === 'DRAFT' && ' · draft'}
      </p>
      {warning && (
        <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-sm text-rose-800">⚠ {warning}</p>
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
                {shift.jobRoleId && !members.has(p.id) ? ` (not ${shift.jobRole?.name})` : ''}
                {busyIds.has(p.id) ? ' — already on then' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !person || person === shift.employeeId}
            onClick={() => void act(() => api.updateShift(shift.id, { employeeId: person }))}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {open ? 'Assign' : 'Change'}
          </button>
        </div>
        {candidates.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">Nobody works at this office yet.</p>
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
            onClick={() => void act(() => api.updateShift(shift.id, { employeeId: null }))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Make it an open shift
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(() => api.updateShift(shift.id, { isRemote: !shift.isRemote }))}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {shift.isRemote ? 'Make it at the office' : 'Make it work from home'}
        </button>
        {shift.status === 'DRAFT' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => api.updateShift(shift.id, { status: 'PUBLISHED' }))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Publish
          </button>
        )}
        {!confirmingRemove ? (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            aria-label={`Remove ${who} shift, ${formatTime(shift.startsAt)}–${formatTime(shift.endsAt)}`}
            className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
          >
            Remove
          </button>
        ) : (
          <div
            role="alertdialog"
            aria-label="Remove this shift?"
            className="w-full rounded-md bg-rose-50 p-2 text-sm ring-1 ring-inset ring-rose-200"
          >
            <p className="font-medium text-rose-900">Remove this shift?</p>
            {shift.status === 'PUBLISHED' && !open && (
              <p className="mt-0.5 text-rose-800">
                It is published, so {shift.employee?.firstName ?? 'they'} may already be counting on
                it.
              </p>
            )}
            <div className="mt-1.5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => api.deleteShift(shift.id))}
                className="rounded bg-rose-600 px-2 py-1 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {busy ? 'Removing…' : 'Yes, remove'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingRemove(false)}
                className="rounded px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
              >
                Keep it
              </button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/// Adding a shift straight into a cell: for that person, or an open one for
/// that office.
function QuickAddDialog({
  row,
  day,
  off,
  locations,
  jobRoles,
  onClose,
  onCreated,
}: {
  row: Row;
  day: Date;
  /// Their time off that day, if any — said before the shift is made.
  off: PtoRequest | null;
  locations: Location[];
  jobRoles: JobRole[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const personLocations = row.person
    ? locations.filter((location) =>
        row.person!.locations.some((a) => a.locationId === location.id),
      )
    : locations;
  const [locationId, setLocationId] = useState(row.locationId ?? personLocations[0]?.id ?? '');
  const [jobRoleId, setJobRoleId] = useState(row.jobRoleId ?? '');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [publish, setPublish] = useState(true);
  const [remote, setRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const at = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const date = new Date(day);
    date.setHours(h, m, 0, 0);
    return date;
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api.createShift({
        employeeId: row.person?.id ?? null,
        locationId,
        jobRoleId: jobRoleId || null,
        isRemote: remote,
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
        <label className="col-span-2 text-sm" htmlFor="quick-location">
          <span className="font-medium text-slate-800">Location</span>
          <select
            id="quick-location"
            value={locationId}
            disabled={Boolean(row.locationId)}
            onChange={(event) => setLocationId(event.target.value)}
            className={field}
          >
            {personLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 text-sm" htmlFor="quick-role">
          <span className="font-medium text-slate-800">
            Job role {row.person && <span className="font-normal text-slate-400">(optional)</span>}
          </span>
          <select
            id="quick-role"
            value={jobRoleId}
            onChange={(event) => setJobRoleId(event.target.value)}
            className={field}
          >
            <option value="">{row.person ? 'Not specified' : 'Any role'}</option>
            {jobRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2">
          <label className="flex items-start gap-2 text-sm text-slate-700" htmlFor="quick-remote">
            <input
              id="quick-remote"
              type="checkbox"
              checked={remote}
              onChange={(event) => setRemote(event.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            <span>
              Work from home
              <span className="block text-xs text-slate-500">
                They can clock in from anywhere during it; no location is recorded.
              </span>
            </span>
          </label>
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
        {problem && (
          <div className="col-span-2">
            <Alert>{problem}</Alert>
          </div>
        )}
        <div className="col-span-2 flex gap-2">
          <button
            type="submit"
            disabled={busy || !locationId || end <= start}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Adding…' : 'Add shift'}
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
