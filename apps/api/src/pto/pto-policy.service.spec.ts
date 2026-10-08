import { Prisma, PtoStatus, PtoType } from '@prisma/client';
import { PtoPolicyService, TYPE_BUCKET, daysWithin } from './pto-policy.service';

const DEFAULT_POLICY = {
  id: 'policy-1',
  singleton: 1,
  vacationDaysPerYear: 15,
  sickDaysPerYear: 5,
  maxCarryoverDays: 5,
  sickCarryoverDays: 0,
  yearStartMonth: 1,
  yearStartDay: 1,
  prorateFirstYear: true,
  updatedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('TYPE_BUCKET', () => {
  it('draws vacation and personal days from the PTO allowance', () => {
    expect(TYPE_BUCKET[PtoType.VACATION]).toBe('vacation');
    expect(TYPE_BUCKET[PtoType.PERSONAL]).toBe('vacation');
  });

  it('draws sick days from the sick allowance', () => {
    expect(TYPE_BUCKET[PtoType.SICK]).toBe('sick');
  });

  it('does not deduct bereavement, unpaid or other', () => {
    expect(TYPE_BUCKET[PtoType.BEREAVEMENT]).toBeNull();
    expect(TYPE_BUCKET[PtoType.UNPAID]).toBeNull();
    expect(TYPE_BUCKET[PtoType.OTHER]).toBeNull();
  });
});

describe('daysWithin', () => {
  const start = day('2026-01-01');
  const end = day('2027-01-01');

  it('counts an inclusive range', () => {
    expect(
      daysWithin(
        { startDate: day('2026-03-02'), endDate: day('2026-03-06'), isHalfDay: false },
        start,
        end,
      ),
    ).toBe(5);
  });

  it('counts a half day as half', () => {
    expect(
      daysWithin(
        { startDate: day('2026-03-02'), endDate: day('2026-03-02'), isHalfDay: true },
        start,
        end,
      ),
    ).toBe(0.5);
  });

  it('splits a request that spans New Year across both years', () => {
    const request = { startDate: day('2026-12-30'), endDate: day('2027-01-02'), isHalfDay: false };
    // 30, 31 December fall in 2026.
    expect(daysWithin(request, start, end)).toBe(2);
    // 1, 2 January fall in 2027.
    expect(daysWithin(request, day('2027-01-01'), day('2028-01-01'))).toBe(2);
  });

  it('is zero for a request entirely outside the year', () => {
    expect(
      daysWithin(
        { startDate: day('2025-05-01'), endDate: day('2025-05-05'), isHalfDay: false },
        start,
        end,
      ),
    ).toBe(0);
  });
});

describe('PtoPolicyService', () => {
  function build(
    options: {
      policy?: unknown;
      requests?: unknown[];
      hireDate?: Date | null;
      createdAt?: Date;
      allowance?: { vacationDaysPerYear: number | null; sickDaysPerYear: number | null } | null;
      startingPoints?: Array<{
        policyYear: number;
        vacationUsed?: number;
        sickUsed?: number;
        vacationCarriedOver?: number | null;
        sickCarriedOver?: number | null;
      }>;
    } = {},
  ) {
    const startingPoints = (options.startingPoints ?? []).map((point) => ({
      vacationUsed: 0,
      sickUsed: 0,
      vacationCarriedOver: null,
      sickCarriedOver: null,
      ...point,
    }));
    const requests = options.requests ?? [];
    const prisma = {
      ptoPolicy: {
        // One row, keyed by its singleton column — see the service.
        findUnique: jest
          .fn()
          .mockResolvedValue('policy' in options ? options.policy : DEFAULT_POLICY),
        findUniqueOrThrow: jest.fn().mockResolvedValue(DEFAULT_POLICY),
        create: jest.fn().mockResolvedValue(DEFAULT_POLICY),
        update: jest.fn().mockImplementation(({ data }) => ({ ...DEFAULT_POLICY, ...data })),
      },
      employee: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'emp-1',
          hireDate: options.hireDate === undefined ? day('2020-01-01') : options.hireDate,
          createdAt: options.createdAt ?? day('2026-09-25'),
          ptoAllowance: options.allowance ?? null,
          ptoStartingPoints: startingPoints,
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'emp-1',
          firstName: 'Angelica',
          lastName: 'Dominguez',
          preferredName: null,
        }),
      },
      ptoAllowance: {
        upsert: jest.fn().mockReturnValue('allowance-upsert'),
        findUnique: jest.fn().mockResolvedValue(options.allowance ?? null),
      },
      ptoStartingPoint: {
        upsert: jest.fn().mockReturnValue('starting-point-upsert'),
        findUnique: jest.fn().mockResolvedValue(startingPoints[0] ?? null),
      },
      $transaction: jest.fn().mockResolvedValue([]),
      ptoRequest: {
        // Every call returns the same set; the service filters by year itself.
        findMany: jest.fn().mockResolvedValue(requests),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new PtoPolicyService(prisma as any), prisma };
  }

  const approved = (type: PtoType, from: string, to: string, isHalfDay = false) => ({
    type,
    status: PtoStatus.APPROVED,
    startDate: day(from),
    endDate: day(to),
    isHalfDay,
  });

  describe('the policy row', () => {
    it('creates the defaults on a database that has none', async () => {
      const { service, prisma } = build({ policy: null });
      await service.get();

      expect(prisma.ptoPolicy.create).toHaveBeenCalledWith({
        data: { singleton: 1 },
      });
    });

    it("reads the winner's row when two first requests race", async () => {
      // The Time off screen asks for the policy and for a balance at once, and
      // a balance needs the policy too, so the very first page load is two
      // concurrent creates. Without the unique column both used to succeed and
      // the practice ended up with two policies.
      const { service, prisma } = build({ policy: null });
      prisma.ptoPolicy.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate key', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.get()).resolves.toMatchObject({ id: 'policy-1' });
      expect(prisma.ptoPolicy.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { singleton: 1 },
      });
    });

    it('does not swallow a failure that is not a lost race', async () => {
      const { service, prisma } = build({ policy: null });
      prisma.ptoPolicy.create.mockRejectedValue(new Error('the database is on fire'));

      await expect(service.get()).rejects.toThrow('the database is on fire');
    });

    it('updates the one row by its singleton key, not by an id it read earlier', async () => {
      const { service, prisma } = build();
      await service.update({ vacationDaysPerYear: 18 }, 'admin-1');

      expect(prisma.ptoPolicy.update.mock.calls[0][0].where).toEqual({ singleton: 1 });
    });

    it('defaults to 15 PTO days, 5 sick days and 5 carried over', async () => {
      const { service } = build();
      const policy = await service.get();
      expect(policy.vacationDaysPerYear).toBe(15);
      expect(policy.sickDaysPerYear).toBe(5);
      expect(policy.maxCarryoverDays).toBe(5);
    });

    it('records who changed it', async () => {
      const { service, prisma } = build();
      await service.update({ vacationDaysPerYear: 18 }, 'admin-1');
      expect(prisma.ptoPolicy.update.mock.calls[0][0].data).toMatchObject({
        vacationDaysPerYear: 18,
        updatedById: 'admin-1',
      });
    });
  });

  describe('policy years', () => {
    it('runs January to December by default', () => {
      const { service } = build();
      const { start, end } = service.yearBounds(2026, DEFAULT_POLICY);
      expect(start.toISOString().slice(0, 10)).toBe('2026-01-01');
      expect(end.toISOString().slice(0, 10)).toBe('2027-01-01');
    });

    it('can run on a fiscal year', () => {
      const { service } = build();
      const fiscal = { ...DEFAULT_POLICY, yearStartMonth: 7, yearStartDay: 1 };
      expect(service.policyYearOf(day('2026-06-30'), fiscal)).toBe(2025);
      expect(service.policyYearOf(day('2026-07-01'), fiscal)).toBe(2026);
    });
  });

  describe('somebody with no hire date on record', () => {
    it('gets the whole year’s allowance, since there is nothing to prorate from', async () => {
      const { service } = build({ hireDate: null, createdAt: day('2026-09-25') });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation).toMatchObject({ entitled: 15, remaining: 15 });
      expect(balance.sick).toMatchObject({ entitled: 5 });
    });

    it('reads every year it walks back through in one query', async () => {
      const { service, prisma } = build({
        hireDate: day('2020-01-01'),
        createdAt: day('2020-01-01'),
      });
      await service.balanceFor('emp-1', 2026);
      // Six years of carry-over, both allowances: still one read.
      expect(prisma.ptoRequest.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.ptoRequest.findMany.mock.calls[0][0].where.endDate).toEqual({
        gte: day('2020-01-01'),
      });
    });

    it('counts carry-over only from when they were added to the app', async () => {
      const { service, prisma } = build({ hireDate: null, createdAt: day('2026-09-25') });
      await service.balanceFor('emp-1', 2026);
      // Added this year: no earlier years walked, so nothing asked about them.
      expect(prisma.ptoRequest.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('a full-year employee', () => {
    /// Hired on the first day of the year under test, so nothing carries in.
    const thisYearOnly = (requests?: unknown[]) => build({ requests, hireDate: day('2026-01-01') });

    it('starts the year with the full entitlement', async () => {
      const { service } = thisYearOnly();
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation).toMatchObject({ entitled: 15, used: 0, remaining: 15 });
      expect(balance.sick).toMatchObject({ entitled: 5, remaining: 5 });
    });

    it('deducts approved vacation', async () => {
      const { service } = thisYearOnly([approved(PtoType.VACATION, '2026-03-02', '2026-03-06')]);
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.used).toBe(5);
      expect(balance.vacation.remaining).toBe(10);
    });

    it('counts a pending request against the balance too', async () => {
      const { service } = thisYearOnly([
        { ...approved(PtoType.VACATION, '2026-03-02', '2026-03-06'), status: PtoStatus.PENDING },
      ]);
      const balance = await service.balanceFor('emp-1', 2026);
      // Not yet "used", but it must not be spendable twice.
      expect(balance.vacation.used).toBe(0);
      expect(balance.vacation.pending).toBe(5);
      expect(balance.vacation.remaining).toBe(10);
    });

    it('takes personal days out of the PTO allowance', async () => {
      const { service } = thisYearOnly([approved(PtoType.PERSONAL, '2026-03-02', '2026-03-03')]);
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.used).toBe(2);
      expect(balance.sick.used).toBe(0);
    });

    it('keeps sick days in their own allowance', async () => {
      const { service } = thisYearOnly([approved(PtoType.SICK, '2026-03-02', '2026-03-03')]);
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.sick).toMatchObject({ used: 2, remaining: 3 });
      expect(balance.vacation.used).toBe(0);
    });

    it('does not deduct unpaid or bereavement leave', async () => {
      const { service } = thisYearOnly([
        approved(PtoType.UNPAID, '2026-03-02', '2026-03-06'),
        approved(PtoType.BEREAVEMENT, '2026-04-01', '2026-04-03'),
      ]);
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.used).toBe(0);
      expect(balance.sick.used).toBe(0);
      expect(balance.unpaidAndOther).toBe(8);
    });

    it('can go negative, rather than hiding that someone is over', async () => {
      const { service } = thisYearOnly([approved(PtoType.VACATION, '2026-02-02', '2026-03-03')]);
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.remaining).toBeLessThan(0);
    });
  });

  describe('carry-over', () => {
    // In these the app has been in use since they were hired, so it has seen
    // every earlier year.
    it('counts nothing from years before they were added to the app', async () => {
      // Hired 2020, added September 2026: what 2025 left is not known, so
      // nothing is assumed — a manager enters what really rolled over.
      const { service } = build({ hireDate: day('2020-01-01'), createdAt: day('2026-09-25') });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation).toMatchObject({ entitled: 15, carriedOver: 0, available: 15 });
      expect(balance.sick).toMatchObject({ entitled: 5, carriedOver: 0, available: 5 });
    });

    it('works out the next year from the first year in the app', async () => {
      const { service } = build({
        hireDate: day('2020-01-01'),
        createdAt: day('2026-09-25'),
        requests: [approved(PtoType.VACATION, '2026-11-02', '2026-11-13')],
      });
      const balance = await service.balanceFor('emp-1', 2027);
      // 2026: 12 of 15 taken, 3 left to roll over.
      expect(balance.vacation.carriedOver).toBe(3);
    });

    it('carries unused days into the next year, up to the cap', async () => {
      // 2025: used 8 of 15, so 7 unused — capped at 5.
      const { service } = build({
        requests: [approved(PtoType.VACATION, '2025-03-03', '2025-03-12')],
        hireDate: day('2024-01-01'),
        createdAt: day('2024-01-01'),
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.carriedOver).toBe(5);
      expect(balance.vacation.available).toBe(20);
    });

    it('carries less than the cap when less is left', async () => {
      // 2025: used 13 of 15, so 2 unused.
      const { service } = build({
        requests: [approved(PtoType.VACATION, '2025-03-03', '2025-03-15')],
        hireDate: day('2025-01-01'),
        createdAt: day('2025-01-01'),
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.carriedOver).toBe(2);
      expect(balance.vacation.available).toBe(17);
    });

    it('carries nothing when the year was fully used', async () => {
      const { service } = build({
        requests: [approved(PtoType.VACATION, '2025-03-03', '2025-03-22')],
        hireDate: day('2025-01-01'),
        createdAt: day('2025-01-01'),
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.carriedOver).toBe(0);
    });

    it('does not carry sick days by default', async () => {
      const { service } = build({ hireDate: day('2024-01-01'), createdAt: day('2024-01-01') });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.sick.carriedOver).toBe(0);
      expect(balance.sick.available).toBe(5);
    });

    it('carries sick days when the practice turns it on', async () => {
      const { service } = build({
        policy: { ...DEFAULT_POLICY, sickCarryoverDays: 3 },
        hireDate: day('2025-01-01'),
        createdAt: day('2025-01-01'),
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.sick.carriedOver).toBe(3);
    });

    it('does not compound year after year beyond the cap', async () => {
      // Four untouched years would be 60 days if it compounded.
      const { service } = build({ hireDate: day('2022-01-01'), createdAt: day('2022-01-01') });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.carriedOver).toBe(5);
    });

    it('adds carried days on top of the new year entitlement', async () => {
      const { service } = build({ hireDate: day('2025-01-01'), createdAt: day('2025-01-01') });
      const balance = await service.balanceFor('emp-1', 2026);
      // Untouched 2025 leaves 15, capped to 5, on top of 2026's 15.
      expect(balance.vacation).toMatchObject({
        entitled: 15,
        carriedOver: 5,
        available: 20,
        remaining: 20,
      });
    });

    it('carries nothing when the practice turns carry-over off', async () => {
      const { service } = build({
        policy: { ...DEFAULT_POLICY, maxCarryoverDays: 0 },
        hireDate: day('2024-01-01'),
        createdAt: day('2024-01-01'),
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.carriedOver).toBe(0);
    });
  });

  describe('a mid-year starter', () => {
    it('gets a proportional entitlement', async () => {
      // Hired 1 July: roughly half the year left.
      const { service } = build({ hireDate: day('2026-07-01') });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.entitled).toBeGreaterThan(7);
      expect(balance.vacation.entitled).toBeLessThan(8);
    });

    it('gets the whole entitlement when the practice does not prorate', async () => {
      const { service } = build({
        policy: { ...DEFAULT_POLICY, prorateFirstYear: false },
        hireDate: day('2026-07-01'),
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.entitled).toBe(15);
    });

    it('gets the full entitlement in later years', async () => {
      const { service } = build({ hireDate: day('2025-07-01') });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.entitled).toBe(15);
    });

    it('gets nothing for a year before they were hired', async () => {
      const { service } = build({ hireDate: day('2026-07-01') });
      const balance = await service.balanceFor('emp-1', 2025);
      expect(balance.vacation.entitled).toBe(0);
    });
  });

  describe('changing the policy', () => {
    it('is reflected immediately in the balance', async () => {
      const { service } = build({ policy: { ...DEFAULT_POLICY, vacationDaysPerYear: 20 } });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.entitled).toBe(20);
    });
  });

  describe('the switch-over: time taken before Domi Staff', () => {
    it('counts days already taken as taken, and says how many were', async () => {
      const { service } = build({
        requests: [approved(PtoType.VACATION, '2026-10-05', '2026-10-06')],
        startingPoints: [{ policyYear: 2026, vacationUsed: 6, sickUsed: 2.5 }],
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation).toMatchObject({ used: 8, usedBefore: 6 });
      expect(balance.sick).toMatchObject({ used: 2.5, usedBefore: 2.5, remaining: 2.5 });
    });

    it('leaves other years alone', async () => {
      const { service } = build({
        hireDate: day('2026-01-01'),
        startingPoints: [{ policyYear: 2026, vacationUsed: 6 }],
      });
      const balance = await service.balanceFor('emp-1', 2027);
      expect(balance.vacation.usedBefore).toBe(0);
      // Nine of fifteen left in 2026, five of them carried into 2027.
      expect(balance.vacation.carriedOver).toBe(5);
    });

    it('carries on only what was left after them', async () => {
      const { service } = build({
        hireDate: day('2026-01-01'),
        startingPoints: [{ policyYear: 2026, vacationUsed: 13 }],
      });
      const balance = await service.balanceFor('emp-1', 2027);
      expect(balance.vacation.carriedOver).toBe(2);
    });

    it('takes what a manager says really carried over, instead of working it out', async () => {
      const { service } = build({
        hireDate: day('2020-01-01'),
        startingPoints: [{ policyYear: 2026, vacationCarriedOver: 1.5, sickCarriedOver: 2 }],
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.carriedOver).toBe(1.5);
      expect(balance.sick.carriedOver).toBe(2);
      expect(balance.vacation.available).toBe(16.5);
    });

    it('works out later years from what a manager said carried over', async () => {
      const { service } = build({
        hireDate: day('2020-01-01'),
        startingPoints: [{ policyYear: 2026, vacationCarriedOver: 0, vacationUsed: 14 }],
      });
      const balance = await service.balanceFor('emp-1', 2027);
      expect(balance.vacation.carriedOver).toBe(1);
    });
  });

  describe('somebody with their own yearly allowance', () => {
    it('gets theirs instead of the practice’s', async () => {
      const { service } = build({ allowance: { vacationDaysPerYear: 20, sickDaysPerYear: null } });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.entitled).toBe(20);
      expect(balance.sick.entitled).toBe(5);
    });

    it('is prorated in a first year like anybody’s', async () => {
      const { service } = build({
        hireDate: day('2026-07-02'),
        allowance: { vacationDaysPerYear: 10, sickDaysPerYear: 4 },
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.entitled).toBe(5);
      expect(balance.sick.entitled).toBe(2);
    });
  });

  describe('a manager adjusting somebody', () => {
    it('saves their allowance and this year’s starting point together', async () => {
      const { service, prisma } = build();
      jest.useFakeTimers().setSystemTime(day('2026-09-28'));
      try {
        await service.adjust(
          'emp-1',
          { vacationDaysPerYear: 20, sickDaysPerYear: null, vacationUsed: 6, sickUsed: 1 },
          'mgr-1',
        );
      } finally {
        jest.useRealTimers();
      }
      expect(prisma.$transaction).toHaveBeenCalledWith([
        'allowance-upsert',
        'starting-point-upsert',
      ]);
      expect(prisma.ptoAllowance.upsert).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1' },
        create: {
          employeeId: 'emp-1',
          vacationDaysPerYear: 20,
          sickDaysPerYear: null,
          setById: 'mgr-1',
        },
        update: { vacationDaysPerYear: 20, sickDaysPerYear: null, setById: 'mgr-1' },
      });
      expect(prisma.ptoStartingPoint.upsert.mock.calls[0][0]).toMatchObject({
        where: { employeeId_policyYear: { employeeId: 'emp-1', policyYear: 2026 } },
        update: {
          vacationUsed: 6,
          sickUsed: 1,
          vacationCarriedOver: null,
          sickCarriedOver: null,
          setById: 'mgr-1',
        },
      });
    });

    it('refuses somebody who does not exist', async () => {
      const { service, prisma } = build();
      prisma.employee.findUnique.mockResolvedValue(null);
      await expect(service.adjust('nobody', {}, 'mgr-1')).rejects.toThrow('Nobody by that id');
    });
  });
});
