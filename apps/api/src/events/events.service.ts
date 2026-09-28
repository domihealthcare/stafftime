import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  EmploymentStatus,
  EventAudience,
  NotificationKind,
  PracticeEventKind,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import {
  addDaysTo,
  localDateIn,
  localTimeIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { InboxService } from '../email/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventInput } from './dto/event.dto';
import { allDayDates, allDayRange, describeWhen } from './event-time';

/// Long enough for a conference; short enough that a typo in the year is caught.
const MAX_TIMED_DAYS = 7;
const MAX_ALL_DAY_DAYS = 31;
/// The schedule asks a week or a month (with its edges) at a time; the phone
/// calendar asks a year. Anything wider is a mistake, not a view.
const MAX_WINDOW_DAYS = 400;

const EVENT_SELECT = {
  id: true,
  kind: true,
  title: true,
  description: true,
  place: true,
  allDay: true,
  startsAt: true,
  endsAt: true,
  audience: true,
  updatedAt: true,
  jobRole: { select: { id: true, name: true, colour: true } },
  location: { select: { id: true, name: true } },
} satisfies Prisma.PracticeEventSelect;

export type EventRow = Prisma.PracticeEventGetPayload<{ select: typeof EVENT_SELECT }>;

/// Who counts as staff for an event: the same people a survey asks.
const WORKING: { in: EmploymentStatus[] } = {
  in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE],
};

/**
 * Events: office meetings, provider meetings, a wellness day — and closures:
 * Christmas, Christmas Eve from 1pm, one office shut for a burst pipe.
 *
 * On the schedule and on people's phones, and nowhere near the hours. An event
 * is not a shift — it adds nothing to scheduled hours, overtime or payroll
 * (decided with Dominguez, September 2026). Somebody paid to be there clocks
 * in as usual. A closure is for both offices or one; a shift that lands in it
 * is warned about on the rota, in its forms and in the round-up, never
 * refused, and pay is untouched (holiday pay is an open question).
 *
 * Managers and admins see every event, so they can look after them; everybody
 * else sees the ones for them — everyone's, their job roles', their offices'.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  /// Events overlapping [from, to).
  async list(from: string, to: string, viewer: AuthUser) {
    const start = new Date(from);
    const end = new Date(to);
    if (end <= start) {
      throw new BadRequestException('The end of the range must be after its start.');
    }
    if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * 86_400_000) {
      throw new BadRequestException(`Ask for at most ${MAX_WINDOW_DAYS} days at a time.`);
    }

    const manages = viewer.role === Role.MANAGER || viewer.role === Role.ADMIN;
    const rows = await this.prisma.practiceEvent.findMany({
      where: {
        startsAt: { lt: end },
        endsAt: { gt: start },
        ...(manages ? {} : await this.visibleTo(viewer.id)),
      },
      select: EVENT_SELECT,
      orderBy: [{ startsAt: 'asc' }, { title: 'asc' }],
    });
    return rows.map(present);
  }

  /// The events one person is invited to, for their calendar feed.
  async forPerson(employeeId: string, from: Date, to: Date): Promise<EventRow[]> {
    return this.prisma.practiceEvent.findMany({
      where: {
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(await this.visibleTo(employeeId)),
      },
      select: EVENT_SELECT,
      orderBy: { startsAt: 'asc' },
    });
  }

  async create(dto: EventInput, actor: AuthUser) {
    const data = await this.checkInput(dto);
    const row = await this.prisma.practiceEvent.create({
      data: { ...data, createdById: actor.id },
      select: EVENT_SELECT,
    });
    this.logger.log(`Event ${row.id} added by ${actor.id}`);

    if (row.endsAt > new Date()) {
      await this.inbox.notify(
        (await this.invited(row)).filter((id) => id !== actor.id),
        notice(row, 'added'),
      );
    }
    return present(row);
  }

  async update(id: string, dto: EventInput, actor: AuthUser) {
    const before = await this.require(id);
    const data = await this.checkInput(dto);
    const after = await this.prisma.practiceEvent.update({
      where: { id },
      data,
      select: EVENT_SELECT,
    });
    this.logger.log(`Event ${id} changed by ${actor.id}`);

    // Only what somebody would plan around. A reworded description is not
    // worth a notification.
    const moved =
      before.title !== after.title ||
      before.place !== after.place ||
      before.allDay !== after.allDay ||
      before.startsAt.getTime() !== after.startsAt.getTime() ||
      before.endsAt.getTime() !== after.endsAt.getTime();
    const reaudienced =
      before.audience !== after.audience ||
      before.jobRole?.id !== after.jobRole?.id ||
      before.location?.id !== after.location?.id;

    if ((moved || reaudienced) && (before.endsAt > new Date() || after.endsAt > new Date())) {
      const [was, now] = await Promise.all([this.invited(before), this.invited(after)]);
      const wasIn = new Set(was);
      const nowIn = new Set(now);
      const notMe = (person: string) => person !== actor.id;

      // New to it: as if it had just been made.
      await this.inbox.notify(
        now.filter((p) => !wasIn.has(p)).filter(notMe),
        notice(after, 'added'),
      );
      if (moved) {
        await this.inbox.notify(
          now.filter((p) => wasIn.has(p)).filter(notMe),
          notice(after, 'changed'),
        );
      }
      // No longer for them: it leaves their schedule, so say so.
      await this.inbox.notify(
        was.filter((p) => !nowIn.has(p)).filter(notMe),
        notice(before, 'dropped'),
      );
    }
    return present(after);
  }

  async remove(id: string, actor: AuthUser) {
    const row = await this.require(id);
    const invited = row.endsAt > new Date() ? await this.invited(row) : [];
    await this.prisma.practiceEvent.delete({ where: { id } });
    this.logger.log(`Event ${id} removed by ${actor.id}`);

    await this.inbox.notify(
      invited.filter((person) => person !== actor.id),
      notice(row, 'cancelled'),
    );
    return { deleted: true };
  }

  /**
   * "Copy last year's holidays": every closure that started in `fromYear`,
   * put on the same date the year after — same times, same offices — for a
   * manager to check. Holidays that move (Thanksgiving) land on the wrong
   * day and are fixed by hand; that is why nothing repeats by itself.
   *
   * A closure already there (same name, same start) is skipped, so pressing
   * it twice does nothing the second time. A 29 February is skipped too,
   * rather than guessed.
   */
  async copyClosures(fromYear: number, actor: AuthUser) {
    const toYear = fromYear + 1;
    const rows = await this.prisma.practiceEvent.findMany({
      where: {
        kind: PracticeEventKind.CLOSURE,
        startsAt: {
          gte: zonedTimeToUtc(`${fromYear}-01-01`, '00:00', PRACTICE_ZONE),
          lt: zonedTimeToUtc(`${toYear}-01-01`, '00:00', PRACTICE_ZONE),
        },
      },
      select: { ...EVENT_SELECT, jobRoleId: true, locationId: true },
      orderBy: { startsAt: 'asc' },
    });

    const created: EventRow[] = [];
    const skipped: string[] = [];
    for (const row of rows) {
      const firstDay = localDateIn(row.startsAt, PRACTICE_ZONE);
      if (firstDay.slice(5) === '02-29') {
        skipped.push(`${row.title} — 29 February has no date in ${toYear}`);
        continue;
      }
      const nextFirst = `${toYear}${firstDay.slice(4)}`;
      let startsAt: Date;
      let endsAt: Date;
      if (row.allDay) {
        const { startDate, endDate } = allDayDates(row);
        ({ startsAt, endsAt } = allDayRange(
          nextFirst,
          addDaysTo(nextFirst, daysBetween(startDate, endDate)),
        ));
      } else {
        // The same wall-clock times, whatever the clocks are doing that year.
        const lastDay = localDateIn(row.endsAt, PRACTICE_ZONE);
        startsAt = zonedTimeToUtc(
          nextFirst,
          localTimeIn(row.startsAt, PRACTICE_ZONE),
          PRACTICE_ZONE,
        );
        endsAt = zonedTimeToUtc(
          addDaysTo(nextFirst, daysBetween(firstDay, lastDay)),
          localTimeIn(row.endsAt, PRACTICE_ZONE),
          PRACTICE_ZONE,
        );
      }

      const already = await this.prisma.practiceEvent.count({
        where: {
          kind: PracticeEventKind.CLOSURE,
          startsAt,
          title: { equals: row.title, mode: 'insensitive' },
        },
      });
      if (already) {
        skipped.push(`${row.title} — already on ${toYear}'s calendar`);
        continue;
      }

      created.push(
        await this.prisma.practiceEvent.create({
          data: {
            kind: PracticeEventKind.CLOSURE,
            title: row.title,
            description: row.description,
            place: null,
            allDay: row.allDay,
            startsAt,
            endsAt,
            audience: row.audience,
            jobRoleId: null,
            locationId: row.locationId,
            createdById: actor.id,
          },
          select: EVENT_SELECT,
        }),
      );
    }
    this.logger.log(`${created.length} closures copied into ${toYear} by ${actor.id}`);

    // One notification each, not one per holiday: a year's worth of "Office
    // closed" arriving at once would bury everything else under the bell.
    const perPerson = new Map<string, string[]>();
    for (const row of created) {
      for (const person of await this.invited(row)) {
        if (person === actor.id) continue;
        perPerson.set(person, [...(perPerson.get(person) ?? []), row.title]);
      }
    }
    const byList = new Map<string, string[]>();
    for (const [person, titles] of perPerson) {
      const key = titles.join('\n');
      byList.set(key, [...(byList.get(key) ?? []), person]);
    }
    for (const [key, people] of byList) {
      const titles = key.split('\n');
      await this.inbox.notify(people, {
        kind: NotificationKind.EVENT,
        title: `${toYear} holidays are on the schedule`,
        body: `${titles.length} closure${titles.length === 1 ? '' : 's'}: ${titles.join(', ')}`,
        link: `/schedule?week=${toYear}-01-01`,
      });
    }

    return { copied: created.length, skipped, toYear };
  }

  private async require(id: string): Promise<EventRow> {
    const row = await this.prisma.practiceEvent.findUnique({
      where: { id },
      select: EVENT_SELECT,
    });
    if (!row) throw new NotFoundException('That event no longer exists.');
    return row;
  }

  /// Everybody an event is for.
  private async invited(row: Pick<EventRow, 'audience' | 'jobRole' | 'location'>) {
    const people = await this.prisma.employee.findMany({
      where: audienceWhere(row),
      select: { id: true },
    });
    return people.map((person) => person.id);
  }

  /// The events somebody is invited to — the same people `invited` counts.
  private async visibleTo(employeeId: string): Promise<Prisma.PracticeEventWhereInput> {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        employmentStatus: true,
        jobRoles: { select: { jobRoleId: true } },
        locations: { select: { locationId: true } },
      },
    });
    if (!person || !WORKING.in.includes(person.employmentStatus)) {
      return { id: { in: [] } };
    }
    return {
      OR: [
        { audience: EventAudience.EVERYONE },
        {
          audience: EventAudience.JOB_ROLE,
          jobRoleId: { in: person.jobRoles.map((row) => row.jobRoleId) },
        },
        {
          audience: EventAudience.LOCATION,
          locationId: { in: person.locations.map((row) => row.locationId) },
        },
      ],
    };
  }

  private async checkInput(dto: EventInput) {
    const kind = dto.kind ?? PracticeEventKind.EVENT;
    const closure = kind === PracticeEventKind.CLOSURE;
    const title = dto.title.trim();
    if (title.length < 2) {
      throw new BadRequestException(
        closure ? 'Name the holiday or closure.' : 'Give the event a name.',
      );
    }
    if (closure && dto.audience === EventAudience.JOB_ROLE) {
      throw new BadRequestException('A closure is for both offices or one office, not a job role.');
    }

    let startsAt: Date;
    let endsAt: Date;
    if (dto.allDay) {
      if (!dto.startDate || !dto.endDate) {
        throw new BadRequestException('Choose the day it is on.');
      }
      if (dto.endDate < dto.startDate) {
        throw new BadRequestException('The last day cannot be before the first.');
      }
      ({ startsAt, endsAt } = allDayRange(dto.startDate, dto.endDate));
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        throw new BadRequestException('That is not a real date.');
      }
      if (endsAt.getTime() - startsAt.getTime() > (MAX_ALL_DAY_DAYS + 1) * 86_400_000) {
        throw new BadRequestException(`An event can run for at most ${MAX_ALL_DAY_DAYS} days.`);
      }
    } else {
      if (!dto.startsAt || !dto.endsAt) {
        throw new BadRequestException('Choose when it starts and ends.');
      }
      startsAt = new Date(dto.startsAt);
      endsAt = new Date(dto.endsAt);
      if (endsAt <= startsAt) {
        throw new BadRequestException('The event must end after it starts.');
      }
      if (endsAt.getTime() - startsAt.getTime() > MAX_TIMED_DAYS * 86_400_000) {
        throw new BadRequestException(
          `A timed event can last at most ${MAX_TIMED_DAYS} days — tick "All day" for longer.`,
        );
      }
    }

    if (dto.audience === EventAudience.JOB_ROLE) {
      if (!dto.jobRoleId) throw new BadRequestException('Choose which job role it is for.');
      const exists = await this.prisma.jobRole.count({ where: { id: dto.jobRoleId } });
      if (!exists) throw new BadRequestException('That job role no longer exists.');
    }
    if (dto.audience === EventAudience.LOCATION) {
      if (!dto.locationId) {
        throw new BadRequestException(
          closure ? 'Choose which office is closed.' : 'Choose which location it is for.',
        );
      }
      const exists = await this.prisma.location.count({ where: { id: dto.locationId } });
      if (!exists) throw new BadRequestException('That location no longer exists.');
    }

    return {
      kind,
      title,
      description: dto.description?.trim() || null,
      // A closure is where the office is: it has no other place.
      place: closure ? null : dto.place?.trim() || null,
      allDay: dto.allDay,
      startsAt,
      endsAt,
      audience: dto.audience,
      jobRoleId: dto.audience === EventAudience.JOB_ROLE ? dto.jobRoleId! : null,
      locationId: dto.audience === EventAudience.LOCATION ? dto.locationId! : null,
    };
  }
}

/// Who an event is for, as an employee filter.
export function audienceWhere(
  row: Pick<EventRow, 'audience' | 'jobRole' | 'location'>,
): Prisma.EmployeeWhereInput {
  if (row.audience === EventAudience.JOB_ROLE) {
    // A deleted role leaves nobody invited, rather than everybody.
    return { employmentStatus: WORKING, jobRoles: { some: { jobRoleId: row.jobRole?.id ?? '' } } };
  }
  if (row.audience === EventAudience.LOCATION) {
    return {
      employmentStatus: WORKING,
      locations: { some: { locationId: row.location?.id ?? '' } },
    };
  }
  return { employmentStatus: WORKING };
}

/// Whether a closure shuts the office a shift is at.
export function closureCovers(
  closure: { audience: EventAudience; locationId: string | null },
  locationId: string,
): boolean {
  return closure.audience === EventAudience.EVERYONE || closure.locationId === locationId;
}

/// What the screens get. An all-day event also carries its days, worked out
/// here on the practice's clock so no browser has to.
function present(row: EventRow) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    place: row.place,
    allDay: row.allDay,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    audience: row.audience,
    jobRole: row.jobRole,
    location: row.location,
    ...(row.allDay ? allDayDates(row) : { startDate: null, endDate: null }),
  };
}

function whenAndWhere(row: EventRow): string {
  if (row.kind === PracticeEventKind.CLOSURE) {
    const where =
      row.audience === EventAudience.LOCATION
        ? (row.location?.name ?? 'One office')
        : 'Both offices';
    return `${describeWhen(row)} · ${where}`;
  }
  return [describeWhen(row), row.place].filter(Boolean).join(' · ');
}

/// What goes under the bell, in the words that fit an event or a closure.
function notice(
  row: EventRow,
  what: 'added' | 'changed' | 'dropped' | 'cancelled',
): { kind: NotificationKind; title: string; body: string; link: string } {
  const closed =
    row.audience === EventAudience.LOCATION ? `${row.location?.name ?? 'Office'} closed` : 'Closed';
  const titles =
    row.kind === PracticeEventKind.CLOSURE
      ? {
          added: `${closed}: ${row.title}`,
          changed: `Closure changed: ${row.title}`,
          // Your office is no longer the one shut, or it is not shut at all.
          dropped: `Open as usual: ${row.title}`,
          cancelled: `Open as usual: ${row.title}`,
        }
      : {
          added: `New event: ${row.title}`,
          changed: `Event changed: ${row.title}`,
          dropped: `No longer on your schedule: ${row.title}`,
          cancelled: `Cancelled: ${row.title}`,
        };
  return {
    kind: NotificationKind.EVENT,
    title: titles[what],
    body: whenAndWhere(row),
    link: scheduleLink(row),
  };
}

/// Whole days from one "YYYY-MM-DD" to another.
function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/// The schedule, open on the week the event is in.
function scheduleLink(row: EventRow): string {
  return `/schedule?week=${localDateIn(row.startsAt, PRACTICE_ZONE)}`;
}
