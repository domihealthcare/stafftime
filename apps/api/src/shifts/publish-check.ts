import { PtoType } from '@prisma/client';
import { twelveHour } from '../availability/availability.rules';
import { shortDate } from '../pto/time-off-clashes';

/**
 * "Before you publish" (October 2026, Dominguez — making the app smarter):
 * everything worth a look about the drafts about to go out, gathered into one
 * pop-up instead of left scattered over the rota. Warns, never refuses — the
 * manager can always publish anyway.
 *
 * Pure: `PublishCheckService` loads the drafts and what bears on them, by the
 * scheduler's own rules (availability is `clashFor`, overtime is the rota's
 * weekly total, a closure is one office or both), and this words it.
 */

export type PublishCheckKey =
  'licenses' | 'leavers' | 'leave' | 'closures' | 'availability' | 'overtime' | 'open';

export interface PublishCheckSection {
  key: PublishCheckKey;
  title: string;
  lines: string[];
}

export interface PublishCheck {
  /// How many of the shifts sent are still drafts, i.e. would be published.
  drafts: number;
  /// Only the sections with something in them, most serious first.
  sections: PublishCheckSection[];
}

export interface CheckShift {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  locationId: string;
  locationName: string;
  jobRoleName: string | null;
  /// The shift's day and hours on its office's clock.
  date: string;
  startTime: string;
  endTime: string;
  startsAt: Date;
  endsAt: Date;
}

export interface CheckLeave {
  employeeId: string;
  type: PtoType;
  /// Plain dates, both included.
  startDate: string;
  endDate: string;
  approved: boolean;
}

export interface CheckClosure {
  title: string;
  startsAt: Date;
  endsAt: Date;
  /// Null for both offices.
  locationId: string | null;
}

export interface CheckLeaver {
  /// Their last day, if one was given.
  lastDay: string | null;
  /// Marked as no longer employed.
  gone: boolean;
}

export interface CheckLapse {
  employeeId: string;
  typeName: string;
  /// The day the license ran out, as a plain date.
  expiresOn: string;
}

export interface CheckOvertime {
  employeeName: string;
  weekStart: string;
  scheduledHours: number;
  overtimeHours: number;
}

export interface PublishCheckInput {
  drafts: CheckShift[];
  /// Open shifts in the same days, at the same offices, drafts or not.
  openShifts: CheckShift[];
  leave: CheckLeave[];
  /// Shift id → why they said they cannot work then (`clashFor`).
  unavailable: Map<string, string>;
  closures: CheckClosure[];
  leavers: Map<string, CheckLeaver>;
  /// Required licenses, latest on file, per person.
  lapses: CheckLapse[];
  /// Weeks the drafts fall in that the rota puts over the line.
  overtime: CheckOvertime[];
  thresholdHours: number;
}

const TITLES: Record<PublishCheckKey, string> = {
  licenses: 'A required license has lapsed by then',
  leavers: 'For people who have left',
  leave: 'On time off',
  closures: 'During a closure',
  availability: 'When they said they can’t work',
  overtime: 'Going into overtime',
  open: 'Open shifts with nobody on them',
};

export function publishWarnings(input: PublishCheckInput): PublishCheck {
  const byDate = (a: CheckShift, b: CheckShift) => a.startsAt.getTime() - b.startsAt.getTime();
  const drafts = [...input.drafts].sort(byDate);
  const staffed = drafts.filter((shift) => shift.employeeId !== null);

  const lines: Record<PublishCheckKey, string[]> = {
    licenses: licenseLines(staffed, input.lapses),
    leavers: leaverLines(staffed, input.leavers),
    leave: staffed.flatMap((shift) => {
      const hits = input.leave.filter(
        (request) =>
          request.employeeId === shift.employeeId &&
          request.startDate <= shift.date &&
          request.endDate >= shift.date,
      );
      // Approved wins over asked-for, when there are both.
      const hit = hits.find((request) => request.approved) ?? hits[0];
      if (!hit) return [];
      return [
        `${shift.employeeName} — ${shortDate(shift.date)}: ${
          hit.approved
            ? `on approved ${leaveLabel(hit.type)}`
            : 'asked for that day off (not decided)'
        }`,
      ];
    }),
    closures: drafts.flatMap((shift) => {
      const closure = input.closures.find(
        (candidate) =>
          candidate.startsAt < shift.endsAt &&
          candidate.endsAt > shift.startsAt &&
          (candidate.locationId === null || candidate.locationId === shift.locationId),
      );
      if (!closure) return [];
      return [
        `${shift.employeeName ?? 'An open shift'} at ${shift.locationName}, ${shortDate(shift.date)} — ${closure.title}`,
      ];
    }),
    availability: staffed.flatMap((shift) => {
      const reason = input.unavailable.get(shift.id);
      return reason
        ? [`${shift.employeeName} — ${shortDate(shift.date)}, ${hours(shift)}: ${reason}`]
        : [];
    }),
    overtime: input.overtime.map(
      (week) =>
        `${week.employeeName} — ${week.scheduledHours} hrs the week of ${shortDate(week.weekStart)} (${
          week.overtimeHours
        } over ${input.thresholdHours})`,
    ),
    open: [...input.openShifts]
      .sort(byDate)
      .map(
        (shift) =>
          `${shortDate(shift.date)} · ${shift.locationName}${
            shift.jobRoleName ? ` · ${shift.jobRoleName}` : ''
          } · ${hours(shift)}`,
      ),
  };

  const order: PublishCheckKey[] = [
    'licenses',
    'leavers',
    'leave',
    'closures',
    'availability',
    'overtime',
    'open',
  ];
  return {
    drafts: input.drafts.length,
    sections: order
      .filter((key) => lines[key].length > 0)
      .map((key) => ({ key, title: TITLES[key], lines: lines[key] })),
  };
}

/// One line per person and license, however many shifts it covers: "Dr. Robin
/// Doe — DEA expired Mon, Oct 5, before 3 shifts from Tue, Oct 13".
function licenseLines(staffed: CheckShift[], lapses: CheckLapse[]): string[] {
  const out: string[] = [];
  for (const lapse of lapses) {
    const after = staffed.filter(
      (shift) => shift.employeeId === lapse.employeeId && shift.date > lapse.expiresOn,
    );
    if (after.length === 0) continue;
    out.push(
      `${after[0].employeeName} — ${lapse.typeName} expired ${shortDate(lapse.expiresOn)}, before ${count(
        after.length,
      )} from ${shortDate(after[0].date)}`,
    );
  }
  return out;
}

/// One line per person, as the nightly round-up does for leavers.
function leaverLines(staffed: CheckShift[], leavers: Map<string, CheckLeaver>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const shift of staffed) {
    const id = shift.employeeId!;
    if (seen.has(id)) continue;
    const leaver = leavers.get(id);
    if (!leaver) continue;
    const after = staffed.filter(
      (candidate) =>
        candidate.employeeId === id &&
        (leaver.gone ? true : leaver.lastDay !== null && candidate.date > leaver.lastDay),
    );
    if (after.length === 0) continue;
    seen.add(id);
    out.push(
      `${shift.employeeName} — ${count(after.length)} from ${shortDate(after[0].date)}, ${
        leaver.lastDay && after[0].date > leaver.lastDay
          ? `after their last day (${shortDate(leaver.lastDay)})`
          : 'but marked as no longer employed'
      }`,
    );
  }
  return out;
}

function hours(shift: CheckShift): string {
  return `${twelveHour(shift.startTime)}–${twelveHour(shift.endTime)}`;
}

function count(n: number): string {
  return `${n} shift${n === 1 ? '' : 's'}`;
}

function leaveLabel(type: PtoType): string {
  switch (type) {
    case PtoType.SICK:
      return 'sick leave';
    case PtoType.VACATION:
      return 'PTO';
    case PtoType.UNPAID:
      return 'unpaid leave';
    case PtoType.BEREAVEMENT:
      return 'bereavement leave';
    case PtoType.PERSONAL:
      return 'personal time';
    default:
      return 'time off';
  }
}
