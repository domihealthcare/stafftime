import { Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, Prisma, PtoPolicy, PtoStatus, PtoType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustPtoBalanceDto, UpdatePtoPolicyDto } from './dto/pto.dto';

/**
 * Which requests draw down which allowance.
 *
 * Bereavement, unpaid and "other" are recorded but not deducted — they are not
 * what the PTO and sick allowances are for.
 *
 * Since September 2026 a new request is only SICK or VACATION ("PTO") —
 * Dominguez; the others stay for requests made before then.
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
  /// Of `used`, days taken before Domi Staff, as a manager entered them.
  usedBefore: number;
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

/// A row of the Time off screen's staff list, for managers.
export interface StaffBalance {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    email: string;
  };
  balance: PtoBalance;
  /// Their own yearly allowance, or null for the practice's.
  vacationDaysPerYear: number | null;
  sickDaysPerYear: number | null;
  /// This policy year's starting point.
  vacationUsed: number;
  sickUsed: number;
  vacationCarriedOver: number | null;
  sickCarriedOver: number | null;
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
   *
   * Two things a manager can add (the switch-over, September 2026): the
   * person's own yearly allowance, when it is not the practice's, and a
   * starting point for a year — days already taken before Domi Staff, and
   * optionally what really carried into it. Both feed the walk as well.
   */
  async balanceFor(employeeId: string, year?: number): Promise<PtoBalance> {
    const policy = await this.get();
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: {
        id: true,
        hireDate: true,
        createdAt: true,
        ptoAllowance: { select: { vacationDaysPerYear: true, sickDaysPerYear: true } },
        ptoStartingPoints: {
          select: {
            policyYear: true,
            vacationUsed: true,
            sickUsed: true,
            vacationCarriedOver: true,
            sickCarriedOver: true,
          },
        },
      },
    });

    const policyYear = year ?? this.policyYearOf(new Date(), policy);
    const { start, end } = this.yearBounds(policyYear, policy);
    const person: PersonalTerms = {
      hireDate: employee.hireDate,
      allowance: employee.ptoAllowance ?? null,
      startingPoints: new Map(
        (employee.ptoStartingPoints ?? []).map((point) => [point.policyYear, point]),
      ),
    };
    const startingPoint = person.startingPoints.get(policyYear);

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

    // With no hire date on record, carry-over is counted from when they were
    // added to the app — nothing before that was booked here anyway.
    const since = employee.hireDate ?? employee.createdAt;
    const carriedVacation = await this.carryOverInto(
      employeeId,
      policyYear,
      policy,
      since,
      person,
      'vacation',
    );
    const carriedSick = await this.carryOverInto(
      employeeId,
      policyYear,
      policy,
      since,
      person,
      'sick',
    );

    const vacationEntitled = this.entitlementFor(
      policyYear,
      policy,
      employee.hireDate,
      yearlyDays(policy, person, 'vacation'),
    );
    const sickEntitled = this.entitlementFor(
      policyYear,
      policy,
      employee.hireDate,
      yearlyDays(policy, person, 'sick'),
    );

    return {
      employeeId,
      policyYear,
      yearStart: start.toISOString().slice(0, 10),
      yearEnd: new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10),
      vacation: this.assemble(
        vacationEntitled,
        carriedVacation,
        tally('vacation', PtoStatus.APPROVED),
        tally('vacation', PtoStatus.PENDING),
        startingPoint?.vacationUsed ?? 0,
      ),
      sick: this.assemble(
        sickEntitled,
        carriedSick,
        tally('sick', PtoStatus.APPROVED),
        tally('sick', PtoStatus.PENDING),
        startingPoint?.sickUsed ?? 0,
      ),
      unpaidAndOther: requests
        .filter((r) => TYPE_BUCKET[r.type] === null && r.status === PtoStatus.APPROVED)
        .reduce((sum, r) => sum + daysWithin(r, start, end), 0),
    };
  }

  /**
   * Everybody still working here, with their balance this policy year and
   * what a manager has set for them — the Time off screen's staff list.
   */
  async staffBalances(): Promise<StaffBalance[]> {
    const staff = await this.prisma.employee.findMany({
      where: { employmentStatus: { not: EmploymentStatus.TERMINATED } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, preferredName: true, email: true },
    });
    const rows: StaffBalance[] = [];
    // One at a time: a practice's worth of staff, and each balance is a few
    // small reads. Not worth holding many connections open at once.
    for (const person of staff) {
      rows.push(await this.staffBalance(person.id, person));
    }
    return rows;
  }

  /// A manager sets a person's own allowance and this year's starting point.
  async adjust(
    employeeId: string,
    dto: AdjustPtoBalanceDto,
    setById: string,
  ): Promise<StaffBalance> {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, preferredName: true, email: true },
    });
    if (!person) throw new NotFoundException('Nobody by that id.');

    const policy = await this.get();
    const policyYear = this.policyYearOf(new Date(), policy);
    const allowance = {
      vacationDaysPerYear: dto.vacationDaysPerYear ?? null,
      sickDaysPerYear: dto.sickDaysPerYear ?? null,
      setById,
    };
    const startingPoint = {
      vacationUsed: dto.vacationUsed ?? 0,
      sickUsed: dto.sickUsed ?? 0,
      vacationCarriedOver: dto.vacationCarriedOver ?? null,
      sickCarriedOver: dto.sickCarriedOver ?? null,
      setById,
    };

    await this.prisma.$transaction([
      this.prisma.ptoAllowance.upsert({
        where: { employeeId },
        create: { employeeId, ...allowance },
        update: allowance,
      }),
      this.prisma.ptoStartingPoint.upsert({
        where: { employeeId_policyYear: { employeeId, policyYear } },
        create: { employeeId, policyYear, ...startingPoint },
        update: startingPoint,
      }),
    ]);
    return this.staffBalance(employeeId, person);
  }

  private async staffBalance(
    employeeId: string,
    person: StaffBalance['employee'],
  ): Promise<StaffBalance> {
    const balance = await this.balanceFor(employeeId);
    const [allowance, startingPoint] = await Promise.all([
      this.prisma.ptoAllowance.findUnique({ where: { employeeId } }),
      this.prisma.ptoStartingPoint.findUnique({
        where: { employeeId_policyYear: { employeeId, policyYear: balance.policyYear } },
      }),
    ]);
    return {
      employee: person,
      balance,
      vacationDaysPerYear: allowance?.vacationDaysPerYear ?? null,
      sickDaysPerYear: allowance?.sickDaysPerYear ?? null,
      vacationUsed: startingPoint?.vacationUsed ?? 0,
      sickUsed: startingPoint?.sickUsed ?? 0,
      vacationCarriedOver: startingPoint?.vacationCarriedOver ?? null,
      sickCarriedOver: startingPoint?.sickCarriedOver ?? null,
    };
  }

  // -------------------------------------------------------------------------

  private assemble(
    entitled: number,
    carriedOver: number,
    usedInApp: number,
    pending: number,
    usedBefore: number,
  ): AllowanceBalance {
    const available = round1(entitled + carriedOver);
    const used = round1(usedInApp + usedBefore);
    return {
      entitled: round1(entitled),
      carriedOver: round1(carriedOver),
      available,
      used,
      usedBefore: round1(usedBefore),
      pending: round1(pending),
      remaining: round1(available - used - pending),
    };
  }

  /// A mid-year starter gets the share of the year they are present for, if the
  /// policy says to prorate. With no hire date on record there is nothing to
  /// prorate from, so the whole year's allowance.
  private entitlementFor(
    policyYear: number,
    policy: PtoPolicy,
    hireDate: Date | null,
    fullEntitlement: number,
  ): number {
    if (!hireDate) return fullEntitlement;
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
    since: Date,
    person: PersonalTerms,
    bucket: 'vacation' | 'sick',
  ): Promise<number> {
    // What a manager said really carried in wins over any working-out.
    const stated = carriedOverStated(person.startingPoints.get(policyYear), bucket);
    if (stated !== null) return round1(stated);

    const cap = bucket === 'vacation' ? policy.maxCarryoverDays : policy.sickCarryoverDays;
    if (cap <= 0) {
      return 0;
    }

    const hireYear = this.policyYearOf(since, policy);
    let carried = 0;

    // Oldest year first, so each year's carry-over feeds the next.
    for (let year = hireYear; year < policyYear; year += 1) {
      const point = person.startingPoints.get(year);
      carried = carriedOverStated(point, bucket) ?? carried;

      const { start, end } = this.yearBounds(year, policy);
      const entitled = this.entitlementFor(
        year,
        policy,
        person.hireDate,
        yearlyDays(policy, person, bucket),
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

      const used =
        requests
          .filter((r) => TYPE_BUCKET[r.type] === bucket)
          .reduce((sum, r) => sum + daysWithin(r, start, end), 0) +
        (bucket === 'vacation' ? (point?.vacationUsed ?? 0) : (point?.sickUsed ?? 0));

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

interface StartingPointTerms {
  vacationUsed: number;
  sickUsed: number;
  vacationCarriedOver: number | null;
  sickCarriedOver: number | null;
}

/// What is particular to one person: their own allowance and starting points.
interface PersonalTerms {
  hireDate: Date | null;
  allowance: { vacationDaysPerYear: number | null; sickDaysPerYear: number | null } | null;
  startingPoints: Map<number, StartingPointTerms>;
}

function yearlyDays(policy: PtoPolicy, person: PersonalTerms, bucket: 'vacation' | 'sick'): number {
  return bucket === 'vacation'
    ? (person.allowance?.vacationDaysPerYear ?? policy.vacationDaysPerYear)
    : (person.allowance?.sickDaysPerYear ?? policy.sickDaysPerYear);
}

function carriedOverStated(
  point: StartingPointTerms | undefined,
  bucket: 'vacation' | 'sick',
): number | null {
  if (!point) return null;
  return bucket === 'vacation' ? point.vacationCarriedOver : point.sickCarriedOver;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
