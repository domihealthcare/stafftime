import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClosingItemKind, Prisma } from '@prisma/client';
import { toUtcDate } from '../common/util/calendar-date.util';
import { isoWeekdayOf, localDateIn } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CHECKLISTS } from './default-checklists';
import {
  ClosingSubmissionDto,
  CreateItemDto,
  CreateSectionDto,
  UpdateItemDto,
  UpdateSectionDto,
} from './dto/closing.dto';

export interface ApplicableItem {
  id: string;
  kind: ClosingItemKind;
  text: string;
  target: number | null;
}

export interface ApplicableSection {
  id: string;
  title: string;
  isPosition: boolean;
  jobRole: string;
  items: ApplicableItem[];
}

/// The entry being closed, as much of it as a closing checklist needs.
export interface ClosingEntry {
  id: string;
  employeeId: string;
  locationId: string;
  clockInAt: Date;
}

const TEMPLATE_INCLUDE = {
  closingSections: {
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { location: { select: { id: true, name: true } } },
      },
    },
  },
} satisfies Prisma.JobRoleInclude;

/**
 * Closing checklists: what Front Desk and Medical Assistants confirm when they
 * clock out, the record of each one, and the restock list their supply ticks
 * build.
 *
 * The one promise that shapes everything here: **a checklist never stops
 * anybody clocking out.** Unticked tasks and short counts are recorded and
 * flagged to managers, a skipped checklist is recorded as skipped, and a
 * failure writing any of it is logged and swallowed — the same rule the app
 * already applies to a clock-out it cannot verify.
 */
@Injectable()
export class ClosingService {
  private readonly logger = new Logger(ClosingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- at clock-out

  /**
   * The checklist this person gets when closing a punch at this office on this
   * day: every section of every job role they hold, with items for other days
   * of the week or other offices left out. Empty for anybody whose roles have
   * no checklist — they clock out as before.
   */
  async applicableFor(
    employeeId: string,
    locationId: string,
    at: Date = new Date(),
  ): Promise<ApplicableSection[]> {
    const [location, roles] = await Promise.all([
      this.prisma.location.findUnique({ where: { id: locationId }, select: { timezone: true } }),
      this.prisma.jobRole.findMany({
        where: { members: { some: { employeeId } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: TEMPLATE_INCLUDE,
      }),
    ]);
    const weekday = isoWeekdayOf(localDateIn(at, location?.timezone ?? 'America/New_York'));

    const sections: ApplicableSection[] = [];
    for (const role of roles) {
      for (const section of role.closingSections) {
        const items = section.items
          .filter((item) => item.weekdays.length === 0 || item.weekdays.includes(weekday))
          .filter((item) => !item.locationId || item.locationId === locationId)
          .map((item) => ({ id: item.id, kind: item.kind, text: item.text, target: item.target }));
        if (items.length > 0) {
          sections.push({
            id: section.id,
            title: section.title,
            isPosition: section.isPosition,
            jobRole: role.name,
            items,
          });
        }
      }
    }
    return sections;
  }

  /// The checklist for somebody's open punch, for the Clock screen to show
  /// before they clock out. Empty when they are not clocked in.
  async forOpenPunch(employeeId: string): Promise<{ sections: ApplicableSection[] }> {
    const open = await this.prisma.timeEntry.findFirst({
      where: { employeeId, clockOutAt: null },
      select: { locationId: true },
    });
    return { sections: open ? await this.applicableFor(employeeId, open.locationId) : [] };
  }

  /**
   * Records the checklist for a punch that has just been closed. Never throws:
   * the clock-out has already happened and must stand.
   */
  async recordForClockOut(
    entry: ClosingEntry,
    submission: ClosingSubmissionDto | undefined,
    askedById?: string,
  ): Promise<void> {
    try {
      await this.record(entry, submission, askedById);
    } catch (error: unknown) {
      this.logger.error(
        `Could not record the closing checklist for punch ${entry.id}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async record(
    entry: ClosingEntry,
    submission: ClosingSubmissionDto | undefined,
    askedById?: string,
  ): Promise<void> {
    const sections = await this.applicableFor(entry.employeeId, entry.locationId);
    if (sections.length === 0) return;

    const location = await this.prisma.location.findUniqueOrThrow({
      where: { id: entry.locationId },
      select: { timezone: true },
    });
    const day = toUtcDate(localDateIn(entry.clockInAt, location.timezone));
    const submitted = Boolean(submission) && !submission?.skipped;

    const chosen = new Set(submitted ? (submission?.positions ?? []) : []);
    const done = new Set(submission?.done ?? []);
    const counts = new Map((submission?.counts ?? []).map((c) => [c.itemId, c.value]));
    const needed = new Set(submitted ? (submission?.needed ?? []) : []);

    // A position section only counts when they worked it; the rest always do.
    const inPlay = sections.filter((section) => !section.isPosition || chosen.has(section.id));

    let gaps = 0;
    let order = 0;
    const answers: Prisma.ClosingAnswerCreateManyRecordInput[] = [];
    const supplies: ApplicableItem[] = [];
    for (const section of inPlay) {
      for (const item of section.items) {
        if (item.kind === ClosingItemKind.REMINDER) continue;
        const base = {
          itemId: item.id,
          section: section.title,
          kind: item.kind,
          text: item.text,
          target: item.target,
          sortOrder: (order += 1),
        };
        if (item.kind === ClosingItemKind.TASK) {
          const ticked = submitted && done.has(item.id);
          if (!ticked) gaps += 1;
          answers.push({ ...base, done: ticked });
        } else if (item.kind === ClosingItemKind.COUNT) {
          const value = submitted ? counts.get(item.id) : undefined;
          if (value === undefined || (item.target !== null && value < item.target)) gaps += 1;
          answers.push({ ...base, count: value ?? null });
        } else {
          const want = needed.has(item.id);
          answers.push({ ...base, needed: want });
          if (want) supplies.push(item);
        }
      }
    }

    await this.prisma.closingRecord.create({
      data: {
        timeEntryId: entry.id,
        employeeId: entry.employeeId,
        locationId: entry.locationId,
        day,
        positions: sections
          .filter((section) => section.isPosition && chosen.has(section.id))
          .map((section) => section.title),
        submitted,
        gaps,
        answers: { createMany: { data: answers } },
      },
    });

    for (const item of supplies) {
      await this.askFor(entry.locationId, item, askedById ?? entry.employeeId);
    }
    this.logger.log(
      `Closing checklist for punch ${entry.id}: ${submitted ? `${gaps} gap(s)` : 'not filled in'}, ${supplies.length} supply request(s)`,
    );
  }

  /// One open line per supply per office: asking again counts, it does not
  /// add a second line to order from.
  private async askFor(locationId: string, item: ApplicableItem, askedById: string) {
    const open = await this.prisma.supplyRequest.findFirst({
      where: { locationId, itemId: item.id, orderedAt: null },
      select: { id: true },
    });
    if (open) {
      await this.prisma.supplyRequest.update({
        where: { id: open.id },
        data: { timesAsked: { increment: 1 }, lastAskedAt: new Date(), lastAskedById: askedById },
      });
    } else {
      await this.prisma.supplyRequest.create({
        data: { locationId, itemId: item.id, text: item.text, lastAskedById: askedById },
      });
    }
  }

  // ---------------------------------------------------------------- managers

  /// Every clock-out checklist on one working day, fullest problems first.
  async day(date: string, locationId?: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new BadRequestException('Give a date as YYYY-MM-DD.');
    const records = await this.prisma.closingRecord.findMany({
      where: { day: toUtcDate(date), locationId },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        employee: { select: { id: true, firstName: true, preferredName: true, lastName: true } },
        location: { select: { id: true, name: true } },
        timeEntry: { select: { clockInAt: true, clockOutAt: true } },
        answers: { orderBy: { sortOrder: 'asc' } },
      },
    });
    return records.map((record) => ({
      id: record.id,
      day: record.day.toISOString().slice(0, 10),
      employee: record.employee,
      location: record.location,
      clockInAt: record.timeEntry.clockInAt,
      clockOutAt: record.timeEntry.clockOutAt,
      positions: record.positions,
      submitted: record.submitted,
      gaps: record.gaps,
      answers: record.answers.map((answer) => ({
        id: answer.id,
        section: answer.section,
        kind: answer.kind,
        text: answer.text,
        target: answer.target,
        done: answer.done,
        count: answer.count,
        needed: answer.needed,
      })),
    }));
  }

  /// The restock list: what is still to order, per office, and what was
  /// ordered in the last fortnight so a second order is not placed by mistake.
  async supplies() {
    const since = new Date(Date.now() - 14 * 24 * 3_600_000);
    const rows = await this.prisma.supplyRequest.findMany({
      where: { OR: [{ orderedAt: null }, { orderedAt: { gte: since } }] },
      orderBy: [{ orderedAt: { sort: 'desc', nulls: 'first' } }, { firstAskedAt: 'asc' }],
      include: { location: { select: { id: true, name: true } } },
    });
    const people = await this.namesFor(
      rows
        .flatMap((row) => [row.lastAskedById, row.orderedById])
        .filter((id): id is string => !!id),
    );
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      location: row.location,
      firstAskedAt: row.firstAskedAt,
      lastAskedAt: row.lastAskedAt,
      timesAsked: row.timesAsked,
      lastAskedBy: row.lastAskedById ? (people.get(row.lastAskedById) ?? null) : null,
      orderedAt: row.orderedAt,
      orderedBy: row.orderedById ? (people.get(row.orderedById) ?? null) : null,
    }));
  }

  async markOrdered(id: string, managerId: string) {
    const row = await this.prisma.supplyRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That request was not found.');
    if (row.orderedAt) return { ordered: true };
    await this.prisma.supplyRequest.update({
      where: { id },
      data: { orderedAt: new Date(), orderedById: managerId },
    });
    return { ordered: true };
  }

  private async namesFor(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const people = await this.prisma.employee.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, firstName: true, preferredName: true, lastName: true },
    });
    return new Map(people.map((p) => [p.id, `${p.preferredName ?? p.firstName} ${p.lastName}`]));
  }

  // ---------------------------------------------------------------- editing

  /// Every job role with its checklist, including roles with none yet.
  templates() {
    return this.prisma.jobRole.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, colour: true, ...TEMPLATE_INCLUDE },
    });
  }

  async createSection(dto: CreateSectionDto) {
    const role = await this.prisma.jobRole.findUnique({ where: { id: dto.jobRoleId } });
    if (!role) throw new NotFoundException('That job role was not found.');
    const last = await this.prisma.closingSection.findFirst({
      where: { jobRoleId: dto.jobRoleId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.closingSection.create({
      data: {
        jobRoleId: dto.jobRoleId,
        title: dto.title.trim(),
        isPosition: dto.isPosition ?? false,
        sortOrder: (last?.sortOrder ?? 0) + 10,
      },
    });
  }

  async updateSection(id: string, dto: UpdateSectionDto) {
    await this.sectionOrThrow(id);
    return this.prisma.closingSection.update({
      where: { id },
      data: { title: dto.title?.trim(), isPosition: dto.isPosition },
    });
  }

  async removeSection(id: string) {
    await this.sectionOrThrow(id);
    await this.prisma.closingSection.delete({ where: { id } });
    return { deleted: true };
  }

  async createItem(dto: CreateItemDto) {
    await this.sectionOrThrow(dto.sectionId);
    await this.assertLocation(dto.locationId);
    const last = await this.prisma.closingItem.findFirst({
      where: { sectionId: dto.sectionId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.closingItem.create({
      data: {
        sectionId: dto.sectionId,
        kind: dto.kind,
        text: dto.text.trim(),
        target: dto.kind === ClosingItemKind.COUNT ? (dto.target ?? null) : null,
        weekdays: normaliseWeekdays(dto.weekdays),
        locationId: dto.locationId ?? null,
        sortOrder: (last?.sortOrder ?? 0) + 10,
      },
    });
  }

  async updateItem(id: string, dto: UpdateItemDto) {
    const item = await this.prisma.closingItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('That item was not found.');
    await this.assertLocation(dto.locationId);
    const kind = dto.kind ?? item.kind;
    return this.prisma.closingItem.update({
      where: { id },
      data: {
        kind,
        text: dto.text?.trim(),
        target:
          kind === ClosingItemKind.COUNT
            ? dto.target === undefined
              ? item.target
              : dto.target
            : null,
        weekdays: dto.weekdays === undefined ? undefined : normaliseWeekdays(dto.weekdays),
        locationId: dto.locationId === undefined ? undefined : dto.locationId,
      },
    });
  }

  async removeItem(id: string) {
    const item = await this.prisma.closingItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('That item was not found.');
    await this.prisma.closingItem.delete({ where: { id } });
    return { deleted: true };
  }

  /// Swaps a section with its neighbour within the same role.
  async moveSection(id: string, direction: 'up' | 'down') {
    const section = await this.sectionOrThrow(id);
    const siblings = await this.prisma.closingSection.findMany({
      where: { jobRoleId: section.jobRoleId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    await this.swap(siblings, id, direction, (rowId, sortOrder) =>
      this.prisma.closingSection.update({ where: { id: rowId }, data: { sortOrder } }),
    );
    return { moved: true };
  }

  /// Swaps an item with its neighbour within the same section.
  async moveItem(id: string, direction: 'up' | 'down') {
    const item = await this.prisma.closingItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('That item was not found.');
    const siblings = await this.prisma.closingItem.findMany({
      where: { sectionId: item.sectionId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    await this.swap(siblings, id, direction, (rowId, sortOrder) =>
      this.prisma.closingItem.update({ where: { id: rowId }, data: { sortOrder } }),
    );
    return { moved: true };
  }

  /// Renumbers the list in its new order: gaps of ten, so the order is always
  /// exactly what is on screen whatever state the numbers were in before.
  private async swap(
    siblings: { id: string }[],
    id: string,
    direction: 'up' | 'down',
    write: (id: string, sortOrder: number) => Prisma.PrismaPromise<unknown>,
  ) {
    const ids = siblings.map((row) => row.id);
    const from = ids.indexOf(id);
    const to = direction === 'up' ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await this.prisma.$transaction(ids.map((rowId, index) => write(rowId, (index + 1) * 10)));
  }

  private async sectionOrThrow(id: string) {
    const section = await this.prisma.closingSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('That section was not found.');
    return section;
  }

  private async assertLocation(locationId: string | null | undefined) {
    if (!locationId) return;
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException('That office was not found.');
  }

  // ---------------------------------------------------------------- seeding

  /**
   * Puts the starting checklists back for Front Desk and Medical Assistant —
   * for the seed, which always gives a known starting point. Never called by
   * the running app: once live, the checklists are the managers'.
   */
  static async resetToDefaults(prisma: PrismaService | Prisma.TransactionClient) {
    const locations = await prisma.location.findMany({ select: { id: true, slug: true } });
    const slugToId = new Map(locations.map((l) => [l.slug, l.id]));
    for (const [roleName, sections] of Object.entries(DEFAULT_CHECKLISTS)) {
      const role = await prisma.jobRole.findUnique({ where: { name: roleName } });
      if (!role) continue;
      await prisma.closingSection.deleteMany({ where: { jobRoleId: role.id } });
      for (const [sectionIndex, section] of sections.entries()) {
        await prisma.closingSection.create({
          data: {
            jobRoleId: role.id,
            title: section.title,
            isPosition: section.isPosition ?? false,
            sortOrder: sectionIndex * 10,
            items: {
              create: section.items.map((item, itemIndex) => ({
                kind: item.kind,
                text: item.text,
                target: item.target ?? null,
                weekdays: item.weekdays ?? [],
                locationId: item.location ? (slugToId.get(item.location) ?? null) : null,
                sortOrder: itemIndex * 10,
              })),
            },
          },
        });
      }
    }
  }
}

function normaliseWeekdays(days: number[] | undefined): number[] {
  return [...new Set(days ?? [])].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
}
