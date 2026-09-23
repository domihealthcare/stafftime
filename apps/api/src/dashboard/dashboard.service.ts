import { Injectable } from '@nestjs/common';
import { PtoStatus, ShiftStatus } from '@prisma/client';
import { addDaysTo, localDateIn } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { PracticeSettingsService } from '../settings/practice-settings.service';
import { ShiftPlanningService } from '../shifts/shift-planning.service';
import { summarise } from './dashboard.summary';

const PRACTICE_ZONE = 'America/New_York';
export const MAX_WEEKS = 26;

/**
 * The manager dashboard: how the practice's weeks have actually gone.
 *
 * Built only from what the app already holds — punches, the rota, approved
 * leave, availability — and from the same rules the rest of the app uses, so
 * a number here never disagrees with the timesheet, the scheduler or the
 * payroll export about what a week or an hour of overtime is.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PracticeSettingsService,
    private readonly planning: ShiftPlanningService,
  ) {}

  async summary(weeks = 8, now = new Date()) {
    const count = Math.min(Math.max(Math.trunc(weeks) || 8, 1), MAX_WEEKS);
    const today = localDateIn(now, PRACTICE_ZONE);
    const thisMonday = mondayOf(today);
    const weekStarts = Array.from({ length: count }, (_, i) =>
      addDaysTo(thisMonday, -7 * (count - 1 - i)),
    );

    // A day either side, so a punch near midnight UTC still lands in its
    // local week; summarise() keeps only the weeks asked for.
    const from = new Date(`${addDaysTo(weekStarts[0], -1)}T00:00:00Z`);
    const until = new Date(`${addDaysTo(thisMonday, 8)}T00:00:00Z`);

    const [{ overtimeThresholdHours }, locations, entries, shifts, leave] = await Promise.all([
      this.settings.get(),
      this.prisma.location.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.timeEntry.findMany({
        where: { clockInAt: { gte: from, lt: until } },
        select: {
          employeeId: true,
          locationId: true,
          clockInAt: true,
          clockOutAt: true,
          isLate: true,
          isEarlyDeparture: true,
          location: { select: { timezone: true } },
          employee: {
            select: { firstName: true, lastName: true, preferredName: true, payType: true },
          },
        },
      }),
      this.prisma.shift.findMany({
        where: { status: { not: ShiftStatus.CANCELLED }, startsAt: { gte: from, lt: until } },
        select: {
          locationId: true,
          startsAt: true,
          endsAt: true,
          location: { select: { timezone: true } },
        },
      }),
      this.prisma.ptoRequest.findMany({
        where: {
          status: PtoStatus.APPROVED,
          startDate: { lt: until },
          endDate: { gte: from },
        },
        select: {
          type: true,
          startDate: true,
          endDate: true,
          isHalfDay: true,
          employee: {
            select: { locations: { where: { isPrimary: true }, select: { locationId: true } } },
          },
        },
      }),
    ]);

    const summary = summarise({
      weekStarts,
      locationIds: locations.map((location) => location.id),
      overtimeThresholdHours,
      entries: entries.map((entry) => ({
        employeeId: entry.employeeId,
        employeeName: `${entry.employee.preferredName ?? entry.employee.firstName} ${entry.employee.lastName}`,
        locationId: entry.locationId,
        timezone: entry.location.timezone,
        payType: entry.employee.payType,
        clockInAt: entry.clockInAt,
        clockOutAt: entry.clockOutAt,
        isLate: entry.isLate,
        isEarlyDeparture: entry.isEarlyDeparture,
      })),
      shifts: shifts.map((shift) => ({
        locationId: shift.locationId,
        timezone: shift.location.timezone,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
      })),
      leave: leave.map((request) => ({
        locationId: request.employee.locations[0]?.locationId ?? null,
        type: request.type,
        startDate: request.startDate.toISOString().slice(0, 10),
        endDate: request.endDate.toISOString().slice(0, 10),
        isHalfDay: request.isHalfDay,
      })),
    });

    // Looking ahead, not back: shifts in the next two weeks that land on a
    // time somebody said they cannot work. The scheduler's own check, so the
    // two screens cannot disagree.
    const ahead = await this.planning.coverage({ from: today, to: addDaysTo(today, 13) });
    const clashes = ahead.days.flatMap((day) =>
      day.shifts
        .filter((shift) => shift.unavailable)
        .map((shift) => ({
          date: day.date,
          employeeName: shift.employeeName,
          locationName: shift.locationName,
          reason: shift.unavailable!,
        })),
    );

    return {
      today,
      overtimeThresholdHours,
      locations,
      weeks: summary,
      upcoming: { clashes, overtime: ahead.overtime },
    };
  }
}

function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  return addDaysTo(date, 1 - weekday);
}
