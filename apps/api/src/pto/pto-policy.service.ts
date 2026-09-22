import { Injectable } from '@nestjs/common';
import { Prisma, PtoPolicy, PtoStatus, PtoType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePtoPolicyDto } from './dto/pto.dto';

/**
 * Which requests draw down which allowance.
 *
 * Bereavement, unpaid and "other" are recorded but not deducted — they are not
 * what the PTO and sick allowances are for.
 *
 * TODO: confirm that personal days come out of the PTO allowance rather than
 * being their own bucket. It is the common arrangement, but it is a handbook
 * decision, not a technical one.
 */
export const TYPE_BUCKET: Record<PtoType, 'vacation' | 'sick' | null> = {
  VACATION: 'vacation',
  PERSONAL: 'vacation',
  SICK: 'sick',
  BEREAVEMENT: null,
  UNPAID: null,
  OTHER: null,
};

export interface AllowanceBalance {
  entitled: number;
  carriedOver: number;
  /// entitled + carriedOver.
  available: number;
  used: number;
  /// Booked but not yet decided — shown so nobody spends the same day twice.
  pending: number;
  remaining: number;
}

export interface PtoBalance {
  employeeId: string;
  policyYear: number;
  yearStart: string;
  yearEnd: string;
  vacation: AllowanceBalance;
  sick: AllowanceBalance;
  /// Days recorded against no allowance, for completeness.
  unpaidAndOther: number;
}

/// The only value `PtoPolicy.singleton` ever takes. See the model comment.
const SINGLETON = 1;

/// Postgres's "duplicate key" as Prisma reports it.
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

@Injectable()
export class PtoPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /// There is exactly one policy, created on first read so a fresh database
  /// starts with the defaults rather than nothing.
  ///
  /// The first read is frequently two reads: the Time off screen asks for the
  /// policy and for a balance at the same moment, and a balance needs the
  /// policy too. A plain read-then-create meant both found nothing and both
  /// inserted — twenty concurrent first reads produced eighteen policies in
  /// testing — after which edits landed on one row and reads came back from
  /// another.
  ///
  /// So the row is a database-enforced singleton, and the loser of the race
  /// reads the winner's row rather than failing.
  async get(): Promise<PtoPolicy> {
    const existing = await this.prisma.ptoPolicy.findUnique({
      where: { singleton: SINGLETON },
    });
    if (existing) return existing;

    try {
      return await this.prisma.ptoPolicy.create({ data: { singleton: SINGLETON } });
    } catch (error) {
      // Somebody else created it between the read and the write. The unique
      // column is what makes that a clean, detectable loss rather than a
      // second policy nobody knows about, and the loser simply reads the
      // winner's row.
      if (isUniqueViolation(error)) {
        return this.prisma.ptoPolicy.findUniqueOrThrow({
          where: { singleton: SINGLETON },
        });
      }
      throw error;
    }
  }

  async update(dto: UpdatePtoPolicyDto, updatedById: string): Promise<PtoPolicy> {
    await this.get();
    return this.prisma.ptoPolicy.update({
      where: { singleton: SINGLETON },
      data: { ...dto, updatedById },
    });
  }

  /**
   * What an employee has left this policy year.
   *
   * Carry-over is worked out by walking back through previous years: last
   * year's unused days, capped by the policy, become this year's carry-over —
   * and last year's own carry-over is worked out the same way. The walk stops
   * at the hire date, so it is bounded.
   */
  async balanceFor(employeeId: string, year?: number): Promise<PtoBalance> {
    const policy = await this.get();
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { id: true, hireDate: true },
    });

    const policyYear = year ?? this.policyYearOf(new Date(), policy);
    const { start, end } = this.yearBounds(policyYear, policy);

    const requests = await this.prisma.ptoRequest.findMany({
      where: {
        employeeId,
        status: { in: [PtoStatus.PENDING, PtoStatus.APPROVED] },
        startDate: { lt: end },
        endDate: { gte: start },
      },
      select: {
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        isHalfDay: true,
      },
    });

    const tally = (bucket: 'vacation' | 'sick', status: PtoStatus) =>
      requests
        .filter((r) => TYPE_BUCKET[r.type] === bucket && r.status === status)
        .reduce((sum, r) => sum + daysWithin(r, start, end), 0);

    const carriedVacation = await this.carryOverInto(
      employeeId,
      policyYear,
      policy,
      employee.hireDate,
      'vacation',
    );
    const carriedSick = await this.carryOverInto(
      employeeId,
      policyYear,
      policy,
      employee.hireDate,
      'sick',
    );

    const vacationEntitled = this.entitlementFor(
      policyYear,
      policy,
      employee.hireDate,
      policy.vacationDaysPerYear,
    );
    const sickEntitled = this.entitlementFor(
      policyYear,
      policy,
      employee.hireDate,
      policy.sickDaysPerYear,
    );

    return {
      employeeId,
      policyYear,
      yearStart: start.toISOString().slice(0, 10),
      yearEnd: new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10),
      vacation: this.assemble(vacationEntitled, carriedVacation, tally('vacation', PtoStatus.APPROVED), tally('vacation', PtoStatus.PENDING)),
      sick: this.assemble(sickEntitled, carriedSick, tally('sick', PtoStatus.APPROVED), tally('sick', PtoStatus.PENDING)),
      unpaidAndOther: requests
        .filter((r) => TYPE_BUCKET[r.type] === null && r.status === PtoStatus.APPROVED)
        .reduce((sum, r) => sum + daysWithin(r, start, end), 0),
    };
  }

  // -------------------------------------------------------------------------

  private assemble(
    entitled: number,
    carriedOver: number,
    used: number,
    pending: number,
  ): AllowanceBalance {
    const available = round1(entitled + carriedOver);
    return {
      entitled: round1(entitled),
      carriedOver: round1(carriedOver),
      available,
      used: round1(used),
      pending: round1(pending),
      remaining: round1(available - used - pending),
    };
  }

  /// A mid-year starter gets the share of the year they are present for, if the
  /// policy says to prorate.
  private entitlementFor(
    policyYear: number,
    policy: PtoPolicy,
    hireDate: Date,
    fullEntitlement: number,
  ): number {
    const { start, end } = this.yearBounds(policyYear, policy);

    if (hireDate >= end) {
      return 0;
    }
    if (!policy.prorateFirstYear || hireDate <= start) {
      return fullEntitlement;
    }

    const yearDays = (end.getTime() - start.getTime()) / 86_400_000;
    const remainingDays = (end.getTime() - hireDate.getTime()) / 86_400_000;
    return round1(fullEntitlement * (remainingDays / yearDays));
  }

  private async carryOverInto(
    employeeId: string,
    policyYear: number,
    policy: PtoPolicy,
    hireDate: Date,
    bucket: 'vacation' | 'sick',
  ): Promise<number> {
    const cap = bucket === 'vacation' ? policy.maxCarryoverDays : policy.sickCarryoverDays;
    if (cap <= 0) {
      return 0;
    }

    const hireYear = this.policyYearOf(hireDate, policy);
    let carried = 0;

    // Oldest year first, so each year's carry-over feeds the next.
    for (let year = hireYear; year < policyYear; year += 1) {
      const { start, end } = this.yearBounds(year, policy);
      const entitled = this.entitlementFor(
        year,
        policy,
        hireDate,
        bucket === 'vacation' ? policy.vacationDaysPerYear : policy.sickDaysPerYear,
      );

      const requests = await this.prisma.ptoRequest.findMany({
        where: {
          employeeId,
          status: PtoStatus.APPROVED,
          startDate: { lt: end },
          endDate: { gte: start },
        },
        select: { type: true, startDate: true, endDate: true, isHalfDay: true },
      });

      const used = requests
        .filter((r) => TYPE_BUCKET[r.type] === bucket)
        .reduce((sum, r) => sum + daysWithin(r, start, end), 0);

      carried = Math.min(cap, Math.max(0, entitled + carried - used));
    }

    return round1(carried);
  }

  /// The policy year a date falls in, named by the calendar year it starts in.
  policyYearOf(date: Date, policy: PtoPolicy): number {
    const year = date.getUTCFullYear();
    const startThisYear = Date.UTC(year, policy.yearStartMonth - 1, policy.yearStartDay);
    return date.getTime() >= startThisYear ? year : year - 1;
  }

  /// Half-open: [start, end).
  yearBounds(policyYear: number, policy: PtoPolicy): { start: Date; end: Date } {
    const start = new Date(
      Date.UTC(policyYear, policy.yearStartMonth - 1, policy.yearStartDay),
    );
    const end = new Date(
      Date.UTC(policyYear + 1, policy.yearStartMonth - 1, policy.yearStartDay),
    );
    return { start, end };
  }
}

// ---------------------------------------------------------------------------

/// Days of a request that fall inside a policy year. A request spanning New Year
/// is counted against each year for the part that lands in it.
export function daysWithin(
  request: { startDate: Date; endDate: Date; isHalfDay: boolean },
  start: Date,
  end: Date,
): number {
  const from = request.startDate < start ? start : request.startDate;
  // endDate is inclusive; end is exclusive.
  const lastAllowed = new Date(end.getTime() - 86_400_000);
  const to = request.endDate > lastAllowed ? lastAllowed : request.endDate;

  if (to < from) {
    return 0;
  }

  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return request.isHalfDay && days === 1 ? 0.5 : days;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
