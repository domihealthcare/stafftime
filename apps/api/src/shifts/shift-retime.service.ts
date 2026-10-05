import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationKind, ShiftStatus } from '@prisma/client';
import {
  addDaysTo,
  isoWeekdayOf,
  localDateIn,
  localTimeIn,
  weekStartOf,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { InboxService } from '../email/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { RetimeShiftDto } from './dto/retime-shift.dto';
import { OvertimeService } from './overtime.service';
import {
  clockTime,
  PlannedSkip,
  PlanResult,
  shortDay,
  ShiftPlanningService,
  weekdaysPhrase,
} from './shift-planning.service';
import { ShiftsService } from './shifts.service';

export interface RetimeResult extends PlanResult {
  /// For the notice: these shifts were changed, not made.
  action: 'changed';
  /// A regular shift (no end date) was changed too, so weeks not written out
  /// yet come at the new hours as well.
  regular: boolean;
}

/**
 * New hours for a shift — and, if asked, for the ones like it after it
 * (Dominguez, October 2026: "Gaby is 7-2 but it is changing to 1-8, so
 * instead of Celeste doing 1 by 1, she can just edit all").
 *
 * "Like it" means the same person (for an open shift: the same job role), the
 * same office, at home or not as this one is, and the same hours as this one
 * had — on the same weekday, or on any day. Shifts that have started, and
 * cancelled ones, are left alone. Hours are the office's wall clock, as a
 * repeat writes them, so a clock change does not shift them.
 *
 * Each shift is changed in place, so notes, drafts and publishing stay as
 * they were. A new time that would overlap another of the person's shifts is
 * skipped and reported, never forced. A regular shift behind them is changed
 * from the same day too, split where it has to be, so the weeks the nightly
 * job has not written yet follow.
 */
@Injectable()
export class ShiftRetimeService {
  private readonly logger = new Logger(ShiftRetimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shifts: ShiftsService,
    private readonly planning: ShiftPlanningService,
    private readonly overtime: OvertimeService,
    private readonly inbox: InboxService,
  ) {}

  async retime(id: string, dto: RetimeShiftDto, now: Date = new Date()): Promise<RetimeResult> {
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException(
        'The end time must be after the start time. An overnight shift needs to be added a day at a time for now.',
      );
    }
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: { location: { select: { timezone: true } } },
    });
    if (!shift || shift.status === ShiftStatus.CANCELLED) {
      throw new NotFoundException('That shift does not exist.');
    }

    const zone = shift.location.timezone;
    const day = localDateIn(shift.startsAt, zone);
    const at = (date: string) => ({
      startsAt: zonedTimeToUtc(date, dto.startTime, zone),
      endsAt: zonedTimeToUtc(date, dto.endTime, zone),
    });

    if (dto.scope === 'ONE') {
      const next = at(day);
      // The single-shift path tells the person and checks overtime itself.
      await this.shifts.update(id, {
        startsAt: next.startsAt.toISOString(),
        endsAt: next.endsAt.toISOString(),
      });
      return {
        action: 'changed',
        regular: false,
        created: 1,
        skipped: [],
        dates: [day],
        overtime: [],
      };
    }

    const oldStart = localTimeIn(shift.startsAt, zone);
    const oldEnd = localTimeIn(shift.endsAt, zone);
    const weekday = isoWeekdayOf(day);
    const sameWeekday = dto.scope === 'SAME_WEEKDAY';

    const later = await this.prisma.shift.findMany({
      where: {
        employeeId: shift.employeeId,
        locationId: shift.locationId,
        isRemote: shift.isRemote,
        // Open shifts belong to nobody; their job role is what they are.
        ...(shift.employeeId ? {} : { jobRoleId: shift.jobRoleId }),
        status: { not: ShiftStatus.CANCELLED },
        OR: [{ id }, { startsAt: { gte: shift.startsAt, gt: now } }],
      },
      select: { id: true, startsAt: true, endsAt: true, status: true, seriesId: true },
      orderBy: { startsAt: 'asc' },
    });
    const matching = later
      .map((other) => ({ ...other, date: localDateIn(other.startsAt, zone) }))
      .filter(
        (other) =>
          localTimeIn(other.startsAt, zone) === oldStart &&
          localTimeIn(other.endsAt, zone) === oldEnd &&
          localDateIn(other.endsAt, zone) === other.date &&
          (!sameWeekday || isoWeekdayOf(other.date) === weekday),
      );
    // The shift itself, whatever its hours look like after a clock change.
    if (!matching.some((other) => other.id === id)) {
      matching.unshift({ ...shift, date: day });
    }

    const employeeId = shift.employeeId;
    const startsOn = await this.overtime.workweekStartsOn();
    const weeks = [...new Set(matching.map((other) => weekStartOf(other.date, startsOn)))];
    const before = employeeId ? await this.overtime.snapshot([employeeId], weeks) : null;

    const skipped: PlannedSkip[] = [];
    const dates: string[] = [];
    let publishedChanged = 0;
    for (const other of matching) {
      const next = at(other.date);
      if (employeeId) {
        const clash = await this.prisma.shift.findFirst({
          where: {
            employeeId,
            id: { not: other.id },
            status: { not: ShiftStatus.CANCELLED },
            startsAt: { lt: next.endsAt },
            endsAt: { gt: next.startsAt },
          },
          select: { id: true },
        });
        if (clash) {
          skipped.push({
            date: other.date,
            reason: 'OVERLAPS_SHIFT',
            detail: 'Already has a shift at that time',
          });
          continue;
        }
      }
      await this.prisma.shift.update({ where: { id: other.id }, data: next });
      dates.push(other.date);
      if (other.status === ShiftStatus.PUBLISHED) publishedChanged += 1;
    }

    let regular = false;
    let regularPublished = false;
    const seriesIds = [
      ...new Set(matching.map((other) => other.seriesId).filter((s): s is string => Boolean(s))),
    ];
    for (const seriesId of seriesIds) {
      const status = await this.moveSeries(seriesId, {
        from: day,
        weekdays: sameWeekday ? [weekday] : null,
        oldStart,
        oldEnd,
        startTime: dto.startTime,
        endTime: dto.endTime,
        zone,
      });
      if (status) {
        regular = true;
        if (status === ShiftStatus.PUBLISHED) regularPublished = true;
      }
    }

    if (employeeId && before) {
      await this.overtime.announceNewOvertime(before, [employeeId], weeks);
    }
    if (employeeId && (publishedChanged > 0 || regularPublished)) {
      const was = `${clockTime(oldStart)}–${clockTime(oldEnd)}`;
      const hours = `${clockTime(dto.startTime)}–${clockTime(dto.endTime)}`;
      await this.inbox.notify([employeeId], {
        kind: NotificationKind.SCHEDULE_CHANGED,
        title: 'Your shift times have changed',
        body: sameWeekday
          ? `${weekdaysPhrase([weekday])} from ${shortDay(day)}: ${hours}, not ${was}.`
          : `Your ${was} shifts from ${shortDay(day)} are now ${hours}.`,
        link: '/schedule',
      });
    }

    this.logger.log(`Changed the hours of ${dates.length} shift(s) from ${day}`);
    return {
      action: 'changed',
      regular,
      created: dates.length,
      skipped,
      dates,
      overtime: employeeId ? await this.planning.overtimeAfterPlanning(dates, [employeeId]) : [],
    };
  }

  /**
   * Gives a regular shift the new hours from `from` on, for all its days or
   * only `weekdays`. A regular shift begun before `from` is ended the day
   * before and carried on as new ones — the days that move at the new hours,
   * any others at the old — so it never claims hours it did not have. Its
   * shifts from `from` on are pointed at whichever one now writes their day,
   * so stopping or editing it later still finds them.
   *
   * Returns the status its shifts are made with, or null if it was left as
   * it was (other hours, or already ended).
   */
  private async moveSeries(
    seriesId: string,
    change: {
      from: string;
      /// Null: every day it has.
      weekdays: number[] | null;
      oldStart: string;
      oldEnd: string;
      startTime: string;
      endTime: string;
      zone: string;
    },
  ): Promise<ShiftStatus | null> {
    const series = await this.prisma.shiftSeries.findUnique({ where: { id: seriesId } });
    if (!series) return null;
    if (series.startTime !== change.oldStart || series.endTime !== change.oldEnd) return null;
    if (series.endsOn && isoDate(series.endsOn) < change.from) return null;

    const moved = series.daysOfWeek.filter((d) => !change.weekdays || change.weekdays.includes(d));
    const kept = series.daysOfWeek.filter((d) => !moved.includes(d));
    if (moved.length === 0) return null;
    const splitting = change.from > isoDate(series.startsOn);

    if (!splitting && kept.length === 0) {
      await this.prisma.shiftSeries.update({
        where: { id: series.id },
        data: { startTime: change.startTime, endTime: change.endTime },
      });
      return series.status;
    }

    const shape = {
      employeeId: series.employeeId,
      locationId: series.locationId,
      jobRoleId: series.jobRoleId,
      isRemote: series.isRemote,
      openCount: series.openCount,
      everyWeeks: series.everyWeeks,
      weeksOfMonth: series.weeksOfMonth,
      // Every few weeks keeps its rhythm across the split.
      cycleFrom: series.everyWeeks > 1 ? (series.cycleFrom ?? series.startsOn) : null,
      status: series.status,
      notes: series.notes,
      endsOn: series.endsOn,
      filledThrough: series.filledThrough,
      createdById: series.createdById,
      startsOn: splitting ? asDate(change.from) : series.startsOn,
    };
    const fresh = await this.prisma.shiftSeries.create({
      data: {
        ...shape,
        daysOfWeek: moved,
        startTime: change.startTime,
        endTime: change.endTime,
      },
      select: { id: true },
    });

    let rest: string | null = null;
    if (splitting) {
      await this.prisma.shiftSeries.update({
        where: { id: series.id },
        data: { endsOn: asDate(addDaysTo(change.from, -1)) },
      });
      if (kept.length > 0) {
        rest = (
          await this.prisma.shiftSeries.create({
            data: {
              ...shape,
              daysOfWeek: kept,
              startTime: series.startTime,
              endTime: series.endTime,
            },
            select: { id: true },
          })
        ).id;
      }
    } else {
      await this.prisma.shiftSeries.update({
        where: { id: series.id },
        data: { daysOfWeek: kept },
      });
    }

    const written = await this.prisma.shift.findMany({
      where: {
        seriesId: series.id,
        startsAt: { gte: zonedTimeToUtc(change.from, '00:00', change.zone) },
      },
      select: { id: true, startsAt: true },
    });
    const movesDay = (startsAt: Date) =>
      moved.includes(isoWeekdayOf(localDateIn(startsAt, change.zone)));
    const toFresh = written.filter((s) => movesDay(s.startsAt)).map((s) => s.id);
    const toRest = written.filter((s) => !movesDay(s.startsAt)).map((s) => s.id);
    if (toFresh.length > 0) {
      await this.prisma.shift.updateMany({
        where: { id: { in: toFresh } },
        data: { seriesId: fresh.id },
      });
    }
    if (rest && toRest.length > 0) {
      await this.prisma.shift.updateMany({
        where: { id: { in: toRest } },
        data: { seriesId: rest },
      });
    }
    return series.status;
  }
}

function asDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
