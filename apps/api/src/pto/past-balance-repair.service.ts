import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PtoStatus, PtoType } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate } from '../common/util/calendar-date.util';
import { practiceToday } from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { countedDateList } from './counted-days';
import { describeSplit } from './describe-time-off';
import { ApprovedToWalk, PastBalanceSplit, walkApproved } from './past-balance-split';
import { PtoPolicyService, TYPE_BUCKET } from './pto-policy.service';
import { TimeOffDaysService } from './time-off-days.service';

/// The kinds that draw on a balance.
const DRAWING_TYPES = (Object.keys(TYPE_BUCKET) as PtoType[]).filter(
  (type) => TYPE_BUCKET[type] !== null,
);

/// One request approved before the split existed, and what putting it right does.
export interface PastBalanceFix {
  id: string;
  employee: { id: string; firstName: string; lastName: string; preferredName: string | null };
  type: PtoType;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  paidDays: number;
  unpaidDays: number;
  /// The paid part's dates, or null when all of it becomes Unpaid.
  paid: { startDate: string; endDate: string } | null;
  unpaid: { startDate: string; endDate: string };
}

interface Found {
  request: {
    id: string;
    employeeId: string;
    type: PtoType;
    startDate: Date;
    endDate: Date;
    isHalfDay: boolean;
    employee: PastBalanceFix['employee'];
  };
  split: PastBalanceSplit;
}

/**
 * Putting right the time off approved before 2 November 2026, when a request
 * past the balance was approved whole, so "Approved" hid the unpaid days
 * (Dominguez: "fix the old approved requests that went past the balance").
 *
 * For this policy year and later only: earlier years' payroll is done and
 * their balances have started again. Each person's approved requests are
 * walked in date order (`walkApproved`), the days still covered staying as
 * they were and the rest becoming a separate Unpaid part, as approving does
 * now. Time off an admin recorded, or one a manager has changed since, is a
 * deliberate choice: it uses up its days but is never split. A manager sees
 * the list before anything changes; each person is told, as for an edit.
 */
@Injectable()
export class PastBalanceRepairService {
  private readonly logger = new Logger(PastBalanceRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PtoPolicyService,
    private readonly days: TimeOffDaysService,
    private readonly notifications: NotificationsService,
  ) {}

  /// What would change, soonest first. Never the manager's own time off.
  async list(actor: AuthUser): Promise<PastBalanceFix[]> {
    const found = await this.find();
    return found
      .filter(({ request }) => request.employeeId !== actor.id)
      .map(({ request, split }) => ({
        id: request.id,
        employee: request.employee,
        type: request.type,
        startDate: isoDate(request.startDate),
        endDate: isoDate(request.endDate),
        isHalfDay: request.isHalfDay,
        paidDays: split.paidDays,
        unpaidDays: split.unpaidDays,
        paid: split.paid
          ? { startDate: isoDate(split.paid.startDate), endDate: isoDate(split.paid.endDate) }
          : null,
        unpaid: {
          startDate: isoDate(split.unpaid.startDate),
          endDate: isoDate(split.unpaid.endDate),
        },
      }));
  }

  /**
   * Splits the ones asked for, worked out afresh, so a request changed since
   * the list was shown is judged as it is now. Each in its own transaction,
   * only while it is still approved with the same kind and dates.
   */
  async split(ids: string[], actor: AuthUser): Promise<{ split: number }> {
    const wanted = new Set(ids);
    const found = (await this.find()).filter(
      ({ request }) => wanted.has(request.id) && request.employeeId !== actor.id,
    );
    let done = 0;
    for (const { request, split } of found) {
      const reviewedAt = new Date();
      const writes: Prisma.PrismaPromise<{ id: string }>[] = [
        this.prisma.ptoRequest.update({
          where: {
            id: request.id,
            status: PtoStatus.APPROVED,
            type: request.type,
            startDate: request.startDate,
            endDate: request.endDate,
          },
          data: split.paid
            ? { endDate: split.paid.endDate }
            : { type: PtoType.UNPAID, unpaidPastBalanceOf: request.type, pastBalance: false },
          select: { id: true },
        }),
      ];
      if (split.paid) {
        writes.push(
          this.prisma.ptoRequest.create({
            data: {
              employeeId: request.employeeId,
              type: PtoType.UNPAID,
              status: PtoStatus.APPROVED,
              startDate: split.unpaid.startDate,
              endDate: split.unpaid.endDate,
              isHalfDay: split.unpaid.isHalfDay,
              reviewedById: actor.id,
              reviewedAt,
              splitFromId: request.id,
              unpaidPastBalanceOf: request.type,
            },
            select: { id: true },
          }),
        );
      }
      writes.push(
        this.prisma.ptoChange.create({
          data: {
            requestId: request.id,
            changedById: actor.id,
            summary: describeSplit(request, split, 'Split past the'),
          },
          select: { id: true },
        }),
      );
      try {
        const written = await this.prisma.$transaction(writes);
        const change = written[written.length - 1];
        done += 1;
        await this.notifyQuietly(change.id);
      } catch (error: unknown) {
        // Changed or cancelled since it was read: left as it is.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          continue;
        }
        throw error;
      }
    }
    this.logger.log(`${done} approved request(s) past the balance split by ${actor.id}`);
    return { split: done };
  }

  /// Every approved request this policy year or later that went past its
  /// balance, soonest first.
  private async find(): Promise<Found[]> {
    const policy = await this.policy.get();
    const thisYear = this.policy.policyYearOf(practiceToday(), policy);
    const yearStart = this.policy.yearBounds(thisYear, policy).start;

    const requests = await this.prisma.ptoRequest.findMany({
      where: {
        status: PtoStatus.APPROVED,
        type: { in: DRAWING_TYPES },
        endDate: { gte: yearStart },
      },
      select: {
        id: true,
        employeeId: true,
        type: true,
        startDate: true,
        endDate: true,
        isHalfDay: true,
        createdAt: true,
        recordedById: true,
        employee: {
          select: { id: true, firstName: true, lastName: true, preferredName: true },
        },
        _count: { select: { changes: true } },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });
    if (requests.length === 0) return [];

    // One walk per person, balance and policy year.
    const groups = new Map<string, typeof requests>();
    for (const request of requests) {
      const years = new Set([
        Math.max(thisYear, this.policy.policyYearOf(request.startDate, policy)),
        this.policy.policyYearOf(request.endDate, policy),
      ]);
      for (const year of years) {
        const key = `${request.employeeId}:${TYPE_BUCKET[request.type]}:${year}`;
        groups.set(key, [...(groups.get(key) ?? []), request]);
      }
    }
    const keys = [...groups.keys()];
    const [closedByPerson, balances] = await Promise.all([
      this.days.closedByPerson(requests),
      this.policy.balancesOn(
        keys.map((key) => {
          const [employeeId, , year] = key.split(':');
          return { employeeId, day: this.policy.yearBounds(Number(year), policy).start };
        }),
      ),
    ]);

    const found: Found[] = [];
    keys.forEach((key, index) => {
      const bucket = key.split(':')[1] as 'vacation' | 'sick';
      const balance = balances[index];
      const from = balance.yearStart;
      const to = balance.yearEnd;
      const allowance = balance[bucket];
      const walk: ApprovedToWalk[] = groups.get(key)!.map((request) => {
        const closed = closedByPerson.get(request.employeeId) ?? new Set<string>();
        const dates = countedDateList(request, closed).filter((d) => d >= from && d <= to);
        const inOneYear = isoDate(request.startDate) >= from && isoDate(request.endDate) <= to;
        return {
          id: request.id,
          request,
          countedDates: dates,
          splittable: inOneYear && request.recordedById === null && request._count.changes === 0,
        };
      });
      const splits = walkApproved(walk, allowance.available - allowance.usedBefore);
      for (const request of groups.get(key)!) {
        const split = splits.get(request.id);
        if (split) found.push({ request, split });
      }
    });
    return found.sort((a, b) => a.request.startDate.getTime() - b.request.startDate.getTime());
  }

  private async notifyQuietly(changeId: string): Promise<void> {
    try {
      await this.notifications.ptoChanged(changeId);
    } catch (error: unknown) {
      this.logger.error(
        `Could not tell somebody of a split: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
