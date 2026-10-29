import { Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, PayType, Prisma, PtoPolicy, PtoStatus, PtoType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isoDate } from '../common/util/calendar-date.util';
import { localDateIn, PRACTICE_ZONE, practiceToday } from '../common/util/zoned-time.util';
import { closedFor, countedDays, loadClosedDays } from './counted-days';
import { AdjustPtoBalanceDto, UpdatePtoPolicyDto } from './dto/pto.dto';
import { A_PERSON } from '../common/people';

/// NJ earned sick leave: an hour of sick time for every 30 hours worked.
export const HOURS_WORKED_PER_SICK_HOUR = 30;
/// Sick time is kept in days; a day of it is 8 hours.
export const HOURS_PER_SICK_DAY = 8;

/**
 * Which requests draw down which allowance.
 *
 * Bereavement, unpaid and "other" are recorded but not deducted - they are not
 * what the PTO and sick allowances are for.
 *
 * Since September 2026 a new request is only SICK or VACATION ("PTO") -
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
  /// Booked but not yet decided - shown so nobody spends the same day twice.
  pending: number;
  remaining: number;
  /// Of `used`, days taken before Domi Staff, as a manager entered them.
  usedBefore: number;
  /// Sick time earned as they work, for hourly staff who started after the
  /// practice's date for it (October 2026): what `entitled` was worked out
  /// from. Absent for everybody given the year's days up front.
  accrual?: SickAccrual;
}

/// Sick time earned as it is worked: an hour for every 30 hours, up to the
/// year's days.
export interface SickAccrual {
  hoursWorked: number;
  hoursEarned: number;
  /// The most it can come to this year, in days.
  upToDays: number;
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
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
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
  /// inserted - twenty concurrent first reads produced eighteen policies in
  /// testing - after which edits landed on one row and reads came back from
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
      data: {
        ...dto,
        sickAccrualFrom:
          dto.sickAccrualFrom === undefined
            ? undefined
            : dto.sickAccrualFrom
              ? new Date(`${dto.sickAccrualFrom}T00:00:00.000Z`)
              : null,
        updatedById,
      },
    });
  }

  /**
   * What an employee has left this policy year.
   *
   * Carry-over is worked out by walking back through previous years: last
   * year's unused days, capped by the policy, become this year's carry-over -
   * and last year's own carry-over is worked out the same way. The walk starts
   * at the later of the hire date and the day they were added to the app: a
   * year before Domi Staff has no record of what was taken, so it is not
   * counted as untouched (October 2026 - that gave everybody the full five
   * days). What really rolled over into that first year is the manager's to
   * enter.
   *
   * Two things a manager can add (the switch-over, September 2026): the
   * person's own yearly allowance, when it is not the practice's, and a
   * starting point for a year - days already taken before Domi Staff, and
   * optionally what really carried into it. Both feed the walk as well.
   */
  /// The balance for the policy year a day falls in - for a request's
  /// first day, which may be next year's.
  async balanceOn(employeeId: string, day: Date): Promise<PtoBalance> {
    const policy = await this.get();
    return (await this.balanceWithTerms(employeeId, policy, this.policyYearOf(day, policy)))
      .balance;
  }

  async balanceFor(employeeId: string, year?: number): Promise<PtoBalance> {
    return (await this.balanceWithTerms(employeeId, await this.get(), year)).balance;
  }

  /// The balance, with the allowance and starting points it was worked out from
  /// - the staff list shows those too, so it need not read them again.
  private async balanceWithTerms(
    employeeId: string,
    policy: PtoPolicy,
    year?: number,
  ): Promise<{ balance: PtoBalance; person: PersonalTerms }> {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: BALANCE_EMPLOYEE_SELECT,
    });
    const window = this.balanceWindow(employee, policy, year);
    const person = personalTerms(employee, policy);
    if (person.accruesSick) {
      person.hoursByYear = await this.hoursWorkedByYear(
        employeeId,
        policy,
        window.firstStart,
        window.end,
      );
    }
    const [requests, closures] = await Promise.all([
      this.prisma.ptoRequest.findMany({
        where: {
          employeeId,
          status: { in: [PtoStatus.PENDING, PtoStatus.APPROVED] },
          startDate: { lt: window.end },
          endDate: { gte: window.firstStart },
        },
        select: BALANCE_REQUEST_SELECT,
      }),
      loadClosedDays(this.prisma, isoDate(window.firstStart), isoDate(window.lastDay)),
    ]);
    // Weekends and the days their office is shut never come off it.
    const closed = closedFor(
      closures,
      (employee.locations ?? []).map((row) => row.locationId),
    );
    return this.workOutBalance(employeeId, policy, window, person, requests, closed);
  }

  /**
   * The same balances for many people at once, for the staff list (the
   * Dashboard's Time off balances card): a handful of reads for everybody
   * instead of about six each, one after another (maintenance pass, October
   * 2026). Each person's figures are worked out by workOutBalance exactly as
   * for one person; each read covers everybody's years, and each person's
   * share is cut back to their own window first, so nothing outside it is
   * seen. In the order of `ids`; anybody not found is left out.
   */
  private async balancesWithTerms(
    ids: string[],
    policy: PtoPolicy,
  ): Promise<Map<string, { balance: PtoBalance; person: PersonalTerms }>> {
    const results = new Map<string, { balance: PtoBalance; person: PersonalTerms }>();
    if (ids.length === 0) return results;
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: ids } },
      select: BALANCE_EMPLOYEE_SELECT,
    });
    if (employees.length === 0) return results;
    const people = employees.map((employee) => ({
      employee,
      window: this.balanceWindow(employee, policy),
      person: personalTerms(employee, policy),
    }));
    // Everybody shares this year's end; the start goes back to the earliest.
    const end = people[0].window.end;
    const lastDay = people[0].window.lastDay;
    const earliest = new Date(Math.min(...people.map((one) => one.window.firstStart.getTime())));
    const accruing = people.filter((one) => one.person.accruesSick);
    const accruingFrom = new Date(
      Math.min(...accruing.map((one) => one.window.firstStart.getTime()), end.getTime()),
    );

    const [requests, closures, entries] = await Promise.all([
      this.prisma.ptoRequest.findMany({
        where: {
          employeeId: { in: employees.map((employee) => employee.id) },
          status: { in: [PtoStatus.PENDING, PtoStatus.APPROVED] },
          startDate: { lt: end },
          endDate: { gte: earliest },
        },
        select: { ...BALANCE_REQUEST_SELECT, employeeId: true },
      }),
      loadClosedDays(this.prisma, isoDate(earliest), isoDate(lastDay)),
      accruing.length === 0
        ? Promise.resolve([])
        : this.prisma.timeEntry.findMany({
            where: {
              employeeId: { in: accruing.map((one) => one.employee.id) },
              clockOutAt: { not: null },
              autoClockedOutAt: null,
              clockInAt: { gte: accruingFrom, lt: end },
            },
            select: { employeeId: true, clockInAt: true, clockOutAt: true },
          }),
    ]);

    for (const { employee, window, person } of people) {
      // Exactly what the one-person reads would have returned.
      const own = requests.filter(
        (request) => request.employeeId === employee.id && request.endDate >= window.firstStart,
      );
      if (person.accruesSick) {
        person.hoursByYear = this.hoursByYear(
          entries.filter(
            (entry) => entry.employeeId === employee.id && entry.clockInAt >= window.firstStart,
          ),
          policy,
        );
      }
      const from = isoDate(window.firstStart);
      const closed = new Set(
        [
          ...closedFor(
            closures,
            (employee.locations ?? []).map((row) => row.locationId),
          ),
        ].filter((date) => date >= from),
      );
      results.set(
        employee.id,
        this.workOutBalance(employee.id, policy, window, person, own, closed),
      );
    }
    return results;
  }

  /// The policy year asked about (this one by default) and how far back the
  /// carry-over walk reaches for this person.
  private balanceWindow(employee: BalanceEmployee, policy: PtoPolicy, year?: number) {
    const policyYear = year ?? this.policyYearOf(practiceToday(), policy);
    const { start, end } = this.yearBounds(policyYear, policy);

    // Carry-over is counted from when they were added to the app, or their
    // hire date if that is later - nothing before was booked here.
    const since =
      employee.hireDate && employee.hireDate > employee.createdAt
        ? employee.hireDate
        : employee.createdAt;
    // One read for this year and every year the carry-over walks back
    // through; each year is picked out below by countedDays, which counts
    // nothing outside it.
    const firstYear = Math.min(this.policyYearOf(since, policy), policyYear);
    const firstStart = this.yearBounds(firstYear, policy).start;
    const lastDay = new Date(end.getTime() - 86_400_000);
    return { policyYear, start, end, since, firstStart, lastDay };
  }

  /// The arithmetic, from what was read: the same for one person or many.
  private workOutBalance(
    employeeId: string,
    policy: PtoPolicy,
    window: ReturnType<PtoPolicyService['balanceWindow']>,
    person: PersonalTerms,
    requests: BalanceRequest[],
    closed: Set<string>,
  ): { balance: PtoBalance; person: PersonalTerms } {
    const { policyYear, start, end, since, lastDay } = window;
    const startingPoint = person.startingPoints.get(policyYear);

    const tally = (bucket: 'vacation' | 'sick', status: PtoStatus) =>
      requests
        .filter((r) => TYPE_BUCKET[r.type] === bucket && r.status === status)
        .reduce((sum, r) => sum + countedDays(r, closed, start, end), 0);

    const approved = requests.filter((r) => r.status === PtoStatus.APPROVED);
    const carriedVacation = this.carryOverInto(
      approved,
      policyYear,
      policy,
      since,
      person,
      'vacation',
      closed,
    );
    const carriedSick = this.carryOverInto(
      approved,
      policyYear,
      policy,
      since,
      person,
      'sick',
      closed,
    );

    const vacationEntitled = this.entitlementFor(policyYear, policy, person, 'vacation');
    const sickEntitled = this.entitlementFor(policyYear, policy, person, 'sick');

    const sick = this.assemble(
      sickEntitled,
      carriedSick,
      tally('sick', PtoStatus.APPROVED),
      tally('sick', PtoStatus.PENDING),
      startingPoint?.sickUsed ?? 0,
    );
    if (person.accruesSick) {
      const hoursWorked = person.hoursByYear.get(policyYear) ?? 0;
      sick.accrual = {
        hoursWorked: round1(hoursWorked),
        hoursEarned: earnedSickHours(hoursWorked),
        upToDays: round1(yearlyDays(policy, person, 'sick')),
      };
    }

    const balance: PtoBalance = {
      employeeId,
      policyYear,
      yearStart: start.toISOString().slice(0, 10),
      yearEnd: lastDay.toISOString().slice(0, 10),
      vacation: this.assemble(
        vacationEntitled,
        carriedVacation,
        tally('vacation', PtoStatus.APPROVED),
        tally('vacation', PtoStatus.PENDING),
        startingPoint?.vacationUsed ?? 0,
      ),
      sick,
      unpaidAndOther: requests
        .filter((r) => TYPE_BUCKET[r.type] === null && r.status === PtoStatus.APPROVED)
        .reduce((sum, r) => sum + countedDays(r, closed, start, end), 0),
    };
    return { balance, person };
  }

  /**
   * Hours worked in each policy year, for sick time earned as it is worked:
   * closed punches only, each counted in the year its day falls in. A
   * clock-out the app made at midnight is a guess until a manager corrects
   * it, so it earns nothing until then.
   */
  private async hoursWorkedByYear(
    employeeId: string,
    policy: PtoPolicy,
    from: Date,
    to: Date,
  ): Promise<Map<number, number>> {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        employeeId,
        clockOutAt: { not: null },
        autoClockedOutAt: null,
        clockInAt: { gte: from, lt: to },
      },
      select: { clockInAt: true, clockOutAt: true },
    });
    return this.hoursByYear(entries, policy);
  }

  /// Closed punches added up by the policy year their day falls in.
  private hoursByYear(
    entries: Array<{ clockInAt: Date; clockOutAt: Date | null }>,
    policy: PtoPolicy,
  ): Map<number, number> {
    const hours = new Map<number, number>();
    for (const entry of entries) {
      const day = new Date(`${localDateIn(entry.clockInAt, PRACTICE_ZONE)}T00:00:00Z`);
      const year = this.policyYearOf(day, policy);
      const worked = (entry.clockOutAt!.getTime() - entry.clockInAt.getTime()) / 3_600_000;
      hours.set(year, (hours.get(year) ?? 0) + Math.max(0, worked));
    }
    return hours;
  }

  /**
   * Everybody still working here, with their balance this policy year and
   * what a manager has set for them - the Time off screen's staff list.
   */
  async staffBalances(): Promise<StaffBalance[]> {
    const staff = await this.prisma.employee.findMany({
      where: { employmentStatus: { not: EmploymentStatus.TERMINATED }, ...A_PERSON },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, preferredName: true, email: true },
    });
    const policy = await this.get();
    // Everybody's balances from a handful of reads (see balancesWithTerms).
    const worked = await this.balancesWithTerms(
      staff.map((person) => person.id),
      policy,
    );
    return staff
      .filter((person) => worked.has(person.id))
      .map((person) => staffBalanceRow(person, worked.get(person.id)!));
  }

  /// One person's row of the above - for Adjust on their staff profile.
  async staffBalanceFor(employeeId: string): Promise<StaffBalance> {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, preferredName: true, email: true },
    });
    if (!person) throw new NotFoundException('Nobody by that id.');
    return this.staffBalance(employeeId, person, await this.get());
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
    const policyYear = this.policyYearOf(practiceToday(), policy);
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
    return this.staffBalance(employeeId, person, policy);
  }

  private async staffBalance(
    employeeId: string,
    person: StaffBalance['employee'],
    policy: PtoPolicy,
  ): Promise<StaffBalance> {
    return staffBalanceRow(person, await this.balanceWithTerms(employeeId, policy));
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

  /**
   * What somebody is given for a policy year.
   *
   * PTO: a mid-year starter gets the share of the year they are present for,
   * if the policy says to prorate. With no hire date on record there is
   * nothing to prorate from, so the whole year's allowance.
   *
   * Sick days (October 2026, Dominguez): never cut down for starting part-way
   * - everybody is given the year's days - except hourly staff who started on
   * or after the practice's date for it, who **earn** them as they work: an
   * hour for every 30 hours worked, up to the year's days.
   */
  private entitlementFor(
    policyYear: number,
    policy: PtoPolicy,
    person: PersonalTerms,
    bucket: 'vacation' | 'sick',
  ): number {
    const fullEntitlement = yearlyDays(policy, person, bucket);
    const hireDate = person.hireDate;
    const { start, end } = this.yearBounds(policyYear, policy);
    if (hireDate && hireDate >= end) {
      return 0;
    }
    if (bucket === 'sick') {
      if (!person.accruesSick) return fullEntitlement;
      const earned = earnedSickHours(person.hoursByYear.get(policyYear) ?? 0) / HOURS_PER_SICK_DAY;
      return round1(Math.min(fullEntitlement, earned));
    }
    if (!hireDate || !policy.prorateFirstYear || hireDate <= start) {
      return fullEntitlement;
    }

    const yearDays = (end.getTime() - start.getTime()) / 86_400_000;
    const remainingDays = (end.getTime() - hireDate.getTime()) / 86_400_000;
    return round1(fullEntitlement * (remainingDays / yearDays));
  }

  /// `approved` is every approved request from the first year walked on.
  private carryOverInto(
    approved: Array<{ type: PtoType; startDate: Date; endDate: Date; isHalfDay: boolean }>,
    policyYear: number,
    policy: PtoPolicy,
    since: Date,
    person: PersonalTerms,
    bucket: 'vacation' | 'sick',
    closed: Set<string>,
  ): number {
    // What a manager said really carried in wins over any working-out.
    const stated = carriedOverStated(person.startingPoints.get(policyYear), bucket);
    if (stated !== null) return round1(stated);

    const cap = bucket === 'vacation' ? policy.maxCarryoverDays : policy.sickCarryoverDays;
    if (cap <= 0) {
      return 0;
    }

    const fromYear = this.policyYearOf(since, policy);
    let carried = 0;

    // Oldest year first, so each year's carry-over feeds the next.
    for (let year = fromYear; year < policyYear; year += 1) {
      const point = person.startingPoints.get(year);
      carried = carriedOverStated(point, bucket) ?? carried;

      const { start, end } = this.yearBounds(year, policy);
      const entitled = this.entitlementFor(year, policy, person, bucket);

      const used =
        approved
          .filter((r) => TYPE_BUCKET[r.type] === bucket)
          .reduce((sum, r) => sum + countedDays(r, closed, start, end), 0) +
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
    const start = new Date(Date.UTC(policyYear, policy.yearStartMonth - 1, policy.yearStartDay));
    const end = new Date(Date.UTC(policyYear + 1, policy.yearStartMonth - 1, policy.yearStartDay));
    return { start, end };
  }
}

// ---------------------------------------------------------------------------

/// Days of a request that fall inside a policy year: weekdays only, and not
/// the days in `closed` (see counted-days.ts). A request spanning New Year is
/// counted against each year for the part that lands in it.
export function daysWithin(
  request: { startDate: Date; endDate: Date; isHalfDay: boolean },
  start: Date,
  end: Date,
  closed: Set<string> = new Set(),
): number {
  return countedDays(request, closed, start, end);
}

/// Whole hours of sick time earned by the hours worked.
export function earnedSickHours(hoursWorked: number): number {
  return Math.floor(hoursWorked / HOURS_WORKED_PER_SICK_HOUR);
}

/**
 * Whether somebody earns sick time as they work rather than being given the
 * year's days: hourly, and started (hired, or added to the app when there is
 * no hire date) on or after the practice's date for it - "going forward, any
 * new staff that is hourly would get the accumulation" (Dominguez, October
 * 2026). No date set: nobody does.
 */
export function accruesSick(
  policy: Pick<PtoPolicy, 'sickAccrualFrom'>,
  person: { payType: PayType; hireDate: Date | null; createdAt: Date },
): boolean {
  if (!policy.sickAccrualFrom || person.payType !== PayType.HOURLY) return false;
  return (person.hireDate ?? person.createdAt) >= policy.sickAccrualFrom;
}

interface StartingPointTerms {
  vacationUsed: number;
  sickUsed: number;
  vacationCarriedOver: number | null;
  sickCarriedOver: number | null;
}

/// What is particular to one person: their own allowance and starting points.
/// What a balance needs to know about the person, read once.
const BALANCE_EMPLOYEE_SELECT = {
  id: true,
  hireDate: true,
  createdAt: true,
  payType: true,
  locations: { select: { locationId: true } },
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
} satisfies Prisma.EmployeeSelect;
type BalanceEmployee = Prisma.EmployeeGetPayload<{ select: typeof BALANCE_EMPLOYEE_SELECT }>;

/// What a balance needs to know about each request.
const BALANCE_REQUEST_SELECT = {
  type: true,
  status: true,
  startDate: true,
  endDate: true,
  isHalfDay: true,
} satisfies Prisma.PtoRequestSelect;
type BalanceRequest = Prisma.PtoRequestGetPayload<{ select: typeof BALANCE_REQUEST_SELECT }>;

/// The person's own terms, as read; hours worked are filled in by the caller.
function personalTerms(employee: BalanceEmployee, policy: PtoPolicy): PersonalTerms {
  return {
    hireDate: employee.hireDate,
    allowance: employee.ptoAllowance ?? null,
    startingPoints: new Map(
      (employee.ptoStartingPoints ?? []).map((point) => [point.policyYear, point]),
    ),
    accruesSick: accruesSick(policy, employee),
    hoursByYear: new Map(),
  };
}

/// One row of the staff list from a person's balance and terms.
function staffBalanceRow(
  employee: StaffBalance['employee'],
  { balance, person: terms }: { balance: PtoBalance; person: PersonalTerms },
): StaffBalance {
  const allowance = terms.allowance;
  const startingPoint = terms.startingPoints.get(balance.policyYear);
  return {
    employee,
    balance,
    vacationDaysPerYear: allowance?.vacationDaysPerYear ?? null,
    sickDaysPerYear: allowance?.sickDaysPerYear ?? null,
    vacationUsed: startingPoint?.vacationUsed ?? 0,
    sickUsed: startingPoint?.sickUsed ?? 0,
    vacationCarriedOver: startingPoint?.vacationCarriedOver ?? null,
    sickCarriedOver: startingPoint?.sickCarriedOver ?? null,
  };
}

interface PersonalTerms {
  hireDate: Date | null;
  allowance: { vacationDaysPerYear: number | null; sickDaysPerYear: number | null } | null;
  startingPoints: Map<number, StartingPointTerms>;
  /// Earns sick time as they work (see `accruesSick`).
  accruesSick: boolean;
  /// Hours worked in each policy year - only read for somebody who accrues.
  hoursByYear: Map<number, number>;
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
