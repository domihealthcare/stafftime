import { PayType, PtoType } from '@prisma/client';
import { addDaysTo, datesBetween, isoWeekdayOf, weekStartIn } from '../common/util/zoned-time.util';

export interface EntryIn {
  employeeId: string;
  employeeName: string;
  locationId: string;
  timezone: string;
  payType: PayType;
  clockInAt: Date;
  clockOutAt: Date | null;
  isLate: boolean;
  isEarlyDeparture: boolean;
}

export interface ShiftIn {
  locationId: string;
  timezone: string;
  startsAt: Date;
  endsAt: Date;
}

export interface LeaveIn {
  /// The person's primary location, for the per-location view.
  locationId: string | null;
  type: PtoType;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
}

export interface WeekFigures {
  workedHours: number;
  scheduledHours: number;
  punches: number;
  late: number;
  earlyDepartures: number;
  timeOffDays: number;
}

const EMPTY: WeekFigures = {
  workedHours: 0,
  scheduledHours: 0,
  punches: 0,
  late: 0,
  earlyDepartures: 0,
  timeOffDays: 0,
};

/**
 * Turns a window of punches, shifts and approved leave into per-week,
 * per-location figures.
 *
 * Pure, so the arithmetic can be tested without a database. The rules match
 * the rest of the app, deliberately:
 *
 * - A week is Monday to Sunday **in the location's timezone**, like the
 *   overtime warning and the payroll export.
 * - Worked hours come from completed punches only. An open punch is somebody
 *   still at work, or a missing clock-out that *What needs a look* chases; it
 *   is counted as a punch but not as hours.
 * - Overtime is per person per week across both locations, hourly staff only,
 *   against the practice's own threshold — the same rule as the scheduler, but
 *   on hours *worked* rather than scheduled.
 * - Time off counts weekdays only: a week's leave from Monday to Sunday is
 *   five days away from work, not seven. A half day counts as half.
 */
export function summarise(input: {
  weekStarts: string[];
  locationIds: string[];
  entries: EntryIn[];
  shifts: ShiftIn[];
  leave: LeaveIn[];
  overtimeThresholdHours: number;
}) {
  const cell = new Map<string, WeekFigures>();
  const at = (week: string, location: string) => {
    const key = `${week}|${location}`;
    const found = cell.get(key) ?? { ...EMPTY };
    cell.set(key, found);
    return found;
  };
  const inWindow = new Set(input.weekStarts);

  // employee|week → hours and name, for overtime.
  const perPerson = new Map<string, { name: string; week: string; hours: number }>();

  for (const entry of input.entries) {
    const week = weekStartIn(entry.clockInAt, entry.timezone);
    if (!inWindow.has(week)) continue;
    const figures = at(week, entry.locationId);
    figures.punches += 1;
    if (entry.isLate) figures.late += 1;
    if (entry.isEarlyDeparture) figures.earlyDepartures += 1;
    if (!entry.clockOutAt) continue;

    const hours = (entry.clockOutAt.getTime() - entry.clockInAt.getTime()) / 3_600_000;
    figures.workedHours += hours;
    if (entry.payType === PayType.HOURLY) {
      const key = `${entry.employeeId}|${week}`;
      const person = perPerson.get(key) ?? { name: entry.employeeName, week, hours: 0 };
      person.hours += hours;
      perPerson.set(key, person);
    }
  }

  for (const shift of input.shifts) {
    const week = weekStartIn(shift.startsAt, shift.timezone);
    if (!inWindow.has(week)) continue;
    at(week, shift.locationId).scheduledHours +=
      (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000;
  }

  const byType = new Map<string, Map<PtoType, number>>();
  for (const request of input.leave) {
    for (const date of datesBetween(request.startDate, request.endDate)) {
      if (isoWeekdayOf(date) > 5) continue;
      const week = addDaysTo(date, -(isoWeekdayOf(date) - 1));
      if (!inWindow.has(week)) continue;
      const days = request.isHalfDay ? 0.5 : 1;
      if (request.locationId) at(week, request.locationId).timeOffDays += days;
      const types = byType.get(week) ?? new Map<PtoType, number>();
      types.set(request.type, (types.get(request.type) ?? 0) + days);
      byType.set(week, types);
    }
  }

  return input.weekStarts.map((weekStart) => {
    const byLocation = input.locationIds.map((locationId) => ({
      locationId,
      ...round(at(weekStart, locationId)),
    }));
    const overtime = [...perPerson.values()]
      .filter((person) => person.week === weekStart && person.hours > input.overtimeThresholdHours)
      .map((person) => ({
        name: person.name,
        hours: round2(person.hours),
        overtimeHours: round2(person.hours - input.overtimeThresholdHours),
      }))
      .sort((a, b) => b.overtimeHours - a.overtimeHours || a.name.localeCompare(b.name));

    const total = byLocation.reduce<WeekFigures>(
      (sum, row) => ({
        workedHours: sum.workedHours + row.workedHours,
        scheduledHours: sum.scheduledHours + row.scheduledHours,
        punches: sum.punches + row.punches,
        late: sum.late + row.late,
        earlyDepartures: sum.earlyDepartures + row.earlyDepartures,
        timeOffDays: sum.timeOffDays + row.timeOffDays,
      }),
      { ...EMPTY },
    );

    return {
      weekStart,
      byLocation,
      total: {
        ...round(total),
        // Leave for somebody with no location still counts practice-wide.
        timeOffDays: round2(
          [...(byType.get(weekStart)?.values() ?? [])].reduce((sum, days) => sum + days, 0),
        ),
        overtimeHours: round2(overtime.reduce((sum, person) => sum + person.overtimeHours, 0)),
      },
      timeOffByType: Object.fromEntries(byType.get(weekStart) ?? []),
      overtime,
    };
  });
}

function round(figures: WeekFigures): WeekFigures {
  return {
    ...figures,
    workedHours: round2(figures.workedHours),
    scheduledHours: round2(figures.scheduledHours),
    timeOffDays: round2(figures.timeOffDays),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
