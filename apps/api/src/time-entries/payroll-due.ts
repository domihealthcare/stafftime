import { TimeEntryStatus } from '@prisma/client';
import {
  addDaysTo,
  isoWeekdayOf,
  localDateIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { DateRange, payPeriodContaining } from '../settings/pay-period';
import { payDayFor } from '../settings/pay-days';

/**
 * "Payroll is due, hours aren't approved" (October 2026, Dominguez — a
 * "smarter" idea). From two working days before a pay period ends until the
 * day before it is paid, what still stands between its hours and the payroll
 * export goes to the top of the round-up and the Timesheet banner: entries not
 * approved, clock-outs the app made at midnight that nobody has corrected, and
 * punches still open from an earlier day. Outside that window the usual,
 * calmer lists carry on as before. Nothing new is stored.
 */

/// How many working days before the end the window opens.
export const DUE_WORKING_DAYS = 2;

export interface PayrollDue {
  period: DateRange;
  payDay: string;
  /// Completed (or needing review) and not approved.
  notApproved: number;
  /// How many people those belong to.
  people: number;
  /// Clocked out by the app at midnight, time not corrected yet.
  toCorrect: number;
  /// Punches still open from a day before today.
  stillIn: number;
}

/// The `n`th Monday–Friday before `date` (not counting it).
export function workingDaysBefore(date: string, n: number): string {
  let day = date;
  let counted = 0;
  while (counted < n) {
    day = addDaysTo(day, -1);
    if (isoWeekdayOf(day) <= 5) counted += 1;
  }
  return day;
}

/// The pay period due now, if today is in its window; null otherwise, or
/// before a pay period is set.
export function dueNow(
  today: string,
  anchor: string | null,
): { period: DateRange; payDay: string } | null {
  if (!anchor) return null;
  const current = payPeriodContaining(today, anchor);
  const previous = payPeriodContaining(addDaysTo(current.from, -1), anchor);
  for (const period of [previous, current]) {
    const payDay = payDayFor(period.to);
    if (today >= workingDaysBefore(period.to, DUE_WORKING_DAYS) && today < payDay) {
      return { period, payDay };
    }
  }
  return null;
}

const short = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/// The round-up's lines: when, then what is left. None when nothing is.
export function describePayrollDue(due: PayrollDue, today: string): string[] {
  const left = [
    ...(due.notApproved > 0
      ? [
          `${plural(due.notApproved, 'entry', 'entries')} not approved yet, for ${plural(due.people, 'person', 'people')}`,
        ]
      : []),
    ...(due.toCorrect > 0
      ? [
          `${plural(due.toCorrect, 'clock-out', 'clock-outs')} made at midnight to correct — ${due.toCorrect === 1 ? 'it' : 'they'} cannot be approved until then`,
        ]
      : []),
    ...(due.stillIn > 0
      ? [
          `${plural(due.stillIn, 'punch', 'punches')} still open from an earlier day — nobody clocked out`,
        ]
      : []),
  ];
  if (left.length === 0) return [];
  const ends =
    today < due.period.to
      ? `ends ${short(due.period.to)}`
      : today === due.period.to
        ? 'ends today'
        : `ended ${short(due.period.to)}`;
  return [
    `Pay period ${short(due.period.from)} – ${short(due.period.to)} ${ends}, paid ${short(due.payDay)}`,
    ...left,
  ];
}

/// Today's lines, read from the database.
export async function loadPayrollDue(
  prisma: PrismaService,
  anchor: Date | string | null,
  now = new Date(),
): Promise<string[]> {
  const today = localDateIn(now, PRACTICE_ZONE);
  const anchorDay =
    anchor === null
      ? null
      : typeof anchor === 'string'
        ? anchor.slice(0, 10)
        : anchor.toISOString().slice(0, 10);
  const due = dueNow(today, anchorDay);
  if (!due) return [];

  const from = zonedTimeToUtc(due.period.from, '00:00', PRACTICE_ZONE);
  const until = zonedTimeToUtc(addDaysTo(due.period.to, 1), '00:00', PRACTICE_ZONE);
  const todayStart = zonedTimeToUtc(today, '00:00', PRACTICE_ZONE);
  const inPeriod = { clockInAt: { gte: from, lt: until } };

  const [notApproved, toCorrect, stillIn] = await Promise.all([
    prisma.timeEntry.groupBy({
      by: ['employeeId'],
      where: {
        ...inPeriod,
        status: { in: [TimeEntryStatus.COMPLETED, TimeEntryStatus.NEEDS_REVIEW] },
        clockOutAt: { not: null },
        // Counted below instead: they need correcting before approving.
        NOT: { autoClockedOutAt: { not: null }, isMissingPunch: true },
      },
      _count: { _all: true },
    }),
    prisma.timeEntry.count({
      where: {
        ...inPeriod,
        status: { not: TimeEntryStatus.APPROVED },
        autoClockedOutAt: { not: null },
        isMissingPunch: true,
      },
    }),
    prisma.timeEntry.count({
      where: {
        clockInAt: { gte: from, lt: todayStart < until ? todayStart : until },
        clockOutAt: null,
      },
    }),
  ]);

  return describePayrollDue(
    {
      ...due,
      notApproved: notApproved.reduce((sum, row) => sum + row._count._all, 0),
      people: notApproved.length,
      toCorrect,
      stillIn,
    },
    today,
  );
}
