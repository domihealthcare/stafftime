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
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { OnCallDayInput, OnCallRotaInput, OnCallSwapInput } from './dto/on-call.dto';
import { turnDateOf } from './call-routing-lookup';
import { clockWords, onCallOn, RotaRule, usualOn } from './on-call';

/// The most a screen asks for at once.
const MAX_DAYS = 93;
/// The most days a manager changes in one go, and a swap gives or takes.
const MAX_CHANGED_DAYS = 62;
const MAX_SWAP_DAYS = 31;

export const WORKING = [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE];

export const PERSON = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  postNominals: true,
  photoUpdatedAt: true,
} satisfies Prisma.EmployeeSelect;

export type Person = Prisma.EmployeeGetPayload<{ select: typeof PERSON }>;

/// Who can be on call: anybody in a job role that carries the clinical forms
/// (Provider), as for provider productivity.
export const PROVIDER: Prisma.EmployeeWhereInput = {
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
    // The same turn the phone line rings, even in the hour the clocks repeat.
    const nowDate = turnDateOf(now, rotas);
    const dates = datesBetween(from, to);
    const views = dates.map((date) => onCallOn(date, rotas, changed.map));
    const current = onCallOn(nowDate, rotas, changed.map);
    const backupIds = views.map((day) => this.backupOf(day, rotas, changed.backups));
    const people = await this.people([
      ...views.map((day) => day.employeeId),
      ...backupIds,
      current.employeeId,
    ]);

    // The override running now, if any: the one made last wins.
    const override = await this.prisma.onCallCover.findFirst({
      where: { startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { endsAt: true, employee: { select: PERSON } },
    });

    return {
      days: views.map((day, index) => ({
        ...day,
        employee: day.employeeId ? (people.get(day.employeeId) ?? null) : null,
        backup: backupIds[index] ? (people.get(backupIds[index] as string) ?? null) : null,
        note: changed.notes.get(day.date) ?? null,
      })),
      now: override
        ? {
            // An override running now beats the day, as on the phone line.
            date: nowDate,
            employee: named(override.employee),
            until: override.endsAt,
          }
        : {
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
          select: {
            weekday: true,
            weekOfMonth: true,
            employee: { select: PERSON },
            backup: { select: PERSON },
          },
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
          backup: entry.backup ? named(entry.backup) : null,
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
        'Start it today or later - who was on call before stays as it was.',
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
      if (entry.backupEmployeeId && entry.backupEmployeeId === entry.employeeId) {
        throw new BadRequestException('The backup has to be somebody other than the provider.');
      }
    }
    await this.assertProviders(
      dto.entries.flatMap((entry) =>
        entry.backupEmployeeId ? [entry.employeeId, entry.backupEmployeeId] : [entry.employeeId],
      ),
    );

    const startsOn = toUtcDate(dto.startsOn);
    await this.prisma.$transaction(async (tx) => {
      await tx.onCallRota.deleteMany({ where: { startsOn } });
      await tx.onCallRota.create({
        data: {
          startsOn,
          changesAt: dto.changesAt,
          createdById: actor.id,
          entries: {
            create: dto.entries.map((entry) => ({
              weekday: entry.weekday,
              weekOfMonth: entry.weekOfMonth,
              employeeId: entry.employeeId,
              backupEmployeeId: entry.backupEmployeeId ?? null,
            })),
          },
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

  /// One day (or each day up to `until`): somebody else on call, or back to
  /// the usual.
  async setDay(date: string, dto: OnCallDayInput, actor: AuthUser, now = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Give the day as a date.');
    const today = localDateIn(now, PRACTICE_ZONE);
    if (date < addDaysTo(today, -1)) {
      throw new BadRequestException('Days already past stay as they were.');
    }
    const until = dto.until && dto.until > date ? dto.until : date;
    const dates = datesBetween(date, until);
    if (dates.length > MAX_CHANGED_DAYS) {
      throw new BadRequestException(`Change at most ${MAX_CHANGED_DAYS} days at once.`);
    }
    const { rotas, changed } = await this.rules(date, until);
    const before = new Map(dates.map((d) => [d, onCallOn(d, rotas, changed.map).employeeId]));
    const note = dto.note?.trim() || null;

    if (dto.employeeId) {
      const employeeId = dto.employeeId;
      const backupId = dto.backupEmployeeId || null;
      if (backupId && backupId === employeeId) {
        throw new BadRequestException('The backup has to be somebody other than the provider.');
      }
      await this.assertProviders(backupId ? [employeeId, backupId] : [employeeId]);
      await this.prisma.$transaction(
        dates.map((d) =>
          this.prisma.onCallDay.upsert({
            where: { date: toUtcDate(d) },
            create: {
              date: toUtcDate(d),
              employeeId,
              backupEmployeeId: backupId,
              note,
              setById: actor.id,
            },
            update: {
              employeeId,
              backupEmployeeId: backupId,
              note,
              setById: actor.id,
              swapId: null,
            },
          }),
        ),
      );
    } else {
      await this.prisma.onCallDay.deleteMany({
        where: { date: { gte: toUtcDate(date), lte: toUtcDate(until) } },
      });
    }

    // Put back to the usual: whoever the pattern has.
    const after = new Map(
      dates.map((d) => [d, dto.employeeId ?? onCallOn(d, rotas, new Map()).employeeId]),
    );
    const moved = dates.filter((d) => before.get(d) !== after.get(d));
    if (moved.length > 0) {
      const ids = moved.flatMap((d) => [before.get(d) ?? null, after.get(d) ?? null]);
      const names = await this.people(ids);
      const name = (id: string | null) => (id ? (names.get(id)?.name ?? 'somebody') : 'nobody');
      const only = (list: (string | null)[]) => (new Set(list).size === 1 ? list[0] : undefined);
      const nowOn = only(moved.map((d) => after.get(d) ?? null));
      const wasOn = only(moved.map((d) => before.get(d) ?? null));
      const when = daysWords(moved);
      await this.notifications.onCall(
        [...new Set(ids)].filter((id): id is string => !!id && id !== actor.id),
        {
          title: `On call ${when}: ${nowOn !== undefined ? `now ${name(nowOn)}` : 'changed'}`,
          body: `A manager changed who is on call ${when}${
            wasOn !== undefined ? ` - it was ${name(wasOn)}` : ''
          }.${note ? ` “${note}”` : ''}`,
        },
        { email: true },
      );
    }
    this.logger.log(
      `On call ${date}${until !== date ? ` to ${until}` : ''} set to ${dto.employeeId ?? 'the usual'} by ${actor.id}`,
    );
    return { date, until, employeeId: after.get(date) ?? null };
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
        giveDates: true,
        takeDates: true,
        note: true,
        status: true,
        createdAt: true,
        answeredAt: true,
        requester: { select: PERSON },
        partner: { select: PERSON },
      },
    });
    return rows.map(({ giveDates: _gives, takeDates: _takes, ...row }) => {
      const { gives, takes } = swapDays({ ...row, giveDates: _gives, takeDates: _takes });
      return {
        ...row,
        giveDate: gives[0],
        takeDate: takes[0] ?? null,
        giveDates: gives,
        takeDates: takes,
        requester: named(row.requester),
        partner: named(row.partner),
      };
    });
  }

  async askSwap(dto: OnCallSwapInput, actor: AuthUser, now = new Date()) {
    await this.assertProviders(
      [actor.id],
      'Only providers on the on-call schedule can ask to swap.',
    );
    if (dto.partnerId === actor.id) throw new BadRequestException('Choose another provider.');
    await this.assertProviders([dto.partnerId]);
    const today = localDateIn(now, PRACTICE_ZONE);
    const gives = [...new Set([dto.giveDate, ...(dto.giveDates ?? [])])].sort();
    const takes = [
      ...new Set([...(dto.takeDate ? [dto.takeDate] : []), ...(dto.takeDates ?? [])]),
    ].sort();
    if (gives.length > MAX_SWAP_DAYS || takes.length > MAX_SWAP_DAYS) {
      throw new BadRequestException(`Choose at most ${MAX_SWAP_DAYS} days at once.`);
    }
    for (const date of [...gives, ...takes]) {
      if (date < today) throw new BadRequestException('Choose days still to come.');
    }
    const all = [...gives, ...takes].sort();
    const { rotas, changed } = await this.rules(all[0], all[all.length - 1]);
    for (const date of gives) {
      if (onCallOn(date, rotas, changed.map).employeeId !== actor.id) {
        throw new BadRequestException(`You are not on call ${dayWords(date)}.`);
      }
    }
    for (const date of takes) {
      if (onCallOn(date, rotas, changed.map).employeeId !== dto.partnerId) {
        throw new BadRequestException(`They are not on call ${dayWords(date)}.`);
      }
    }
    const swap = await this.prisma.onCallSwap.create({
      data: {
        requesterId: actor.id,
        partnerId: dto.partnerId,
        giveDate: toUtcDate(gives[0]),
        takeDate: takes.length ? toUtcDate(takes[0]) : null,
        giveDates: gives.map(toUtcDate),
        takeDates: takes.map(toUtcDate),
        note: dto.note?.trim() || null,
      },
      select: { id: true },
    });
    const names = await this.people([actor.id]);
    const me = names.get(actor.id)?.name ?? 'A provider';
    await this.notifications.onCall(
      [dto.partnerId],
      {
        title: `${me} asks you to take on call ${daysWords(gives)}`,
        body: `${takes.length ? `In return, they would take yours ${daysWords(takes)}. ` : ''}${
          dto.note?.trim() ? `“${dto.note.trim()}” ` : ''
        }Nothing changes until you say yes, on the on-call schedule.`,
      },
      { email: true },
    );
    this.logger.log(`On-call swap ${swap.id} asked by ${actor.id} (${gives.length} days)`);
    return swap;
  }

  /// "Yes": the days change hands, if all of them are still as they were.
  async answerSwap(id: string, accept: boolean, actor: AuthUser, now = new Date()) {
    const swap = await this.requireSwap(id);
    if (swap.partnerId !== actor.id)
      throw new ForbiddenException('Only the provider asked can answer.');
    if (swap.status !== OnCallSwapStatus.PENDING)
      throw new ConflictException('That has already been answered.');
    const { gives, takes } = swapDays(swap);
    /// Each day keeps the backup it had (its own, else the pattern's), unless
    /// that is the provider now taking it.
    const backupFor = new Map<string, string | null>();
    /// Every day that changes hands, and who has it after.
    const swapped: [string, string, string][] = [
      ...gives.map((date): [string, string, string] => [date, swap.requesterId, swap.partnerId]),
      ...takes.map((date): [string, string, string] => [date, swap.partnerId, swap.requesterId]),
    ];

    if (accept) {
      const today = localDateIn(now, PRACTICE_ZONE);
      if (swapped.some(([date]) => date < today)) {
        throw new BadRequestException('That day has already gone.');
      }
      const all = swapped.map(([date]) => date).sort();
      const { rotas, changed } = await this.rules(all[0], all[all.length - 1]);
      if (swapped.some(([date, was]) => onCallOn(date, rotas, changed.map).employeeId !== was)) {
        throw new ConflictException(
          'The schedule has changed since this was asked, so it cannot go ahead.',
        );
      }
      for (const [date, was, becomes] of swapped) {
        const backup = this.backupOf({ date, employeeId: was }, rotas, changed.backups);
        backupFor.set(date, backup && backup !== becomes ? backup : null);
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
        for (const [date, , employeeId] of swapped) {
          await tx.onCallDay.upsert({
            where: { date: toUtcDate(date) },
            create: {
              date: toUtcDate(date),
              employeeId,
              backupEmployeeId: backupFor.get(date) ?? null,
              swapId: id,
              setById: actor.id,
            },
            update: {
              employeeId,
              backupEmployeeId: backupFor.get(date) ?? null,
              swapId: id,
              setById: actor.id,
              note: null,
            },
          });
        }
      }
      return true;
    });
    if (!done) throw new ConflictException('That has already been answered.');

    const names = await this.people([swap.requesterId, swap.partnerId]);
    const them = names.get(swap.partnerId)?.name ?? 'They';
    const what = `${daysWords(gives)}${takes.length ? `, and you take theirs ${daysWords(takes)}` : ''}`;
    await this.notifications.onCall(
      [swap.requesterId],
      accept
        ? {
            title: `${them} will take your on call ${daysWords(gives)}`,
            body: `Swapped: ${them} is on call ${what}.`,
          }
        : {
            title: `${them} can’t take your on call ${daysWords(gives)}`,
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
          title: `On call swapped: ${them} for ${requester} ${daysWords(gives)}`,
          body: takes.length
            ? `And ${requester} takes ${daysWords(takes)}.`
            : 'Nothing given back.',
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
        title: `${names.get(actor.id)?.name ?? 'A provider'} no longer needs you to take ${daysWords(swapDays(swap).gives)}`,
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
          entries: {
            select: { weekday: true, weekOfMonth: true, employeeId: true, backupEmployeeId: true },
          },
        },
      }),
      this.prisma.onCallDay.findMany({
        where: { date: { gte: toUtcDate(from), lte: toUtcDate(to) } },
        select: { date: true, employeeId: true, backupEmployeeId: true, swapId: true, note: true },
      }),
    ]);
    const rules: BackupRota[] = rotas.map((rota) => ({
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
        backups: new Map(days.map((day) => [isoDate(day.date), day.backupEmployeeId])),
        notes: new Map(
          days.filter((day) => day.note).map((day) => [isoDate(day.date), day.note as string]),
        ),
      },
    };
  }

  /// The backup for a day: a changed day's own, else the pattern's.
  private backupOf(
    day: { date: string; employeeId: string | null },
    rotas: BackupRota[],
    backups: Map<string, string | null>,
  ): string | null {
    if (!day.employeeId) return null;
    if (backups.has(day.date)) return backups.get(day.date) ?? null;
    const rota = rotaOnDay(day.date, rotas);
    if (!rota) return null;
    const indexed = rota.entries.map((entry, index) => ({ ...entry, employeeId: String(index) }));
    const pick = usualOn(day.date, { ...rota, entries: indexed });
    const found = pick === null ? null : rota.entries[Number(pick)];
    return found && found.backupEmployeeId !== day.employeeId ? found.backupEmployeeId : null;
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
export function named(person: Person) {
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

type BackupRota = RotaRule & {
  entries: (RotaRule['entries'][number] & { backupEmployeeId: string | null })[];
};

function rotaOnDay(date: string, rotas: BackupRota[]): BackupRota | null {
  let found: BackupRota | null = null;
  for (const rota of rotas) {
    if (rota.startsOn <= date && (!found || rota.startsOn > found.startsOn)) found = rota;
  }
  return found;
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

/// "Mon, Nov 9", "Mon, Nov 9 and Tue, Nov 10", "Mon, Nov 9, Wed, Nov 11 and
/// Fri, Nov 13"; four or more: "Mon, Nov 9 to Thu, Nov 12 (4 days)" for a run,
/// else "4 days, Mon, Nov 9 to Fri, Nov 13".
export function daysWords(dates: string[]): string {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return dayWords(sorted[0]);
  const consecutive = sorted.every((d, i) => i === 0 || addDaysTo(sorted[i - 1], 1) === d);
  if (sorted.length > 3 && consecutive) {
    return `${dayWords(sorted[0])} to ${dayWords(sorted[sorted.length - 1])} (${sorted.length} days)`;
  }
  if (sorted.length > 3) {
    return `${sorted.length} days, ${dayWords(sorted[0])} to ${dayWords(sorted[sorted.length - 1])}`;
  }
  return `${sorted.slice(0, -1).map(dayWords).join(', ')} and ${dayWords(sorted[sorted.length - 1])}`;
}

/// The days a swap gives and takes back. Swaps asked before several days
/// were possible have only the single giveDate and takeDate.
function swapDays(swap: {
  giveDate: Date;
  takeDate: Date | null;
  giveDates: Date[];
  takeDates: Date[];
}): { gives: string[]; takes: string[] } {
  const gives = swap.giveDates.length ? swap.giveDates.map(isoDate) : [isoDate(swap.giveDate)];
  const takes = swap.takeDates.length
    ? swap.takeDates.map(isoDate)
    : swap.takeDate
      ? [isoDate(swap.takeDate)]
      : [];
  return { gives: [...gives].sort(), takes: [...takes].sort() };
}
