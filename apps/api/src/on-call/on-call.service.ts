import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, OnCallSwapStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import {
  addDaysTo,
  datesBetween,
  localDateIn,
  localTimeIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { OnCallDayInput, OnCallRotaInput, OnCallSwapInput } from './dto/on-call.dto';
import { clockWords, onCallOn, RotaRule, turnDateAt } from './on-call';

/// The most a screen asks for at once.
const MAX_DAYS = 93;

const WORKING = [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE];

const PERSON = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  postNominals: true,
  photoUpdatedAt: true,
} satisfies Prisma.EmployeeSelect;

type Person = Prisma.EmployeeGetPayload<{ select: typeof PERSON }>;

/// Who can be on call: anybody in a job role that carries the clinical forms
/// (Provider), as for provider productivity.
const PROVIDER: Prisma.EmployeeWhereInput = {
  employmentStatus: { in: WORKING },
  jobRoles: { some: { jobRole: { usesClinicalForms: true } } },
};

/**
 * The provider on-call schedule (October 2026, Dominguez). The rules for who
 * is on call are in `on-call.ts`; this reads and writes them, and handles
 * swaps between providers. Providers, managers and admins see it; managers
 * and admins change the pattern and single days; a provider asks another to
 * swap, and it takes effect when they say yes. Never hours or pay.
 */
@Injectable()
export class OnCallService {
  private readonly logger = new Logger(OnCallService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- reading

  /// Day by day, from one date to another, with who is on call now.
  async schedule(actor: AuthUser, from: string, to: string, now = new Date()) {
    await this.assertCanSee(actor);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '') ||
      to < from
    ) {
      throw new BadRequestException(
        'Give the days as from and to, the first no later than the last.',
      );
    }
    if (addDaysTo(from, MAX_DAYS) < to)
      throw new BadRequestException(`At most ${MAX_DAYS} days at a time.`);

    const today = localDateIn(now, PRACTICE_ZONE);
    const { rotas, changed } = await this.rules(
      from < today ? addDaysTo(from, -1) : addDaysTo(today, -1),
      to > today ? to : today,
    );
    const nowDate = turnDateAt(today, localTimeIn(now, PRACTICE_ZONE), rotas);
    const dates = datesBetween(from, to);
    const views = dates.map((date) => onCallOn(date, rotas, changed.map));
    const current = onCallOn(nowDate, rotas, changed.map);
    const people = await this.people([...views.map((day) => day.employeeId), current.employeeId]);

    return {
      days: views.map((day) => ({
        ...day,
        employee: day.employeeId ? (people.get(day.employeeId) ?? null) : null,
        note: changed.notes.get(day.date) ?? null,
      })),
      now: {
        date: nowDate,
        employee: current.employeeId ? (people.get(current.employeeId) ?? null) : null,
        until: zonedTimeToUtc(addDaysTo(nowDate, 1), current.changesAt, PRACTICE_ZONE),
      },
      providers: await this.providers(),
    };
  }

  /// The patterns: the one in force now and any starting later.
  async rotas(actor: AuthUser, now = new Date()) {
    await this.assertCanSee(actor);
    const today = localDateIn(now, PRACTICE_ZONE);
    const all = await this.prisma.onCallRota.findMany({
      orderBy: { startsOn: 'asc' },
      select: {
        startsOn: true,
        changesAt: true,
        entries: {
          select: { weekday: true, weekOfMonth: true, employee: { select: PERSON } },
          orderBy: [{ weekday: 'asc' }, { weekOfMonth: 'asc' }],
        },
      },
    });
    const inForce = [...all].reverse().find((rota) => isoDate(rota.startsOn) <= today);
    return all
      .filter((rota) => rota === inForce || isoDate(rota.startsOn) > today)
      .map((rota) => ({
        startsOn: isoDate(rota.startsOn),
        changesAt: rota.changesAt,
        inForce: rota === inForce,
        entries: rota.entries.map((entry) => ({
          weekday: entry.weekday,
          weekOfMonth: entry.weekOfMonth,
          employee: named(entry.employee),
        })),
      }));
  }

  /// A provider's own turns, as instants, for their calendar feed.
  async turnsFor(employeeId: string, from: Date, to: Date) {
    const first = addDaysTo(localDateIn(from, PRACTICE_ZONE), -1);
    const last = localDateIn(to, PRACTICE_ZONE);
    const { rotas, changed } = await this.rules(first, last);
    return datesBetween(first, last)
      .map((date) => onCallOn(date, rotas, changed.map))
      .filter((day) => day.employeeId === employeeId)
      .map((day) => ({
        date: day.date,
        startsAt: zonedTimeToUtc(day.date, day.changesAt, PRACTICE_ZONE),
        endsAt: zonedTimeToUtc(addDaysTo(day.date, 1), day.changesAt, PRACTICE_ZONE),
      }));
  }

  // ---------------------------------------------------------- the managers

  /// A new usual pattern from a day on (or a change to one not yet started,
  /// or to today's). Never in the past: who was on call stays as it was.
  async saveRota(dto: OnCallRotaInput, actor: AuthUser, now = new Date()) {
    const today = localDateIn(now, PRACTICE_ZONE);
    if (dto.startsOn < today) {
      throw new BadRequestException(
        'Start it today or later — who was on call before stays as it was.',
      );
    }
    const keys = new Set<string>();
    for (const entry of dto.entries) {
      const key = `${entry.weekday}|${entry.weekOfMonth}`;
      if (keys.has(key)) {
        throw new BadRequestException(
          'Each day can have one provider, and one for each week of the month.',
        );
      }
      keys.add(key);
    }
    await this.assertProviders(dto.entries.map((entry) => entry.employeeId));

    const startsOn = toUtcDate(dto.startsOn);
    await this.prisma.$transaction(async (tx) => {
      await tx.onCallRota.deleteMany({ where: { startsOn } });
      await tx.onCallRota.create({
        data: {
          startsOn,
          changesAt: dto.changesAt,
          createdById: actor.id,
          entries: { create: dto.entries },
        },
      });
    });

    const providers = await this.prisma.employee.findMany({
      where: PROVIDER,
      select: { id: true },
    });
    await this.notifications.onCall(
      providers.map((person) => person.id).filter((id) => id !== actor.id),
      {
        title: `The on-call schedule changes from ${dayWords(dto.startsOn)}`,
        body: `A manager saved a new usual pattern, handing over at ${clockWords(dto.changesAt)}. Check your days on the on-call schedule.`,
      },
      { email: false },
    );
    this.logger.log(`On-call pattern from ${dto.startsOn} saved by ${actor.id}`);
    return this.rotas(actor, now);
  }

  /// Take back a pattern that has not started yet.
  async removeRota(startsOn: string, actor: AuthUser, now = new Date()) {
    if (startsOn <= localDateIn(now, PRACTICE_ZONE)) {
      throw new BadRequestException(
        'A pattern already in force cannot be taken back; save a new one instead.',
      );
    }
    const removed = await this.prisma.onCallRota.deleteMany({
      where: { startsOn: toUtcDate(startsOn) },
    });
    if (removed.count === 0) throw new NotFoundException('There is no pattern starting that day.');
    this.logger.log(`On-call pattern from ${startsOn} removed by ${actor.id}`);
    return this.rotas(actor, now);
  }

  /// One day: somebody else on call, or back to the usual.
  async setDay(date: string, dto: OnCallDayInput, actor: AuthUser, now = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Give the day as a date.');
    const today = localDateIn(now, PRACTICE_ZONE);
    if (date < addDaysTo(today, -1)) {
      throw new BadRequestException('Days already past stay as they were.');
    }
    const { rotas, changed } = await this.rules(date, date);
    const before = onCallOn(date, rotas, changed.map).employeeId;

    if (dto.employeeId) {
      await this.assertProviders([dto.employeeId]);
      await this.prisma.onCallDay.upsert({
        where: { date: toUtcDate(date) },
        create: {
          date: toUtcDate(date),
          employeeId: dto.employeeId,
          note: dto.note?.trim() || null,
          setById: actor.id,
        },
        update: {
          employeeId: dto.employeeId,
          note: dto.note?.trim() || null,
          setById: actor.id,
          swapId: null,
        },
      });
    } else {
      await this.prisma.onCallDay.deleteMany({ where: { date: toUtcDate(date) } });
    }

    // Put back to the usual: whoever the pattern has.
    const after = dto.employeeId ?? onCallOn(date, rotas, new Map()).employeeId;
    if (before !== after) {
      const names = await this.people([before, after]);
      const name = (id: string | null) => (id ? (names.get(id)?.name ?? 'somebody') : 'nobody');
      await this.notifications.onCall(
        [before, after].filter((id): id is string => !!id && id !== actor.id),
        {
          title: `On call ${dayWords(date)}: now ${name(after)}`,
          body: `A manager changed who is on call ${dayWords(date)} — it was ${name(before)}.${dto.note?.trim() ? ` “${dto.note.trim()}”` : ''}`,
        },
        { email: true },
      );
    }
    this.logger.log(`On call ${date} set to ${after ?? 'nobody'} by ${actor.id}`);
    return { date, employeeId: after };
  }

  // ------------------------------------------------------------------ swaps

  async swaps(actor: AuthUser) {
    await this.assertCanSee(actor);
    const manager = actor.role === Role.MANAGER || actor.role === Role.ADMIN;
    const rows = await this.prisma.onCallSwap.findMany({
      where: manager
        ? {
            OR: [
              { status: OnCallSwapStatus.PENDING },
              { requesterId: actor.id },
              { partnerId: actor.id },
            ],
          }
        : { OR: [{ requesterId: actor.id }, { partnerId: actor.id }] },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        giveDate: true,
        takeDate: true,
        note: true,
        status: true,
        createdAt: true,
        answeredAt: true,
        requester: { select: PERSON },
        partner: { select: PERSON },
      },
    });
    return rows.map((row) => ({
      ...row,
      giveDate: isoDate(row.giveDate),
      takeDate: row.takeDate ? isoDate(row.takeDate) : null,
      requester: named(row.requester),
      partner: named(row.partner),
    }));
  }

  async askSwap(dto: OnCallSwapInput, actor: AuthUser, now = new Date()) {
    await this.assertProviders(
      [actor.id],
      'Only providers on the on-call schedule can ask to swap.',
    );
    if (dto.partnerId === actor.id) throw new BadRequestException('Choose another provider.');
    await this.assertProviders([dto.partnerId]);
    const today = localDateIn(now, PRACTICE_ZONE);
    const takeDate = dto.takeDate || null;
    for (const date of [dto.giveDate, takeDate]) {
      if (date && date < today) throw new BadRequestException('Choose days still to come.');
    }
    const span = [dto.giveDate, takeDate ?? dto.giveDate].sort();
    const { rotas, changed } = await this.rules(span[0], span[1]);
    if (onCallOn(dto.giveDate, rotas, changed.map).employeeId !== actor.id) {
      throw new BadRequestException(`You are not on call ${dayWords(dto.giveDate)}.`);
    }
    if (takeDate && onCallOn(takeDate, rotas, changed.map).employeeId !== dto.partnerId) {
      throw new BadRequestException(`They are not on call ${dayWords(takeDate)}.`);
    }
    const swap = await this.prisma.onCallSwap.create({
      data: {
        requesterId: actor.id,
        partnerId: dto.partnerId,
        giveDate: toUtcDate(dto.giveDate),
        takeDate: takeDate ? toUtcDate(takeDate) : null,
        note: dto.note?.trim() || null,
      },
      select: { id: true },
    });
    const names = await this.people([actor.id]);
    const me = names.get(actor.id)?.name ?? 'A provider';
    await this.notifications.onCall(
      [dto.partnerId],
      {
        title: `${me} asks you to take on call ${dayWords(dto.giveDate)}`,
        body: `${takeDate ? `In return, they would take yours ${dayWords(takeDate)}. ` : ''}${
          dto.note?.trim() ? `“${dto.note.trim()}” ` : ''
        }Say yes or no on the on-call schedule.`,
      },
      { email: true },
    );
    this.logger.log(`On-call swap ${swap.id} asked by ${actor.id}`);
    return swap;
  }

  /// "Yes": the days change hands, if both are still as they were.
  async answerSwap(id: string, accept: boolean, actor: AuthUser, now = new Date()) {
    const swap = await this.requireSwap(id);
    if (swap.partnerId !== actor.id)
      throw new ForbiddenException('Only the provider asked can answer.');
    if (swap.status !== OnCallSwapStatus.PENDING)
      throw new ConflictException('That has already been answered.');
    const giveDate = isoDate(swap.giveDate);
    const takeDate = swap.takeDate ? isoDate(swap.takeDate) : null;

    if (accept) {
      const today = localDateIn(now, PRACTICE_ZONE);
      if (giveDate < today || (takeDate && takeDate < today)) {
        throw new BadRequestException('That day has already gone.');
      }
      const span = [giveDate, takeDate ?? giveDate].sort();
      const { rotas, changed } = await this.rules(span[0], span[1]);
      if (
        onCallOn(giveDate, rotas, changed.map).employeeId !== swap.requesterId ||
        (takeDate && onCallOn(takeDate, rotas, changed.map).employeeId !== swap.partnerId)
      ) {
        throw new ConflictException(
          'The schedule has changed since this was asked, so it cannot go ahead.',
        );
      }
    }

    const done = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.onCallSwap.updateMany({
        where: { id, status: OnCallSwapStatus.PENDING },
        data: {
          status: accept ? OnCallSwapStatus.ACCEPTED : OnCallSwapStatus.DECLINED,
          answeredAt: now,
        },
      });
      if (claimed.count === 0) return false;
      if (accept) {
        const days: [string, string][] = [[giveDate, swap.partnerId]];
        if (takeDate) days.push([takeDate, swap.requesterId]);
        for (const [date, employeeId] of days) {
          await tx.onCallDay.upsert({
            where: { date: toUtcDate(date) },
            create: { date: toUtcDate(date), employeeId, swapId: id, setById: actor.id },
            update: { employeeId, swapId: id, setById: actor.id, note: null },
          });
        }
      }
      return true;
    });
    if (!done) throw new ConflictException('That has already been answered.');

    const names = await this.people([swap.requesterId, swap.partnerId]);
    const them = names.get(swap.partnerId)?.name ?? 'They';
    const what = `${dayWords(giveDate)}${takeDate ? `, and you take theirs ${dayWords(takeDate)}` : ''}`;
    await this.notifications.onCall(
      [swap.requesterId],
      accept
        ? {
            title: `${them} will take your on call ${dayWords(giveDate)}`,
            body: `Swapped: ${them} is on call ${what}.`,
          }
        : {
            title: `${them} can’t take your on call ${dayWords(giveDate)}`,
            body: 'Ask somebody else, or a manager, on the on-call schedule.',
          },
      { email: true },
    );
    if (accept) {
      const managers = await this.prisma.employee.findMany({
        where: { role: { in: [Role.MANAGER, Role.ADMIN] }, employmentStatus: { in: WORKING } },
        select: { id: true },
      });
      const requester = names.get(swap.requesterId)?.name ?? 'A provider';
      await this.notifications.onCall(
        managers.map((m) => m.id).filter((m) => m !== swap.requesterId && m !== swap.partnerId),
        {
          title: `On call swapped: ${them} for ${requester} ${dayWords(giveDate)}`,
          body: takeDate ? `And ${requester} takes ${dayWords(takeDate)}.` : 'Nothing given back.',
        },
        { email: false },
      );
    }
    this.logger.log(`On-call swap ${id} ${accept ? 'accepted' : 'declined'}`);
    return { status: accept ? OnCallSwapStatus.ACCEPTED : OnCallSwapStatus.DECLINED };
  }

  async cancelSwap(id: string, actor: AuthUser) {
    const swap = await this.requireSwap(id);
    if (swap.requesterId !== actor.id)
      throw new ForbiddenException('Only the provider who asked can take it back.');
    const cancelled = await this.prisma.onCallSwap.updateMany({
      where: { id, status: OnCallSwapStatus.PENDING },
      data: { status: OnCallSwapStatus.CANCELLED, answeredAt: new Date() },
    });
    if (cancelled.count === 0) throw new ConflictException('That has already been answered.');
    const names = await this.people([actor.id]);
    await this.notifications.onCall(
      [swap.partnerId],
      {
        title: `${names.get(actor.id)?.name ?? 'A provider'} no longer needs you to take ${dayWords(isoDate(swap.giveDate))}`,
        body: 'They took back their request to swap on call.',
      },
      { email: false },
    );
    return { status: OnCallSwapStatus.CANCELLED };
  }

  // ---------------------------------------------------------------- helpers

  /// Providers, managers and admins.
  async canSee(actor: AuthUser): Promise<boolean> {
    if (actor.role === Role.MANAGER || actor.role === Role.ADMIN) return true;
    const count = await this.prisma.employee.count({ where: { id: actor.id, ...PROVIDER } });
    return count > 0;
  }

  private async assertCanSee(actor: AuthUser) {
    if (!(await this.canSee(actor))) {
      throw new ForbiddenException('The on-call schedule is for providers and managers.');
    }
  }

  private async assertProviders(ids: string[], message = 'Only providers can be on call.') {
    const unique = [...new Set(ids)];
    const count = await this.prisma.employee.count({ where: { id: { in: unique }, ...PROVIDER } });
    if (count !== unique.length) throw new BadRequestException(message);
  }

  private async providers() {
    const rows = await this.prisma.employee.findMany({
      where: PROVIDER,
      select: PERSON,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map(named);
  }

  /// Every pattern, and the changed days in a range.
  private async rules(from: string, to: string) {
    const [rotas, days] = await Promise.all([
      this.prisma.onCallRota.findMany({
        select: {
          startsOn: true,
          changesAt: true,
          entries: { select: { weekday: true, weekOfMonth: true, employeeId: true } },
        },
      }),
      this.prisma.onCallDay.findMany({
        where: { date: { gte: toUtcDate(from), lte: toUtcDate(to) } },
        select: { date: true, employeeId: true, swapId: true, note: true },
      }),
    ]);
    const rules: RotaRule[] = rotas.map((rota) => ({
      startsOn: isoDate(rota.startsOn),
      changesAt: rota.changesAt,
      entries: rota.entries,
    }));
    return {
      rotas: rules,
      changed: {
        map: new Map(
          days.map((day) => [
            isoDate(day.date),
            { employeeId: day.employeeId, swapped: !!day.swapId },
          ]),
        ),
        notes: new Map(
          days.filter((day) => day.note).map((day) => [isoDate(day.date), day.note as string]),
        ),
      },
    };
  }

  private async people(ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))];
    const rows = wanted.length
      ? await this.prisma.employee.findMany({ where: { id: { in: wanted } }, select: PERSON })
      : [];
    return new Map(rows.map((row) => [row.id, named(row)]));
  }

  private async requireSwap(id: string) {
    const swap = await this.prisma.onCallSwap.findUnique({ where: { id } });
    if (!swap) throw new NotFoundException('That swap is no longer there.');
    return swap;
  }
}

/// "Dr. Jonathan Dominguez" for somebody with letters after their name,
/// otherwise the name they go by.
function named(person: Person) {
  const first = person.preferredName ?? person.firstName;
  const doctor = person.postNominals && /\b(MD|DO)\b/i.test(person.postNominals);
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    preferredName: person.preferredName,
    photoUpdatedAt: person.photoUpdatedAt,
    name: `${doctor ? 'Dr. ' : ''}${first} ${person.lastName}`,
  };
}

/// "Sat, Oct 24".
function dayWords(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
