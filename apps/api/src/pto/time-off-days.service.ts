import { Injectable } from '@nestjs/common';
import { PtoType } from '@prisma/client';
import { addUtcDays, isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  closedFor,
  countedDateList,
  countedDays,
  loadClosedDays,
  NO_CLOSURES,
  skippedDays,
} from './counted-days';
import { PastBalanceSplit, splitByYear } from './past-balance-split';
import { PtoBalance, PtoPolicyService, TYPE_BUCKET } from './pto-policy.service';

interface Dates {
  employeeId: string;
  startDate: Date;
  endDate: Date;
  isHalfDay: boolean;
}

/// One policy year's share of a request, and what it does to that year's
/// allowance (November 2026: each year is judged on its own).
export interface TimeOffYear {
  policyYear: number;
  /// Its first and last day inside the request, and the days it takes there.
  from: string;
  to: string;
  days: number;
  /// Left of that year's allowance before this request (others waiting
  /// counted), and after it. Null for a kind that draws on none.
  remaining: number | null;
  after: number | null;
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
  /// Each policy year it falls in, in order: one for most requests, two for
  /// one across the turn of the year.
  years: TimeOffYear[];
  /// More than is left in any of those years.
  pastBalance: boolean;
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

  /// The days each request takes, in order (weekdays its person's office is
  /// open), from one read for every request: the Timesheet's days off.
  async datesFor(requests: Dates[]): Promise<(request: Dates) => string[]> {
    if (requests.length === 0) return () => [];
    const closedByPerson = await this.closedByPerson(requests);
    return (request) =>
      countedDateList(request, closedByPerson.get(request.employeeId) ?? new Set());
  }

  /**
   * What approving each request would do past the balance (November 2026):
   * which of its days stay paid and which become Unpaid, or null when it
   * fits or draws on no allowance. Each policy year it falls in is judged on
   * that year's balance. "Left" is what has been approved against it, not
   * what others are waiting for: another request still waiting may yet be
   * declined. In the order given.
   */
  async approvalSplits(
    requests: (Dates & { type: PtoType })[],
  ): Promise<(PastBalanceSplit | null)[]> {
    const drawing = requests.filter((request) => TYPE_BUCKET[request.type] !== null);
    if (drawing.length === 0) return requests.map(() => null);
    const [closedByPerson, balances] = await Promise.all([
      this.closedByPerson(drawing),
      this.balancesAcross(drawing),
    ]);
    const splits = new Map(
      drawing.map((request, index) => {
        const bucket = TYPE_BUCKET[request.type]!;
        const dates = countedDateList(request, closedByPerson.get(request.employeeId) ?? new Set());
        const parts = balances[index].map((balance) => ({
          countedDates: inYear(dates, balance),
          left: balance[bucket].available - balance[bucket].used,
        }));
        return [request, splitByYear(request, parts)] as const;
      }),
    );
    return requests.map((request) => splits.get(request) ?? null);
  }

  /**
   * The balance of every policy year each request falls in, in order: the
   * year of its first day, then the next while it runs on past the year's
   * end. Read for every request together, a year at a time.
   */
  async balancesAcross(requests: Dates[]): Promise<PtoBalance[][]> {
    const result: PtoBalance[][] = requests.map(() => []);
    let asked = requests.map((request, index) => ({ index, day: request.startDate }));
    // A request runs into a handful of years at most; this stops a wrong
    // date from going on for ever.
    for (let round = 0; round < 5 && asked.length > 0; round += 1) {
      const balances = await this.policy.balancesOn(
        asked.map(({ index, day }) => ({ employeeId: requests[index].employeeId, day })),
      );
      const next: typeof asked = [];
      asked.forEach(({ index }, at) => {
        const balance = balances[at];
        result[index].push(balance);
        if (isoDate(requests[index].endDate) > balance.yearEnd) {
          next.push({ index, day: addUtcDays(toUtcDate(balance.yearEnd), 1) });
        }
      });
      asked = next;
    }
    return result;
  }

  /// The days each person need not take off, from one read for everybody.
  async closedByPerson(requests: Dates[]): Promise<Map<string, Set<string>>> {
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

  /// What a request would take, and leave, in each policy year it falls in.
  async preview(request: Dates & { type: PtoType }): Promise<TimeOffPreview> {
    const [closed, [balances]] = await Promise.all([
      this.closedForPerson(request),
      this.balancesAcross([request]),
    ]);
    const dates = countedDateList(request, closed);
    const days = countedDays(request, closed);
    const halfDay = request.isHalfDay && dates.length === 1;
    const skipped = skippedDays(request, closed);
    const bucket = TYPE_BUCKET[request.type];
    const start = isoDate(request.startDate);
    const end = isoDate(request.endDate);
    const years: TimeOffYear[] = balances.map((balance) => {
      const own = inYear(dates, balance);
      const yearDays = halfDay ? days : own.length;
      const remaining = bucket ? balance[bucket].remaining : null;
      return {
        policyYear: balance.policyYear,
        from: start > balance.yearStart ? start : balance.yearStart,
        to: end < balance.yearEnd ? end : balance.yearEnd,
        days: yearDays,
        remaining,
        after: remaining === null ? null : Math.round((remaining - yearDays) * 10) / 10,
      };
    });
    const first = years[0];
    return {
      days,
      weekendDays: skipped.weekend,
      closedDays: skipped.closed,
      bucket,
      policyYear: first.policyYear,
      inOneYear: years.length === 1,
      remaining: first.remaining,
      after: first.remaining === null ? null : Math.round((first.remaining - days) * 10) / 10,
      years,
      pastBalance: years.some((year) => year.after !== null && year.days > 0 && year.after < 0),
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

/// The days that fall inside one policy year's balance.
function inYear(dates: string[], balance: { yearStart: string; yearEnd: string }): string[] {
  return dates.filter((date) => date >= balance.yearStart && date <= balance.yearEnd);
}
