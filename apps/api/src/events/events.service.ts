import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, EventAudience, NotificationKind, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
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
 * Events: office meetings, provider meetings, a wellness day.
 *
 * On the schedule and on people's phones, and nowhere near the hours. An event
 * is not a shift — it adds nothing to scheduled hours, overtime or payroll
 * (decided with Dominguez, September 2026). Somebody paid to be there clocks
 * in as usual.
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
        {
          kind: NotificationKind.EVENT,
          title: `New event: ${row.title}`,
          body: whenAndWhere(row),
          link: scheduleLink(row),
        },
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
      await this.inbox.notify(now.filter((p) => !wasIn.has(p)).filter(notMe), {
        kind: NotificationKind.EVENT,
        title: `New event: ${after.title}`,
        body: whenAndWhere(after),
        link: scheduleLink(after),
      });
      if (moved) {
        await this.inbox.notify(now.filter((p) => wasIn.has(p)).filter(notMe), {
          kind: NotificationKind.EVENT,
          title: `Event changed: ${after.title}`,
          body: whenAndWhere(after),
          link: scheduleLink(after),
        });
      }
      // No longer for them: it leaves their schedule, so say so.
      await this.inbox.notify(was.filter((p) => !nowIn.has(p)).filter(notMe), {
        kind: NotificationKind.EVENT,
        title: `No longer on your schedule: ${before.title}`,
        body: whenAndWhere(before),
        link: scheduleLink(before),
      });
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
      {
        kind: NotificationKind.EVENT,
        title: `Cancelled: ${row.title}`,
        body: whenAndWhere(row),
        link: scheduleLink(row),
      },
    );
    return { deleted: true };
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
    const title = dto.title.trim();
    if (title.length < 2) throw new BadRequestException('Give the event a name.');

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
      if (!dto.locationId) throw new BadRequestException('Choose which location it is for.');
      const exists = await this.prisma.location.count({ where: { id: dto.locationId } });
      if (!exists) throw new BadRequestException('That location no longer exists.');
    }

    return {
      title,
      description: dto.description?.trim() || null,
      place: dto.place?.trim() || null,
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

/// What the screens get. An all-day event also carries its days, worked out
/// here on the practice's clock so no browser has to.
function present(row: EventRow) {
  return {
    id: row.id,
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
  return [describeWhen(row), row.place].filter(Boolean).join(' · ');
}

/// The schedule, open on the week the event is in.
function scheduleLink(row: EventRow): string {
  return `/schedule?week=${localDateIn(row.startsAt, PRACTICE_ZONE)}`;
}
