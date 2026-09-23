import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EmploymentStatus,
  Role,
  ShiftStatus,
  Unavailability,
  UnavailabilityKind,
} from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { addDaysTo, localDateIn, weekStartIn } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { Rule, describe } from './availability.rules';
import { CreateUnavailabilityDto } from './dto/availability.dto';

/// Both offices are in New Jersey. Used only to decide what "today" is when
/// somebody has no location to take a timezone from.
const PRACTICE_ZONE = 'America/New_York';

/**
 * When staff cannot work.
 *
 * The rule that shapes everything here, confirmed by Dominguez: availability
 * can be changed at any time, but **only for weeks whose rota is not yet
 * published**. People are already working to a published week, so a change
 * cannot reach back into it. The earliest date a change can touch is
 * `firstOpenDate`: the day after the last published week at any of the
 * person's locations, and never before today.
 */
@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Somebody's current and future availability, and how far the rota already
  /// reaches for them.
  async forEmployee(employeeId: string, actor: AuthUser, now = new Date()) {
    if (actor.role === Role.EMPLOYEE && employeeId !== actor.id) {
      throw new ForbiddenException('That is not yours.');
    }
    const { today, firstOpenDate } = await this.window(employeeId, now);

    const rows = await this.prisma.unavailability.findMany({
      where: { employeeId, ...current(today) },
      orderBy: [{ kind: 'asc' }, { weekday: 'asc' }, { date: 'asc' }, { startTime: 'asc' }],
    });

    return {
      firstOpenDate,
      rules: rows.map((row) => present(row, firstOpenDate)),
    };
  }

  /// Everybody's, for the manager building the rota.
  async team(now = new Date()) {
    const today = localDateIn(now, PRACTICE_ZONE);
    const people = await this.prisma.employee.findMany({
      where: { employmentStatus: { in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        unavailability: {
          where: current(today),
          orderBy: [{ kind: 'asc' }, { weekday: 'asc' }, { date: 'asc' }],
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return people.map(({ unavailability, ...person }) => ({
      ...person,
      rules: unavailability.map((row) => present(row, today)),
    }));
  }

  async create(dto: CreateUnavailabilityDto, actor: AuthUser, now = new Date()) {
    const { startTime, endTime } = checkHours(dto.startTime, dto.endTime);
    const { today, firstOpenDate } = await this.window(actor.id, now);

    let effectiveFrom: string;
    if (dto.kind === UnavailabilityKind.ONE_OFF) {
      const date = dto.date!.slice(0, 10);
      if (date < today) throw new BadRequestException('That date has already passed.');
      if (date < firstOpenDate) throw lockedError(date, firstOpenDate);
      effectiveFrom = date;
    } else {
      // A new weekly rule starts at the first week that is still open, so it
      // cannot change a week people are already working to.
      effectiveFrom = firstOpenDate;
    }

    const row = await this.prisma.unavailability.create({
      data: {
        employeeId: actor.id,
        kind: dto.kind,
        weekday: dto.kind === UnavailabilityKind.WEEKLY ? dto.weekday! : null,
        date: dto.kind === UnavailabilityKind.ONE_OFF ? day(effectiveFrom) : null,
        startTime,
        endTime,
        note: dto.note?.trim() || null,
        effectiveFrom: day(effectiveFrom),
      },
    });
    this.logger.log(`Unavailability ${row.id} (${row.kind}) added by ${actor.id}`);
    return present(row, firstOpenDate);
  }

  /**
   * Taking one away.
   *
   * A one-off inside a published week stays: that week is fixed. A weekly rule
   * that has already applied to a published week is ended at the first open
   * week instead of deleted, so the weeks it covered keep saying what they said.
   */
  async remove(id: string, actor: AuthUser, now = new Date()) {
    const row = await this.prisma.unavailability.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That does not exist.');
    if (row.employeeId !== actor.id) throw new ForbiddenException('That is not yours.');

    const { firstOpenDate } = await this.window(actor.id, now);
    const from = iso(row.effectiveFrom);

    if (row.kind === UnavailabilityKind.ONE_OFF) {
      if (from < firstOpenDate) throw lockedError(from, firstOpenDate);
      await this.prisma.unavailability.delete({ where: { id } });
      return { removed: true, endsAfter: null };
    }

    if (from >= firstOpenDate) {
      await this.prisma.unavailability.delete({ where: { id } });
      return { removed: true, endsAfter: null };
    }

    const endsAfter = addDaysTo(firstOpenDate, -1);
    await this.prisma.unavailability.update({
      where: { id },
      data: { effectiveUntil: day(endsAfter) },
    });
    this.logger.log(`Weekly unavailability ${id} ended after ${endsAfter} by ${actor.id}`);
    return { removed: true, endsAfter };
  }

  /**
   * Today, and the first date a change may touch.
   *
   * "Published" is per location, the way managers publish: the last week with
   * a published shift at any of the person's locations is fixed, whoever those
   * shifts are for — somebody not on this week's rota may still be about to be
   * added to it.
   */
  async window(employeeId: string, now = new Date()) {
    const places = await this.prisma.employeeLocation.findMany({
      where: { employeeId },
      select: { location: { select: { id: true, timezone: true } }, isPrimary: true },
    });
    const zone =
      places.find((place) => place.isPrimary)?.location.timezone ??
      places[0]?.location.timezone ??
      PRACTICE_ZONE;
    const today = localDateIn(now, zone);

    const latest = places.length
      ? await this.prisma.shift.findFirst({
          where: {
            status: ShiftStatus.PUBLISHED,
            locationId: { in: places.map((place) => place.location.id) },
            startsAt: { gte: new Date(`${addDaysTo(today, -7)}T00:00:00Z`) },
          },
          orderBy: { startsAt: 'desc' },
          select: { startsAt: true, location: { select: { timezone: true } } },
        })
      : null;

    const afterPublished = latest
      ? addDaysTo(weekStartIn(latest.startsAt, latest.location.timezone), 7)
      : today;

    return { today, firstOpenDate: afterPublished > today ? afterPublished : today };
  }
}

/// What still matters: one-offs from today on, weekly rules not yet ended.
function current(today: string) {
  return {
    OR: [
      { kind: UnavailabilityKind.ONE_OFF, date: { gte: day(today) } },
      {
        kind: UnavailabilityKind.WEEKLY,
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: day(today) } }],
      },
    ],
  };
}

export function toRule(row: Unavailability): Rule {
  return {
    kind: row.kind,
    weekday: row.weekday,
    date: row.date ? iso(row.date) : null,
    startTime: row.startTime,
    endTime: row.endTime,
    effectiveFrom: iso(row.effectiveFrom),
    effectiveUntil: row.effectiveUntil ? iso(row.effectiveUntil) : null,
  };
}

function present(row: Unavailability, firstOpenDate: string) {
  const rule = toRule(row);
  return {
    id: row.id,
    ...rule,
    note: row.note,
    description: describe(rule),
    /// Whether it can still be taken away without touching a published week.
    /// A weekly rule always can — it just ends at the first open week.
    locked: rule.kind === UnavailabilityKind.ONE_OFF && rule.effectiveFrom < firstOpenDate,
  };
}

function checkHours(start?: string, end?: string) {
  if (!start && !end) return { startTime: null, endTime: null };
  if (!start || !end) {
    throw new BadRequestException('Give both a start and an end time, or neither for all day.');
  }
  if (end <= start) {
    throw new BadRequestException(
      'The end time has to be after the start. For overnight, add the two days separately.',
    );
  }
  return { startTime: start, endTime: end };
}

function lockedError(date: string, firstOpenDate: string) {
  return new BadRequestException(
    `The schedule for ${label(date)} is already published, so it can’t be changed here. ` +
      `Changes can start from ${label(firstOpenDate)} — for anything sooner, talk to a manager.`,
  );
}

function label(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function day(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
