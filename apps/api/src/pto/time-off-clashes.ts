import { EmploymentStatus, PtoStatus, ShiftStatus } from '@prisma/client';
import {
  addDaysTo,
  datesBetween,
  isoWeekdayOf,
  localDateIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Time-off clashes, seen early (Dominguez, October 2026 — making the app
 * smarter, with the defaults proposed and agreed): too many people from one
 * job role off on the same day at one office.
 *
 * - **Too many** is more than half of the people at that office who hold that
 *   job role — which, for a role of one or two, is all of them.
 * - **Off** is approved time off and requests still waiting on a manager: the
 *   point is to see it before the second request is approved, not after.
 * - **A day** is a weekday, or a weekend day with shifts at that office —
 *   nobody is short-staffed on a Sunday the office is shut.
 *
 * Somebody in two job roles, or at two offices, counts in each. Shown on the
 * request while a manager decides it, on the Dashboard for the next 8 weeks,
 * and in the nightly email for the next 2. **It warns, never refuses** — like
 * the rest of the Schedule.
 */
export const DASHBOARD_WEEKS = 8;
export const EMAIL_DAYS = 14;

/// Everybody at one office who holds one job role.
export interface Team {
  locationId: string;
  locationName: string;
  jobRoleId: string;
  jobRoleName: string;
  jobRoleOrder: number;
  memberIds: string[];
  /// The practice's minimum for this office and role, when it has set one
  /// (`StaffingMinimum`): then a clash is leaving fewer than that on.
  minimum?: number | null;
}

/// One request, approved or waiting, as plain dates.
export interface Away {
  requestId: string;
  employeeId: string;
  name: string;
  status: PtoStatus;
  isHalfDay: boolean;
  startDate: string;
  endDate: string;
}

export interface ClashPerson {
  employeeId: string;
  name: string;
  requestId: string;
  /// Approved, or still waiting on a manager.
  approved: boolean;
  isHalfDay: boolean;
}

export interface TimeOffClash {
  /// The first and last day of a run of days with the same people off.
  from: string;
  to: string;
  locationId: string;
  locationName: string;
  jobRoleId: string;
  jobRoleName: string;
  /// How many at that office hold the role, and who of them is off.
  total: number;
  off: ClashPerson[];
  /// The minimum it falls below, when one is set; null: more than half off.
  minimum: number | null;
}

/**
 * The clashes among these teams on these days, a run of days with the same
 * people off told as one ("Mon Dec 22 – Fri Dec 26", not five lines).
 *
 * `workingDays` says which days count for each office.
 */
export function findClashes(
  teams: Team[],
  away: Away[],
  workingDays: (locationId: string) => string[],
): TimeOffClash[] {
  const clashes: TimeOffClash[] = [];
  for (const team of teams) {
    const members = new Set(team.memberIds);
    let run: TimeOffClash | null = null;
    for (const date of workingDays(team.locationId)) {
      const off = away
        .filter(
          (request) =>
            members.has(request.employeeId) && request.startDate <= date && request.endDate >= date,
        )
        .map((request) => ({
          employeeId: request.employeeId,
          name: request.name,
          requestId: request.requestId,
          approved: request.status === PtoStatus.APPROVED,
          isHalfDay: request.isHalfDay,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const people = new Set(off.map((person) => person.employeeId));
      // By the practice's minimum where it has set one, else more than half.
      const minimum = team.minimum ?? null;
      const clashing =
        minimum !== null
          ? people.size > 0 && members.size - people.size < minimum
          : people.size * 2 > members.size;

      const same =
        run &&
        clashing &&
        run.off.length === off.length &&
        run.off.every((person, i) => person.requestId === off[i].requestId);
      if (same && run) {
        run.to = date;
        continue;
      }
      if (run) clashes.push(run);
      run = clashing
        ? {
            from: date,
            to: date,
            locationId: team.locationId,
            locationName: team.locationName,
            jobRoleId: team.jobRoleId,
            jobRoleName: team.jobRoleName,
            total: members.size,
            off,
            minimum,
          }
        : null;
    }
    if (run) clashes.push(run);
  }

  const order = new Map(
    teams.map((team) => [`${team.locationId}:${team.jobRoleId}`, team.jobRoleOrder]),
  );
  return clashes.sort(
    (a, b) =>
      a.from.localeCompare(b.from) ||
      a.locationName.localeCompare(b.locationName) ||
      (order.get(`${a.locationId}:${a.jobRoleId}`) ?? 0) -
        (order.get(`${b.locationId}:${b.jobRoleId}`) ?? 0),
  );
}

/// "North Bergen, Mon Dec 22 – Fri Dec 26: 2 of 3 in Medical Assistant off —
/// Ana L, Bea M (asked)" — for the email.
export function describeClash(clash: TimeOffClash): string {
  const when =
    clash.from === clash.to
      ? shortDate(clash.from)
      : `${shortDate(clash.from)} – ${shortDate(clash.to)}`;
  const who = clash.off
    .map(
      (person) =>
        `${person.name}${person.isHalfDay ? ' (half day)' : ''}${person.approved ? '' : ' (asked, not decided)'}`,
    )
    .join(', ');
  const count =
    clash.off.length === clash.total
      ? `all ${clash.total} in ${clash.jobRoleName} off`
      : `${clash.off.length} of ${clash.total} in ${clash.jobRoleName} off`;
  const minimum = clash.minimum !== null ? ` (minimum ${clash.minimum})` : '';
  return `${clash.locationName}, ${when}: ${count}${minimum} — ${who}`;
}

export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/// Reads who works where, who is off and which days count, from `from` to
/// `to` (plain dates, both included), and finds the clashes. With
/// `employeeId`, only the clashes that person is part of — for a request being
/// decided.
export async function loadTimeOffClashes(
  prisma: PrismaService,
  from: string,
  to: string,
  only?: { employeeId: string },
): Promise<TimeOffClash[]> {
  const fromDay = new Date(`${from}T00:00:00Z`);
  const toDay = new Date(`${to}T00:00:00Z`);

  const [people, requests, weekendShifts, minimums] = await Promise.all([
    prisma.employee.findMany({
      where: { employmentStatus: EmploymentStatus.ACTIVE },
      select: {
        id: true,
        locations: { select: { location: { select: { id: true, name: true } } } },
        jobRoles: { select: { jobRole: { select: { id: true, name: true, sortOrder: true } } } },
      },
    }),
    prisma.ptoRequest.findMany({
      where: {
        status: { in: [PtoStatus.APPROVED, PtoStatus.PENDING] },
        startDate: { lte: toDay },
        endDate: { gte: fromDay },
        employee: { employmentStatus: EmploymentStatus.ACTIVE },
      },
      select: {
        id: true,
        employeeId: true,
        status: true,
        isHalfDay: true,
        startDate: true,
        endDate: true,
        employee: { select: { firstName: true, preferredName: true, lastName: true } },
      },
    }),
    // Weekend days count only where the office is open: a shift there.
    prisma.shift.findMany({
      where: {
        status: { not: ShiftStatus.CANCELLED },
        startsAt: {
          gte: zonedTimeToUtc(from, '00:00', PRACTICE_ZONE),
          lt: zonedTimeToUtc(addDaysTo(to, 1), '00:00', PRACTICE_ZONE),
        },
      },
      select: { locationId: true, startsAt: true, location: { select: { timezone: true } } },
    }),
    prisma.staffingMinimum.findMany({
      select: { locationId: true, jobRoleId: true, minimum: true },
    }),
  ]);
  const minimumOf = new Map(
    minimums.map((row) => [`${row.locationId}:${row.jobRoleId}`, row.minimum]),
  );

  const teamsByKey = new Map<string, Team>();
  for (const person of people) {
    for (const { location } of person.locations) {
      for (const { jobRole } of person.jobRoles) {
        const key = `${location.id}:${jobRole.id}`;
        const team = teamsByKey.get(key) ?? {
          locationId: location.id,
          locationName: location.name,
          jobRoleId: jobRole.id,
          jobRoleName: jobRole.name,
          jobRoleOrder: jobRole.sortOrder,
          memberIds: [],
          minimum: minimumOf.get(key) ?? null,
        };
        team.memberIds.push(person.id);
        teamsByKey.set(key, team);
      }
    }
  }
  let teams = [...teamsByKey.values()];
  if (only) teams = teams.filter((team) => team.memberIds.includes(only.employeeId));

  const openWeekends = new Set(
    weekendShifts.map(
      (shift) => `${shift.locationId}:${localDateIn(shift.startsAt, shift.location.timezone)}`,
    ),
  );
  const dates = datesBetween(from, to);
  const workingDays = (locationId: string) =>
    dates.filter((date) => isoWeekdayOf(date) <= 5 || openWeekends.has(`${locationId}:${date}`));

  const away: Away[] = requests.map((request) => ({
    requestId: request.id,
    employeeId: request.employeeId,
    name: `${request.employee.preferredName ?? request.employee.firstName} ${request.employee.lastName}`,
    status: request.status,
    isHalfDay: request.isHalfDay,
    startDate: request.startDate.toISOString().slice(0, 10),
    endDate: request.endDate.toISOString().slice(0, 10),
  }));

  const clashes = findClashes(teams, away, workingDays);
  return only
    ? clashes.filter((clash) => clash.off.some((person) => person.employeeId === only.employeeId))
    : clashes;
}
