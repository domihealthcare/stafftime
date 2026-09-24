import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PayType, ShiftStatus } from '@prisma/client';
import { addDaysTo, localDateIn, weekStartIn } from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PracticeSettingsService } from '../settings/practice-settings.service';

/// How close to the overtime line counts as "close". Four hours is half a
/// normal day: a late finish or a swapped shift away from going over. A
/// constant for now, like the threshold was, until the practice asks to move it.
export const NEAR_OVERTIME_HOURS = 4;

/// Past the line; within {@link NEAR_OVERTIME_HOURS} of it; or neither.
export type OvertimeLevel = 'over' | 'near' | 'ok';

export function overtimeLevel(hours: number, thresholdHours: number): OvertimeLevel {
  if (hours > thresholdHours) return 'over';
  if (hours >= thresholdHours - NEAR_OVERTIME_HOURS) return 'near';
  return 'ok';
}

/// What adding (or moving, or assigning) one shift does to somebody's week,
/// worked out before it is saved so the scheduler can say so first.
export interface OvertimeCheck {
  /// Overtime is an hourly question — salaried staff are never warned about.
  hourly: boolean;
  weekStart: string;
  /// The week without this shift, and with it.
  hoursBefore: number;
  hoursAfter: number;
  thresholdHours: number;
  level: OvertimeLevel;
}

/// A week of somebody's own published rota that is over or close to the line.
export interface OwnOvertimeWeek {
  weekStart: string;
  scheduledHours: number;
  thresholdHours: number;
  overtimeHours: number;
  level: Exclude<OvertimeLevel, 'ok'>;
}

/// `employeeId:weekStart` → scheduled hours.
export type WeekTotals = Map<string, number>;

/**
 * Overtime as the rota builds it — one person, one week, before and after a
 * change — and telling the person when a published change puts them over.
 *
 * Counted the same way as the scheduler's weekly warning: scheduled hours,
 * every location, the week starting Monday in the shift's own office time,
 * hourly staff only.
 */
@Injectable()
export class OvertimeService {
  private readonly logger = new Logger(OvertimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PracticeSettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /// "If this shift goes in, where does their week land?"
  async check(query: {
    employeeId: string;
    locationId: string;
    startsAt: Date;
    endsAt: Date;
    /// The shift being changed, so it is not counted twice.
    shiftId?: string;
  }): Promise<OvertimeCheck> {
    const [employee, location, { overtimeThresholdHours }] = await Promise.all([
      this.prisma.employee.findUnique({
        where: { id: query.employeeId },
        select: { payType: true },
      }),
      this.prisma.location.findUnique({
        where: { id: query.locationId },
        select: { timezone: true },
      }),
      this.settings.get(),
    ]);
    if (!employee) throw new NotFoundException('That employee does not exist.');
    if (!location) throw new NotFoundException('That location does not exist.');

    const weekStart = weekStartIn(query.startsAt, location.timezone);
    const totals = await this.weekTotals([query.employeeId], [weekStart], {
      excludeShiftId: query.shiftId,
    });
    const hoursBefore = round2(totals.get(key(query.employeeId, weekStart)) ?? 0);
    const hoursAfter = round2(
      hoursBefore + (query.endsAt.getTime() - query.startsAt.getTime()) / 3_600_000,
    );
    const hourly = employee.payType === PayType.HOURLY;

    return {
      hourly,
      weekStart,
      hoursBefore,
      hoursAfter,
      thresholdHours: overtimeThresholdHours,
      level: hourly ? overtimeLevel(hoursAfter, overtimeThresholdHours) : 'ok',
    };
  }

  /// The signed-in person's own weeks, from this one on, that their published
  /// rota puts over or close to the line. Drafts are left out: they are the
  /// manager's workings, not the rota yet.
  async mine(employeeId: string): Promise<OwnOvertimeWeek[]> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { payType: true },
    });
    if (employee?.payType !== PayType.HOURLY) return [];

    const now = new Date();
    const shifts = await this.prisma.shift.findMany({
      where: {
        employeeId,
        status: ShiftStatus.PUBLISHED,
        endsAt: { gt: new Date(now.getTime() - 8 * 86_400_000) },
        startsAt: { lt: new Date(now.getTime() + 42 * 86_400_000) },
      },
      select: { startsAt: true, endsAt: true, location: { select: { timezone: true } } },
    });

    const weeks = new Map<string, { hours: number; zone: string }>();
    for (const shift of shifts) {
      const weekStart = weekStartIn(shift.startsAt, shift.location.timezone);
      const week = weeks.get(weekStart) ?? { hours: 0, zone: shift.location.timezone };
      week.hours += (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000;
      weeks.set(weekStart, week);
    }

    const { overtimeThresholdHours } = await this.settings.get();
    const result: OwnOvertimeWeek[] = [];
    for (const [weekStart, week] of weeks) {
      // A week that has already finished is the timesheet's business now.
      if (addDaysTo(weekStart, 7) <= localDateIn(now, week.zone)) continue;
      const level = overtimeLevel(week.hours, overtimeThresholdHours);
      if (level === 'ok') continue;
      result.push({
        weekStart,
        scheduledHours: round2(week.hours),
        thresholdHours: overtimeThresholdHours,
        overtimeHours: round2(Math.max(0, week.hours - overtimeThresholdHours)),
        level,
      });
    }
    return result.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }

  /**
   * Scheduled hours per person per week, hourly staff only.
   *
   * `publishedOnly` is what the person themselves can see; without it, drafts
   * count too, which is what the manager building the rota needs.
   */
  async weekTotals(
    employeeIds: string[],
    weekStarts: string[],
    options: { publishedOnly?: boolean; excludeShiftId?: string } = {},
  ): Promise<WeekTotals> {
    const totals: WeekTotals = new Map();
    const ids = [...new Set(employeeIds)];
    const weeks = new Set(weekStarts);
    if (ids.length === 0 || weeks.size === 0) return totals;

    const sorted = [...weeks].sort();
    // A day either side: the office's week starts at its own midnight, not UTC's.
    const from = new Date(`${addDaysTo(sorted[0], -1)}T00:00:00Z`);
    const to = new Date(`${addDaysTo(sorted[sorted.length - 1], 8)}T00:00:00Z`);

    const shifts = await this.prisma.shift.findMany({
      where: {
        employeeId: { in: ids },
        id: options.excludeShiftId ? { not: options.excludeShiftId } : undefined,
        status: options.publishedOnly ? ShiftStatus.PUBLISHED : { not: ShiftStatus.CANCELLED },
        startsAt: { gte: from, lt: to },
        employee: { payType: PayType.HOURLY },
      },
      select: {
        employeeId: true,
        startsAt: true,
        endsAt: true,
        location: { select: { timezone: true } },
      },
    });

    for (const shift of shifts) {
      if (!shift.employeeId) continue;
      const weekStart = weekStartIn(shift.startsAt, shift.location.timezone);
      if (!weeks.has(weekStart)) continue;
      const k = key(shift.employeeId, weekStart);
      totals.set(
        k,
        (totals.get(k) ?? 0) + (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000,
      );
    }
    return totals;
  }

  /// Published hours for these people and weeks, taken before a change so the
  /// same question can be asked after it. See {@link announceNewOvertime}.
  snapshot(employeeIds: string[], weekStarts: string[]): Promise<WeekTotals> {
    return this.weekTotals(employeeIds, weekStarts, { publishedOnly: true });
  }

  /**
   * Tells each person whose published week has just gone over the line.
   *
   * Only on the crossing — a week that was already over and gets one more
   * shift does not send a second email, and drafts send nothing until they are
   * published. Fire and forget, like every other notification: a rota change
   * must never fail because an email could not be sent.
   */
  announceNewOvertime(before: WeekTotals, employeeIds: string[], weekStarts: string[]): void {
    void (async () => {
      const [after, { overtimeThresholdHours }] = await Promise.all([
        this.snapshot(employeeIds, weekStarts),
        this.settings.get(),
      ]);
      for (const [k, hours] of after) {
        if (hours <= overtimeThresholdHours) continue;
        if ((before.get(k) ?? 0) > overtimeThresholdHours) continue;
        const [employeeId, weekStart] = k.split(':');
        await this.notifications.scheduledIntoOvertime(
          employeeId,
          weekStart,
          round2(hours),
          overtimeThresholdHours,
        );
      }
    })().catch((error: unknown) =>
      this.logger.error(
        `Could not check for new overtime: ${error instanceof Error ? error.message : error}`,
      ),
    );
  }
}

function key(employeeId: string, weekStart: string): string {
  return `${employeeId}:${weekStart}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
