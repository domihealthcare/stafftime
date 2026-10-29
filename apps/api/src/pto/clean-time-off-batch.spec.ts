import {
  EmploymentStatus,
  EventAudience,
  PayType,
  PtoStatus,
  PtoType,
  Role,
  ShiftStatus,
} from '@prisma/client';
import { notCleanBecause } from './clean-time-off';
import { CleanTimeOffService } from './clean-time-off.service';
import { PtoPolicyService } from './pto-policy.service';
import { PtoService } from './pto.service';

/**
 * "Approve the clean time off" used to work out each waiting request on its
 * own: its balance, its clashes and its shifts, about a dozen reads a request.
 * It now reads once for all of them (maintenance pass, October 2026). The
 * answer must be exactly what one at a time gave. This builds a small practice
 * at the turn of the year (so some requests fall in next year's allowance)
 * in a fake database that answers both ways of asking, runs the old steps
 * (kept below, as they were) and the service as it is now, and compares.
 */

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const NOW = new Date('2026-12-14T15:00:00Z');
const manager = { id: 'mgr-1', email: 'mgr@example.com', role: Role.MANAGER };

const POLICY = {
  id: 'policy-1',
  singleton: 1,
  vacationDaysPerYear: 15,
  sickDaysPerYear: 5,
  maxCarryoverDays: 5,
  sickCarryoverDays: 2,
  yearStartMonth: 1,
  yearStartDay: 1,
  prorateFirstYear: true,
  sickAccrualFrom: day('2026-10-16'),
  updatedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const OFFICES = {
  nb: { id: 'nb', name: 'North Bergen' },
  wny: { id: 'wny', name: 'West New York' },
};
const ROLES = {
  fd: { id: 'fd', name: 'Front Desk', sortOrder: 1 },
  ma: { id: 'ma', name: 'Medical Assistant', sortOrder: 2 },
  prov: { id: 'prov', name: 'Provider', sortOrder: 3 },
};

const person = (
  id: string,
  offices: (keyof typeof OFFICES)[],
  roles: (keyof typeof ROLES)[],
  over: Record<string, unknown> = {},
) => ({
  id,
  firstName: id[0].toUpperCase() + id.slice(1),
  lastName: 'Test',
  preferredName: null,
  hireDate: day('2023-03-01'),
  createdAt: day('2025-02-01'),
  payType: PayType.SALARY,
  employmentStatus: EmploymentStatus.ACTIVE,
  isSharedAccount: false,
  locations: offices.map((office) => ({ locationId: office, location: OFFICES[office] })),
  jobRoles: roles.map((role) => ({ jobRole: ROLES[role] })),
  ptoAllowance: null as null | {
    vacationDaysPerYear: number | null;
    sickDaysPerYear: number | null;
  },
  ptoStartingPoints: [] as unknown[],
  ...over,
});

const PEOPLE = [
  // Hourly, started after the practice's date for earning sick time.
  person('ana', ['nb'], ['ma'], {
    payType: PayType.HOURLY,
    hireDate: day('2026-10-20'),
    createdAt: day('2026-10-19'),
  }),
  person('bea', ['nb'], ['ma']),
  person('cy', ['nb'], ['ma', 'fd'], { hireDate: null, createdAt: day('2026-01-05') }),
  person('dee', ['wny'], ['fd'], {
    ptoAllowance: { vacationDaysPerYear: 10, sickDaysPerYear: null },
    ptoStartingPoints: [
      {
        policyYear: 2026,
        vacationUsed: 2,
        sickUsed: 0,
        vacationCarriedOver: 1,
        sickCarriedOver: null,
      },
    ],
  }),
  person('eli', ['wny', 'nb'], ['fd']),
  person('fay', ['nb'], ['prov']),
  person('gus', ['nb'], ['fd'], { isSharedAccount: true }),
  person('hal', ['wny'], ['fd'], { employmentStatus: EmploymentStatus.TERMINATED }),
  person('ivy', ['wny'], ['fd']),
  person('mgr-1', ['nb'], ['fd']),
];

let requestCount = 0;
const request = (
  employeeId: string,
  type: PtoType,
  status: PtoStatus,
  from: string,
  to: string,
  isHalfDay = false,
) => ({
  id: `req-${String((requestCount += 1)).padStart(2, '0')}`,
  employeeId,
  type,
  status,
  startDate: day(from),
  endDate: day(to),
  isHalfDay,
});

const { APPROVED, PENDING, DENIED } = PtoStatus;
const { VACATION, SICK, UNPAID } = PtoType;
const REQUESTS = [
  // Two of three Medical Assistants at North Bergen off together.
  request('ana', VACATION, PENDING, '2026-12-21', '2026-12-23'),
  request('bea', VACATION, APPROVED, '2026-12-22', '2026-12-24'),
  // Next year's allowance, and next year's sick time earned as worked.
  request('cy', SICK, PENDING, '2027-01-04', '2027-01-05'),
  request('ana', SICK, PENDING, '2027-01-11', '2027-01-11'),
  request('cy', VACATION, PENDING, '2026-12-28', '2026-12-31'),
  request('cy', VACATION, APPROVED, '2026-06-01', '2026-06-12'),
  // More than is left.
  request('dee', VACATION, PENDING, '2026-12-15', '2026-12-30'),
  request('eli', UNPAID, PENDING, '2026-12-18', '2026-12-18'),
  // The only provider: any day off leaves nobody.
  request('fay', VACATION, PENDING, '2026-12-16', '2026-12-16', true),
  request('hal', VACATION, PENDING, '2026-12-17', '2026-12-17'),
  request('ivy', VACATION, PENDING, '2026-12-17', '2026-12-18'),
  request('ivy', SICK, DENIED, '2026-12-15', '2026-12-15'),
  // The manager's own: never in the list.
  request('mgr-1', VACATION, PENDING, '2026-12-18', '2026-12-18'),
  // Already over, with its shift already over too.
  request('bea', SICK, PENDING, '2026-12-01', '2026-12-01'),
  // With a shift still to come in it.
  request('eli', VACATION, PENDING, '2027-01-08', '2027-01-08'),
  // A Saturday at North Bergen, open that day.
  request('cy', VACATION, PENDING, '2026-12-19', '2026-12-19'),
];

const shift = (
  employeeId: string | null,
  locationId: keyof typeof OFFICES,
  startsAt: string,
  hours: number,
  status: ShiftStatus = ShiftStatus.PUBLISHED,
) => ({
  id: `sh-${employeeId}-${startsAt}`,
  employeeId,
  locationId,
  startsAt: new Date(startsAt),
  endsAt: new Date(new Date(startsAt).getTime() + hours * 3_600_000),
  status,
  location: { name: OFFICES[locationId].name, timezone: 'America/New_York' },
});

const SHIFTS = [
  shift('bea', 'nb', '2026-12-01T14:00:00Z', 8),
  shift('eli', 'wny', '2027-01-08T14:00:00Z', 8),
  shift('eli', 'wny', '2027-01-08T23:00:00Z', 2, ShiftStatus.CANCELLED),
  shift('cy', 'nb', '2026-12-19T14:00:00Z', 5),
  shift(null, 'nb', '2026-12-19T15:00:00Z', 4),
  shift('dee', 'wny', '2026-12-14T13:00:00Z', 8),
  // A night shift reaching into ivy's first day from the evening before.
  shift('ivy', 'wny', '2026-12-17T03:00:00Z', 3),
];

const njDay = (value: string) => ({
  startsAt: new Date(`${value}T05:00:00.000Z`),
  endsAt: new Date(new Date(`${value}T05:00:00.000Z`).getTime() + 86_400_000),
});
const CLOSURES = [
  { ...njDay('2026-12-25'), audience: EventAudience.EVERYONE, locationId: null, kind: 'CLOSURE' },
  { ...njDay('2026-12-31'), audience: EventAudience.LOCATION, locationId: 'nb', kind: 'CLOSURE' },
  { ...njDay('2027-01-01'), audience: EventAudience.EVERYONE, locationId: null, kind: 'CLOSURE' },
];

const punch = (employeeId: string, date: string, hours: number) => ({
  employeeId,
  clockInAt: new Date(`${date}T13:00:00.000Z`),
  clockOutAt: new Date(new Date(`${date}T13:00:00.000Z`).getTime() + hours * 3_600_000),
  autoClockedOutAt: null,
});
const ENTRIES = [
  ...['2026-10-20', '2026-10-21', '2026-11-02', '2026-12-01'].map((date) => punch('ana', date, 8)),
  punch('ana', '2027-01-04', 9),
];

const MINIMUMS = [{ locationId: 'wny', jobRoleId: 'fd', minimum: 2, weekdays: [1, 2, 3, 4, 5] }];

// ---------------------------------------------------------------------------
// The fake database: Prisma's `where`, as far as these reads use it.

type Rule = Record<string, unknown>;
const OPERATORS = ['in', 'not', 'lt', 'lte', 'gt', 'gte'];

function matches(row: Record<string, unknown>, where: Rule | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, rule]) => {
    if (rule === undefined) return true;
    if (key === 'OR') return (rule as Rule[]).some((one) => matches(row, one));
    const value = row[key];
    if (rule === null || rule instanceof Date || typeof rule !== 'object') {
      return rule instanceof Date
        ? value instanceof Date && value.getTime() === rule.getTime()
        : value === rule;
    }
    const ops = rule as Rule;
    if (!Object.keys(ops).every((op) => OPERATORS.includes(op))) {
      // A relation: the row's own copy of it.
      return matches(value as Record<string, unknown>, ops);
    }
    return Object.entries(ops).every(([op, target]) => {
      switch (op) {
        case 'in':
          return (target as unknown[]).includes(value);
        case 'not':
          return value !== target;
        case 'lt':
          return (value as Date) < (target as Date);
        case 'lte':
          return (value as Date) <= (target as Date);
        case 'gt':
          return (value as Date) > (target as Date);
        default:
          return (value as Date) >= (target as Date);
      }
    });
  });
}

const byDate = (key: string) => (a: Record<string, unknown>, b: Record<string, unknown>) =>
  (a[key] as Date).getTime() - (b[key] as Date).getTime();

function fakeDatabase() {
  const people = new Map(PEOPLE.map((one) => [one.id, one]));
  const withEmployee = (row: (typeof REQUESTS)[number]) => ({
    ...row,
    employee: people.get(row.employeeId),
  });
  const prisma = {
    ptoPolicy: { findUnique: jest.fn(async () => POLICY) },
    employee: {
      findMany: jest.fn(async ({ where }: { where: Rule }) =>
        PEOPLE.filter((one) => matches(one, where)),
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        const found = people.get(where.id);
        if (!found) throw new Error('not found');
        return found;
      }),
    },
    ptoRequest: {
      findMany: jest.fn(async ({ where, orderBy }: { where: Rule; orderBy?: unknown }) => {
        const found = REQUESTS.map(withEmployee).filter((row) => matches(row, where));
        return orderBy ? found.sort(byDate('startDate')) : found;
      }),
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          REQUESTS.find((row) => row.id === where.id) ?? null,
      ),
    },
    shift: {
      findMany: jest.fn(async ({ where, orderBy }: { where: Rule; orderBy?: unknown }) => {
        const found = SHIFTS.filter((row) => matches(row, where));
        return orderBy ? found.sort(byDate('startsAt')) : found;
      }),
    },
    practiceEvent: {
      findMany: jest.fn(async ({ where }: { where: Rule }) =>
        CLOSURES.filter((row) => matches(row, where)),
      ),
    },
    timeEntry: {
      findMany: jest.fn(async ({ where }: { where: Rule }) =>
        ENTRIES.filter((row) => matches(row, where)),
      ),
    },
    staffingMinimum: { findMany: jest.fn(async () => MINIMUMS) },
  };
  const calls = () =>
    Object.values(prisma)
      .flatMap((model) => Object.values(model))
      .reduce((sum, method) => sum + (method as jest.Mock).mock.calls.length, 0);
  return { prisma, calls };
}

function services() {
  const { prisma, calls } = fakeDatabase();
  const policy = new PtoPolicyService(prisma as never);
  const pto = new PtoService(prisma as never, {} as never, {} as never);
  return {
    prisma,
    calls,
    policy,
    pto,
    clean: new CleanTimeOffService(prisma as never, pto, policy),
  };
}

/// The check as it was, one request at a time.
async function oneAtATime(
  { prisma, policy, pto }: ReturnType<typeof services>,
  actor: { id: string },
  now: Date,
) {
  const requests = await prisma.ptoRequest.findMany({
    where: { status: PtoStatus.PENDING, employeeId: { not: actor.id } },
    orderBy: { startDate: 'asc' },
  });
  return Promise.all(
    requests.map(async (request) => {
      const [balance, clashes, shifts] = await Promise.all([
        policy.balanceOn(request.employeeId, request.startDate),
        pto.clashes(request.id),
        pto.conflictingShifts(request.id),
      ]);
      const remaining =
        request.type === PtoType.VACATION
          ? balance.vacation.remaining
          : request.type === PtoType.SICK
            ? balance.sick.remaining
            : null;
      const why = notCleanBecause({
        type: request.type,
        remaining,
        clashes: clashes.length,
        shifts: shifts.filter((one) => one.endsAt > now).length,
      });
      return { id: request.id, clean: why === null, why };
    }),
  );
}

describe('approving the clean time off, checked together', () => {
  it('gives every request exactly what checking it alone gives', async () => {
    const before = services();
    const now = services();
    const expected = await oneAtATime(before, manager, NOW);
    const actual = await now.clean.check(manager, NOW);

    expect(actual).toEqual(expected);
    // The case is a real test: each reason turns up, and some are clean.
    const reasons = new Set(actual.map((row) => row.why));
    expect(reasons).toEqual(
      new Set([
        null,
        'not PTO or sick',
        'more days than are left',
        'too many off at once',
        'lands on shifts',
      ]),
    );
    expect(actual.map((row) => row.id)).not.toContain('req-13');

    // About a dozen reads a request before. Now: the list, the policy, four
    // reads for each policy year the requests fall in (two here), four for
    // the clashes and one for the shifts, however many requests there are.
    expect(before.calls()).toBeGreaterThan(100);
    expect(now.calls()).toBe(15);
  });

  it('each balance is what balanceOn gives, this year and next', async () => {
    const { policy } = services();
    const asked = REQUESTS.map((one) => ({ employeeId: one.employeeId, day: one.startDate }));
    const together = await policy.balancesOn(asked);
    const alone = await Promise.all(asked.map((one) => policy.balanceOn(one.employeeId, one.day)));
    expect(together).toEqual(alone);
    expect(new Set(together.map((balance) => balance.policyYear))).toEqual(new Set([2026, 2027]));
  });

  it('each request is told its own shifts, as conflictingShifts gives them', async () => {
    const { pto } = services();
    // The fake hands back whole rows; the fields asked for are compared.
    const asked = (shifts: { id: string; startsAt: Date; endsAt: Date; location: unknown }[]) =>
      shifts.map(({ id, startsAt, endsAt, location }) => ({
        id,
        startsAt,
        endsAt,
        name: (location as { name: string }).name,
      }));
    const together = await pto.conflictingShiftsFor(REQUESTS);
    const alone = await Promise.all(REQUESTS.map((one) => pto.conflictingShifts(one.id)));
    expect(together.map(asked)).toEqual(alone.map(asked));
    expect(together.some((shifts) => shifts.length > 0)).toBe(true);
  });

  it('approves the same ones', async () => {
    const before = services();
    const clean = (await oneAtATime(before, manager, new Date()))
      .filter((row) => row.clean)
      .map((row) => row.id);

    const now = services();
    const review = jest.spyOn(now.pto, 'review').mockResolvedValue({} as never);
    const outcome = await now.clean.approve(
      REQUESTS.map((one) => one.id),
      manager,
    );
    expect(review.mock.calls.map(([id]) => id)).toEqual(clean);
    expect(outcome.approved).toBe(clean.length);
    expect(clean.length).toBeGreaterThan(0);
    expect(outcome.left.length).toBeGreaterThan(0);
  });
});
