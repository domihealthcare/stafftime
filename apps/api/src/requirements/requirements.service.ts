import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { audienceWhere, forPersonWhere, WORKING } from './audience';
import { RequirementInput } from './dto/requirement.dto';
import { askedWording, nudgeDue, nudgeWording, type WaitingItem } from './nudges';

const SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  url: true,
  dueOn: true,
  everyone: true,
  closedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
  announcement: { select: { id: true, title: true } },
  resource: { select: { id: true, title: true, kind: true } },
  targets: {
    select: {
      employeeId: true,
      jobRoleId: true,
      locationId: true,
      employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
      jobRole: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.RequirementSelect;

type Row = Prisma.RequirementGetPayload<{ select: typeof SELECT }>;

const PERSON = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
} satisfies Prisma.EmployeeSelect;

/**
 * Required reading and tasks (October 2026, Dominguez): a manager or admin
 * asks a set of people to confirm they have read something — a News post, a
 * Resources page, a few lines — or to do something and say so. The person is
 * told when it is set and reminded (see `nudges.ts`) until they confirm; a
 * card on Home shows what is waiting. A nag, never a gate: nothing stops
 * anybody clocking in.
 *
 * What is kept is *that* somebody confirmed, and when — no document, no
 * signature.
 */
@Injectable()
export class RequirementsService {
  private readonly logger = new Logger(RequirementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------- the person

  /// Everything one person is asked for that is still open: what is waiting
  /// first, soonest due first, then what they have done.
  async mine(actor: AuthUser) {
    const where = await this.whereFor(actor.id);
    if (!where) return [];
    const rows = await this.prisma.requirement.findMany({
      where: { AND: [where, { closedAt: null }] },
      select: { ...SELECT, done: { where: { employeeId: actor.id }, select: { doneAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows
      // Who else was asked is the managers' business, not shown here.
      .map(({ done, ...row }) => ({
        ...view({ ...row, targets: undefined }),
        doneAt: done[0]?.doneAt ?? null,
      }))
      .sort(
        (a, b) =>
          Number(a.doneAt !== null) - Number(b.doneAt !== null) ||
          (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'),
      );
  }

  /// "I've read it" / "Done". Once; saying it again changes nothing.
  async confirm(id: string, actor: AuthUser) {
    const where = await this.whereFor(actor.id);
    const row = where
      ? await this.prisma.requirement.findFirst({
          where: { AND: [where, { id }] },
          select: { id: true, closedAt: true },
        })
      : null;
    if (!row) throw new NotFoundException('That is not something you have been asked for.');
    if (row.closedAt) throw new BadRequestException('That is no longer being asked for.');
    await this.prisma.requirementDone.upsert({
      where: { requirementId_employeeId: { requirementId: id, employeeId: actor.id } },
      create: { requirementId: id, employeeId: actor.id },
      update: {},
    });
    return { done: true };
  }

  /// How many are still waiting on this person — for the Home card's badge.
  async waitingCount(employeeId: string): Promise<number> {
    const where = await this.whereFor(employeeId);
    if (!where) return 0;
    return this.prisma.requirement.count({
      where: { AND: [where, { closedAt: null, done: { none: { employeeId } } }] },
    });
  }

  /// May this person open a resource because they have been asked to read
  /// it? A Resources page for another job role is otherwise closed to them.
  async opensResource(employeeId: string, resourceId: string): Promise<boolean> {
    const where = await this.whereFor(employeeId);
    if (!where) return false;
    const count = await this.prisma.requirement.count({
      where: { AND: [where, { resourceId, closedAt: null }] },
    });
    return count > 0;
  }

  // ---------------------------------------------------------- the managers

  /// Everything set, open first, with how far along each one is.
  async list() {
    const rows = await this.prisma.requirement.findMany({
      select: SELECT,
      orderBy: [{ closedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
    });
    const today = localDateIn(new Date(), PRACTICE_ZONE);
    return Promise.all(
      rows.map(async (row) => {
        const audience = audienceWhere(row);
        const [asked, done] = await Promise.all([
          this.prisma.employee.count({ where: audience }),
          this.prisma.employee.count({
            where: { AND: [audience, { requirementsDone: { some: { requirementId: row.id } } }] },
          }),
        ]);
        const dueOn = row.dueOn ? isoDate(row.dueOn) : null;
        return {
          ...view(row),
          asked,
          done,
          overdue: !row.closedAt && dueOn !== null && dueOn < today && done < asked,
        };
      }),
    );
  }

  /// Who has confirmed, and when, and who is still to — for one requirement.
  async progress(id: string) {
    const row = await this.require(id);
    const people = await this.prisma.employee.findMany({
      where: audienceWhere(row),
      select: {
        ...PERSON,
        requirementsDone: { where: { requirementId: id }, select: { doneAt: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return {
      requirement: view(row),
      done: people
        .filter((person) => person.requirementsDone.length > 0)
        .map(({ requirementsDone, ...person }) => ({
          ...person,
          doneAt: requirementsDone[0].doneAt,
        }))
        .sort((a, b) => a.doneAt.getTime() - b.doneAt.getTime()),
      waiting: people
        .filter((person) => person.requirementsDone.length === 0)
        .map((person) => ({
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          preferredName: person.preferredName,
        })),
    };
  }

  async create(dto: RequirementInput, actor: AuthUser) {
    const data = await this.check(dto);
    const created = await this.prisma.requirement.create({
      data: {
        ...data.fields,
        createdById: actor.id,
        targets: { create: data.targets },
      },
      select: SELECT,
    });
    const people = await this.prisma.employee.findMany({
      where: audienceWhere(created),
      select: { id: true },
    });
    await this.notifications.required(
      people.map((person) => person.id),
      askedWording(view(created)),
    );
    this.logger.log(`Requirement ${created.id} set by ${actor.id} for ${people.length} people`);
    return { ...view(created), asked: people.length, done: 0, overdue: false };
  }

  /// A change. Anybody it now reaches who it did not before is told; the
  /// rest heard when it was set.
  async update(id: string, dto: RequirementInput, actor: AuthUser) {
    const before = await this.require(id);
    const data = await this.check(dto);
    const hadIt = await this.prisma.employee.findMany({
      where: audienceWhere(before),
      select: { id: true },
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.requirementTarget.deleteMany({ where: { requirementId: id } });
      return tx.requirement.update({
        where: { id },
        data: { ...data.fields, targets: { create: data.targets } },
        select: SELECT,
      });
    });
    if (!updated.closedAt) {
      const known = new Set(hadIt.map((person) => person.id));
      const now = await this.prisma.employee.findMany({
        where: audienceWhere(updated),
        select: { id: true },
      });
      await this.notifications.required(
        now.map((person) => person.id).filter((personId) => !known.has(personId)),
        askedWording(view(updated)),
      );
    }
    this.logger.log(`Requirement ${id} changed by ${actor.id}`);
    return view(updated);
  }

  /// Stop asking — or ask again. What was confirmed stays.
  async setClosed(id: string, closed: boolean, actor: AuthUser) {
    await this.require(id);
    await this.prisma.requirement.update({
      where: { id },
      data: { closedAt: closed ? new Date() : null },
    });
    this.logger.log(`Requirement ${id} ${closed ? 'closed' : 'reopened'} by ${actor.id}`);
    return { closed };
  }

  async remove(id: string, actor: AuthUser) {
    await this.require(id);
    await this.prisma.requirement.delete({ where: { id } });
    this.logger.log(`Requirement ${id} removed by ${actor.id}`);
    return { removed: true };
  }

  /// "Remind them now": everybody still to do it, at once. Counts as their
  /// reminder for today, so the timer does not send a second.
  async remindNow(id: string, actor: AuthUser) {
    const row = await this.require(id);
    if (row.closedAt) throw new BadRequestException('That is no longer being asked for.');
    const waiting = await this.prisma.employee.findMany({
      where: { AND: [audienceWhere(row), { requirementsDone: { none: { requirementId: id } } }] },
      select: { id: true },
    });
    const today = toUtcDate(localDateIn(new Date(), PRACTICE_ZONE));
    for (const person of waiting) {
      await this.prisma.requirementNudge.upsert({
        where: { requirementId_employeeId: { requirementId: id, employeeId: person.id } },
        create: { requirementId: id, employeeId: person.id, lastOn: today },
        update: { lastOn: today, count: { increment: 1 } },
      });
    }
    const item = view(row);
    await this.notifications.required(
      waiting.map((person) => person.id),
      nudgeWording([
        {
          kind: item.kind,
          title: item.title,
          dueOn: item.dueOn,
          stage:
            item.dueOn && item.dueOn < localDateIn(new Date(), PRACTICE_ZONE)
              ? 'OVERDUE'
              : 'WAITING',
        },
      ]),
    );
    this.logger.log(`Requirement ${id}: ${waiting.length} reminded by ${actor.id}`);
    return { reminded: waiting.length };
  }

  // ------------------------------------------------------------ the timer

  /// The reminders due today, one message per person (see `nudges.ts`). Run
  /// by the five-minute timer and, as a fallback, the nightly job.
  async nudge(now: Date = new Date()): Promise<number> {
    const today = localDateIn(now, PRACTICE_ZONE);
    const open = await this.prisma.requirement.findMany({
      where: { closedAt: null },
      select: { ...SELECT, nudges: { select: { employeeId: true, lastOn: true } } },
    });
    const byPerson = new Map<string, WaitingItem[]>();
    for (const row of open) {
      const createdOn = localDateIn(row.createdAt, PRACTICE_ZONE);
      const dueOn = row.dueOn ? isoDate(row.dueOn) : null;
      const waiting = await this.prisma.employee.findMany({
        where: {
          AND: [audienceWhere(row), { requirementsDone: { none: { requirementId: row.id } } }],
        },
        select: { id: true },
      });
      const last = new Map(row.nudges.map((n) => [n.employeeId, isoDate(n.lastOn)]));
      for (const person of waiting) {
        const lastOn = last.get(person.id) ?? null;
        const stage = nudgeDue({ createdOn, dueOn, lastOn, today });
        if (!stage) continue;
        if (!(await this.claim(row.id, person.id, lastOn, today))) continue;
        const theirs = byPerson.get(person.id) ?? [];
        theirs.push({ kind: row.kind, title: row.title, dueOn, stage });
        byPerson.set(person.id, theirs);
      }
    }
    for (const [employeeId, items] of byPerson) {
      await this.notifications.requiredReminder(employeeId, nudgeWording(items));
    }
    if (byPerson.size > 0) this.logger.log(`Reminded ${byPerson.size} people about required items`);
    return byPerson.size;
  }

  /// Records today's reminder; false when another run got there first.
  private async claim(
    requirementId: string,
    employeeId: string,
    lastOn: string | null,
    today: string,
  ): Promise<boolean> {
    const day = toUtcDate(today);
    if (lastOn === null) {
      try {
        await this.prisma.requirementNudge.create({
          data: { requirementId, employeeId, lastOn: day },
        });
        return true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return false;
        }
        throw error;
      }
    }
    const result = await this.prisma.requirementNudge.updateMany({
      where: { requirementId, employeeId, lastOn: { lt: day } },
      data: { lastOn: day, count: { increment: 1 } },
    });
    return result.count === 1;
  }

  // ---------------------------------------------------------------- helpers

  /// The requirements one person is asked for, or null if they no longer work here.
  private async whereFor(employeeId: string): Promise<Prisma.RequirementWhereInput | null> {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        employmentStatus: true,
        jobRoles: { select: { jobRoleId: true } },
        locations: { select: { locationId: true } },
      },
    });
    if (!person || !WORKING.in.includes(person.employmentStatus)) return null;
    return forPersonWhere(
      employeeId,
      person.jobRoles.map((row) => row.jobRoleId),
      person.locations.map((row) => row.locationId),
    );
  }

  private async require(id: string): Promise<Row> {
    const row = await this.prisma.requirement.findUnique({ where: { id }, select: SELECT });
    if (!row) throw new NotFoundException('That is no longer on the list.');
    return row;
  }

  private async check(dto: RequirementInput) {
    const text = (value: string | null | undefined) => value?.trim() || null;
    const url = checkUrl(text(dto.url));
    const targets = {
      employeeIds: [...new Set(dto.targets?.employeeIds ?? [])],
      jobRoleIds: [...new Set(dto.targets?.jobRoleIds ?? [])],
      locationIds: [...new Set(dto.targets?.locationIds ?? [])],
    };
    if (!dto.everyone) {
      const chosen =
        targets.employeeIds.length + targets.jobRoleIds.length + targets.locationIds.length;
      if (chosen === 0) {
        throw new BadRequestException(
          'Choose who it is for: everyone, or some people, job roles or offices.',
        );
      }
      const [people, roles, offices] = await Promise.all([
        this.prisma.employee.count({ where: { id: { in: targets.employeeIds } } }),
        this.prisma.jobRole.count({ where: { id: { in: targets.jobRoleIds } } }),
        this.prisma.location.count({ where: { id: { in: targets.locationIds } } }),
      ]);
      if (
        people !== targets.employeeIds.length ||
        roles !== targets.jobRoleIds.length ||
        offices !== targets.locationIds.length
      ) {
        throw new BadRequestException('Somebody or something chosen is no longer in the app.');
      }
    }
    if (dto.announcementId) {
      const post = await this.prisma.announcement.count({ where: { id: dto.announcementId } });
      if (!post) throw new BadRequestException('That News post is no longer there.');
    }
    if (dto.resourceId) {
      const resource = await this.prisma.resource.count({ where: { id: dto.resourceId } });
      if (!resource) throw new BadRequestException('That resource is no longer there.');
    }
    return {
      fields: {
        kind: dto.kind,
        title: dto.title.trim(),
        body: text(dto.body),
        url,
        announcementId: dto.announcementId || null,
        resourceId: dto.resourceId || null,
        dueOn: dto.dueOn ? toUtcDate(dto.dueOn) : null,
        everyone: dto.everyone,
      },
      targets: dto.everyone
        ? []
        : [
            ...targets.employeeIds.map((employeeId) => ({ employeeId })),
            ...targets.jobRoleIds.map((jobRoleId) => ({ jobRoleId })),
            ...targets.locationIds.map((locationId) => ({ locationId })),
          ],
    };
  }
}

/// What a screen needs: the due date as a plain date, who it is for in words.
function view(row: Omit<Row, 'targets'> & Partial<Pick<Row, 'targets'>>) {
  const { targets, ...rest } = row;
  return {
    ...rest,
    dueOn: row.dueOn ? isoDate(row.dueOn) : null,
    targets: targets
      ? {
          employees: targets.flatMap((t) => (t.employee ? [t.employee] : [])),
          jobRoles: targets.flatMap((t) => (t.jobRole ? [t.jobRole] : [])),
          locations: targets.flatMap((t) => (t.location ? [t.location] : [])),
        }
      : undefined,
  };
}

/// A link to read or do it at, or null. Only a real https address is kept.
function checkUrl(value: string | null): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException(
      'That link is not a web address. Paste the whole link, starting https://',
    );
  }
  if (url.protocol !== 'https:' || /\s/.test(value)) {
    throw new BadRequestException('A link has to start with https://');
  }
  return url.toString();
}
