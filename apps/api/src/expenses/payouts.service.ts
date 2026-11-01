import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationKind, ReimbursementMethod, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { askedCents, money } from '../cme/cme';
import { NotificationsService } from '../email/notifications.service';
import { named, PERSON } from '../on-call/on-call.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutKind, PayoutPaidInput } from './dto/expenses.dto';
import { METHOD_WORDS, nextPayrollFrom } from './expenses';
import { unpaidCme, unpaidExpenses } from './unpaid';

export interface Payout {
  kind: PayoutKind;
  id: string;
  employeeId: string;
  person: ReturnType<typeof named>;
  /// "Printer ink for the front desk", or the CME activity's name.
  what: string;
  /// What was approved, to pay.
  amountCents: number;
  /// When it was approved (an ISO time), if known.
  approvedAt: string | null;
  /// Put off with "Not this time" until this day (YYYY-MM-DD), else null.
  deferredUntil: string | null;
  /// Where it is decided: the Expenses or CME screen.
  link: string;
}

/**
 * The payroll prompt (1 November 2026, Dominguez: reimbursements "should not
 * be part of payroll - though should prompt the person running payroll
 * (usually angelica d) that there is an unpaid reimbursement (which she should
 * have the option to defer or it was addressed (i.e. via paper check for
 * instance)) this should be for CME as well"). Lists every approved expense
 * and CME request not paid back yet; **Paid** records the day, amount and how
 * (and tells the person), **Not this time** puts it off until the next
 * payroll (`nextPayrollFrom`), and **Bring it back** undoes that. Open to
 * managers and admins (who run the export) and the expense approvers. Never
 * your own.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /// Managers and admins, and the people on the expense approvers list.
  async allowed(actor: AuthUser): Promise<boolean> {
    if (actor.role === Role.MANAGER || actor.role === Role.ADMIN) return true;
    const person = await this.prisma.employee.findUnique({
      where: { id: actor.id },
      select: { canApproveExpenses: true },
    });
    return person?.canApproveExpenses === true;
  }

  /// Due now, and put off; with the day "Not this time" would put one off to.
  async list(now = new Date()) {
    const today = localDateIn(now, PRACTICE_ZONE);
    const [expenses, cme, anchor] = await Promise.all([
      this.prisma.expenseRequest.findMany({
        where: unpaidExpenses(),
        select: {
          id: true,
          employeeId: true,
          description: true,
          amountCents: true,
          approvedCents: true,
          decidedAt: true,
          payDeferredUntil: true,
          employee: { select: PERSON },
        },
        orderBy: { decidedAt: 'asc' },
      }),
      this.prisma.cmeRequest.findMany({
        where: unpaidCme(),
        select: {
          id: true,
          employeeId: true,
          title: true,
          registrationCents: true,
          travelCents: true,
          lodgingCents: true,
          otherCents: true,
          approvedCents: true,
          decidedAt: true,
          payDeferredUntil: true,
          employee: { select: PERSON },
        },
        orderBy: { decidedAt: 'asc' },
      }),
      this.anchor(),
    ]);
    const payouts: Payout[] = [
      ...expenses.map((row) => ({
        kind: 'expense' as const,
        id: row.id,
        employeeId: row.employeeId,
        person: named(row.employee),
        what: row.description,
        amountCents: row.approvedCents ?? row.amountCents,
        approvedAt: row.decidedAt?.toISOString() ?? null,
        deferredUntil: row.payDeferredUntil ? isoDate(row.payDeferredUntil) : null,
        link: '/expenses',
      })),
      ...cme.map((row) => ({
        kind: 'cme' as const,
        id: row.id,
        employeeId: row.employeeId,
        person: named(row.employee),
        what: `CME: ${row.title}`,
        amountCents: row.approvedCents ?? askedCents(row),
        approvedAt: row.decidedAt?.toISOString() ?? null,
        deferredUntil: row.payDeferredUntil ? isoDate(row.payDeferredUntil) : null,
        link: '/cme',
      })),
    ].sort((a, b) => (a.approvedAt ?? '').localeCompare(b.approvedAt ?? ''));
    const isDue = (payout: Payout) => !payout.deferredUntil || payout.deferredUntil <= today;
    return {
      due: payouts.filter(isDue),
      deferred: payouts.filter((payout) => !isDue(payout)),
      nextPayroll: nextPayrollFrom(today, anchor),
    };
  }

  /// Paid back outside payroll. The person is told.
  async paid(
    kind: PayoutKind,
    id: string,
    dto: PayoutPaidInput,
    actor: AuthUser,
    now = new Date(),
  ) {
    if (dto.paidOn > localDateIn(now, PRACTICE_ZONE)) {
      throw new BadRequestException('The payment date cannot be in the future.');
    }
    const how = METHOD_WORDS[dto.how ?? ReimbursementMethod.OTHER];
    const note = dto.note?.trim() || null;
    const target = await this.find(kind, id, actor);
    const done =
      kind === 'expense'
        ? await this.prisma.expenseRequest.updateMany({
            where: { id, ...unpaidExpenses() },
            data: {
              paidOn: toUtcDate(dto.paidOn),
              paidCents: dto.paidCents,
              paidHow: dto.how,
              paidNote: note,
              payDeferredUntil: null,
            },
          })
        : await this.prisma.cmeRequest.updateMany({
            where: { id, ...unpaidCme() },
            data: {
              reimbursedOn: toUtcDate(dto.paidOn),
              reimbursedCents: dto.paidCents,
              reimbursedHow: dto.how,
              reimbursedNote: note,
              payDeferredUntil: null,
            },
          });
    if (done.count === 0)
      throw new BadRequestException('That reimbursement has already been paid.');
    await this.notifications.personal(
      [target.employeeId],
      kind === 'expense' ? NotificationKind.EXPENSE : NotificationKind.CME,
      {
        title:
          kind === 'expense'
            ? 'Your expense reimbursement has been paid'
            : 'Your CME reimbursement has been paid',
        body: `${target.what}: ${money(dto.paidCents)}, by ${how}.`,
        link: kind === 'expense' ? '/expenses' : '/cme',
      },
    );
    this.logger.log(`${kind} ${id} paid back (${dto.how}) by ${actor.id}`);
    return { paid: true };
  }

  /// "Not this time": left alone until the next payroll.
  async defer(kind: PayoutKind, id: string, actor: AuthUser, now = new Date()) {
    await this.find(kind, id, actor);
    const until = nextPayrollFrom(localDateIn(now, PRACTICE_ZONE), await this.anchor());
    await this.setDeferred(kind, id, toUtcDate(until));
    this.logger.log(`${kind} ${id} put off until ${until} by ${actor.id}`);
    return { deferredUntil: until };
  }

  /// Back on the list now.
  async undefer(kind: PayoutKind, id: string, actor: AuthUser) {
    await this.find(kind, id, actor);
    await this.setDeferred(kind, id, null);
    return { deferredUntil: null };
  }

  // ---------------------------------------------------------------- helpers

  private async anchor(): Promise<string | null> {
    const settings = await this.prisma.practiceSettings.findFirst({
      select: { payPeriodStart: true },
    });
    return settings?.payPeriodStart ? isoDate(settings.payPeriodStart) : null;
  }

  /// An approved one not paid back yet, and not the actor's own.
  private async find(kind: PayoutKind, id: string, actor: AuthUser) {
    const row =
      kind === 'expense'
        ? await this.prisma.expenseRequest
            .findFirst({
              where: { id, ...unpaidExpenses() },
              select: { employeeId: true, description: true },
            })
            .then((found) => found && { employeeId: found.employeeId, what: found.description })
        : await this.prisma.cmeRequest
            .findFirst({
              where: { id, ...unpaidCme() },
              select: { employeeId: true, title: true },
            })
            .then((found) => found && { employeeId: found.employeeId, what: found.title });
    if (!row) throw new NotFoundException('That reimbursement is not pending payment.');
    if (row.employeeId === actor.id) {
      throw new ForbiddenException('Another approver must record your own reimbursement.');
    }
    return row;
  }

  private async setDeferred(kind: PayoutKind, id: string, until: Date | null) {
    if (kind === 'expense') {
      await this.prisma.expenseRequest.update({ where: { id }, data: { payDeferredUntil: until } });
    } else {
      await this.prisma.cmeRequest.update({ where: { id }, data: { payDeferredUntil: until } });
    }
  }
}
