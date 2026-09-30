import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationKind, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { InboxService } from '../email/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  IntervalDto,
  NewStatementDto,
  SavePlanDto,
  SaveStatementDto,
} from './dto/productivity.dto';
import { addDaysIso, planIntervals, runningBalances, totals } from './productivity-math';

/// The label used when a plan has no categories: one number for the interval.
export const DEFAULT_LABEL = 'Patients';

const STATEMENT_SELECT = {
  id: true,
  employeeId: true,
  startDate: true,
  endDate: true,
  multiplier: true,
  paidOn: true,
  note: true,
  carriesBalance: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
  intervals: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      position: true,
      startDate: true,
      endDate: true,
      expected: true,
      counts: { orderBy: { position: 'asc' }, select: { label: true, count: true } },
    },
  },
} satisfies Prisma.ProductivityStatementSelect;

type StatementRow = Prisma.ProductivityStatementGetPayload<{ select: typeof STATEMENT_SELECT }>;

const iso = (date: Date) => date.toISOString().slice(0, 10);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

/// A statement as the screens show it: plain dates, the sums worked out.
export function presentStatement(row: StatementRow) {
  const intervals = row.intervals.map((interval) => ({
    id: interval.id,
    position: interval.position,
    startDate: iso(interval.startDate),
    endDate: iso(interval.endDate),
    expected: interval.expected,
    counts: interval.counts,
    actual: interval.counts.reduce((sum, count) => sum + count.count, 0),
  }));
  return {
    id: row.id,
    employeeId: row.employeeId,
    employee: row.employee,
    startDate: iso(row.startDate),
    endDate: iso(row.endDate),
    multiplier: row.multiplier === null ? null : Number(row.multiplier.toString()),
    paidOn: row.paidOn ? iso(row.paidOn) : null,
    note: row.note,
    carriesBalance: row.carriesBalance,
    published: row.publishedAt !== null,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    intervals,
    totals: totals(
      intervals.map((interval) => ({
        expected: interval.expected,
        counts: interval.counts.map((count) => count.count),
      })),
      row.multiplier,
    ),
  };
}

/**
 * Provider productivity (Dominguez, September 2026): managers and admins work
 * out each provider's numbers for a period — intervals, patients expected,
 * patients seen, a multiplier on the difference — and publish it, and the
 * provider can then read theirs. Nobody else's, and nothing that is not
 * published.
 *
 * The models differ from provider to provider, so nothing is compulsory: a
 * plan only supplies defaults, and a statement can be a bare count, a count
 * against a target, or one with money as well.
 */
@Injectable()
export class ProductivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  // ---- Who may use it -----------------------------------------------------

  /// Working out and publishing productivity is for the people an admin has
  /// chosen, whatever their access level: a manager has no say in it by default.
  async assertAccess(user: AuthUser) {
    if (!(await this.hasAccess(user.id))) {
      throw new ForbiddenException('You have not been given access to provider productivity.');
    }
  }

  async hasAccess(employeeId: string): Promise<boolean> {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { canManageProductivity: true },
    });
    return person?.canManageProductivity === true;
  }

  async accessList() {
    return this.prisma.employee.findMany({
      where: { canManageProductivity: true },
      select: { id: true, firstName: true, lastName: true, preferredName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async setAccess(employeeId: string, allowed: boolean) {
    await this.assertPerson(employeeId);
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { canManageProductivity: allowed },
    });
    return this.accessList();
  }

  /// The providers to choose from: people in a job role that carries the
  /// clinical forms (Provider). Provider productivity is for them alone.
  async people() {
    return this.prisma.employee.findMany({
      where: {
        employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] },
        jobRoles: { some: { jobRole: { usesClinicalForms: true } } },
      },
      select: { id: true, firstName: true, lastName: true, preferredName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  // ---- Plans -------------------------------------------------------------

  /// Everybody who has a plan, for the manager's list.
  async plans() {
    const rows = await this.prisma.productivityPlan.findMany({
      select: {
        employeeId: true,
        intervalWeeks: true,
        intervalsPerStatement: true,
        expectedPerInterval: true,
        multiplier: true,
        categories: true,
        carriesBalance: true,
        employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
    });
    return rows.map((row) => this.presentPlan(row));
  }

  async plan(employeeId: string) {
    const row = await this.prisma.productivityPlan.findUnique({
      where: { employeeId },
      select: {
        employeeId: true,
        intervalWeeks: true,
        intervalsPerStatement: true,
        expectedPerInterval: true,
        multiplier: true,
        categories: true,
        carriesBalance: true,
      },
    });
    return row ? this.presentPlan(row) : null;
  }

  async savePlan(employeeId: string, dto: SavePlanDto) {
    await this.assertProvider(employeeId);
    const categories = this.cleanLabels(dto.categories ?? []);
    const data = {
      intervalWeeks: dto.intervalWeeks,
      intervalsPerStatement: dto.intervalsPerStatement,
      expectedPerInterval: dto.expectedPerInterval ?? null,
      multiplier: dto.multiplier ?? null,
      categories,
      carriesBalance: dto.carriesBalance ?? true,
    };
    await this.prisma.productivityPlan.upsert({
      where: { employeeId },
      create: { employeeId, ...data },
      update: data,
    });
    return this.plan(employeeId);
  }

  /// The plan goes; statements already made stay exactly as they were.
  async removePlan(employeeId: string) {
    await this.prisma.productivityPlan.deleteMany({ where: { employeeId } });
    return { removed: true };
  }

  private presentPlan(row: {
    employeeId: string;
    intervalWeeks: number;
    intervalsPerStatement: number;
    expectedPerInterval: number | null;
    multiplier: Prisma.Decimal | null;
    categories: string[];
    carriesBalance: boolean;
    employee?: { id: string; firstName: string; lastName: string; preferredName: string | null };
  }) {
    return {
      employeeId: row.employeeId,
      employee: row.employee,
      intervalWeeks: row.intervalWeeks,
      intervalsPerStatement: row.intervalsPerStatement,
      expectedPerInterval: row.expectedPerInterval,
      multiplier: row.multiplier === null ? null : Number(row.multiplier.toString()),
      categories: row.categories,
      carriesBalance: row.carriesBalance,
    };
  }

  // ---- Statements (managers) --------------------------------------------

  async statements(employeeId: string) {
    await this.assertPerson(employeeId);
    return (await this.withBalances(employeeId)).reverse();
  }

  /// Every statement of one provider, oldest first, each with what was carried
  /// in, what is payable and what is still owed after it. Worked out over all of
  /// them, so a change to an early period reaches the later ones.
  private async withBalances(employeeId: string) {
    const rows = await this.prisma.productivityStatement.findMany({
      where: { employeeId },
      select: STATEMENT_SELECT,
      orderBy: { startDate: 'asc' },
    });
    const shown = rows.map(presentStatement);
    const balances = runningBalances(
      shown.map((statement) => ({
        amountCents: statement.totals.amountCents,
        carriesBalance: statement.carriesBalance,
      })),
    );
    return shown.map((statement, at) => ({ ...statement, balance: balances[at] }));
  }

  /// A new draft, laid out from the provider's plan: the right number of
  /// intervals of the right length, each with its target and a zero for every
  /// category, ready to be filled in.
  async create(dto: NewStatementDto, user: AuthUser) {
    await this.assertProvider(dto.employeeId);
    const plan = await this.plan(dto.employeeId);

    let start = dto.startDate;
    if (!start) {
      const last = await this.prisma.productivityStatement.findFirst({
        where: { employeeId: dto.employeeId },
        orderBy: { endDate: 'desc' },
        select: { endDate: true },
      });
      if (!last) throw new BadRequestException('Choose the first day of the period.');
      start = addDaysIso(iso(last.endDate), 1);
    }
    this.assertRealDay(start);

    const weeks = plan?.intervalWeeks ?? 2;
    const count = plan?.intervalsPerStatement ?? 1;
    const labels = plan && plan.categories.length > 0 ? plan.categories : [DEFAULT_LABEL];
    const laidOut = planIntervals(start, weeks, count);
    await this.assertNoOverlap(
      dto.employeeId,
      laidOut[0].startDate,
      laidOut[laidOut.length - 1].endDate,
    );

    const created = await this.prisma.productivityStatement.create({
      data: {
        employeeId: dto.employeeId,
        startDate: day(laidOut[0].startDate),
        endDate: day(laidOut[laidOut.length - 1].endDate),
        multiplier: plan?.multiplier ?? null,
        carriesBalance: plan?.carriesBalance ?? false,
        createdById: user.id,
        intervals: {
          create: laidOut.map((interval, position) => ({
            position,
            startDate: day(interval.startDate),
            endDate: day(interval.endDate),
            expected: plan?.expectedPerInterval ?? null,
            counts: {
              create: labels.map((label, place) => ({ label, position: place, count: 0 })),
            },
          })),
        },
      },
      select: STATEMENT_SELECT,
    });
    return this.one(created.id);
  }

  /// Saves the statement as the form shows it. If it is published the
  /// provider sees the change at once, so they are told.
  async save(id: string, dto: SaveStatementDto) {
    const existing = await this.findRaw(id);
    const intervals = this.cleanIntervals(dto.intervals);
    const start = intervals[0].startDate;
    const end = intervals[intervals.length - 1].endDate;
    await this.assertNoOverlap(existing.employeeId, start, end, id);

    const note = dto.note?.trim() ? dto.note.trim() : null;
    await this.prisma.$transaction(async (tx) => {
      // Replaced whole, like the form: what is shown is what is kept.
      await tx.productivityInterval.deleteMany({ where: { statementId: id } });
      return tx.productivityStatement.update({
        where: { id },
        data: {
          startDate: day(start),
          endDate: day(end),
          multiplier: dto.multiplier ?? null,
          paidOn: dto.paidOn ? day(dto.paidOn) : null,
          note,
          intervals: {
            create: intervals.map((interval, position) => ({
              position,
              startDate: day(interval.startDate),
              endDate: day(interval.endDate),
              expected: interval.expected ?? null,
              counts: {
                create: interval.counts.map((count, place) => ({
                  label: count.label,
                  position: place,
                  count: count.count,
                })),
              },
            })),
          },
        },
        select: STATEMENT_SELECT,
      });
    });
    if (existing.publishedAt) {
      await this.tell(existing.employeeId, 'updated', start, end);
    }
    return this.one(id);
  }

  async publish(id: string, user: AuthUser) {
    const existing = await this.findRaw(id);
    if (existing.publishedAt) return this.one(id);
    await this.prisma.productivityStatement.update({
      where: { id },
      data: { publishedAt: new Date(), publishedById: user.id },
    });
    await this.tell(existing.employeeId, 'ready', iso(existing.startDate), iso(existing.endDate));
    return this.one(id);
  }

  /// Back to a draft: the provider can no longer read it.
  async unpublish(id: string) {
    await this.findRaw(id);
    await this.prisma.productivityStatement.update({
      where: { id },
      data: { publishedAt: null, publishedById: null },
    });
    return this.one(id);
  }

  async remove(id: string) {
    await this.findRaw(id);
    await this.prisma.productivityStatement.delete({ where: { id } });
    return { removed: true };
  }

  // ---- The provider's own -----------------------------------------------

  /// Published statements about the signed-in person, newest first. There is
  /// no way to ask for anybody else's: the person comes from the session.
  async mine(user: AuthUser) {
    // Balances are worked out over everything, then only the published are shown.
    const all = await this.withBalances(user.id);
    return all
      .filter((statement) => statement.published)
      .map((statement) => {
        const { employee: _employee, ...rest } = statement;
        void _employee;
        return rest;
      });
  }

  /// Whether the person has anything to read, to decide whether their
  /// menu shows the screen at all.
  async hasPublished(employeeId: string): Promise<boolean> {
    const count = await this.prisma.productivityStatement.count({
      where: { employeeId, publishedAt: { not: null } },
    });
    return count > 0;
  }

  // ---- Checks -------------------------------------------------------------

  /// One statement with its balance, which depends on its neighbours.
  private async one(id: string) {
    const row = await this.findRaw(id);
    const all = await this.withBalances(row.employeeId);
    const found = all.find((statement) => statement.id === id);
    if (!found) throw new NotFoundException('That statement does not exist.');
    return found;
  }

  private async findRaw(id: string) {
    const row = await this.prisma.productivityStatement.findUnique({
      where: { id },
      select: { id: true, employeeId: true, startDate: true, endDate: true, publishedAt: true },
    });
    if (!row) throw new NotFoundException('That statement does not exist.');
    return row;
  }

  private async assertPerson(employeeId: string) {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException('That person does not exist.');
  }

  /// Plans and new statements are for people in a provider job role only.
  /// Statements already made stay readable if somebody later leaves the role.
  private async assertProvider(employeeId: string) {
    await this.assertPerson(employeeId);
    const provider = await this.prisma.employee.findFirst({
      where: { id: employeeId, jobRoles: { some: { jobRole: { usesClinicalForms: true } } } },
      select: { id: true },
    });
    if (!provider) {
      throw new BadRequestException(
        'Provider productivity is only for people in a provider job role. Add them to one under Manage → Job roles first.',
      );
    }
  }

  private assertRealDay(value: string) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${value} is not a real date.`);
    }
  }

  /// Trimmed, non-empty and unique regardless of case, in the order given.
  private cleanLabels(labels: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of labels) {
      const label = raw.trim();
      if (!label) continue;
      if (seen.has(label.toLowerCase())) {
        throw new BadRequestException(`"${label}" is listed twice.`);
      }
      seen.add(label.toLowerCase());
      out.push(label);
    }
    return out;
  }

  /// Ordered, inside themselves, and not overlapping one another.
  private cleanIntervals(input: IntervalDto[]): IntervalDto[] {
    const intervals = input.map((interval) => {
      this.assertRealDay(interval.startDate);
      this.assertRealDay(interval.endDate);
      if (interval.endDate < interval.startDate) {
        throw new BadRequestException('An interval cannot end before it starts.');
      }
      return { ...interval, counts: this.cleanCounts(interval.counts) };
    });
    intervals.sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let index = 1; index < intervals.length; index += 1) {
      if (intervals[index].startDate <= intervals[index - 1].endDate) {
        throw new BadRequestException('Two intervals cover the same days.');
      }
    }
    return intervals;
  }

  private cleanCounts(counts: { label: string; count: number }[]) {
    const seen = new Set<string>();
    return counts.map((count) => {
      const label = count.label.trim();
      if (!label) throw new BadRequestException('Every count needs a label.');
      if (seen.has(label.toLowerCase())) {
        throw new BadRequestException(`"${label}" is counted twice in one interval.`);
      }
      seen.add(label.toLowerCase());
      return { label, count: count.count };
    });
  }

  /// Two statements for one provider never cover the same day: the same
  /// patients would be counted twice.
  private async assertNoOverlap(employeeId: string, start: string, end: string, ignoreId?: string) {
    const clash = await this.prisma.productivityStatement.findFirst({
      where: {
        employeeId,
        id: ignoreId ? { not: ignoreId } : undefined,
        startDate: { lte: day(end) },
        endDate: { gte: day(start) },
      },
      select: { startDate: true, endDate: true },
    });
    if (clash) {
      throw new ConflictException(
        `That overlaps another statement (${iso(clash.startDate)} to ${iso(clash.endDate)}).`,
      );
    }
  }

  /// A bell entry with no numbers in it — the same care as every notification.
  private async tell(employeeId: string, what: 'ready' | 'updated', start: string, end: string) {
    await this.inbox.notify([employeeId], {
      kind: NotificationKind.PRODUCTIVITY,
      title:
        what === 'ready'
          ? 'Your productivity statement is ready'
          : 'Your productivity statement was updated',
      body: `${start} to ${end}`,
      link: '/my-productivity',
    });
  }
}
