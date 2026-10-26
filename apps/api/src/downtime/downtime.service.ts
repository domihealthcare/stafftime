import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DowntimeNoticeKind, EmploymentStatus, Prisma, Role, ShiftStatus } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { A_PERSON } from '../common/people';
import { toUtcDate, isoDate } from '../common/util/calendar-date.util';
import { PRACTICE_ZONE, localDateIn, zonedTimeToUtc } from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CAUSE_LABELS,
  aheadNoticeDue,
  asksForCheck,
  catchUpFor,
  checkRoundsDue,
  clockWords,
  dateWords,
  dayWords,
  durationWords,
  endOfPracticeDay,
  headline,
  isOrAre,
  minutesBetween,
  monthOf,
  npiIsValid,
  officesWords,
  overlaps,
  plannedWindow,
  sentenceStart,
  procedureGroupFor,
  shouldTell,
  shredOn,
  summarise,
  systemsWords,
} from './downtime';
import {
  CatchUpInput,
  DowntimeCheckInput,
  DowntimeContactsInput,
  EndDowntimeInput,
  KitItemsInput,
  PadProvidersInput,
  StartDowntimeInput,
} from './dto/downtime.dto';

const PERSON = { id: true, firstName: true, lastName: true, preferredName: true } as const;

const SELECT = {
  id: true,
  systems: true,
  note: true,
  planned: true,
  startsAt: true,
  plannedEndsAt: true,
  announcedAt: true,
  endedAt: true,
  cause: true,
  causeNote: true,
  catchUpPlan: true,
  catchUpDueOn: true,
  caughtUpAt: true,
  shreddedAt: true,
  startedById: true,
  startedBy: { select: PERSON },
  endedBy: { select: PERSON },
  caughtUpBy: { select: PERSON },
  shreddedBy: { select: PERSON },
  locations: { select: { location: { select: { id: true, name: true } } } },
  updates: {
    select: { id: true, body: true, createdAt: true, createdBy: { select: PERSON } },
    orderBy: { createdAt: 'asc' },
  },
  contactsMade: {
    select: { contactId: true, label: true, doneAt: true, doneBy: { select: PERSON } },
    orderBy: { doneAt: 'asc' },
  },
  _count: { select: { recipients: { where: { kind: DowntimeNoticeKind.STARTED } } } },
} satisfies Prisma.DowntimeSelect;

type Row = Prisma.DowntimeGetPayload<{ select: typeof SELECT }>;
type Person = { firstName: string; lastName: string; preferredName: string | null };

const nameOf = (person: Person | null) =>
  person ? `${person.preferredName ?? person.firstName} ${person.lastName}` : null;
/// "Kayla B", as the monthly check lines say who.
const shortName = (person: Person | null) =>
  person ? `${person.preferredName ?? person.firstName} ${person.lastName.charAt(0)}` : 'Somebody';

const isManager = (user: AuthUser) => user.role === Role.MANAGER || user.role === Role.ADMIN;

/**
 * Downtime (October 2026, Dominguez): when eCW, the phones or the internet go
 * down at an office. A manager or admin starts one (or enters a planned one
 * ahead), the people on shift there today are told by bell, email and phone,
 * updates go to the same people, and a manager or admin closes it with what
 * caused it. The log keeps how long it was, the catch-up and the shredding of
 * the paper. Rules in `downtime.ts`; the procedures are a guide
 * (`GuideKey.DOWNTIME`), and the forms print in the browser.
 *
 * Nothing about a patient is kept: the paperwork during a downtime is paper.
 */
@Injectable()
export class DowntimeService {
  private readonly logger = new Logger(DowntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------ reading

  private async officeCount(): Promise<number> {
    return this.prisma.location.count();
  }

  private view(row: Row, officeCount: number, user: AuthUser | null, now: Date) {
    const offices = row.locations.map((entry) => entry.location);
    const where = officesWords(
      offices.map((office) => office.name),
      officeCount,
    );
    const status = row.endedAt ? 'ENDED' : row.announcedAt ? 'ACTIVE' : 'PLANNED';
    const manager = user ? isManager(user) : false;
    return {
      id: row.id,
      status,
      systems: row.systems,
      headline: headline(row.systems, where),
      offices,
      note: row.note,
      planned: row.planned,
      startsAt: row.startsAt,
      plannedEndsAt: row.plannedEndsAt,
      announcedAt: row.announcedAt,
      endedAt: row.endedAt,
      minutes: Math.round(
        status === 'PLANNED' ? 0 : minutesBetween(row.startsAt, row.endedAt ?? now),
      ),
      cause: row.cause,
      causeLabel: row.cause ? CAUSE_LABELS[row.cause] : null,
      causeNote: row.causeNote,
      catchUpPlan: row.catchUpPlan,
      catchUpDueOn: row.catchUpDueOn ? isoDate(row.catchUpDueOn) : null,
      caughtUpAt: row.caughtUpAt,
      shreddedAt: row.shreddedAt,
      shredOn: row.caughtUpAt ? shredOn(row.caughtUpAt) : null,
      startedBy: nameOf(row.startedBy),
      endedBy: nameOf(row.endedBy),
      caughtUpBy: nameOf(row.caughtUpBy),
      shreddedBy: nameOf(row.shreddedBy),
      updates: row.updates.map((update) => ({
        id: update.id,
        body: update.body,
        createdAt: update.createdAt,
        by: nameOf(update.createdBy),
      })),
      // Who was contacted, and how many were told: the managers' log.
      contactsMade: manager
        ? row.contactsMade.map((made) => ({
            contactId: made.contactId,
            label: made.label,
            doneAt: made.doneAt,
            by: nameOf(made.doneBy),
          }))
        : [],
      toldCount: manager ? row._count.recipients : null,
    };
  }

  /// The downtimes somebody hears about: at one of their offices, or one they
  /// were told of. Managers and admins: all of them.
  private async visibleTo(user: AuthUser): Promise<Prisma.DowntimeWhereInput> {
    if (isManager(user)) return {};
    const offices = await this.prisma.employeeLocation.findMany({
      where: { employeeId: user.id },
      select: { locationId: true },
    });
    return {
      OR: [
        { locations: { some: { locationId: { in: offices.map((row) => row.locationId) } } } },
        { recipients: { some: { employeeId: user.id } } },
      ],
    };
  }

  /// What is going on now, for the red bar and the Downtime page: the
  /// downtimes on now, and those planned. Managers also get who to contact.
  async current(user: AuthUser, now = new Date()) {
    const visible = await this.visibleTo(user);
    const [rows, officeCount] = await Promise.all([
      this.prisma.downtime.findMany({
        where: { AND: [visible, { endedAt: null }] },
        select: SELECT,
        orderBy: { startsAt: 'asc' },
      }),
      this.officeCount(),
    ]);
    const views = rows.map((row) => this.view(row, officeCount, user, now));
    return {
      active: views.filter((view) => view.status === 'ACTIVE'),
      planned: views.filter((view) => view.status === 'PLANNED'),
      contacts: isManager(user) ? await this.contacts() : [],
      myGroup: await this.groupOf(user),
    };
  }

  /// Whose procedures they see first, by their main job role (or the ones an
  /// admin viewing as somebody chose).
  private async groupOf(user: AuthUser): Promise<string> {
    const jobRoles = user.viewAsJobRoleIds
      ? (
          await this.prisma.jobRole.findMany({
            where: { id: { in: user.viewAsJobRoleIds } },
            select: { name: true, usesClinicalForms: true },
          })
        ).map((jobRole) => ({ ...jobRole, isPrimary: false }))
      : (
          await this.prisma.employeeJobRole.findMany({
            where: { employeeId: user.id },
            select: {
              isPrimary: true,
              jobRole: { select: { name: true, usesClinicalForms: true } },
            },
          })
        ).map((held) => ({ ...held.jobRole, isPrimary: held.isPrimary }));
    return procedureGroupFor({ role: user.role, jobRoles });
  }

  /// The kiosk's: what is down at its office now, in a line.
  async activeAt(locationId: string) {
    const [rows, officeCount] = await Promise.all([
      this.prisma.downtime.findMany({
        where: {
          announcedAt: { not: null },
          endedAt: null,
          locations: { some: { locationId } },
        },
        select: SELECT,
        orderBy: { startsAt: 'asc' },
      }),
      this.officeCount(),
    ]);
    return rows.map((row) => {
      const view = this.view(row, officeCount, null, new Date());
      return { id: view.id, headline: view.headline, startsAt: view.startsAt };
    });
  }

  /// The log, for managers and admins: a year's downtimes, newest first, and
  /// anything earlier still not caught up or shredded, with the year added up.
  async log(user: AuthUser, year?: number, now = new Date()) {
    const thisYear = Number(localDateIn(now, PRACTICE_ZONE).slice(0, 4));
    const chosen = year && year > 2000 && year < 3000 ? year : thisYear;
    const from = zonedTimeToUtc(`${chosen}-01-01`, '00:00', PRACTICE_ZONE);
    const to = zonedTimeToUtc(`${chosen + 1}-01-01`, '00:00', PRACTICE_ZONE);
    const [rows, officeCount, first] = await Promise.all([
      this.prisma.downtime.findMany({
        where: {
          OR: [
            { startsAt: { gte: from, lt: to } },
            { endedAt: { not: null }, OR: [{ caughtUpAt: null }, { shreddedAt: null }] },
          ],
        },
        select: SELECT,
        orderBy: { startsAt: 'desc' },
      }),
      this.officeCount(),
      this.prisma.downtime.findFirst({ select: { startsAt: true }, orderBy: { startsAt: 'asc' } }),
    ]);
    const inYear = rows.filter((row) => row.startsAt >= from && row.startsAt < to);
    const firstYear = first
      ? Number(localDateIn(first.startsAt, PRACTICE_ZONE).slice(0, 4))
      : thisYear;
    return {
      year: chosen,
      years: Array.from({ length: thisYear - firstYear + 1 }, (_, index) => thisYear - index),
      downtimes: rows.map((row) => this.view(row, officeCount, user, now)),
      summary: summarise(
        inYear.map((row) => ({
          systems: row.systems,
          cause: row.cause,
          startsAt: row.startsAt,
          endedAt: row.endedAt,
          offices: row.locations.map((entry) => entry.location.name),
        })),
      ),
    };
  }

  private async load(id: string): Promise<Row> {
    const row = await this.prisma.downtime.findUnique({ where: { id }, select: SELECT });
    if (!row) throw new NotFoundException('That downtime is not on file.');
    return row;
  }

  private async answer(id: string, user: AuthUser, now = new Date()) {
    return this.view(await this.load(id), await this.officeCount(), user, now);
  }

  // ----------------------------------------------------------- starting

  async start(dto: StartDowntimeInput, user: AuthUser, now = new Date()) {
    const systems = [...new Set(dto.systems)];
    const locationIds = [...new Set(dto.locationIds)];
    const offices = await this.prisma.location.count({ where: { id: { in: locationIds } } });
    if (offices !== locationIds.length) throw new BadRequestException('Choose the office again.');

    const planned = Boolean(dto.planned);
    let startsAt = now;
    let plannedEndsAt: Date | null = null;
    if (planned) {
      if (!dto.startsAt) throw new BadRequestException('Say when it starts.');
      startsAt = new Date(dto.startsAt);
      if (!(startsAt > now)) {
        throw new BadRequestException(
          'A planned downtime starts later than now. To start one now, leave Planned unticked.',
        );
      }
      if (dto.plannedEndsAt) {
        plannedEndsAt = new Date(dto.plannedEndsAt);
        if (!(plannedEndsAt > startsAt)) {
          throw new BadRequestException('It has to end after it starts.');
        }
      }
    }

    const created = await this.prisma.downtime.create({
      data: {
        systems,
        note: dto.note?.trim() || null,
        planned,
        startsAt,
        plannedEndsAt,
        startedById: user.id,
        locations: { createMany: { data: locationIds.map((locationId) => ({ locationId })) } },
      },
      select: { id: true },
    });
    this.logger.log(
      `Downtime ${created.id} ${planned ? 'planned' : 'started'} by ${user.id}: ${systems.join(', ')}`,
    );
    if (planned) {
      if (aheadNoticeDue(startsAt, now)) await this.sendAhead(created.id);
    } else {
      await this.announce(created.id, now);
    }
    return this.answer(created.id, user, now);
  }

  /// It has started: told to the people on shift at its offices today, and
  /// to the managers and admins. Once.
  private async announce(id: string, now: Date): Promise<number> {
    const claimed = await this.prisma.downtime.updateMany({
      where: { id, announcedAt: null, endedAt: null },
      data: { announcedAt: now },
    });
    if (claimed.count === 0) return 0;
    return this.tellOnShift(id, now, true);
  }

  /// The people on a published shift at the downtime's offices who should be
  /// told now (`shouldTell`), and when it starts the managers and admins too.
  /// Each claimed before the message goes, so nobody hears twice.
  private async tellOnShift(id: string, now: Date, atStart: boolean): Promise<number> {
    const row = await this.load(id);
    const locationIds = row.locations.map((entry) => entry.location.id);
    const shifts = await this.prisma.shift.findMany({
      where: {
        status: ShiftStatus.PUBLISHED,
        employeeId: { not: null },
        locationId: { in: locationIds },
        endsAt: { gt: now },
        startsAt: { lt: endOfPracticeDay(now) },
        employee: { employmentStatus: EmploymentStatus.ACTIVE, ...A_PERSON },
      },
      select: { employeeId: true, startsAt: true, endsAt: true },
    });
    const ids = new Set(
      shifts.filter((shift) => shouldTell(shift, now, atStart)).map((shift) => shift.employeeId!),
    );
    if (atStart) {
      const managers = await this.prisma.employee.findMany({
        where: {
          role: { in: [Role.MANAGER, Role.ADMIN] },
          employmentStatus: EmploymentStatus.ACTIVE,
          ...A_PERSON,
        },
        select: { id: true },
      });
      for (const manager of managers) ids.add(manager.id);
    }
    // Whoever started it knows.
    if (row.startedById) ids.delete(row.startedById);

    const told = await this.claim(id, [...ids], DowntimeNoticeKind.STARTED);
    if (told.length === 0) return 0;
    const where = officesWords(
      row.locations.map((entry) => entry.location.name),
      await this.officeCount(),
    );
    await this.notifications.downtime(told, {
      title: `${row.planned ? 'Planned downtime has started' : 'Downtime'}: ${headline(row.systems, where)}`,
      body: [
        `Since ${clockWords(row.startsAt)}${row.note ? `. ${row.note}` : '.'}`,
        'Use the paper forms: the sign-in sheet, a running patient sheet and a progress note for each patient. What to do for your job is on the Downtime page.',
        'Nothing about a patient goes into Domi Staff or on your phone.',
      ].join('\n\n'),
      link: '/downtime',
    });
    return told.length;
  }

  /// Claims a notice for each person, and returns those it was claimed for.
  private async claim(
    downtimeId: string,
    employeeIds: string[],
    kind: DowntimeNoticeKind,
  ): Promise<string[]> {
    const claimed: string[] = [];
    for (const employeeId of employeeIds) {
      try {
        await this.prisma.downtimeRecipient.create({ data: { downtimeId, employeeId, kind } });
        claimed.push(employeeId);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }
    return claimed;
  }

  /// The evening before a planned downtime: the people whose published
  /// shifts it touches, and the managers and admins.
  private async sendAhead(id: string): Promise<number> {
    const row = await this.load(id);
    if (row.announcedAt || row.endedAt) return 0;
    const window = plannedWindow(row.startsAt, row.plannedEndsAt);
    const shifts = await this.prisma.shift.findMany({
      where: {
        status: ShiftStatus.PUBLISHED,
        employeeId: { not: null },
        locationId: { in: row.locations.map((entry) => entry.location.id) },
        startsAt: { lt: window.to },
        endsAt: { gt: window.from },
        employee: { employmentStatus: EmploymentStatus.ACTIVE, ...A_PERSON },
      },
      select: { employeeId: true, startsAt: true, endsAt: true },
    });
    const ids = new Set(
      shifts.filter((shift) => overlaps(shift, window)).map((shift) => shift.employeeId!),
    );
    const managers = await this.prisma.employee.findMany({
      where: {
        role: { in: [Role.MANAGER, Role.ADMIN] },
        employmentStatus: EmploymentStatus.ACTIVE,
        ...A_PERSON,
      },
      select: { id: true },
    });
    for (const manager of managers) ids.add(manager.id);
    if (row.startedById) ids.delete(row.startedById);

    const told = await this.claim(id, [...ids], DowntimeNoticeKind.AHEAD);
    if (told.length === 0) return 0;
    const where = officesWords(
      row.locations.map((entry) => entry.location.name),
      await this.officeCount(),
    );
    const until = row.plannedEndsAt ? ` to ${clockWords(row.plannedEndsAt)}` : '';
    await this.notifications.downtime(told, {
      title: `Planned downtime ${dayWords(row.startsAt)}: ${systemsWords(row.systems)} at ${where}`,
      body: [
        `From ${clockWords(row.startsAt)}${until}${row.note ? `. ${row.note}` : '.'}`,
        'Use the paper forms while it is on. What to do for your job is on the Downtime page.',
      ].join('\n\n'),
      link: '/downtime',
    });
    return told.length;
  }

  // ------------------------------------------------------- while it is on

  async postUpdate(id: string, body: string, user: AuthUser, now = new Date()) {
    const row = await this.load(id);
    if (row.endedAt) throw new BadRequestException('This downtime is closed.');
    const text = body.trim();
    if (!text) throw new BadRequestException('Write the update.');
    await this.prisma.downtimeUpdate.create({
      data: { downtimeId: id, body: text, createdById: user.id },
    });
    const kind = row.announcedAt ? DowntimeNoticeKind.STARTED : DowntimeNoticeKind.AHEAD;
    const recipients = await this.prisma.downtimeRecipient.findMany({
      where: { downtimeId: id, kind },
      select: { employeeId: true },
    });
    const where = officesWords(
      row.locations.map((entry) => entry.location.name),
      await this.officeCount(),
    );
    await this.notifications.downtime(
      recipients.map((entry) => entry.employeeId).filter((employeeId) => employeeId !== user.id),
      {
        title: `Downtime update: ${systemsWords(row.systems)} at ${where}`,
        body: text,
        link: '/downtime',
      },
    );
    return this.answer(id, user, now);
  }

  /// A contact reached (or the tick taken back), for the log.
  async tickContact(id: string, contactId: string, done: boolean, user: AuthUser) {
    await this.load(id);
    const contact = await this.prisma.downtimeContact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException('That contact is not on the list.');
    if (done) {
      await this.prisma.downtimeContactMade.upsert({
        where: { downtimeId_contactId: { downtimeId: id, contactId } },
        create: {
          downtimeId: id,
          contactId,
          label: [contact.label, contact.name].filter(Boolean).join(': '),
          doneById: user.id,
        },
        update: {},
      });
    } else {
      await this.prisma.downtimeContactMade.deleteMany({ where: { downtimeId: id, contactId } });
    }
    return this.answer(id, user);
  }

  // -------------------------------------------------------------- ending

  async end(id: string, dto: EndDowntimeInput, user: AuthUser, now = new Date()) {
    const row = await this.load(id);
    if (row.endedAt) throw new BadRequestException('This downtime is already closed.');
    if (!row.announcedAt) {
      throw new BadRequestException('It has not started yet. Cancel it instead.');
    }
    const catchUp = catchUpFor(row.startsAt, now);
    const dueOn = dto.catchUpDueOn ?? (catchUp.kind === 'PLAN' ? null : catchUp.dueOn);
    const plan = dto.catchUpPlan?.trim() || null;
    const closed = await this.prisma.downtime.updateMany({
      where: { id, endedAt: null },
      data: {
        endedAt: now,
        endedById: user.id,
        cause: dto.cause,
        causeNote: dto.causeNote?.trim() || null,
        catchUpPlan: plan,
        catchUpDueOn: dueOn ? toUtcDate(dueOn) : null,
      },
    });
    if (closed.count === 0) throw new BadRequestException('This downtime is already closed.');
    this.logger.log(`Downtime ${id} closed by ${user.id}: ${dto.cause}`);

    const recipients = await this.prisma.downtimeRecipient.findMany({
      where: { downtimeId: id, kind: DowntimeNoticeKind.STARTED },
      select: { employeeId: true },
    });
    const where = officesWords(
      row.locations.map((entry) => entry.location.name),
      await this.officeCount(),
    );
    const what = systemsWords(row.systems);
    const catchUpWords =
      catchUp.kind === 'SAME_DAY' && !dto.catchUpDueOn
        ? 'before the end of today'
        : dueOn
          ? `by the end of ${dateWords(dueOn)}`
          : 'a manager will say how';
    await this.notifications.downtime(
      recipients.map((entry) => entry.employeeId).filter((employeeId) => employeeId !== user.id),
      {
        title: `${sentenceStart(what)} ${isOrAre(row.systems)} back at ${where}`,
        body: [
          `The downtime is over, after ${durationWords(minutesBetween(row.startsAt, now))}.`,
          `Catching up: ${catchUpWords}.${plan ? ` ${plan}` : ''} What to do for your job is under "When it's back" on the Downtime page.`,
        ].join('\n\n'),
        link: '/downtime?tab=procedures',
      },
    );
    return this.answer(id, user, now);
  }

  /// A planned one called off before it started: those told ahead hear so.
  async cancel(id: string, user: AuthUser) {
    const row = await this.load(id);
    if (row.announcedAt || row.endedAt) {
      throw new BadRequestException('It has started. Close it instead.');
    }
    const recipients = await this.prisma.downtimeRecipient.findMany({
      where: { downtimeId: id, kind: DowntimeNoticeKind.AHEAD },
      select: { employeeId: true },
    });
    const officeCount = await this.officeCount();
    await this.prisma.downtime.delete({ where: { id } });
    this.logger.log(`Planned downtime ${id} cancelled by ${user.id}`);
    const where = officesWords(
      row.locations.map((entry) => entry.location.name),
      officeCount,
    );
    await this.notifications.downtime(
      recipients.map((entry) => entry.employeeId).filter((employeeId) => employeeId !== user.id),
      {
        title: `Planned downtime cancelled: ${systemsWords(row.systems)} at ${where}`,
        body: `The downtime planned for ${dayWords(row.startsAt)} at ${clockWords(row.startsAt)} is not going ahead.`,
        link: '/downtime',
      },
    );
    return { cancelled: true };
  }

  async setCatchUp(id: string, dto: CatchUpInput, user: AuthUser) {
    const row = await this.load(id);
    if (!row.endedAt) throw new BadRequestException('Close the downtime first.');
    await this.prisma.downtime.update({
      where: { id },
      data: {
        ...(dto.catchUpPlan !== undefined ? { catchUpPlan: dto.catchUpPlan.trim() || null } : {}),
        ...(dto.catchUpDueOn !== undefined
          ? { catchUpDueOn: dto.catchUpDueOn ? toUtcDate(dto.catchUpDueOn) : null }
          : {}),
      },
    });
    return this.answer(id, user);
  }

  async markCaughtUp(id: string, done: boolean, user: AuthUser, now = new Date()) {
    const row = await this.load(id);
    if (!row.endedAt) throw new BadRequestException('Close the downtime first.');
    await this.prisma.downtime.update({
      where: { id },
      data: done
        ? { caughtUpAt: now, caughtUpById: user.id }
        : { caughtUpAt: null, caughtUpById: null, shreddedAt: null, shreddedById: null },
    });
    return this.answer(id, user, now);
  }

  async markShredded(id: string, done: boolean, user: AuthUser, now = new Date()) {
    const row = await this.load(id);
    if (!row.caughtUpAt) throw new BadRequestException('Mark it caught up first.');
    await this.prisma.downtime.update({
      where: { id },
      data: done
        ? { shreddedAt: now, shreddedById: user.id }
        : { shreddedAt: null, shreddedById: null },
    });
    return this.answer(id, user, now);
  }

  // ------------------------------------------------------------- set-up

  async contacts() {
    return this.prisma.downtimeContact.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: {
        id: true,
        label: true,
        name: true,
        detail: true,
        phone: true,
        email: true,
        systems: true,
      },
    });
  }

  /// The whole list, saved at once in the order given.
  async saveContacts(dto: DowntimeContactsInput) {
    const keep = dto.contacts.map((contact) => contact.id).filter((id): id is string => !!id);
    await this.prisma.$transaction(async (tx) => {
      await tx.downtimeContact.deleteMany({ where: { id: { notIn: keep } } });
      for (const [index, contact] of dto.contacts.entries()) {
        const data = {
          label: contact.label.trim(),
          name: contact.name?.trim() || null,
          detail: contact.detail?.trim() || null,
          phone: contact.phone?.trim() || null,
          email: contact.email?.trim() || null,
          systems: [...new Set(contact.systems)],
          sortOrder: (index + 1) * 10,
        };
        if (contact.id) {
          await tx.downtimeContact.updateMany({ where: { id: contact.id }, data });
        } else {
          await tx.downtimeContact.create({ data });
        }
      }
    });
    return this.contacts();
  }

  async kitItems() {
    return this.prisma.downtimeKitItem.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, quantity: true },
    });
  }

  async saveKitItems(dto: KitItemsInput) {
    const keep = dto.items.map((item) => item.id).filter((id): id is string => !!id);
    await this.prisma.$transaction(async (tx) => {
      await tx.downtimeKitItem.deleteMany({ where: { id: { notIn: keep } } });
      for (const [index, item] of dto.items.entries()) {
        const data = {
          label: item.label.trim(),
          quantity: item.quantity ?? null,
          sortOrder: (index + 1) * 10,
        };
        if (item.id) await tx.downtimeKitItem.updateMany({ where: { id: item.id }, data });
        else await tx.downtimeKitItem.create({ data });
      }
    });
    return this.kitItems();
  }

  async padProviders() {
    return this.prisma.downtimePadProvider.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, npi: true },
    });
  }

  async savePadProviders(dto: PadProvidersInput) {
    for (const provider of dto.providers) {
      if (!npiIsValid(provider.npi)) {
        throw new BadRequestException(
          `The NPI for ${provider.name.trim()} does not check out. Look at it again.`,
        );
      }
    }
    const keep = dto.providers.map((provider) => provider.id).filter((id): id is string => !!id);
    await this.prisma.$transaction(async (tx) => {
      await tx.downtimePadProvider.deleteMany({ where: { id: { notIn: keep } } });
      for (const [index, provider] of dto.providers.entries()) {
        const data = {
          name: provider.name.trim(),
          npi: provider.npi,
          sortOrder: (index + 1) * 10,
        };
        if (provider.id) {
          await tx.downtimePadProvider.updateMany({ where: { id: provider.id }, data });
        } else {
          await tx.downtimePadProvider.create({ data });
        }
      }
    });
    return this.padProviders();
  }

  // --------------------------------------------------- the monthly check

  private async jobRoleNames(employeeId: string): Promise<string[]> {
    const held = await this.prisma.employeeJobRole.findMany({
      where: { employeeId },
      select: { jobRole: { select: { name: true } } },
    });
    return held.map((entry) => entry.jobRole.name);
  }

  /// Whether this month's check is asked of them, and done.
  async myCheck(user: AuthUser, now = new Date()) {
    const month = monthOf(now);
    const [names, done, items, offices] = await Promise.all([
      this.jobRoleNames(user.id),
      this.prisma.downtimeCheck.count({ where: { month: toUtcDate(month), employeeId: user.id } }),
      this.kitItems(),
      this.prisma.employeeLocation.findMany({
        where: { employeeId: user.id },
        select: { isPrimary: true, location: { select: { id: true, name: true } } },
        orderBy: { isPrimary: 'desc' },
      }),
    ]);
    const allOffices =
      offices.length > 0
        ? offices.map((entry) => entry.location)
        : await this.prisma.location.findMany({
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          });
    return {
      month,
      asked: asksForCheck({ role: user.role, jobRoleNames: names }),
      done: done > 0,
      items,
      offices: allOffices,
    };
  }

  async submitCheck(dto: DowntimeCheckInput, user: AuthUser, now = new Date()) {
    const names = await this.jobRoleNames(user.id);
    if (!asksForCheck({ role: user.role, jobRoleNames: names }) && !isManager(user)) {
      throw new ForbiddenException('The monthly check is done by the admin team and managers.');
    }
    if (dto.locationId) {
      const office = await this.prisma.location.count({ where: { id: dto.locationId } });
      if (!office) throw new BadRequestException('Choose the office again.');
    }
    const lowItems = [...new Set(dto.lowItems.map((item) => item.trim()).filter(Boolean))];
    const feedback = dto.feedback?.trim() || null;
    const check = await this.prisma.downtimeCheck.create({
      data: {
        month: toUtcDate(monthOf(now)),
        locationId: dto.locationId ?? null,
        employeeId: user.id,
        lowItems,
        feedback,
      },
      select: {
        employee: { select: PERSON },
        location: { select: { name: true } },
      },
    });
    if (lowItems.length > 0 || feedback) {
      const managers = await this.prisma.employee.findMany({
        where: {
          role: { in: [Role.MANAGER, Role.ADMIN] },
          employmentStatus: EmploymentStatus.ACTIVE,
          ...A_PERSON,
          id: { not: user.id },
        },
        select: { id: true },
      });
      const where = check.location ? ` at ${check.location.name}` : '';
      await this.notifications.bell(
        managers.map((manager) => manager.id),
        'DOWNTIME',
        {
          title: `Monthly downtime check${where}`,
          body: [
            lowItems.length ? `Running low: ${lowItems.join(', ')}.` : '',
            feedback ? `${shortName(check.employee)} wrote about the procedures.` : '',
          ]
            .filter(Boolean)
            .join(' '),
          link: '/downtime?tab=check',
        },
      );
    }
    return this.myCheck(user, now);
  }

  /// The checks of the last few months, for managers: newest first.
  async checks(now = new Date()) {
    const since = toUtcDate(
      `${localDateIn(new Date(now.getTime() - 92 * 86_400_000), PRACTICE_ZONE).slice(0, 7)}-01`,
    );
    const rows = await this.prisma.downtimeCheck.findMany({
      where: { month: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        month: true,
        lowItems: true,
        feedback: true,
        readAt: true,
        createdAt: true,
        location: { select: { id: true, name: true } },
        employee: { select: PERSON },
        readBy: { select: PERSON },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      month: isoDate(row.month),
      lowItems: row.lowItems,
      feedback: row.feedback,
      readAt: row.readAt,
      readBy: nameOf(row.readBy),
      createdAt: row.createdAt,
      office: row.location,
      by: nameOf(row.employee),
    }));
  }

  async markCheckRead(id: string, user: AuthUser, now = new Date()) {
    const found = await this.prisma.downtimeCheck.updateMany({
      where: { id },
      data: { readAt: now, readById: user.id },
    });
    if (found.count === 0) throw new NotFoundException('That check is not on file.');
    return this.checks(now);
  }

  // ---------------------------------------------------------- the timer

  /// Run by the five-minute timer: a planned downtime starting, the evening
  /// before one, people coming on shift during one, and the monthly check.
  async run(now = new Date()) {
    let started = 0;
    let ahead = 0;
    let later = 0;
    const due = await this.prisma.downtime.findMany({
      where: { announcedAt: null, endedAt: null, planned: true },
      select: { id: true, startsAt: true },
    });
    for (const row of due) {
      if (row.startsAt <= now) started += (await this.announce(row.id, now)) > 0 ? 1 : 0;
      else if (aheadNoticeDue(row.startsAt, now)) ahead += await this.sendAhead(row.id);
    }
    const active = await this.prisma.downtime.findMany({
      where: { announcedAt: { not: null }, endedAt: null },
      select: { id: true },
    });
    for (const row of active) later += await this.tellOnShift(row.id, now, false);
    const checks = await this.askForChecks(now);
    return { started, ahead, later, checks };
  }

  /// This month's check, to admins and the admin team: on the 1st, and a
  /// week on to anybody who has not done it.
  private async askForChecks(now: Date): Promise<number> {
    const rounds = checkRoundsDue(now);
    if (rounds.length === 0) return 0;
    const month = monthOf(now);
    const people = await this.prisma.employee.findMany({
      where: {
        employmentStatus: EmploymentStatus.ACTIVE,
        ...A_PERSON,
        OR: [
          { role: Role.ADMIN },
          {
            jobRoles: { some: { jobRole: { name: { startsWith: 'Admin', mode: 'insensitive' } } } },
          },
        ],
      },
      select: { id: true },
    });
    const done = new Set(
      (
        await this.prisma.downtimeCheck.findMany({
          where: { month: toUtcDate(month) },
          select: { employeeId: true },
        })
      ).map((row) => row.employeeId),
    );
    let sent = 0;
    for (const round of rounds) {
      const toAsk: string[] = [];
      for (const person of people) {
        if (done.has(person.id)) continue;
        try {
          await this.prisma.downtimeCheckNotice.create({
            data: { month: toUtcDate(month), employeeId: person.id, round },
          });
          toAsk.push(person.id);
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            continue;
          }
          throw error;
        }
      }
      if (toAsk.length === 0) continue;
      await this.notifications.downtime(toAsk, {
        title: round === 1 ? 'Monthly downtime check' : 'Reminder: the monthly downtime check',
        body: 'Please check the downtime stack at your front desk (sign-in sheets, progress notes, order pads and the rest), and say if anything in the downtime procedures has changed or should be added. It takes a minute.',
        link: '/downtime?tab=check',
      });
      sent += toAsk.length;
    }
    return sent;
  }
}
