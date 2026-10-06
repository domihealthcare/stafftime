import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  EmploymentStatus,
  NotificationKind,
  PayType,
  Prisma,
  PtoStatus,
  ShiftStatus,
} from '@prisma/client';
import {
  addDaysTo,
  datesBetween,
  isoWeekdayOf,
  localDateIn,
  localTimeIn,
  PRACTICE_ZONE,
  weekStartIn,
  weekStartOf,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { clashFor, Rule } from '../availability/availability.rules';
import { toRule } from '../availability/availability.service';
import { InboxService } from '../email/inbox.service';
import { heldJobRole } from './held-job-role';
import { PrismaService } from '../prisma/prisma.service';
import { workweekStartsOn } from '../settings/pay-period';
import { PracticeSettingsService } from '../settings/practice-settings.service';
import {
  CopyWeekDto,
  QueryCoverageDto,
  RepeatShiftsDto,
  SetWeeklyScheduleDto,
  StopStandingShiftDto,
  UpdateStandingShiftDto,
} from './dto/repeat-shifts.dto';
import { OvertimeService } from './overtime.service';
import {
  capitalised,
  isEveryWeek,
  onPattern,
  patternPhrase,
  patternProblem,
  RepeatPattern,
} from './repeat-pattern';

/// Guards against a mis-typed year turning into three thousand shifts.
const MAX_GENERATED_SHIFTS = 200;
const MAX_SPAN_DAYS = 400;

/// How far ahead a standing shift — one with no end date — is written out.
/// Eight weeks: past anything a manager plans or staff look at in the month
/// view, and the nightly job keeps it there.
export const STANDING_DAYS_AHEAD = 56;

export interface OvertimeWarning {
  employeeId: string;
  employeeName: string;
  /// First day of the overtime week these hours fall in (the pay period's
  /// weekday), as a plain date.
  weekStart: string;
  scheduledHours: number;
  overtimeHours: number;
  /// True when some of the week's hours are at a location the manager is not
  /// currently looking at, which is the case a single-location view would miss.
  spansLocations: boolean;
}

export type SkipReason = 'OVERLAPS_SHIFT' | 'ON_APPROVED_LEAVE';

export interface PlannedSkip {
  date: string;
  reason: SkipReason;
  detail: string;
}

export interface PlanResult {
  created: number;
  skipped: PlannedSkip[];
  /// The dates that now have a shift, for the UI to jump to.
  dates: string[];
  /// Anyone these shifts leave past the overtime line, week by week — said
  /// with the result, because a repeating rota can reach weeks nobody is
  /// looking at yet.
  overtime: OvertimeWarning[];
  /// For a repeat with no end date: the standing shift it made, and the last
  /// date written out so far.
  standing?: { id: string; filledThrough: string };
}

const SHIFT_INCLUDE = {
  employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
  location: { select: { id: true, name: true, slug: true, timezone: true } },
  jobRole: { select: { id: true, name: true } },
} satisfies Prisma.ShiftInclude;

/**
 * Building a schedule in bulk, rather than one shift at a time.
 *
 * Everything here works in the location's own wall-clock time: a repeating 9am
 * shift stays at 9am through a clock change, and a copied week lands on the
 * same local hours it came from.
 *
 * Conflicts are skipped and reported, never silently dropped or forced. A
 * manager needs to know that Thursday did not get made because someone is on
 * leave.
 */
@Injectable()
export class ShiftPlanningService {
  private readonly logger = new Logger(ShiftPlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PracticeSettingsService,
    private readonly overtime: OvertimeService,
    private readonly inbox: InboxService,
  ) {}

  async repeat(
    dto: RepeatShiftsDto,
    createdById: string,
    now: Date = new Date(),
  ): Promise<PlanResult> {
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException(
        'The end time must be after the start time. An overnight shift needs to be added a day at a time for now.',
      );
    }

    // No last date: a standing shift, written out a few weeks ahead now and
    // topped up every night (`extendStandingShifts`).
    const from = dto.from.slice(0, 10);
    const standing = !dto.until;
    const until = dto.until
      ? dto.until.slice(0, 10)
      : standingHorizon(laterOf(from, localDateIn(now, PRACTICE_ZONE)));

    const dates = datesBetween(from, until);
    if (dates.length === 0) {
      throw new BadRequestException('The last date cannot be before the first.');
    }
    const everyWeeks = dto.everyWeeks ?? 1;
    const weeksOfMonth = [...(dto.weeksOfMonth ?? [])].sort();
    const pattern: RepeatPattern = {
      daysOfWeek: dto.daysOfWeek,
      everyWeeks,
      weeksOfMonth,
      cycleFrom: from,
    };
    const wrong = patternProblem(pattern);
    if (wrong) throw new BadRequestException(wrong);
    if (dates.length > MAX_SPAN_DAYS) {
      throw new BadRequestException(
        `That spans ${dates.length} days. Plan at most ${MAX_SPAN_DAYS} days at a time.`,
      );
    }

    const location = await this.requireLocation(dto.locationId);
    if (dto.employeeId) await this.requireAssignment(dto.employeeId, dto.locationId);
    // Somebody's shifts are for one of their own job roles; open ones, any.
    const jobRoleId = dto.employeeId
      ? await heldJobRole(this.prisma, dto.employeeId, dto.jobRoleId)
      : (dto.jobRoleId ?? null);
    if (!dto.employeeId && jobRoleId) await this.requireJobRole(jobRoleId);

    const wanted = dates.filter((date) => onPattern(date, pattern));
    if (wanted.length === 0) {
      throw new BadRequestException(
        isEveryWeek(pattern)
          ? 'None of those weekdays fall inside that date range.'
          : `${capitalised(patternPhrase(pattern))} does not fall inside that date range.`,
      );
    }
    if (wanted.length > MAX_GENERATED_SHIFTS) {
      throw new BadRequestException(
        `That would create ${wanted.length} shifts. Plan at most ${MAX_GENERATED_SHIFTS} at a time.`,
      );
    }

    const candidates = wanted.map((date) => ({
      date,
      startsAt: zonedTimeToUtc(date, dto.startTime, location.timezone),
      endsAt: zonedTimeToUtc(date, dto.endTime, location.timezone),
    }));

    const perDay = dto.employeeId ? 1 : (dto.openCount ?? 1);
    if (wanted.length * perDay > MAX_GENERATED_SHIFTS) {
      throw new BadRequestException(
        `That would create ${wanted.length * perDay} shifts. Plan at most ${MAX_GENERATED_SHIFTS} at a time.`,
      );
    }

    const status = dto.status ?? ShiftStatus.DRAFT;
    const startsOn = await this.settings.workweekStartsOn();
    const weeks = [...new Set(wanted.map((date) => weekStartOf(date, startsOn)))];
    const before =
      dto.employeeId && status === ShiftStatus.PUBLISHED
        ? await this.overtime.snapshot([dto.employeeId], weeks)
        : null;

    const series = standing
      ? await this.prisma.shiftSeries.create({
          data: {
            employeeId: dto.employeeId ?? null,
            locationId: dto.locationId,
            jobRoleId,
            isRemote: dto.isRemote ?? false,
            openCount: perDay,
            daysOfWeek: [...dto.daysOfWeek].sort(),
            everyWeeks,
            weeksOfMonth,
            cycleFrom: everyWeeks > 1 ? asDate(from) : null,
            startTime: dto.startTime,
            endTime: dto.endTime,
            status,
            notes: dto.notes,
            startsOn: asDate(from),
            filledThrough: asDate(until),
            createdById,
          },
          select: { id: true },
        })
      : null;

    const result = await this.createAll(candidates, {
      employeeId: dto.employeeId ?? null,
      jobRoleId,
      isRemote: dto.isRemote ?? false,
      openCount: perDay,
      locationId: dto.locationId,
      status,
      notes: dto.notes,
      createdById,
      timezone: location.timezone,
      seriesId: series?.id ?? null,
    });

    if (before && dto.employeeId) {
      await this.overtime.announceNewOvertime(before, [dto.employeeId], weeks);
      await this.tellAboutNewShifts(
        dto.employeeId,
        result.created,
        result.dates,
        standing ? patternPhrase(pattern) : undefined,
      );
    }
    return {
      ...result,
      overtime: dto.employeeId
        ? await this.overtimeAfterPlanning(result.dates, [dto.employeeId])
        : [],
      ...(series ? { standing: { id: series.id, filledThrough: until } } : {}),
    };
  }

  /**
   * Writes out the next weeks of every standing shift, so each stays
   * `STANDING_DAYS_AHEAD` days ahead. Run by the nightly job.
   *
   * It carries on from the day after the last date already written, never
   * before — so a shift a manager removed by hand stays removed — and it
   * clashes, skips and warns exactly as a repeat does. Nobody is told under
   * the bell: they were told "every Monday, no end date" when it was made,
   * and a new line every night would be noise.
   *
   * Somebody who is no longer active, or no longer at that office, gets no
   * new shifts from it; the dates are passed over rather than kept for later,
   * so nobody comes back to a pile of shifts in the past.
   */
  async extendStandingShifts(now: Date = new Date()): Promise<number> {
    const target = standingHorizon(localDateIn(now, PRACTICE_ZONE));
    const today = localDateIn(now, PRACTICE_ZONE);
    const due = await this.prisma.shiftSeries.findMany({
      where: {
        filledThrough: { lt: asDate(target) },
        OR: [{ endsOn: null }, { endsOn: { gte: asDate(today) } }],
      },
      include: {
        location: { select: { timezone: true, isActive: true } },
        employee: {
          select: { employmentStatus: true, locations: { select: { locationId: true } } },
        },
      },
    });

    let created = 0;
    for (const series of due) {
      const filled = isoDate(series.filledThrough);
      const endsOn = series.endsOn ? isoDate(series.endsOn) : null;
      const last = endsOn && endsOn < target ? endsOn : target;
      if (last <= filled) continue;

      const working =
        series.location.isActive &&
        (!series.employeeId ||
          (series.employee?.employmentStatus === EmploymentStatus.ACTIVE &&
            series.employee.locations.some((at) => at.locationId === series.locationId)));

      if (working) {
        const candidates = datesBetween(addDaysTo(filled, 1), last)
          .filter((date) => onPattern(date, patternOf(series)))
          .map((date) => ({
            date,
            startsAt: zonedTimeToUtc(date, series.startTime, series.location.timezone),
            endsAt: zonedTimeToUtc(date, series.endTime, series.location.timezone),
          }));
        const result = await this.createAll(candidates, {
          employeeId: series.employeeId,
          jobRoleId: series.jobRoleId,
          isRemote: series.isRemote,
          openCount: series.openCount,
          locationId: series.locationId,
          status: series.status,
          notes: series.notes ?? undefined,
          createdById: series.createdById,
          timezone: series.location.timezone,
          seriesId: series.id,
        });
        created += result.created;
      }

      await this.prisma.shiftSeries.update({
        where: { id: series.id },
        data: { filledThrough: asDate(last) },
      });
    }

    if (created > 0) this.logger.log(`Standing shifts: wrote ${created} more`);
    return created;
  }

  /// The standing shifts still running, for the Schedule's list of them.
  /// One stopped before its first day — replaced in a usual week before it
  /// began — never ran, and is left out.
  async standing(now: Date = new Date()) {
    const today = localDateIn(now, PRACTICE_ZONE);
    const running = await this.prisma.shiftSeries.findMany({
      where: { OR: [{ endsOn: null }, { endsOn: { gte: asDate(today) } }] },
      select: {
        id: true,
        employeeId: true,
        locationId: true,
        daysOfWeek: true,
        everyWeeks: true,
        weeksOfMonth: true,
        cycleFrom: true,
        startTime: true,
        endTime: true,
        openCount: true,
        isRemote: true,
        status: true,
        startsOn: true,
        endsOn: true,
        employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
        location: { select: { id: true, name: true } },
        jobRole: { select: { id: true, name: true } },
      },
      orderBy: [{ startsOn: 'asc' }, { startTime: 'asc' }],
    });
    return running.filter((series) => !series.endsOn || series.endsOn >= series.startsOn);
  }

  /**
   * Changes a standing shift from `from` (today if not given) onward.
   *
   * The rule is updated, and its shifts from that day are taken off the rota
   * the way a stop does it (drafts deleted, published ones cancelled) and
   * written again to the new rule. Earlier shifts, started shifts and ones
   * moved off the series by hand are left alone. The person is told once.
   */
  async updateStanding(id: string, dto: UpdateStandingShiftDto, now: Date = new Date()) {
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('The end time must be after the start time.');
    }
    const series = await this.prisma.shiftSeries.findUnique({
      where: { id },
      include: { location: { select: { timezone: true } } },
    });
    if (!series) throw new NotFoundException('That standing shift does not exist.');
    if (series.endsOn) throw new BadRequestException('That regular shift has been stopped.');

    const location = await this.requireLocation(dto.locationId);
    if (series.employeeId) await this.requireAssignment(series.employeeId, dto.locationId);
    const askedRole = dto.jobRoleId === undefined ? series.jobRoleId : dto.jobRoleId;
    const jobRoleId = series.employeeId
      ? await heldJobRole(this.prisma, series.employeeId, askedRole)
      : askedRole;
    if (!series.employeeId && jobRoleId) await this.requireJobRole(jobRoleId);

    const today = localDateIn(now, PRACTICE_ZONE);
    const from = laterOf(dto.from?.slice(0, 10) ?? today, today);
    const filled = isoDate(series.filledThrough);
    const daysOfWeek = [...dto.daysOfWeek].sort();
    const openCount = series.employeeId ? 1 : (dto.openCount ?? series.openCount);
    const isRemote = dto.isRemote ?? series.isRemote;
    // Every few weeks keeps its rhythm through a change of hours; a new
    // rhythm starts in the week the change does.
    const everyWeeks = dto.everyWeeks ?? series.everyWeeks;
    const weeksOfMonth = [...(dto.weeksOfMonth ?? series.weeksOfMonth)].sort();
    const cycleFrom =
      everyWeeks === 1
        ? null
        : everyWeeks === series.everyWeeks
          ? (series.cycleFrom ?? series.startsOn)
          : asDate(from);
    const pattern = patternOf({
      daysOfWeek,
      everyWeeks,
      weeksOfMonth,
      cycleFrom,
      startsOn: series.startsOn,
    });
    const wrong = patternProblem(pattern);
    if (wrong) throw new BadRequestException(wrong);

    // Shifts on or after `from` that have not started. Time already worked, or
    // with punches against it, is never touched.
    const cutoff = zonedTimeToUtc(from, '00:00', series.location.timezone);
    const going = {
      seriesId: id,
      status: { not: ShiftStatus.CANCELLED },
      startsAt: { gte: cutoff > now ? cutoff : now },
      timeEntries: { none: {} },
    } satisfies Prisma.ShiftWhereInput;

    // The weeks the rewrite reaches, measured before it, so the person hears
    // once if new hours take one of them over the line.
    const startsOn = await this.settings.workweekStartsOn();
    const weeks = [
      ...new Set(datesBetween(from, filled).map((date) => weekStartOf(date, startsOn))),
    ];
    const before =
      series.employeeId && series.status === ShiftStatus.PUBLISHED && weeks.length > 0
        ? await this.overtime.snapshot([series.employeeId], weeks)
        : null;

    await this.prisma.shiftSeries.update({
      where: { id },
      data: {
        locationId: dto.locationId,
        jobRoleId,
        isRemote,
        openCount,
        daysOfWeek,
        everyWeeks,
        weeksOfMonth,
        cycleFrom,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });

    const published = await this.prisma.shift.count({
      where: { ...going, status: ShiftStatus.PUBLISHED },
    });
    await this.prisma.shift.deleteMany({ where: { ...going, status: ShiftStatus.DRAFT } });
    await this.prisma.shift.updateMany({ where: going, data: { status: ShiftStatus.CANCELLED } });

    const dates = datesBetween(from, filled).filter((date) => onPattern(date, pattern));
    const result = await this.createAll(
      dates.map((date) => ({
        date,
        startsAt: zonedTimeToUtc(date, dto.startTime, location.timezone),
        endsAt: zonedTimeToUtc(date, dto.endTime, location.timezone),
      })),
      {
        employeeId: series.employeeId,
        jobRoleId,
        isRemote,
        openCount,
        locationId: dto.locationId,
        status: series.status,
        notes: series.notes ?? undefined,
        createdById: series.createdById,
        timezone: location.timezone,
        seriesId: id,
      },
    );

    if (series.employeeId && (published > 0 || result.created > 0)) {
      await this.inbox.notify([series.employeeId], {
        kind: NotificationKind.SCHEDULE_CHANGED,
        title: 'Your regular shift has changed',
        body: `${capitalised(patternPhrase(pattern))} from ${shortDay(from)}.`,
        link: '/schedule',
      });
    }
    if (before && series.employeeId) {
      await this.overtime.announceNewOvertime(before, [series.employeeId], weeks);
    }

    this.logger.log(`Changed standing shift ${id} from ${from}`);
    return {
      ...result,
      from,
      overtime: series.employeeId
        ? await this.overtimeAfterPlanning(result.dates, [series.employeeId])
        : [],
    };
  }

  /**
   * Stops a standing shift after `lastDate` (today if not given).
   *
   * Its shifts after that day go the way a single removal goes: a draft is
   * deleted, a published shift is cancelled so the person keeps a record of
   * it. A shift that has already started is never touched, whatever date is
   * given, and neither is one moved off the series by hand since.
   */
  async stopStanding(id: string, dto: StopStandingShiftDto, now: Date = new Date()) {
    const series = await this.prisma.shiftSeries.findUnique({
      where: { id },
      include: { location: { select: { timezone: true } } },
    });
    if (!series) throw new NotFoundException('That standing shift does not exist.');

    const lastDate = dto.lastDate?.slice(0, 10) ?? localDateIn(now, PRACTICE_ZONE);
    const cutoff = zonedTimeToUtc(addDaysTo(lastDate, 1), '00:00', series.location.timezone);
    const after = cutoff > now ? cutoff : now;

    await this.prisma.shiftSeries.update({
      where: { id },
      data: { endsOn: asDate(lastDate) },
    });

    // One with a punch against it is never touched.
    const going = {
      seriesId: id,
      status: { not: ShiftStatus.CANCELLED },
      startsAt: { gte: after },
      timeEntries: { none: {} },
    } satisfies Prisma.ShiftWhereInput;

    const published = await this.prisma.shift.findMany({
      where: { ...going, status: ShiftStatus.PUBLISHED },
      select: { employeeId: true, startsAt: true },
      orderBy: { startsAt: 'asc' },
    });
    const deleted = await this.prisma.shift.deleteMany({
      where: { ...going, status: ShiftStatus.DRAFT },
    });
    const cancelled = await this.prisma.shift.updateMany({
      where: going,
      data: { status: ShiftStatus.CANCELLED },
    });

    if (series.employeeId && published.length > 0) {
      await this.inbox.notify([series.employeeId], {
        kind: NotificationKind.SCHEDULE_CHANGED,
        title:
          published.length === 1
            ? 'A shift taken off your schedule'
            : `${published.length} shifts taken off your schedule`,
        body: `${capitalised(patternPhrase(patternOf(series)))} after ${shortDay(lastDate)} — that regular shift has ended.`,
        link: '/schedule',
      });
    }

    this.logger.log(`Stopped standing shift ${id} after ${lastDate}`);
    return { lastDate, removed: deleted.count + cancelled.count };
  }

  /**
   * Sets somebody's usual week in one go — "Mondays 12 to 8 at North Bergen,
   * Tuesdays 9 to 5 at West New York, Fridays from home" — from `from` on
   * (Dominguez, September 2026). Before, a person whose hours or office
   * differ day to day needed a regular shift made for each day by hand.
   *
   * It is stored as the regular shifts it already was: days with the same
   * hours, office and job role share one. Against what they have now:
   *
   * - a regular shift that still matches exactly is left alone, shifts and all;
   * - one whose hours and place still match but whose days changed keeps
   *   going, losing only the days dropped and gaining the days added;
   * - any other is stopped the day before `from` (drafts deleted, published
   *   shifts cancelled, as a stop does);
   * - and what is left is made new, with no end date.
   *
   * Everything is taken off before anything is written, so a new Monday does
   * not clash with the old Monday it replaces. Time already started or worked
   * is never touched. The person is told once, not per day.
   */
  async setWeek(
    employeeId: string,
    dto: SetWeeklyScheduleDto,
    createdById: string,
    now: Date = new Date(),
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employmentStatus: true },
    });
    if (!employee) throw new NotFoundException('That member of staff does not exist.');
    if (employee.employmentStatus === EmploymentStatus.TERMINATED) {
      throw new BadRequestException('They have left the practice.');
    }

    const seen = new Set<number>();
    for (const day of dto.days) {
      // "Mondays" → "Monday".
      const name = WEEKDAY_PLURAL[day.dayOfWeek - 1].slice(0, -1);
      if (seen.has(day.dayOfWeek)) {
        throw new BadRequestException(
          `${name} is in there twice. One shift a day in a usual week.`,
        );
      }
      seen.add(day.dayOfWeek);
      if (day.endTime <= day.startTime) {
        throw new BadRequestException(`${name}: the end time must be after the start time.`);
      }
    }

    const today = localDateIn(now, PRACTICE_ZONE);
    const from = laterOf(dto.from?.slice(0, 10) ?? today, today);
    const status = dto.status ?? ShiftStatus.PUBLISHED;

    const zones = new Map<string, string>();
    for (const locationId of new Set(dto.days.map((day) => day.locationId))) {
      const location = await this.requireLocation(locationId);
      await this.requireAssignment(employeeId, locationId);
      zones.set(locationId, location.timezone);
    }
    // Each day is for one of their own job roles.
    const roleOf = new Map<number, string | null>();
    for (const day of dto.days) {
      roleOf.set(day.dayOfWeek, await heldJobRole(this.prisma, employeeId, day.jobRoleId));
    }

    // Days that share everything but the day become one regular shift.
    const wanted = new Map<
      string,
      {
        locationId: string;
        isRemote: boolean;
        jobRoleId: string | null;
        startTime: string;
        endTime: string;
        daysOfWeek: number[];
      }
    >();
    for (const day of dto.days) {
      const shape = {
        locationId: day.locationId,
        isRemote: day.isRemote ?? false,
        jobRoleId: roleOf.get(day.dayOfWeek) ?? null,
        startTime: day.startTime,
        endTime: day.endTime,
      };
      const key = seriesKey({ ...shape, status });
      const group = wanted.get(key) ?? { ...shape, daysOfWeek: [] };
      group.daysOfWeek.push(day.dayOfWeek);
      wanted.set(key, group);
    }
    for (const group of wanted.values()) group.daysOfWeek.sort();

    // A usual week is made of every-week regular shifts. One on certain weeks
    // only — the first Saturday of the month — is left running beside it.
    const current = await this.prisma.shiftSeries.findMany({
      where: { employeeId, endsOn: null, everyWeeks: 1, weeksOfMonth: { isEmpty: true } },
      include: { location: { select: { timezone: true } } },
      orderBy: { startsOn: 'asc' },
    });

    const horizon = standingHorizon(from);
    const startsOn = await this.settings.workweekStartsOn();
    const weeks = [
      ...new Set(datesBetween(from, horizon).map((date) => weekStartOf(date, startsOn))),
    ];
    const before = await this.overtime.snapshot([employeeId], weeks);

    // First, everything that goes.
    let removed = 0;
    let publishedRemoved = 0;
    let kept = 0;
    const additions: {
      seriesId: string;
      group: NonNullable<ReturnType<typeof wanted.get>>;
      days: number[];
      through: string;
      status: ShiftStatus;
      notes?: string;
    }[] = [];

    for (const series of current) {
      const key = seriesKey(series);
      const group = wanted.get(key);
      const filled = isoDate(series.filledThrough);
      const sameDays = group && group.daysOfWeek.join() === [...series.daysOfWeek].sort().join();

      if (group && sameDays) {
        wanted.delete(key);
        kept += 1;
        continue;
      }

      // Changed in place only while the nightly job would carry the new days
      // on from where it is; a change far enough ahead is a stop and a start.
      if (group && from <= addDaysTo(filled, 1)) {
        wanted.delete(key);
        const dropped = series.daysOfWeek.filter((day) => !group.daysOfWeek.includes(day));
        const added = group.daysOfWeek.filter((day) => !series.daysOfWeek.includes(day));
        await this.prisma.shiftSeries.update({
          where: { id: series.id },
          data: { daysOfWeek: group.daysOfWeek },
        });
        const gone = await this.takeOff(series.id, series.location.timezone, from, now, dropped);
        removed += gone.removed;
        publishedRemoved += gone.published;
        if (added.length > 0) {
          additions.push({
            seriesId: series.id,
            group,
            days: added,
            through: filled,
            status: series.status,
            notes: series.notes ?? undefined,
          });
        }
        continue;
      }

      await this.prisma.shiftSeries.update({
        where: { id: series.id },
        data: { endsOn: asDate(addDaysTo(from, -1)) },
      });
      const gone = await this.takeOff(series.id, series.location.timezone, from, now);
      removed += gone.removed;
      publishedRemoved += gone.published;
    }

    // Then what is new.
    for (const group of wanted.values()) {
      const series = await this.prisma.shiftSeries.create({
        data: {
          employeeId,
          locationId: group.locationId,
          jobRoleId: group.jobRoleId,
          isRemote: group.isRemote,
          openCount: 1,
          daysOfWeek: group.daysOfWeek,
          startTime: group.startTime,
          endTime: group.endTime,
          status,
          startsOn: asDate(from),
          filledThrough: asDate(horizon),
          createdById,
        },
        select: { id: true },
      });
      additions.push({
        seriesId: series.id,
        group,
        days: group.daysOfWeek,
        through: horizon,
        status,
      });
    }

    let created = 0;
    let publishedCreated = 0;
    const skipped: PlannedSkip[] = [];
    const dates: string[] = [];
    for (const addition of additions) {
      const zone = zones.get(addition.group.locationId)!;
      const result = await this.createAll(
        datesBetween(from, addition.through)
          .filter((date) => addition.days.includes(isoWeekdayOf(date)))
          .map((date) => ({
            date,
            startsAt: zonedTimeToUtc(date, addition.group.startTime, zone),
            endsAt: zonedTimeToUtc(date, addition.group.endTime, zone),
          })),
        {
          employeeId,
          jobRoleId: addition.group.jobRoleId,
          isRemote: addition.group.isRemote,
          openCount: 1,
          locationId: addition.group.locationId,
          status: addition.status,
          notes: addition.notes,
          createdById,
          timezone: zone,
          seriesId: addition.seriesId,
        },
      );
      created += result.created;
      if (addition.status === ShiftStatus.PUBLISHED) publishedCreated += result.created;
      skipped.push(...result.skipped);
      dates.push(...result.dates);
    }

    if (publishedCreated > 0 || publishedRemoved > 0) {
      await this.inbox.notify([employeeId], {
        kind: NotificationKind.SCHEDULE_CHANGED,
        title: 'Your usual week has changed',
        body: `From ${shortDay(from)}: ${weekSummary(dto.days)}.`,
        link: '/schedule',
      });
      await this.overtime.announceNewOvertime(before, [employeeId], weeks);
    }

    this.logger.log(
      `Set the usual week of ${employeeId} from ${from}: ${created} shifts written, ${removed} taken off`,
    );
    const written = [...new Set(dates)].sort();
    return {
      from,
      created,
      removed,
      kept,
      skipped: skipped.sort((a, b) => a.date.localeCompare(b.date)),
      dates: written,
      overtime: await this.overtimeAfterPlanning(written, [employeeId]),
    };
  }

  /**
   * Takes a regular shift's shifts off the rota from `from` — on the given
   * weekdays only, when given. A draft is deleted, a published shift is
   * cancelled so the person keeps a record of it; one already started, or
   * with a punch against it, is never touched.
   */
  private async takeOff(
    seriesId: string,
    zone: string,
    from: string,
    now: Date,
    weekdays?: number[],
  ): Promise<{ removed: number; published: number }> {
    if (weekdays && weekdays.length === 0) return { removed: 0, published: 0 };
    const cutoff = zonedTimeToUtc(from, '00:00', zone);
    const going = (
      await this.prisma.shift.findMany({
        where: {
          seriesId,
          status: { not: ShiftStatus.CANCELLED },
          startsAt: { gte: cutoff > now ? cutoff : now },
          timeEntries: { none: {} },
        },
        select: { id: true, startsAt: true, status: true },
      })
    ).filter(
      (shift) => !weekdays || weekdays.includes(isoWeekdayOf(localDateIn(shift.startsAt, zone))),
    );
    if (going.length === 0) return { removed: 0, published: 0 };

    const ids = going.map((shift) => shift.id);
    const deleted = await this.prisma.shift.deleteMany({
      where: { id: { in: ids }, status: ShiftStatus.DRAFT, timeEntries: { none: {} } },
    });
    // A punch made since the list was read still keeps its shift.
    const cancelled = await this.prisma.shift.updateMany({
      where: { id: { in: ids }, status: { not: ShiftStatus.CANCELLED }, timeEntries: { none: {} } },
      data: { status: ShiftStatus.CANCELLED },
    });
    return {
      removed: deleted.count + cancelled.count,
      published: going.filter((shift) => shift.status === ShiftStatus.PUBLISHED).length,
    };
  }

  /**
   * Copies a week forward.
   *
   * Shifts move by whole days rather than a fixed number of milliseconds, and
   * are rebuilt from their local wall-clock time — so a 9am shift copied across
   * a clock change is still 9am, not 8 or 10.
   */
  async copyWeek(dto: CopyWeekDto, createdById: string): Promise<PlanResult> {
    const fromStart = dto.fromWeekStart.slice(0, 10);
    const toStart = dto.toWeekStart.slice(0, 10);
    if (fromStart === toStart) {
      throw new BadRequestException('Those are the same week.');
    }

    const offsetDays = Math.round(
      (new Date(`${toStart}T00:00:00Z`).getTime() - new Date(`${fromStart}T00:00:00Z`).getTime()) /
        86_400_000,
    );

    const source = await this.prisma.shift.findMany({
      where: {
        locationId: dto.locationId,
        employeeId: dto.employeeIds?.length ? { in: dto.employeeIds } : undefined,
        status: { not: ShiftStatus.CANCELLED },
        // The week as New Jersey has it: midnight there, not midnight UTC,
        // which is the evening before.
        startsAt: {
          gte: zonedTimeToUtc(fromStart, '00:00', PRACTICE_ZONE),
          lt: zonedTimeToUtc(addDaysTo(fromStart, 7), '00:00', PRACTICE_ZONE),
        },
      },
      select: {
        employeeId: true,
        jobRoleId: true,
        isRemote: true,
        locationId: true,
        startsAt: true,
        endsAt: true,
        notes: true,
        location: { select: { timezone: true } },
      },
      orderBy: { startsAt: 'asc' },
    });

    if (source.length === 0) {
      throw new BadRequestException('There are no shifts in that week to copy.');
    }

    const people = [
      ...new Set(source.flatMap((shift) => (shift.employeeId ? [shift.employeeId] : []))),
    ];
    // The target week, with a week either side for an office whose week
    // falls on a different UTC date than the one given.
    const startsOn = await this.settings.workweekStartsOn();
    const weeks = [-7, 0, 7].map((offset) => weekStartOf(addDaysTo(toStart, offset), startsOn));
    const before =
      dto.status === ShiftStatus.PUBLISHED ? await this.overtime.snapshot(people, weeks) : null;

    const skipped: PlannedSkip[] = [];
    const dates: string[] = [];
    let created = 0;
    /// employeeId → the dates they got a shift on, for one notice each.
    const madeFor = new Map<string, string[]>();

    for (const shift of source) {
      const zone = shift.location.timezone;
      // Read the original in its own local terms, then rebuild it a week later.
      const localDate = localDateIn(shift.startsAt, zone);
      const localStart = localTimeIn(shift.startsAt, zone);
      const localEnd = localTimeIn(shift.endsAt, zone);
      // An overnight shift ends on the following local date.
      const endOffset = daysBetween(localDate, localDateIn(shift.endsAt, zone));

      const targetDate = addDaysTo(localDate, offsetDays);
      const startsAt = zonedTimeToUtc(targetDate, localStart, zone);
      const endsAt = zonedTimeToUtc(addDaysTo(targetDate, endOffset), localEnd, zone);

      const result = await this.createAll([{ date: targetDate, startsAt, endsAt }], {
        // An open shift is copied open: the need is the same next week, the
        // person is not decided yet.
        employeeId: shift.employeeId,
        jobRoleId: shift.jobRoleId,
        isRemote: shift.isRemote,
        openCount: 1,
        locationId: shift.locationId,
        status: dto.status ?? ShiftStatus.DRAFT,
        notes: shift.notes ?? undefined,
        createdById,
        timezone: zone,
      });

      created += result.created;
      skipped.push(...result.skipped);
      dates.push(...result.dates);
      if (shift.employeeId && result.created > 0) {
        madeFor.set(shift.employeeId, [...(madeFor.get(shift.employeeId) ?? []), ...result.dates]);
      }
    }

    if (dto.status === ShiftStatus.PUBLISHED) {
      for (const [employeeId, theirDates] of madeFor) {
        await this.tellAboutNewShifts(employeeId, theirDates.length, theirDates);
      }
    }

    this.logger.log(`Copied ${created} shifts from week ${fromStart} to ${toStart}`);
    if (before) await this.overtime.announceNewOvertime(before, people, weeks);
    const copied = [...new Set(dates)].sort();
    return {
      created,
      skipped,
      dates: copied,
      overtime: await this.overtimeAfterPlanning(copied, people),
    };
  }

  /**
   * Publishes several drafts in one go.
   *
   * Only drafts are touched — an id that is already published, cancelled or
   * gone is counted as skipped, never an error, so a stale screen can still
   * press the button. Each person hears once ("4 new shifts on your schedule"),
   * not once per shift, and hears about overtime once, on the crossing.
   */
  async publishMany(ids: string[]): Promise<{ published: number; skipped: number }> {
    const drafts = await this.prisma.shift.findMany({
      where: { id: { in: ids }, status: ShiftStatus.DRAFT },
      select: {
        id: true,
        employeeId: true,
        startsAt: true,
        location: { select: { timezone: true } },
      },
    });
    if (drafts.length === 0) return { published: 0, skipped: ids.length };

    const startsOn = await this.settings.workweekStartsOn();
    const people = [
      ...new Set(drafts.flatMap((shift) => (shift.employeeId ? [shift.employeeId] : []))),
    ];
    const weeks = [
      ...new Set(
        drafts.map((shift) => weekStartIn(shift.startsAt, shift.location.timezone, startsOn)),
      ),
    ];
    const before = await this.overtime.snapshot(people, weeks);

    // Guarded by status again, so two managers pressing at once publish each once.
    const done = await this.prisma.shift.updateMany({
      where: { id: { in: drafts.map((shift) => shift.id) }, status: ShiftStatus.DRAFT },
      data: { status: ShiftStatus.PUBLISHED },
    });

    const datesFor = new Map<string, string[]>();
    for (const shift of drafts) {
      if (!shift.employeeId) continue;
      datesFor.set(shift.employeeId, [
        ...(datesFor.get(shift.employeeId) ?? []),
        localDateIn(shift.startsAt, shift.location.timezone),
      ]);
    }
    for (const [employeeId, dates] of datesFor) {
      await this.tellAboutNewShifts(employeeId, dates.length, dates);
    }
    await this.overtime.announceNewOvertime(before, people, weeks);
    return { published: done.count, skipped: ids.length - done.count };
  }

  /**
   * Day-by-day staffing for a window: who is on, how many hours are covered,
   * who is away, and who the rota is about to push into overtime.
   *
   * The point is the gaps — a day with nobody scheduled, somebody scheduled
   * while they are on approved leave, or a week that has quietly passed forty
   * hours for someone.
   */
  async coverage(query: QueryCoverageDto) {
    const from = query.from.slice(0, 10);
    const to = query.to.slice(0, 10);
    const dates = datesBetween(from, to);
    if (dates.length === 0 || dates.length > 62) {
      throw new BadRequestException('Ask for a window between one day and two months.');
    }

    // Leave and availability are plain dates, compared as dates. Shifts are
    // moments, so their window runs midnight to midnight in New Jersey.
    const windowStart = new Date(`${from}T00:00:00Z`);
    const windowEnd = new Date(`${addDaysTo(to, 1)}T00:00:00Z`);
    const shiftsFrom = zonedTimeToUtc(from, '00:00', PRACTICE_ZONE);
    const shiftsUntil = zonedTimeToUtc(addDaysTo(to, 1), '00:00', PRACTICE_ZONE);

    const [shifts, leave] = await Promise.all([
      this.prisma.shift.findMany({
        where: {
          locationId: query.locationId,
          status: { not: ShiftStatus.CANCELLED },
          startsAt: { gte: shiftsFrom, lt: shiftsUntil },
        },
        include: SHIFT_INCLUDE,
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.ptoRequest.findMany({
        where: {
          status: PtoStatus.APPROVED,
          startDate: { lt: windowEnd },
          endDate: { gte: windowStart },
        },
        select: {
          employeeId: true,
          type: true,
          startDate: true,
          endDate: true,
          employee: { select: { firstName: true, preferredName: true, lastName: true } },
        },
      }),
    ]);

    // What each person has said they cannot do, for the shifts in view.
    const unavailability = await this.prisma.unavailability.findMany({
      where: {
        employeeId: {
          in: [...new Set(shifts.flatMap((shift) => (shift.employeeId ? [shift.employeeId] : [])))],
        },
        effectiveFrom: { lt: windowEnd },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: windowStart } }],
      },
    });
    const rulesFor = new Map<string, Rule[]>();
    for (const row of unavailability) {
      rulesFor.set(row.employeeId, [...(rulesFor.get(row.employeeId) ?? []), toRule(row)]);
    }

    const days = dates.map((date) => {
      const onThisDay = shifts.filter(
        (shift) => localDateIn(shift.startsAt, shift.location.timezone) === date,
      );

      const away = leave.filter(
        (request) =>
          request.startDate.toISOString().slice(0, 10) <= date &&
          request.endDate.toISOString().slice(0, 10) >= date,
      );

      const awayIds = new Set(away.map((request) => request.employeeId));
      const assigned = onThisDay.filter((shift) => shift.employeeId !== null);

      return {
        date,
        weekday: isoWeekdayOf(date),
        shifts: onThisDay.map((shift) => ({
          id: shift.id,
          employeeId: shift.employeeId,
          employeeName: shift.employee ? displayName(shift.employee) : null,
          jobRoleName: shift.jobRole?.name ?? null,
          locationName: shift.location.name,
          startsAt: shift.startsAt.toISOString(),
          endsAt: shift.endsAt.toISOString(),
          status: shift.status,
          // The thing a manager needs to see: scheduled while on leave.
          conflictsWithLeave: shift.employeeId !== null && awayIds.has(shift.employeeId),
          // And scheduled when they said they could not work — a warning, not
          // a refusal, because sometimes a manager has to ask anyway.
          unavailable: clashFor((shift.employeeId && rulesFor.get(shift.employeeId)) || [], {
            date,
            startTime: localTimeIn(shift.startsAt, shift.location.timezone),
            endTime:
              localDateIn(shift.endsAt, shift.location.timezone) === date
                ? localTimeIn(shift.endsAt, shift.location.timezone)
                : '24:00',
          }),
        })),
        // Hours somebody is actually down for; open shifts are counted apart,
        // because a need is not cover.
        staffedHours:
          Math.round(
            assigned.reduce(
              (sum, shift) => sum + (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000,
              0,
            ) * 100,
          ) / 100,
        peopleScheduled: new Set(assigned.map((shift) => shift.employeeId)).size,
        openShifts: onThisDay.length - assigned.length,
        away: away.map((request) => ({
          employeeId: request.employeeId,
          employeeName: displayName(request.employee),
          type: request.type,
        })),
      };
    });

    const { overtimeThresholdHours } = await this.settings.get();

    return {
      days,
      // Only people past the line. "Close to it" is said while a shift is
      // being added (see OvertimeService.check), not left standing afterwards
      // — asked for by Dominguez, September 2026.
      overtime: await this.overtimeForWeeksTouching(dates, query.locationId),
      // The response says which line it applied. Without it the screen has to
      // guess, and a screen that guesses "40" while the practice has set 20
      // tells people the wrong rule in confident words.
      overtimeThresholdHours,
    };
  }

  /**
   * Who the rota puts over forty hours, for every week the window touches.
   *
   * Two things here are easy to get wrong and both would make the warning
   * useless in exactly the cases it exists for:
   *
   * **The whole week counts, not the visible window.** A manager looking at
   * Wednesday to Friday still needs Monday and Tuesday in the total, or adding
   * a sixth day looks free. So the query widens to the start of the first week
   * and the end of the last, whatever was asked for. A week starts on the pay
   * period's weekday (`workweekStartsOn`).
   *
   * **Every location counts, not the one being viewed.** Somebody on 24 hours
   * at North Bergen and 20 at West New York is on 44 for the week, and a
   * per-location view is precisely where that goes unnoticed. The hours are
   * therefore totalled across the practice even when the screen is filtered,
   * and `spansLocations` tells the screen to say so.
   *
   * Scheduled hours, not worked ones: this is a question about a rota being
   * built, and mixing in actual punches would make the number impossible to
   * explain. Hourly staff only, matching the payroll export — see the note
   * there about pay type not being the legal test for exempt status.
   *
   * The threshold is the practice's, not a constant: forty is the federal line
   * and a sensible default, but it is theirs to move.
   */
  private async overtimeForWeeksTouching(
    dates: string[],
    viewingLocationId?: string,
  ): Promise<OvertimeWarning[]> {
    const { overtimeThresholdHours, payPeriodStart } = await this.settings.get();
    const startsOn = workweekStartsOn(payPeriodStart);
    const firstDay = weekStartOf(dates[0], startsOn);
    const lastDay = addDaysTo(weekStartOf(dates[dates.length - 1], startsOn), 6);

    const shifts = await this.prisma.shift.findMany({
      where: {
        status: { not: ShiftStatus.CANCELLED },
        startsAt: { gte: new Date(`${firstDay}T00:00:00Z`) },
        endsAt: { lt: new Date(`${addDaysTo(lastDay, 2)}T00:00:00Z`) },
        employee: { payType: PayType.HOURLY },
      },
      include: SHIFT_INCLUDE,
    });

    // employeeId + week → the hours and where they were worked.
    const weeks = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        weekStart: string;
        hours: number;
        locationIds: Set<string>;
      }
    >();

    for (const shift of shifts) {
      // The query already asks for hourly staff, which no open shift has; this
      // is for the type checker as much as anything.
      if (!shift.employeeId || !shift.employee) continue;
      const weekStart = weekStartIn(shift.startsAt, shift.location.timezone, startsOn);
      const key = `${shift.employeeId}:${weekStart}`;

      const week = weeks.get(key) ?? {
        employeeId: shift.employeeId,
        employeeName: displayName(shift.employee),
        weekStart,
        hours: 0,
        locationIds: new Set<string>(),
      };
      week.hours += (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000;
      week.locationIds.add(shift.locationId);
      weeks.set(key, week);
    }

    return [...weeks.values()]
      .filter((week) => week.hours > overtimeThresholdHours)
      .map((week) => ({
        employeeId: week.employeeId,
        employeeName: week.employeeName,
        weekStart: week.weekStart,
        scheduledHours: round2(week.hours),
        overtimeHours: round2(week.hours - overtimeThresholdHours),
        spansLocations:
          viewingLocationId !== undefined &&
          (week.locationIds.size > 1 || !week.locationIds.has(viewingLocationId)),
      }))
      .sort(
        (a, b) =>
          a.weekStart.localeCompare(b.weekStart) ||
          b.overtimeHours - a.overtimeHours ||
          a.employeeName.localeCompare(b.employeeName),
      );
  }

  /// One notice for a batch of published shifts, not one per shift: a month
  /// of Tuesdays is one thing to know.
  private async tellAboutNewShifts(
    employeeId: string,
    count: number,
    dates: string[],
    /// For a regular shift: which days, in words — "Mondays".
    standing?: string,
  ) {
    if (count === 0) return;
    const sorted = [...dates].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (standing) {
      await this.inbox.notify([employeeId], {
        kind: NotificationKind.SCHEDULE_CHANGED,
        title: 'A regular shift on your schedule',
        body: `${capitalised(standing)} from ${shortDay(first)}, with no end date.`,
        link: '/schedule',
      });
      return;
    }
    await this.inbox.notify([employeeId], {
      kind: NotificationKind.SCHEDULE_CHANGED,
      title: count === 1 ? 'A new shift on your schedule' : `${count} new shifts on your schedule`,
      body: first === last ? `${shortDay(first)}.` : `${shortDay(first)} to ${shortDay(last)}.`,
      link: '/schedule',
    });
  }

  /// Who a batch of new shifts leaves past the line, in the weeks it touched.
  /// Also asked after a change of hours (`ShiftRetimeService`).
  async overtimeAfterPlanning(dates: string[], employeeIds: string[]): Promise<OvertimeWarning[]> {
    if (dates.length === 0 || employeeIds.length === 0) return [];
    const people = new Set(employeeIds);
    return (await this.overtimeForWeeksTouching([...dates].sort())).filter((week) =>
      people.has(week.employeeId),
    );
  }

  // -------------------------------------------------------------------------

  /**
   * Creates each candidate that does not clash, reporting the rest.
   *
   * Approved leave is a skip rather than a failure: scheduling somebody over
   * their own holiday is nearly always a mistake, and telling the manager which
   * days were dropped is more useful than refusing the whole batch.
   */
  private async createAll(
    candidates: { date: string; startsAt: Date; endsAt: Date }[],
    common: {
      employeeId: string | null;
      jobRoleId: string | null;
      isRemote: boolean;
      /// Open shifts only: how many identical slots each day.
      openCount: number;
      locationId: string;
      status: ShiftStatus;
      notes?: string;
      createdById: string | null;
      timezone: string;
      /// The standing shift these come from, if any.
      seriesId?: string | null;
    },
  ): Promise<Omit<PlanResult, 'overtime'>> {
    const skipped: PlannedSkip[] = [];
    const dates: string[] = [];
    let created = 0;

    for (const candidate of candidates) {
      // An open shift belongs to nobody yet, so nobody can clash with it or be
      // on leave for it.
      if (!common.employeeId) {
        await this.prisma.shift.createMany({
          data: Array.from({ length: common.openCount }, () => ({
            employeeId: null,
            jobRoleId: common.jobRoleId,
            isRemote: common.isRemote,
            locationId: common.locationId,
            startsAt: candidate.startsAt,
            endsAt: candidate.endsAt,
            status: common.status,
            notes: common.notes,
            createdById: common.createdById,
            seriesId: common.seriesId ?? null,
          })),
        });
        created += common.openCount;
        dates.push(candidate.date);
        continue;
      }

      const clash = await this.prisma.shift.findFirst({
        where: {
          employeeId: common.employeeId,
          status: { not: ShiftStatus.CANCELLED },
          startsAt: { lt: candidate.endsAt },
          endsAt: { gt: candidate.startsAt },
        },
        select: { id: true },
      });

      if (clash) {
        skipped.push({
          date: candidate.date,
          reason: 'OVERLAPS_SHIFT',
          detail: 'Already has a shift at that time',
        });
        continue;
      }

      const onLeave = await this.prisma.ptoRequest.findFirst({
        where: {
          employeeId: common.employeeId,
          status: PtoStatus.APPROVED,
          startDate: { lte: new Date(`${candidate.date}T00:00:00.000Z`) },
          endDate: { gte: new Date(`${candidate.date}T00:00:00.000Z`) },
        },
        select: { type: true },
      });

      if (onLeave) {
        skipped.push({
          date: candidate.date,
          reason: 'ON_APPROVED_LEAVE',
          detail: `On approved ${onLeave.type.toLowerCase()} leave`,
        });
        continue;
      }

      await this.prisma.shift.create({
        data: {
          employeeId: common.employeeId,
          jobRoleId: common.jobRoleId,
          isRemote: common.isRemote,
          locationId: common.locationId,
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt,
          status: common.status,
          notes: common.notes,
          createdById: common.createdById,
          seriesId: common.seriesId ?? null,
        },
      });

      created += 1;
      dates.push(candidate.date);
    }

    return { created, skipped, dates };
  }

  private async requireLocation(locationId: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, name: true, timezone: true, isActive: true },
    });
    if (!location) {
      throw new NotFoundException(`Location ${locationId} not found`);
    }
    if (!location.isActive) {
      throw new BadRequestException(`${location.name} is not an active location.`);
    }
    return location;
  }

  private async requireJobRole(jobRoleId: string) {
    const role = await this.prisma.jobRole.findUnique({
      where: { id: jobRoleId },
      select: { id: true },
    });
    if (!role) throw new BadRequestException('That job role does not exist.');
  }

  private async requireAssignment(employeeId: string, locationId: string) {
    const assignment = await this.prisma.employeeLocation.findUnique({
      where: { employeeId_locationId: { employeeId, locationId } },
      select: { employeeId: true },
    });
    if (!assignment) {
      throw new BadRequestException(
        'That employee is not assigned to that location. Assign it first.',
      );
    }
  }
}

// ---------------------------------------------------------------------------

function displayName(person: {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
}): string {
  return `${person.preferredName ?? person.firstName} ${person.lastName}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/// The last date a standing shift is written out to, counting from `date`.
function standingHorizon(date: string): string {
  return addDaysTo(date, STANDING_DAYS_AHEAD);
}

function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

/// A regular shift's days and weeks, as `onPattern` reads them.
function patternOf(series: {
  daysOfWeek: number[];
  everyWeeks: number;
  weeksOfMonth: number[];
  cycleFrom: Date | null;
  startsOn: Date;
}): RepeatPattern {
  return {
    daysOfWeek: series.daysOfWeek,
    everyWeeks: series.everyWeeks,
    weeksOfMonth: series.weeksOfMonth,
    cycleFrom: isoDate(series.cycleFrom ?? series.startsOn),
  };
}

/// A plain date as Prisma's `@db.Date` wants it.
function asDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/// "Tue, Oct 6".
export function shortDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const WEEKDAY_PLURAL = [
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
  'Sundays',
];

/// "Mondays", "Mondays and Thursdays", "Mondays, Wednesdays and Fridays" —
/// in the week's order as the practice reads it, Sunday first.
export function weekdaysPhrase(daysOfWeek: number[]): string {
  const names = [...new Set(daysOfWeek)]
    .sort((a, b) => (a % 7) - (b % 7))
    .map((day) => WEEKDAY_PLURAL[day - 1]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/// What makes two regular shifts the same apart from their days.
function seriesKey(shape: {
  locationId: string;
  isRemote: boolean;
  jobRoleId: string | null;
  startTime: string;
  endTime: string;
  status: ShiftStatus;
}): string {
  return [
    shape.locationId,
    shape.isRemote,
    shape.jobRoleId ?? '',
    shape.startTime,
    shape.endTime,
    shape.status,
  ].join('|');
}

/// "8:30" → "8:30am", "12:00" → "12pm".
export function clockTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/// "Mondays 12pm–8pm, Tuesdays 9am–5pm" — Sunday first; "no regular shifts"
/// for an empty week. Offices are left to the Schedule, one tap away.
export function weekSummary(days: { dayOfWeek: number; startTime: string; endTime: string }[]) {
  if (days.length === 0) return 'no regular shifts';
  return [...days]
    .sort((a, b) => (a.dayOfWeek % 7) - (b.dayOfWeek % 7))
    .map(
      (day) =>
        `${WEEKDAY_PLURAL[day.dayOfWeek - 1]} ${clockTime(day.startTime)}–${clockTime(day.endTime)}`,
    )
    .join(', ');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
