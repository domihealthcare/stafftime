import { Injectable } from '@nestjs/common';
import {
  EmploymentStatus,
  EventAudience,
  PracticeEventKind,
  PtoStatus,
  ShiftStatus,
} from '@prisma/client';
import { clashFor, Rule } from '../availability/availability.rules';
import { toRule } from '../availability/availability.service';
import { isoDate } from '../common/util/calendar-date.util';
import {
  PRACTICE_ZONE,
  addDaysTo,
  localDateIn,
  localTimeIn,
  weekStartIn,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { loadStanding } from '../credentials/standing-query';
import { describeShortDay, loadShortDays } from '../staffing/minimums';
import { PrismaService } from '../prisma/prisma.service';
import { workweekStartsOn } from '../settings/pay-period';
import { PracticeSettingsService } from '../settings/practice-settings.service';
import {
  CheckLapse,
  CheckLeaver,
  CheckShift,
  PublishCheck,
  publishWarnings,
} from './publish-check';
import { ShiftPlanningService } from './shift-planning.service';

const SHIFT_SELECT = {
  id: true,
  employeeId: true,
  locationId: true,
  startsAt: true,
  endsAt: true,
  employee: {
    select: {
      firstName: true,
      preferredName: true,
      lastName: true,
      employmentStatus: true,
      terminationDate: true,
    },
  },
  location: { select: { name: true, timezone: true } },
  jobRole: { select: { name: true } },
} as const;

/**
 * Reads what bears on a set of drafts before they are published — see
 * `publish-check.ts` for what is said and why. Only reads; nothing is stored
 * and nobody is told.
 */
@Injectable()
export class PublishCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PracticeSettingsService,
    private readonly planning: ShiftPlanningService,
  ) {}

  /// `withOpenShifts` false for one person's drafts (the right-click menu),
  /// where the office's open shifts are beside the point.
  async check(ids: string[], withOpenShifts = true): Promise<PublishCheck> {
    const rows = await this.prisma.shift.findMany({
      where: { id: { in: ids }, status: ShiftStatus.DRAFT },
      select: SHIFT_SELECT,
    });
    if (rows.length === 0) return { drafts: 0, sections: [] };

    const drafts = rows.map(toCheckShift);
    const dates = drafts.map((shift) => shift.date).sort();
    const from = dates[0];
    const to = dates[dates.length - 1];
    const people = [
      ...new Set(drafts.flatMap((shift) => (shift.employeeId ? [shift.employeeId] : []))),
    ];
    const offices = [...new Set(drafts.map((shift) => shift.locationId))];
    const windowStart = zonedTimeToUtc(from, '00:00', PRACTICE_ZONE);
    const windowEnd = zonedTimeToUtc(addDaysTo(to, 1), '00:00', PRACTICE_ZONE);

    const [openRows, leave, unavailability, closures, standing, settings] = await Promise.all([
      withOpenShifts
        ? this.prisma.shift.findMany({
            where: {
              employeeId: null,
              status: { not: ShiftStatus.CANCELLED },
              locationId: { in: offices },
              startsAt: { gte: windowStart, lt: windowEnd },
            },
            select: SHIFT_SELECT,
          })
        : Promise.resolve([]),
      this.prisma.ptoRequest.findMany({
        where: {
          employeeId: { in: people },
          status: { in: [PtoStatus.APPROVED, PtoStatus.PENDING] },
          startDate: { lte: new Date(`${to}T00:00:00Z`) },
          endDate: { gte: new Date(`${from}T00:00:00Z`) },
        },
        select: { employeeId: true, type: true, startDate: true, endDate: true, status: true },
      }),
      this.prisma.unavailability.findMany({
        where: {
          employeeId: { in: people },
          effectiveFrom: { lte: new Date(`${to}T00:00:00Z`) },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gte: new Date(`${from}T00:00:00Z`) } },
          ],
        },
      }),
      this.prisma.practiceEvent.findMany({
        where: {
          kind: PracticeEventKind.CLOSURE,
          startsAt: { lt: windowEnd },
          endsAt: { gt: windowStart },
        },
        select: { title: true, startsAt: true, endsAt: true, audience: true, locationId: true },
      }),
      people.length > 0 ? loadStanding(this.prisma) : Promise.resolve([]),
      this.settings.get(),
    ]);

    const rulesFor = new Map<string, Rule[]>();
    for (const row of unavailability) {
      rulesFor.set(row.employeeId, [...(rulesFor.get(row.employeeId) ?? []), toRule(row)]);
    }
    const unavailable = new Map<string, string>();
    for (const shift of drafts) {
      if (!shift.employeeId) continue;
      const reason = clashFor(rulesFor.get(shift.employeeId) ?? [], {
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
      });
      if (reason) unavailable.set(shift.id, reason);
    }

    const leavers = new Map<string, CheckLeaver>();
    for (const row of rows) {
      if (!row.employeeId || !row.employee) continue;
      const gone = row.employee.employmentStatus === EmploymentStatus.TERMINATED;
      const lastDay = row.employee.terminationDate ? isoDate(row.employee.terminationDate) : null;
      if (gone || lastDay) leavers.set(row.employeeId, { gone, lastDay });
    }

    // Required licenses only, with one on file that runs out before a shift.
    // One with nothing on file is the Licenses screen's to chase: listing it
    // here would put the same line on every publish until it is entered.
    const lapses: CheckLapse[] = standing
      .filter((person) => people.includes(person.employee.id))
      .flatMap((person) =>
        person.lines
          .filter((line) => line.required && line.credential)
          .map((line) => ({
            employeeId: person.employee.id,
            typeName: line.type.name,
            expiresOn: isoDate(line.credential!.expiresOn),
          })),
      );

    // The rota's own weekly totals, across both offices and counting drafts,
    // narrowed to the people and weeks being published.
    const startsOn = workweekStartsOn(settings.payPeriodStart);
    const weeks = new Set(
      rows.flatMap((row) =>
        row.employeeId
          ? [`${row.employeeId}:${weekStartIn(row.startsAt, row.location.timezone, startsOn)}`]
          : [],
      ),
    );
    const overtime = (await this.planning.overtimeForWeeksTouching([from, to])).filter((week) =>
      weeks.has(`${week.employeeId}:${week.weekStart}`),
    );

    // The whole rota at those offices those days, drafts included, against the
    // practice's minimum per office and role.
    const shortDays = (await loadShortDays(this.prisma, from, to, offices)).map(describeShortDay);

    return publishWarnings({
      drafts,
      openShifts: openRows.map(toCheckShift),
      leave: leave.map((request) => ({
        employeeId: request.employeeId,
        type: request.type,
        startDate: isoDate(request.startDate),
        endDate: isoDate(request.endDate),
        approved: request.status === PtoStatus.APPROVED,
      })),
      unavailable,
      closures: closures.map((closure) => ({
        title: closure.title,
        startsAt: closure.startsAt,
        endsAt: closure.endsAt,
        locationId: closure.audience === EventAudience.LOCATION ? closure.locationId : null,
      })),
      leavers,
      lapses,
      overtime,
      thresholdHours: settings.overtimeThresholdHours,
      shortDays,
    });
  }
}

type ShiftRow = {
  id: string;
  employeeId: string | null;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  employee: { firstName: string; preferredName: string | null; lastName: string } | null;
  location: { name: string; timezone: string };
  jobRole: { name: string } | null;
};

function toCheckShift(row: ShiftRow): CheckShift {
  const zone = row.location.timezone;
  const date = localDateIn(row.startsAt, zone);
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee
      ? `${row.employee.preferredName ?? row.employee.firstName} ${row.employee.lastName}`
      : null,
    locationId: row.locationId,
    locationName: row.location.name,
    jobRoleName: row.jobRole?.name ?? null,
    date,
    startTime: localTimeIn(row.startsAt, zone),
    // A shift past midnight runs to the end of its day, as the rota reads it.
    endTime: localDateIn(row.endsAt, zone) === date ? localTimeIn(row.endsAt, zone) : '24:00',
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}
