import { Injectable } from '@nestjs/common';
import { PtoType } from '@prisma/client';
import { isoDate } from '../common/util/calendar-date.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  closedFor,
  countedDateList,
  countedDays,
  loadClosedDays,
  NO_CLOSURES,
  skippedDays,
} from './counted-days';
import { PastBalanceSplit, splitPastBalance } from './past-balance-split';
import { PtoPolicyService, TYPE_BUCKET } from './pto-policy.service';

interface Dates {
  employeeId: string;
  startDate: Date;
  endDate: Date;
  isHalfDay: boolean;
}

/// What a request would do to its allowance, before it is sent.
export interface TimeOffPreview {
  /// The days it takes: weekdays, not closures.
  days: number;
  /// Days in the range that do not count, to say why.
  weekendDays: number;
  closedDays: string[];
  /// Which allowance it draws on, if any.
  bucket: 'vacation' | 'sick' | null;
  /// The policy year its first day is in, and whether all of it is.
  policyYear: number;
  inOneYear: boolean;
  /// Left of that allowance before this request (others waiting counted),
  /// and after it. Null for a kind that draws on none.
  remaining: number | null;
  after: number | null;
}

/**
 * The days a time-off request takes, worked out the same way everywhere
 * (`counted-days.ts`: weekdays, not a day the person's office is shut), and
 * what that does to their balance - for the request form before it is sent,
 * the "this may be unpaid" check when it is, and the request lists.
 */
@Injectable()
export class TimeOffDaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PtoPolicyService,
  ) {}

  /// A counter for a batch of requests: one read for the closures and the
  /// people's offices, however many requests.
  async counterFor(requests: Dates[]): Promise<(request: Dates) => number> {
    if (requests.length === 0) return () => 0;
    const closedByPerson = await this.closedByPerson(requests);
    return (request) => countedDays(request, closedByPerson.get(request.employeeId) ?? new Set());
  }

  /**
   * What approving each request would do past the balance (November 2026):
   * how many of its days stay paid and how many become Unpaid, or null when
   * it fits, draws on no allowance, or runs into another policy year. "Left"
   * is what has been approved against it, not what others are waiting for:
   * another request still waiting may yet be declined. In the order given.
   */
  async approvalSplits(
    requests: (Dates & { type: PtoType })[],
  ): Promise<(PastBalanceSplit | null)[]> {
    const drawing = requests.filter((request) => TYPE_BUCKET[request.type] !== null);
    if (drawing.length === 0) return requests.map(() => null);
    const [closedByPerson, balances] = await Promise.all([
      this.closedByPerson(drawing),
      this.policy.balancesOn(
        drawing.map((request) => ({ employeeId: request.employeeId, day: request.startDate })),
      ),
    ]);
    const splits = new Map(
      drawing.map((request, index) => {
        const bucket = TYPE_BUCKET[request.type]!;
        const balance = balances[index];
        if (isoDate(request.endDate) > balance.yearEnd) return [request, null] as const;
        const allowance = balance[bucket];
        const left = allowance.available - allowance.used;
        const dates = countedDateList(request, closedByPerson.get(request.employeeId) ?? new Set());
        return [request, splitPastBalance(request, dates, left)] as const;
      }),
    );
    return requests.map((request) => splits.get(request) ?? null);
  }

  /// The days each person need not take off, from one read for everybody.
  private async closedByPerson(requests: Dates[]): Promise<Map<string, Set<string>>> {
    const from = requests.reduce(
      (min, r) => (r.startDate < min ? r.startDate : min),
      requests[0].startDate,
    );
    const to = requests.reduce(
      (max, r) => (r.endDate > max ? r.endDate : max),
      requests[0].endDate,
    );
    const ids = [...new Set(requests.map((r) => r.employeeId))];
    const [closures, people] = await Promise.all([
      loadClosedDays(this.prisma, isoDate(from), isoDate(to)),
      this.prisma.employeeLocation.findMany({
        where: { employeeId: { in: ids } },
        select: { employeeId: true, locationId: true },
      }),
    ]);
    const closedByPerson = new Map(
      ids.map((id) => [
        id,
        closedFor(
          closures ?? NO_CLOSURES,
          people.filter((row) => row.employeeId === id).map((row) => row.locationId),
        ),
      ]),
    );
    return closedByPerson;
  }

  /// What a request would take, and leave.
  async preview(request: Dates & { type: PtoType }): Promise<TimeOffPreview> {
    const [count, closed] = await Promise.all([
      this.counterFor([request]),
      this.closedForPerson(request),
    ]);
    const days = count(request);
    const skipped = skippedDays(request, closed);
    const bucket = TYPE_BUCKET[request.type];
    const balance = await this.policy.balanceOn(request.employeeId, request.startDate);
    const inOneYear = isoDate(request.endDate) <= balance.yearEnd;
    const remaining = bucket ? balance[bucket].remaining : null;
    return {
      days,
      weekendDays: skipped.weekend,
      closedDays: skipped.closed,
      bucket,
      policyYear: balance.policyYear,
      inOneYear,
      remaining,
      after: remaining === null ? null : Math.round((remaining - days) * 10) / 10,
    };
  }

  private async closedForPerson(request: Dates): Promise<Set<string>> {
    const [closures, offices] = await Promise.all([
      loadClosedDays(this.prisma, isoDate(request.startDate), isoDate(request.endDate)),
      this.prisma.employeeLocation.findMany({
        where: { employeeId: request.employeeId },
        select: { locationId: true },
      }),
    ]);
    return closedFor(
      closures,
      offices.map((row) => row.locationId),
    );
  }
}
