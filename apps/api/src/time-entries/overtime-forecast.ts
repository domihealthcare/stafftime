import { EmploymentStatus, PayType, ShiftStatus } from '@prisma/client';
import {
  addDaysTo,
  localDateIn,
  PRACTICE_ZONE,
  weekStartOf,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { workweekStartsOn } from '../settings/pay-period';

/**
 * Overtime from hours actually worked (October 2026, Dominguez — making the
 * app smarter). The rota warns when the *schedule* takes somebody past the
 * line; nothing caught overtime that creeps in from clocking in early or
 * staying late until payroll. Part-way through the week this adds up what
 * each hourly person has **worked so far** and what the rota **still has
 * them down for**, and names those heading past the line — in time to trim a
 * shift before the overtime is paid.
 *
 * The week is the overtime week (the pay period's weekday, as everywhere);
 * hours count at both offices; drafts count, as on the rota. A punch the app
 * closed at midnight and nobody has corrected is left out — its hours are
 * the app's guess, and it is on the managers' list to fix already. Hourly
 * staff only, as in the payroll export. Managers only: the Dashboard and the
 * nightly email, never a banner.
 */

export interface WorkedPunch {
  employeeId: string;
  clockInAt: Date;
  /// Null while still clocked in: counted up to now.
  clockOutAt: Date | null;
}

export interface ScheduledShift {
  employeeId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface OvertimeHeading {
  employeeId: string;
  employeeName: string;
  worked: number;
  stillScheduled: number;
  projected: number;
  /// The whole week as the rota has it, for comparison.
  rota: number;
}

export interface OvertimeForecast {
  weekStart: string;
  thresholdHours: number;
  people: OvertimeHeading[];
}

export function forecastOvertime(input: {
  now: Date;
  thresholdHours: number;
  people: { id: string; name: string }[];
  punches: WorkedPunch[];
  shifts: ScheduledShift[];
}): OvertimeHeading[] {
  const now = input.now.getTime();
  const hours = (from: number, to: number) => Math.max(0, to - from) / 3_600_000;

  return input.people
    .map((person) => {
      const worked = input.punches
        .filter((punch) => punch.employeeId === person.id)
        .reduce(
          (sum, punch) =>
            sum + hours(punch.clockInAt.getTime(), punch.clockOutAt?.getTime() ?? now),
          0,
        );
      const theirs = input.shifts.filter((shift) => shift.employeeId === person.id);
      const stillScheduled = theirs.reduce(
        (sum, shift) =>
          sum + hours(Math.max(shift.startsAt.getTime(), now), shift.endsAt.getTime()),
        0,
      );
      const rota = theirs.reduce(
        (sum, shift) => sum + hours(shift.startsAt.getTime(), shift.endsAt.getTime()),
        0,
      );
      return {
        employeeId: person.id,
        employeeName: person.name,
        worked: round1(worked),
        stillScheduled: round1(stillScheduled),
        projected: round1(worked + stillScheduled),
        rota: round1(rota),
      };
    })
    .filter((person) => person.projected > input.thresholdHours)
    .sort((a, b) => b.projected - a.projected || a.employeeName.localeCompare(b.employeeName));
}

/// "Frankie Front-Desk — 34.5 hrs worked + 8 still on the rota = 42.5 (the
/// rota alone: 40)".
export function describeOvertimeHeading(person: OvertimeHeading, threshold: number): string {
  const head =
    person.stillScheduled > 0
      ? `${person.worked} hrs worked + ${person.stillScheduled} still on the rota = ${person.projected} this week`
      : `${person.worked} hrs worked this week, past the ${threshold}`;
  const rota =
    person.rota > threshold ? 'the rota already had them over' : `the rota alone: ${person.rota}`;
  return `${person.employeeName} — ${head} (${rota})`;
}

export async function loadOvertimeForecast(
  prisma: PrismaService,
  now: Date = new Date(),
): Promise<OvertimeForecast> {
  const settings = await prisma.practiceSettings.findFirst({
    select: { overtimeThresholdHours: true, payPeriodStart: true },
  });
  const thresholdHours = settings?.overtimeThresholdHours ?? 40;
  const weekStart = weekStartOf(
    localDateIn(now, PRACTICE_ZONE),
    workweekStartsOn(settings?.payPeriodStart ?? null),
  );
  const from = zonedTimeToUtc(weekStart, '00:00', PRACTICE_ZONE);
  const to = zonedTimeToUtc(addDaysTo(weekStart, 7), '00:00', PRACTICE_ZONE);

  const people = await prisma.employee.findMany({
    where: { payType: PayType.HOURLY, employmentStatus: { not: EmploymentStatus.TERMINATED } },
    select: { id: true, firstName: true, preferredName: true, lastName: true },
  });
  const ids = people.map((person) => person.id);
  const [punches, shifts] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        employeeId: { in: ids },
        clockInAt: { gte: from, lt: to },
        // Closed by the app at midnight and not yet corrected: its hours are a
        // guess, and it is already on the list of clock-outs to correct.
        NOT: { autoClockedOutAt: { not: null }, isMissingPunch: true },
      },
      select: { employeeId: true, clockInAt: true, clockOutAt: true },
    }),
    prisma.shift.findMany({
      where: {
        employeeId: { in: ids },
        status: { not: ShiftStatus.CANCELLED },
        startsAt: { gte: from, lt: to },
      },
      select: { employeeId: true, startsAt: true, endsAt: true },
    }),
  ]);

  return {
    weekStart,
    thresholdHours,
    people: forecastOvertime({
      now,
      thresholdHours,
      people: people.map((person) => ({
        id: person.id,
        name: `${person.preferredName ?? person.firstName} ${person.lastName}`,
      })),
      punches,
      shifts: shifts.flatMap((shift) =>
        shift.employeeId
          ? [{ employeeId: shift.employeeId, startsAt: shift.startsAt, endsAt: shift.endsAt }]
          : [],
      ),
    }),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
