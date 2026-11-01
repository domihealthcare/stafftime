import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, ExpenseStatus, NotificationKind, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { assertAPerson } from '../common/people';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { money } from '../cme/cme';
import { NotificationsService } from '../email/notifications.service';
import { named, PERSON } from '../on-call/on-call.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseApproveInput, ExpenseRequestInput } from './dto/expenses.dto';
import { expenseProblem } from './expenses';

export const EXPENSE_SELECT = {
  id: true,
  employeeId: true,
  description: true,
  kind: true,
  spentOn: true,
  amountCents: true,
  note: true,
  receiptEmailedAt: true,
  status: true,
  approvedCents: true,
  decidedAt: true,
  decisionNote: true,
  receiptReceivedAt: true,
  paidOn: true,
  paidCents: true,
  paidHow: true,
  paidNote: true,
  payDeferredUntil: true,
  createdAt: true,
  employee: { select: PERSON },
  decidedBy: { select: PERSON },
} satisfies Prisma.ExpenseRequestSelect;

type ExpenseRow = Prisma.ExpenseRequestGetPayload<{ select: typeof EXPENSE_SELECT }>;

export function presentExpense(row: ExpenseRow) {
  const { employee, decidedBy, spentOn, paidOn, payDeferredUntil, ...rest } = row;
  return {
    ...rest,
    spentOn: isoDate(spentOn),
    paidOn: paidOn ? isoDate(paidOn) : null,
    payDeferredUntil: payDeferredUntil ? isoDate(payDeferredUntil) : null,
    person: named(employee),
    decidedBy: decidedBy ? named(decidedBy) : null,
  };
}

/// "Printer ink for the front desk ($42.10, Oct 30)".
const summary = (request: { description: string; amountCents: number }) =>
  `${request.description}: ${money(request.amountCents)}`;

/**
 * Expense reimbursements (1 November 2026, Dominguez). The rules are in
 * `expenses.ts`. Anybody asks for their own and may withdraw it while it
 * waits; the people on the approvers list (`ExpenseAccessService`) approve,
 * once the emailed receipt has arrived, or decline with a reason. Never your
 * own. Each step tells the other side, on the bell and by email. Paying it
 * back is the payroll prompt's (`PayoutsService`).
 */
@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /// Somebody's own requests, newest first, and who to email the receipt to.
  async mine(actor: AuthUser) {
    const [approvers, rows] = await Promise.all([
      this.approvers(),
      this.prisma.expenseRequest.findMany({
        where: { employeeId: actor.id },
        select: EXPENSE_SELECT,
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
      }),
    ]);
    return { approvers, requests: rows.map(presentExpense) };
  }

  /// For the approvers: everybody's, newest first.
  async all() {
    const rows = await this.prisma.expenseRequest.findMany({
      select: EXPENSE_SELECT,
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });
    return { requests: rows.map(presentExpense) };
  }

  async create(dto: ExpenseRequestInput, actor: AuthUser, now = new Date()) {
    await assertAPerson(this.prisma, actor.id, 'A shared account cannot ask to be paid back.');
    const problem = expenseProblem(
      {
        description: dto.description,
        spentOn: dto.spentOn,
        amountCents: dto.amountCents,
        receiptEmailed: dto.receiptEmailed === true,
      },
      localDateIn(now, PRACTICE_ZONE),
    );
    if (problem) throw new BadRequestException(problem);
    const row = await this.prisma.expenseRequest.create({
      data: {
        employeeId: actor.id,
        description: dto.description.trim(),
        kind: dto.kind ?? null,
        spentOn: toUtcDate(dto.spentOn),
        amountCents: dto.amountCents,
        note: dto.note?.trim() || null,
        receiptEmailedAt: now,
      },
      select: EXPENSE_SELECT,
    });
    const request = presentExpense(row);
    const approvers = (await this.approvers()).filter((person) => person.id !== actor.id);
    await this.notifications.personal(
      approvers.map((person) => person.id),
      NotificationKind.EXPENSE,
      {
        title: `${request.person.name} asked to be paid back`,
        body: `${summary(request)}. They say the receipt is in your email.`,
        link: '/expenses',
      },
    );
    this.logger.log(`Expense request ${request.id} made by ${actor.id}`);
    return request;
  }

  /// Taken back by the person while it still waits.
  async withdraw(id: string, actor: AuthUser) {
    const done = await this.prisma.expenseRequest.updateMany({
      where: { id, employeeId: actor.id, status: ExpenseStatus.PENDING },
      data: { status: ExpenseStatus.WITHDRAWN },
    });
    if (done.count === 0) {
      throw new BadRequestException('Only one of yours still waiting can be withdrawn.');
    }
    return { withdrawn: true };
  }

  async approve(id: string, dto: ExpenseApproveInput, actor: AuthUser, now = new Date()) {
    if (dto.receiptReceived !== true)
      throw new BadRequestException('Tick that the receipt arrived.');
    const request = await this.requireWaiting(id, actor);
    const approvedCents = dto.approvedCents ?? request.amountCents;
    const note = dto.note?.trim() || null;
    await this.decide(id, actor, now, {
      status: ExpenseStatus.APPROVED,
      approvedCents,
      decisionNote: note,
      receiptReceivedAt: now,
    });
    const amount =
      approvedCents === request.amountCents
        ? money(approvedCents)
        : `${money(approvedCents)} of the ${money(request.amountCents)} asked`;
    await this.notifications.personal([request.employeeId], NotificationKind.EXPENSE, {
      title: 'Your expense was approved',
      body: `${request.description}: ${amount}. It is paid back separately, not on your paycheck.${
        note ? ` "${note}"` : ''
      }`,
      link: '/expenses',
    });
    return { approved: true };
  }

  async decline(id: string, reason: string, actor: AuthUser, now = new Date()) {
    const words = reason?.trim();
    if (!words || words.length < 3) throw new BadRequestException('Say why, for them.');
    const request = await this.requireWaiting(id, actor);
    await this.decide(id, actor, now, {
      status: ExpenseStatus.DECLINED,
      approvedCents: null,
      decisionNote: words,
      receiptReceivedAt: null,
    });
    await this.notifications.personal([request.employeeId], NotificationKind.EXPENSE, {
      title: 'Your expense was not approved',
      body: `${summary(request)}. "${words}"`,
      link: '/expenses',
    });
    return { declined: true };
  }

  // ---------------------------------------------------------------- helpers

  /// The people on the approvers list still here, with the email a receipt
  /// goes to.
  async approvers() {
    const people = await this.prisma.employee.findMany({
      where: { canApproveExpenses: true, employmentStatus: { not: EmploymentStatus.TERMINATED } },
      select: { ...PERSON, email: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return people.map((person) => ({ ...named(person), email: person.email }));
  }

  private async requireWaiting(id: string, actor: AuthUser) {
    const row = await this.prisma.expenseRequest.findUnique({
      where: { id },
      select: EXPENSE_SELECT,
    });
    if (!row) throw new NotFoundException('That request does not exist.');
    if (row.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('That one has already been decided.');
    }
    if (row.employeeId === actor.id) {
      throw new ForbiddenException('Ask somebody else on the list to decide your own.');
    }
    return presentExpense(row);
  }

  /// Settled only while still waiting, so two approvers cannot both decide.
  private async decide(
    id: string,
    actor: AuthUser,
    now: Date,
    data: {
      status: ExpenseStatus;
      approvedCents: number | null;
      decisionNote: string | null;
      receiptReceivedAt: Date | null;
    },
  ) {
    const done = await this.prisma.expenseRequest.updateMany({
      where: { id, status: ExpenseStatus.PENDING },
      data: { ...data, decidedById: actor.id, decidedAt: now },
    });
    if (done.count === 0) throw new BadRequestException('That one has already been decided.');
    this.logger.log(`Expense request ${id} ${data.status.toLowerCase()} by ${actor.id}`);
  }
}
