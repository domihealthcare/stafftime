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
 * The place can move with the hours, or alone (Dominguez, October 2026:
 * "needs to be able to update location as well"): another of their offices,
 * or from home. Only an office they work at, and never home for an open
 * shift.
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
      include: { location: { select: { timezone: true, name: true } } },
    });
    if (!shift || shift.status === ShiftStatus.CANCELLED) {
      throw new NotFoundException('That shift does not exist.');
    }

    const zone = shift.location.timezone;
    const day = localDateIn(shift.startsAt, zone);

    // Where it goes: the same place unless another is asked for.
    const locationId = dto.locationId ?? shift.locationId;
    const isRemote = dto.isRemote ?? shift.isRemote;
    const placeChanged = locationId !== shift.locationId || isRemote !== shift.isRemote;
    if (isRemote && !shift.employeeId) {
      throw new BadRequestException(
        'An open shift is a slot an office needs covered; it cannot be worked from home.',
      );
    }
    const place =
      locationId === shift.locationId
        ? shift.location
        : await this.prisma.location.findUnique({
            where: { id: locationId },
            select: { timezone: true, name: true, isActive: true },
          });
    if (!place) throw new NotFoundException('That office does not exist.');
    if ('isActive' in place && !place.isActive) {
      throw new BadRequestException(`${place.name} is not an active office.`);
    }
    if (shift.employeeId && locationId !== shift.locationId) {
      const assigned = await this.prisma.employeeLocation.findUnique({
        where: { employeeId_locationId: { employeeId: shift.employeeId, locationId } },
        select: { employeeId: true },
      });
      if (!assigned) {
        throw new BadRequestException(
          `They do not work at ${place.name}. Add the office to them on the Staff screen first.`,
        );
      }
    }
    const at = (date: string) => ({
      startsAt: zonedTimeToUtc(date, dto.startTime, place.timezone),
      endsAt: zonedTimeToUtc(date, dto.endTime, place.timezone),
    });

    if (dto.scope === 'ONE') {
      const next = at(day);
      // The single-shift path tells the person and checks overtime itself.
      await this.shifts.update(id, {
        startsAt: next.startsAt.toISOString(),
        endsAt: next.endsAt.toISOString(),
        ...(placeChanged ? { locationId, isRemote } : {}),
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
      await this.prisma.shift.update({
        where: { id: other.id },
        data: { ...next, locationId, isRemote },
      });
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
        oldLocationId: shift.locationId,
        oldIsRemote: shift.isRemote,
        startTime: dto.startTime,
        endTime: dto.endTime,
        locationId,
        isRemote,
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
      // The place is named only when it changed.
      const where = (remote: boolean, name: string) =>
        placeChanged ? (remote ? ' from home' : ` at ${name}`) : '';
      const oldWhere = where(shift.isRemote, shift.location.name);
      const newWhere = where(isRemote, place.name);
      const oldHours = `${clockTime(oldStart)}–${clockTime(oldEnd)}`;
      const newHours = `${clockTime(dto.startTime)}–${clockTime(dto.endTime)}`;
      await this.inbox.notify([employeeId], {
        kind: NotificationKind.SCHEDULE_CHANGED,
        title: placeChanged ? 'Your shifts have changed' : 'Your shift times have changed',
        body: sameWeekday
          ? `${weekdaysPhrase([weekday])} from ${shortDay(day)}: ${newHours}${newWhere}, not ${oldHours}${oldWhere}.`
          : `Your ${oldHours} shifts${oldWhere} from ${shortDay(day)} are now ${newHours}${newWhere}.`,
        link: '/schedule',
      });
    }

    this.logger.log(`Changed the hours or place of ${dates.length} shift(s) from ${day}`);
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
   * Gives a regular shift the new hours and place from `from` on, for all its days or
   * only `weekdays`. A regular shift begun before `from` is ended the day
   * before and carried on as new ones — the days that move at the new hours,
   * any others at the old — so it never claims hours it did not have. Its
   * shifts from `from` on are pointed at whichever one now writes their day,
   * so stopping or editing it later still finds them.
   *
   * Returns the status its shifts are made with, or null if it was left as
   * it was (other hours or place, or already ended).
   */
  private async moveSeries(
    seriesId: string,
    change: {
      from: string;
      /// Null: every day it has.
      weekdays: number[] | null;
      oldStart: string;
      oldEnd: string;
      oldLocationId: string;
      oldIsRemote: boolean;
      startTime: string;
      endTime: string;
      locationId: string;
      isRemote: boolean;
      zone: string;
    },
  ): Promise<ShiftStatus | null> {
    const series = await this.prisma.shiftSeries.findUnique({ where: { id: seriesId } });
    if (!series) return null;
    if (series.startTime !== change.oldStart || series.endTime !== change.oldEnd) return null;
    if (series.locationId !== change.oldLocationId || series.isRemote !== change.oldIsRemote) {
      return null;
    }
    const moves = {
      startTime: change.startTime,
      endTime: change.endTime,
      locationId: change.locationId,
      isRemote: change.isRemote,
    };
    if (series.endsOn && isoDate(series.endsOn) < change.from) return null;

    const moved = series.daysOfWeek.filter((d) => !change.weekdays || change.weekdays.includes(d));
    const kept = series.daysOfWeek.filter((d) => !moved.includes(d));
    if (moved.length === 0) return null;
    const splitting = change.from > isoDate(series.startsOn);

    if (!splitting && kept.length === 0) {
      await this.prisma.shiftSeries.update({ where: { id: series.id }, data: moves });
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
      data: { ...shape, ...moves, daysOfWeek: moved },
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
