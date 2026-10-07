import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  EmploymentStatus,
  EventAudience,
  NotificationKind,
  PracticeEventKind,
  Prisma,
  Role,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../common/auth/auth-user';
import {
  addDaysTo,
  localDateIn,
  localTimeIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { InboxService } from '../email/inbox.service';
import { GoogleMeetService } from './google-meet.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventInput } from './dto/event.dto';
import { allDayDates, allDayRange, describeWhen } from './event-time';
import { describeRule, occurrenceDates, RepeatRule, ruleProblem } from './recurrence';

/// Long enough for a conference; short enough that a typo in the year is caught.
const MAX_TIMED_DAYS = 7;
const MAX_ALL_DAY_DAYS = 31;
/// The schedule asks a week or a month (with its edges) at a time; the phone
/// calendar asks a year. Anything wider is a mistake, not a view.
const MAX_WINDOW_DAYS = 400;

const PERSON = { select: { id: true, firstName: true, lastName: true, preferredName: true } };

export const EVENT_SELECT = {
  id: true,
  kind: true,
  title: true,
  description: true,
  place: true,
  meetingUrl: true,
  allDay: true,
  startsAt: true,
  endsAt: true,
  audience: true,
  seriesId: true,
  updatedAt: true,
  jobRole: { select: { id: true, name: true, colour: true } },
  location: { select: { id: true, name: true } },
  atLocation: {
    select: { id: true, name: true, addressLine1: true, city: true, state: true },
  },
  invitees: {
    select: {
      employee: PERSON,
      jobRole: { select: { id: true, name: true, colour: true } },
      location: { select: { id: true, name: true } },
    },
  },
  series: {
    select: {
      id: true,
      frequency: true,
      interval: true,
      weekdays: true,
      monthlyMode: true,
      monthlyWeek: true,
      firstDate: true,
      untilDate: true,
    },
  },
} satisfies Prisma.PracticeEventSelect;

export type EventRow = Prisma.PracticeEventGetPayload<{ select: typeof EVENT_SELECT }>;

/// What decides who an event is for.
type AudienceOf = Pick<EventRow, 'audience' | 'jobRole' | 'location' | 'invitees'>;

/// The kinds that go on the bell. A holiday only names a day; nobody needs
/// telling about Election Day.
const NOTIFIED: PracticeEventKind[] = [
  PracticeEventKind.EVENT,
  PracticeEventKind.CLOSURE,
  PracticeEventKind.DIAGNOSTIC,
];
/// The kinds reminded about the day before. Not diagnostics: every weekend's
/// "Tomorrow: US + ECHO" to everybody would bury the bell.
const REMINDED: PracticeEventKind[] = [PracticeEventKind.EVENT, PracticeEventKind.CLOSURE];
/// The kinds a year is copied forward for, and can be entered years ahead.
const YEARLY: PracticeEventKind[] = [PracticeEventKind.CLOSURE, PracticeEventKind.HOLIDAY];

/// Who counts as staff for an event: the same people a survey asks.
const WORKING: { in: EmploymentStatus[] } = {
  in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE],
};

/// Checked input, ready to write.
interface Checked {
  data: {
    kind: PracticeEventKind;
    title: string;
    description: string | null;
    place: string | null;
    meetingUrl: string | null;
    allDay: boolean;
    startsAt: Date;
    endsAt: Date;
    audience: EventAudience;
    jobRoleId: string | null;
    locationId: string | null;
    atLocationId: string | null;
  };
  invitees: { employeeIds: string[]; jobRoleIds: string[]; locationIds: string[] };
  /// The rule and the date it counts from, when it repeats.
  repeat: { firstDate: string; rule: RepeatRule } | null;
}

export type Scope = 'one' | 'following';

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
 * An event can repeat — every 2 weeks on Friday, every week on Monday and
 * Friday, the first Friday of the month — and be for any mix of job roles,
 * offices and people. A series is written out one row per date, so one date
 * can be moved or removed on its own, or everything from one date on.
 *
 * Managers and admins see every event, so they can look after them; everybody
 * else sees the ones for them.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly meet: GoogleMeetService,
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
    const input = await this.checkInput(dto);
    const { first, last, count } = await this.prisma.$transaction((tx) =>
      this.write(tx, input, actor.id),
    );
    this.logger.log(
      `Event ${first.id} added by ${actor.id} (${count} date${count === 1 ? '' : 's'})`,
    );

    // A closure or holiday can also be entered for the next few years in one go.
    let yearsCreated = 0;
    if (dto.yearsAhead && YEARLY.includes(input.data.kind)) {
      yearsCreated = await this.repeatClosureYearly(first, dto.yearsAhead, actor);
    }

    // One notification for a whole series, not one per date.
    if (last.endsAt > new Date() && NOTIFIED.includes(first.kind)) {
      await this.inbox.notify(
        (await this.invited(first)).filter((id) => id !== actor.id),
        notice(first, 'added', input.repeat ? seriesBody(first, input.repeat) : undefined),
      );
    }
    return { ...present(first), created: count + yearsCreated };
  }

  /**
   * Changes one date, or — `following` — this date and every one after it in
   * its series. Adding a repeat to a one-off event makes it the first date of
   * a new series.
   */
  async update(id: string, dto: EventInput, actor: AuthUser, scope: Scope = 'one') {
    const before = await this.require(id);
    const input = await this.checkInput(dto);
    const following =
      (scope === 'following' && before.seriesId) || (!before.seriesId && input.repeat);

    if (!following) {
      const after = await this.prisma.$transaction(async (tx) => {
        await tx.practiceEvent.update({ where: { id }, data: input.data });
        await tx.practiceEventInvitee.deleteMany({ where: { eventId: id } });
        await tx.practiceEventInvitee.createMany({ data: inviteeRows([id], input) });
        return tx.practiceEvent.findUniqueOrThrow({ where: { id }, select: EVENT_SELECT });
      });
      this.logger.log(`Event ${id} changed by ${actor.id}`);
      await this.tellAboutChange(before, after, actor, undefined);
      return { ...present(after), created: 1 };
    }

    const { first, count } = await this.prisma.$transaction(async (tx) => {
      await this.cutFrom(tx, before);
      return this.write(tx, input, actor.id);
    });
    this.logger.log(
      `Event ${id} and after replaced by ${actor.id} (${count} date${count === 1 ? '' : 's'})`,
    );
    await this.tellAboutChange(
      before,
      first,
      actor,
      input.repeat ? seriesBody(first, input.repeat) : undefined,
    );
    return { ...present(first), created: count };
  }

  /// Removes one date, or — `following` — this date and every one after it.
  async remove(id: string, actor: AuthUser, scope: Scope = 'one') {
    const row = await this.require(id);
    const upcoming = row.endsAt > new Date();
    const invited = upcoming && NOTIFIED.includes(row.kind) ? await this.invited(row) : [];

    let removed = 1;
    if (scope === 'following' && row.seriesId) {
      removed = await this.prisma.$transaction((tx) => this.cutFrom(tx, row));
    } else {
      await this.prisma.practiceEvent.delete({ where: { id } });
    }
    this.logger.log(
      `Event ${id}${removed > 1 ? ` and ${removed - 1} after it` : ''} removed by ${actor.id}`,
    );

    await this.inbox.notify(
      invited.filter((person) => person !== actor.id),
      notice(
        row,
        'cancelled',
        removed > 1 ? `From ${describeWhen(row)} on — ${removed} dates.` : undefined,
      ),
    );
    return { deleted: removed };
  }

  /**
   * The day-before reminder, from the nightly job: everything starting
   * tomorrow on the practice's clock, to everybody it is for. Each is marked
   * as sent, so running the job twice never reminds twice.
   */
  async sendReminders(now = new Date()): Promise<number> {
    const tomorrow = addDaysTo(localDateIn(now, PRACTICE_ZONE), 1);
    const rows = await this.prisma.practiceEvent.findMany({
      where: {
        startsAt: {
          gte: zonedTimeToUtc(tomorrow, '00:00', PRACTICE_ZONE),
          lt: zonedTimeToUtc(addDaysTo(tomorrow, 1), '00:00', PRACTICE_ZONE),
        },
        reminderSentAt: null,
        kind: { in: REMINDED },
      },
      select: EVENT_SELECT,
      orderBy: { startsAt: 'asc' },
    });
    for (const row of rows) {
      await this.inbox.notify(await this.invited(row), notice(row, 'reminder'));
      await this.prisma.practiceEvent.update({
        where: { id: row.id },
        data: { reminderSentAt: now },
      });
    }
    if (rows.length > 0) this.logger.log(`Reminded about ${rows.length} event(s) tomorrow`);
    return rows.length;
  }

  /// The same closure or holiday on the same date in each of the next `years`
  /// years, as separate one-off entries (a moving holiday can then be fixed
  /// one year at a time). Returns how many were made.
  private async repeatClosureYearly(row: EventRow, years: number, actor: AuthUser) {
    const source = await this.prisma.practiceEvent.findUniqueOrThrow({
      where: { id: row.id },
      select: { ...EVENT_SELECT, jobRoleId: true, locationId: true },
    });
    const firstYear = Number(localDateIn(source.startsAt, PRACTICE_ZONE).slice(0, 4));
    let made = 0;
    for (let year = firstYear + 1; year <= firstYear + years; year += 1) {
      const moved = closureInYear(source, year);
      if (!moved) continue;
      await this.prisma.practiceEvent.create({
        data: {
          kind: source.kind,
          title: source.title,
          description: source.description,
          place: null,
          allDay: source.allDay,
          startsAt: moved.startsAt,
          endsAt: moved.endsAt,
          audience: source.audience,
          jobRoleId: null,
          locationId: source.locationId,
          createdById: actor.id,
        },
      });
      made += 1;
    }
    return made;
  }

  /**
   * "Copy last year's holidays": every closure and holiday that started in
   * `fromYear`, put on the same date the year after — same times, same
   * offices — for a manager to check. Holidays that move (Thanksgiving) land on the wrong
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
        kind: { in: YEARLY },
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
      const moved = closureInYear(row, toYear);
      if (!moved) {
        skipped.push(`${row.title} — 29 February has no date in ${toYear}`);
        continue;
      }
      const { startsAt, endsAt } = moved;

      const already = await this.prisma.practiceEvent.count({
        where: {
          kind: row.kind,
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
            kind: row.kind,
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
    // Holidays shut nothing, so only the closures are worth a notification.
    for (const row of created.filter((made) => made.kind === PracticeEventKind.CLOSURE)) {
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

  /**
   * Writes an event — one row, or one row per date of its series — with its
   * invitees. Ids are made here so the whole series goes in two statements
   * rather than one round trip per date.
   */
  private async write(tx: Prisma.TransactionClient, input: Checked, actorId: string) {
    const occurrences = input.repeat
      ? occurrencesOf(input.data, input.repeat.firstDate, input.repeat.rule)
      : [{ startsAt: input.data.startsAt, endsAt: input.data.endsAt }];
    if (occurrences.length === 0) {
      throw new BadRequestException(
        'Those repeat settings never land on a day before it stops. Check the days and the end date.',
      );
    }

    let seriesId: string | null = null;
    if (input.repeat) {
      const { rule, firstDate } = input.repeat;
      const series = await tx.practiceEventSeries.create({
        data: {
          frequency: rule.frequency,
          interval: rule.interval,
          weekdays: rule.frequency === 'WEEKLY' ? [...new Set(rule.weekdays)].sort() : [],
          monthlyMode: rule.frequency === 'MONTHLY' ? (rule.monthlyMode ?? null) : null,
          monthlyWeek:
            rule.frequency === 'MONTHLY' && rule.monthlyMode === 'WEEKDAY_OF_MONTH'
              ? (rule.monthlyWeek ?? null)
              : null,
          firstDate: new Date(`${firstDate}T00:00:00.000Z`),
          untilDate: new Date(`${rule.until}T00:00:00.000Z`),
        },
        select: { id: true },
      });
      seriesId = series.id;
    }

    const ids = occurrences.map(() => randomUUID());
    await tx.practiceEvent.createMany({
      data: occurrences.map((occurrence, index) => ({
        ...input.data,
        id: ids[index],
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        seriesId,
        createdById: actorId,
      })),
    });
    const invitees = inviteeRows(ids, input);
    if (invitees.length > 0) await tx.practiceEventInvitee.createMany({ data: invitees });

    const [first, last] = await Promise.all([
      tx.practiceEvent.findUniqueOrThrow({ where: { id: ids[0] }, select: EVENT_SELECT }),
      tx.practiceEvent.findUniqueOrThrow({
        where: { id: ids[ids.length - 1] },
        select: EVENT_SELECT,
      }),
    ]);
    return { first, last, count: ids.length };
  }

  /**
   * Takes a date and everything after it out of its series, and ends the
   * series the day before — or removes the series if nothing is left of it.
   * A one-off event is just removed. Returns how many dates went.
   */
  private async cutFrom(tx: Prisma.TransactionClient, row: EventRow): Promise<number> {
    if (!row.seriesId) {
      await tx.practiceEvent.delete({ where: { id: row.id } });
      return 1;
    }
    const { count } = await tx.practiceEvent.deleteMany({
      where: { seriesId: row.seriesId, startsAt: { gte: row.startsAt } },
    });
    const left = await tx.practiceEvent.count({ where: { seriesId: row.seriesId } });
    if (left === 0) {
      await tx.practiceEventSeries.delete({ where: { id: row.seriesId } });
    } else {
      const dayBefore = addDaysTo(localDateIn(row.startsAt, PRACTICE_ZONE), -1);
      await tx.practiceEventSeries.update({
        where: { id: row.seriesId },
        data: { untilDate: new Date(`${dayBefore}T00:00:00.000Z`) },
      });
    }
    return count;
  }

  /**
   * Who hears what about a change: newcomers that it is new, people still in
   * it that it changed (when anything they would plan around did), and people
   * dropped that it is off their schedule.
   */
  private async tellAboutChange(
    before: EventRow,
    after: EventRow,
    actor: AuthUser,
    body: string | undefined,
  ) {
    const moved =
      Boolean(body) ||
      before.title !== after.title ||
      before.place !== after.place ||
      before.meetingUrl !== after.meetingUrl ||
      before.atLocation?.id !== after.atLocation?.id ||
      before.allDay !== after.allDay ||
      before.startsAt.getTime() !== after.startsAt.getTime() ||
      before.endsAt.getTime() !== after.endsAt.getTime();
    const reaudienced = audienceKey(before) !== audienceKey(after);
    if (
      !(moved || reaudienced) ||
      !(before.endsAt > new Date() || after.endsAt > new Date()) ||
      !NOTIFIED.includes(after.kind)
    ) {
      return;
    }

    const [was, now] = await Promise.all([this.invited(before), this.invited(after)]);
    const wasIn = new Set(was);
    const nowIn = new Set(now);
    const notMe = (person: string) => person !== actor.id;

    await this.inbox.notify(
      now.filter((p) => !wasIn.has(p)).filter(notMe),
      notice(after, 'added', body),
    );
    if (moved) {
      await this.inbox.notify(
        now.filter((p) => wasIn.has(p)).filter(notMe),
        notice(after, 'changed', body),
      );
    }
    await this.inbox.notify(
      was.filter((p) => !nowIn.has(p)).filter(notMe),
      notice(before, 'dropped'),
    );
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
  private async invited(row: AudienceOf) {
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
    const roles = person.jobRoles.map((row) => row.jobRoleId);
    const offices = person.locations.map((row) => row.locationId);
    return {
      OR: [
        { audience: EventAudience.EVERYONE },
        { audience: EventAudience.JOB_ROLE, jobRoleId: { in: roles } },
        { audience: EventAudience.LOCATION, locationId: { in: offices } },
        {
          audience: EventAudience.CHOSEN,
          invitees: {
            some: {
              OR: [{ employeeId }, { jobRoleId: { in: roles } }, { locationId: { in: offices } }],
            },
          },
        },
      ],
    };
  }

  private async checkInput(dto: EventInput): Promise<Checked> {
    const kind = dto.kind ?? PracticeEventKind.EVENT;
    const closure = kind === PracticeEventKind.CLOSURE;
    const holiday = kind === PracticeEventKind.HOLIDAY;
    const diagnostic = kind === PracticeEventKind.DIAGNOSTIC;
    /// Holidays and diagnostics are for everyone (Dominguez, October 2026),
    /// so the audience is not theirs to choose.
    if (holiday || diagnostic) {
      dto = {
        ...dto,
        audience: EventAudience.EVERYONE,
        jobRoleId: undefined,
        locationId: undefined,
      };
    }
    const title = dto.title.trim();
    if (title.length < 2) {
      throw new BadRequestException(
        closure
          ? 'Name the holiday or closure.'
          : holiday
            ? 'Name the holiday.'
            : diagnostic
              ? 'Say which tests — "US + ECHO", "ANS + VNG".'
              : 'Give the event a name.',
      );
    }
    if (holiday && !dto.allDay) {
      throw new BadRequestException('A holiday is a whole day — tick "All day".');
    }
    if (holiday && dto.repeat) {
      throw new BadRequestException(
        'A holiday does not repeat within the year — use "Repeat every year" instead.',
      );
    }
    let atLocationId: string | null = null;
    if (diagnostic) {
      if (!dto.atLocationId) throw new BadRequestException('Choose which office it is at.');
      const exists = await this.prisma.location.count({ where: { id: dto.atLocationId } });
      if (!exists) throw new BadRequestException('That office no longer exists.');
      atLocationId = dto.atLocationId;
    }
    if (
      closure &&
      (dto.audience === EventAudience.JOB_ROLE || dto.audience === EventAudience.CHOSEN)
    ) {
      throw new BadRequestException(
        'A closure is for both offices or one office — not a job role or a list of people.',
      );
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
        throw new BadRequestException(
          closure ? 'The closure must end after it starts.' : 'The event must end after it starts.',
        );
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

    const invitees = {
      employeeIds: [...new Set(dto.invitees?.employeeIds ?? [])],
      jobRoleIds: [...new Set(dto.invitees?.jobRoleIds ?? [])],
      locationIds: [...new Set(dto.invitees?.locationIds ?? [])],
    };
    if (dto.audience === EventAudience.CHOSEN) {
      const total =
        invitees.employeeIds.length + invitees.jobRoleIds.length + invitees.locationIds.length;
      if (total === 0) throw new BadRequestException('Add who it is for.');
      const [people, roles, offices] = await Promise.all([
        this.prisma.employee.count({ where: { id: { in: invitees.employeeIds } } }),
        this.prisma.jobRole.count({ where: { id: { in: invitees.jobRoleIds } } }),
        this.prisma.location.count({ where: { id: { in: invitees.locationIds } } }),
      ]);
      if (
        people !== invitees.employeeIds.length ||
        roles !== invitees.jobRoleIds.length ||
        offices !== invitees.locationIds.length
      ) {
        throw new BadRequestException('Somebody or something on the list no longer exists.');
      }
    }

    const pastedUrl = checkMeetingUrl(dto.meetingUrl);

    let repeat: Checked['repeat'] = null;
    if (dto.repeat) {
      const firstDate = dto.allDay ? dto.startDate! : localDateIn(startsAt, PRACTICE_ZONE);
      const rule: RepeatRule = {
        frequency: dto.repeat.frequency,
        interval: dto.repeat.interval,
        weekdays: dto.repeat.weekdays,
        monthlyMode: dto.repeat.monthlyMode,
        monthlyWeek: dto.repeat.monthlyWeek,
        until: dto.repeat.until,
      };
      const problem = ruleProblem(firstDate, rule);
      if (problem) throw new BadRequestException(problem);
      repeat = { firstDate, rule };
    }

    // Asked for last, once everything else is known to be fine, so a refused
    // form never leaves an unused meeting behind at Google.
    const noCall = closure || holiday || diagnostic;
    const meetingUrl = noCall
      ? null
      : dto.createMeetLink
        ? await this.meet.createLink()
        : pastedUrl;

    return {
      data: {
        kind,
        title,
        description: dto.description?.trim() || null,
        // A closure is where the office is: it has no other place, and no
        // call. A diagnostics date is at its office; a holiday is nowhere.
        place: noCall ? null : dto.place?.trim() || null,
        meetingUrl,
        allDay: dto.allDay,
        startsAt,
        endsAt,
        audience: dto.audience,
        jobRoleId: dto.audience === EventAudience.JOB_ROLE ? dto.jobRoleId! : null,
        locationId: dto.audience === EventAudience.LOCATION ? dto.locationId! : null,
        atLocationId,
      },
      invitees:
        dto.audience === EventAudience.CHOSEN
          ? invitees
          : { employeeIds: [], jobRoleIds: [], locationIds: [] },
      repeat,
    };
  }
}

/**
 * A pasted video call link, or null. Only a real https address is kept: the
 * app shows it as a button and puts it on people's phones, so anything else —
 * a javascript: address above all — must never get that far. A database check
 * says the same.
 */
function checkMeetingUrl(value: string | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new BadRequestException(
      'That video call link is not a web address. Paste the whole link, starting https://',
    );
  }
  if (url.protocol !== 'https:' || /\s/.test(text)) {
    throw new BadRequestException('A video call link has to start with https://');
  }
  return url.toString();
}

/// Who an event is for, as an employee filter.
export function audienceWhere(row: AudienceOf): Prisma.EmployeeWhereInput {
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
  if (row.audience === EventAudience.CHOSEN) {
    const people = row.invitees.flatMap((i) => (i.employee ? [i.employee.id] : []));
    const roles = row.invitees.flatMap((i) => (i.jobRole ? [i.jobRole.id] : []));
    const offices = row.invitees.flatMap((i) => (i.location ? [i.location.id] : []));
    const any: Prisma.EmployeeWhereInput[] = [];
    if (people.length) any.push({ id: { in: people } });
    if (roles.length) any.push({ jobRoles: { some: { jobRoleId: { in: roles } } } });
    if (offices.length) any.push({ locations: { some: { locationId: { in: offices } } } });
    // Everything on the list since removed leaves nobody, not everybody.
    return { employmentStatus: WORKING, OR: any.length > 0 ? any : [{ id: { in: [] } }] };
  }
  return { employmentStatus: WORKING };
}

/// The dates of a series as instants: each at the same wall-clock times on
/// the practice's clock, whatever the clocks are doing that week.
function occurrencesOf(
  data: Checked['data'],
  firstDate: string,
  rule: RepeatRule,
): { startsAt: Date; endsAt: Date }[] {
  const dates = occurrenceDates(firstDate, rule);
  if (data.allDay) {
    const { startDate, endDate } = allDayDates(data);
    const span = daysBetween(startDate, endDate);
    return dates.map((date) => allDayRange(date, addDaysTo(date, span)));
  }
  const startTime = localTimeIn(data.startsAt, PRACTICE_ZONE);
  const endTime = localTimeIn(data.endsAt, PRACTICE_ZONE);
  const endOffset = daysBetween(
    localDateIn(data.startsAt, PRACTICE_ZONE),
    localDateIn(data.endsAt, PRACTICE_ZONE),
  );
  return dates.map((date) => ({
    startsAt: zonedTimeToUtc(date, startTime, PRACTICE_ZONE),
    endsAt: zonedTimeToUtc(addDaysTo(date, endOffset), endTime, PRACTICE_ZONE),
  }));
}

function inviteeRows(eventIds: string[], input: Checked) {
  return eventIds.flatMap((eventId) => [
    ...input.invitees.employeeIds.map((employeeId) => ({ eventId, employeeId })),
    ...input.invitees.jobRoleIds.map((jobRoleId) => ({ eventId, jobRoleId })),
    ...input.invitees.locationIds.map((locationId) => ({ eventId, locationId })),
  ]);
}

/// A comparable description of who an event is for.
function audienceKey(row: AudienceOf): string {
  return [
    row.audience,
    row.jobRole?.id ?? '',
    row.location?.id ?? '',
    ...row.invitees.map((i) => i.employee?.id ?? i.jobRole?.id ?? i.location?.id ?? '').sort(),
  ].join('|');
}

/// "Every 2 weeks on Fri until Dec 31, 2026 · 9:00 AM–10:00 AM, from Fri, Oct 2."
function seriesBody(first: EventRow, repeat: NonNullable<Checked['repeat']>): string {
  return `${describeRule(repeat.firstDate, repeat.rule)}. First: ${describeWhen(first)}${
    first.place ? ` · ${first.place}` : ''
  }.`;
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
    meetingUrl: row.meetingUrl,
    allDay: row.allDay,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    audience: row.audience,
    jobRole: row.jobRole,
    location: row.location,
    atLocation: row.atLocation ? { id: row.atLocation.id, name: row.atLocation.name } : null,
    invitees: row.invitees.map((invitee) =>
      invitee.employee
        ? {
            type: 'EMPLOYEE' as const,
            id: invitee.employee.id,
            name: `${invitee.employee.preferredName ?? invitee.employee.firstName} ${invitee.employee.lastName}`,
            colour: null,
          }
        : invitee.jobRole
          ? { type: 'JOB_ROLE' as const, ...invitee.jobRole }
          : { type: 'LOCATION' as const, ...invitee.location!, colour: null },
    ),
    series: row.series
      ? {
          id: row.series.id,
          frequency: row.series.frequency,
          interval: row.series.interval,
          weekdays: row.series.weekdays,
          monthlyMode: row.series.monthlyMode,
          monthlyWeek: row.series.monthlyWeek,
          firstDate: row.series.firstDate.toISOString().slice(0, 10),
          until: row.series.untilDate.toISOString().slice(0, 10),
          summary: describeRule(row.series.firstDate.toISOString().slice(0, 10), {
            frequency: row.series.frequency,
            interval: row.series.interval,
            weekdays: row.series.weekdays,
            monthlyMode: row.series.monthlyMode ?? undefined,
            monthlyWeek: row.series.monthlyWeek ?? undefined,
            until: row.series.untilDate.toISOString().slice(0, 10),
          }),
        }
      : null,
    ...(row.allDay ? allDayDates(row) : { startDate: null, endDate: null }),
  };
}

function whenAndWhere(row: EventRow): string {
  if (row.kind === PracticeEventKind.DIAGNOSTIC) {
    return [describeWhen(row), row.atLocation?.name].filter(Boolean).join(' · ');
  }
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
  what: 'added' | 'changed' | 'dropped' | 'cancelled' | 'reminder',
  body?: string,
): { kind: NotificationKind; title: string; body: string; link: string } {
  const closed =
    row.audience === EventAudience.LOCATION ? `${row.location?.name ?? 'Office'} closed` : 'Closed';
  const titles =
    row.kind === PracticeEventKind.DIAGNOSTIC
      ? {
          added: `Diagnostics: ${row.title}`,
          changed: `Diagnostics changed: ${row.title}`,
          dropped: `No longer on your schedule: ${row.title}`,
          cancelled: `Diagnostics cancelled: ${row.title}`,
          reminder: `Tomorrow: ${row.title}`,
        }
      : row.kind === PracticeEventKind.CLOSURE
        ? {
            added: `${closed}: ${row.title}`,
            changed: `Closure changed: ${row.title}`,
            // Your office is no longer the one shut, or it is not shut at all.
            dropped: `Open as usual: ${row.title}`,
            cancelled: `Open as usual: ${row.title}`,
            reminder: `Tomorrow — ${closed.toLowerCase()}: ${row.title}`,
          }
        : {
            added: `New event: ${row.title}`,
            changed: `Event changed: ${row.title}`,
            dropped: `No longer on your schedule: ${row.title}`,
            cancelled: `Cancelled: ${row.title}`,
            reminder: `Tomorrow: ${row.title}`,
          };
  return {
    kind: NotificationKind.EVENT,
    title: titles[what],
    body: body ?? whenAndWhere(row),
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

/// A closure's start and end moved to the same date in `year` (same wall-clock
/// times, whatever the clocks are doing), or null for a 29 February.
function closureInYear(row: EventRow, year: number): { startsAt: Date; endsAt: Date } | null {
  const firstDay = localDateIn(row.startsAt, PRACTICE_ZONE);
  if (firstDay.slice(5) === '02-29') return null;
  const nextFirst = `${year}${firstDay.slice(4)}`;
  if (row.allDay) {
    const { startDate, endDate } = allDayDates(row);
    return allDayRange(nextFirst, addDaysTo(nextFirst, daysBetween(startDate, endDate)));
  }
  const lastDay = localDateIn(row.endsAt, PRACTICE_ZONE);
  return {
    startsAt: zonedTimeToUtc(nextFirst, localTimeIn(row.startsAt, PRACTICE_ZONE), PRACTICE_ZONE),
    endsAt: zonedTimeToUtc(
      addDaysTo(nextFirst, daysBetween(firstDay, lastDay)),
      localTimeIn(row.endsAt, PRACTICE_ZONE),
      PRACTICE_ZONE,
    ),
  };
}
