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
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { clashFor, Rule } from '../availability/availability.rules';
import { toRule } from '../availability/availability.service';
import { InboxService } from '../email/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { PracticeSettingsService } from '../settings/practice-settings.service';
import {
  CopyWeekDto,
  QueryCoverageDto,
  RepeatShiftsDto,
  StopStandingShiftDto,
} from './dto/repeat-shifts.dto';
import { OvertimeService } from './overtime.service';

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
  /// Monday of the week these hours fall in, as a plain date.
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
    if (dates.length > MAX_SPAN_DAYS) {
      throw new BadRequestException(
        `That spans ${dates.length} days. Plan at most ${MAX_SPAN_DAYS} days at a time.`,
      );
    }

    const location = await this.requireLocation(dto.locationId);
    if (dto.employeeId) await this.requireAssignment(dto.employeeId, dto.locationId);
    if (dto.jobRoleId) await this.requireJobRole(dto.jobRoleId);

    const wanted = dates.filter((date) => dto.daysOfWeek.includes(isoWeekdayOf(date)));
    if (wanted.length === 0) {
      throw new BadRequestException('None of those weekdays fall inside that date range.');
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
    const weeks = [...new Set(wanted.map(mondayOnOrBefore))];
    const before =
      dto.employeeId && status === ShiftStatus.PUBLISHED
        ? await this.overtime.snapshot([dto.employeeId], weeks)
        : null;

    const series = standing
      ? await this.prisma.shiftSeries.create({
          data: {
            employeeId: dto.employeeId ?? null,
            locationId: dto.locationId,
            jobRoleId: dto.jobRoleId ?? null,
            isRemote: dto.isRemote ?? false,
            openCount: perDay,
            daysOfWeek: [...dto.daysOfWeek].sort(),
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
      jobRoleId: dto.jobRoleId ?? null,
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
        standing ? { daysOfWeek: dto.daysOfWeek, from } : undefined,
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
          .filter((date) => series.daysOfWeek.includes(isoWeekdayOf(date)))
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
  async standing(now: Date = new Date()) {
    const today = localDateIn(now, PRACTICE_ZONE);
    return this.prisma.shiftSeries.findMany({
      where: { OR: [{ endsOn: null }, { endsOn: { gte: asDate(today) } }] },
      select: {
        id: true,
        employeeId: true,
        locationId: true,
        daysOfWeek: true,
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

    const going = {
      seriesId: id,
      status: { not: ShiftStatus.CANCELLED },
      startsAt: { gte: after },
    } satisfies Prisma.ShiftWhereInput;

    const published = await this.prisma.shift.findMany({
      where: { ...going, status: ShiftStatus.PUBLISHED },
      select: { employeeId: true, startsAt: true },
      orderBy: { startsAt: 'asc' },
    });
    const deleted = await this.prisma.shift.deleteMany({
      where: { ...going, status: ShiftStatus.DRAFT, timeEntries: { none: {} } },
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
        body: `${weekdaysPhrase(series.daysOfWeek)} after ${shortDay(lastDate)} — that regular shift has ended.`,
        link: '/schedule',
      });
    }

    this.logger.log(`Stopped standing shift ${id} after ${lastDate}`);
    return { lastDate, removed: deleted.count + cancelled.count };
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
        startsAt: {
          gte: new Date(`${fromStart}T00:00:00Z`),
          lt: new Date(`${addDaysTo(fromStart, 7)}T00:00:00Z`),
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
    // The target week, with a week either side for an office whose Monday
    // falls on a different UTC date than the one given.
    const weeks = [-7, 0, 7].map((offset) => mondayOnOrBefore(addDaysTo(toStart, offset)));
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

    const windowStart = new Date(`${from}T00:00:00Z`);
    const windowEnd = new Date(`${addDaysTo(to, 1)}T00:00:00Z`);

    const [shifts, leave] = await Promise.all([
      this.prisma.shift.findMany({
        where: {
          locationId: query.locationId,
          status: { not: ShiftStatus.CANCELLED },
          startsAt: { gte: windowStart, lt: windowEnd },
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
   * a sixth day looks free. So the query widens to the Monday of the first week
   * and the Sunday of the last, whatever was asked for.
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
    const { overtimeThresholdHours } = await this.settings.get();
    const firstMonday = mondayOnOrBefore(dates[0]);
    const lastSunday = addDaysTo(mondayOnOrBefore(dates[dates.length - 1]), 6);

    const shifts = await this.prisma.shift.findMany({
      where: {
        status: { not: ShiftStatus.CANCELLED },
        startsAt: { gte: new Date(`${firstMonday}T00:00:00Z`) },
        endsAt: { lt: new Date(`${addDaysTo(lastSunday, 2)}T00:00:00Z`) },
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
      const weekStart = weekStartIn(shift.startsAt, shift.location.timezone);
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
    standing?: { daysOfWeek: number[]; from: string },
  ) {
    if (count === 0) return;
    const sorted = [...dates].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (standing) {
      await this.inbox.notify([employeeId], {
        kind: NotificationKind.SCHEDULE_CHANGED,
        title: 'A regular shift on your schedule',
        body: `${weekdaysPhrase(standing.daysOfWeek)} from ${shortDay(first)}, with no end date.`,
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
  private async overtimeAfterPlanning(
    dates: string[],
    employeeIds: string[],
  ): Promise<OvertimeWarning[]> {
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

/// The Monday on or before a plain date. `weekStartIn` answers this for an
/// instant in a timezone; this is the same question for a date that is already
/// a local calendar day.
function mondayOnOrBefore(date: string): string {
  return addDaysTo(date, -((isoWeekdayOf(date) + 6) % 7));
}

/// The last date a standing shift is written out to, counting from `date`.
function standingHorizon(date: string): string {
  return addDaysTo(date, STANDING_DAYS_AHEAD);
}

function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

/// A plain date as Prisma's `@db.Date` wants it.
function asDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/// "Tue, Oct 6".
function shortDay(date: string): string {
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
