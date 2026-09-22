import { PtoStatus, PtoType } from '@prisma/client';
import { PtoPolicyService, TYPE_BUCKET, daysWithin } from './pto-policy.service';

const DEFAULT_POLICY = {
  id: 'policy-1',
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
      daysWithin({ startDate: day('2026-03-02'), endDate: day('2026-03-06'), isHalfDay: false }, start, end),
    ).toBe(5);
  });

  it('counts a half day as half', () => {
    expect(
      daysWithin({ startDate: day('2026-03-02'), endDate: day('2026-03-02'), isHalfDay: true }, start, end),
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
      daysWithin({ startDate: day('2025-05-01'), endDate: day('2025-05-05'), isHalfDay: false }, start, end),
    ).toBe(0);
  });
});

describe('PtoPolicyService', () => {
  function build(options: { policy?: unknown; requests?: unknown[]; hireDate?: Date } = {}) {
    const requests = options.requests ?? [];
    const prisma = {
      ptoPolicy: {
        findFirst: jest
          .fn()
          .mockResolvedValue('policy' in options ? options.policy : DEFAULT_POLICY),
        create: jest.fn().mockResolvedValue(DEFAULT_POLICY),
        update: jest.fn().mockImplementation(({ data }) => ({ ...DEFAULT_POLICY, ...data })),
      },
      employee: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'emp-1',
          hireDate: options.hireDate ?? day('2020-01-01'),
        }),
      },
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
      expect(prisma.ptoPolicy.create).toHaveBeenCalledWith({ data: {} });
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

  describe('a full-year employee', () => {
    /// Hired on the first day of the year under test, so nothing carries in.
    const thisYearOnly = (requests?: unknown[]) =>
      build({ requests, hireDate: day('2026-01-01') });

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
    it('carries unused days into the next year, up to the cap', async () => {
      // 2025: used 8 of 15, so 7 unused — capped at 5.
      const { service } = build({
        requests: [approved(PtoType.VACATION, '2025-03-03', '2025-03-12')],
        hireDate: day('2024-01-01'),
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
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.carriedOver).toBe(2);
      expect(balance.vacation.available).toBe(17);
    });

    it('carries nothing when the year was fully used', async () => {
      const { service } = build({
        requests: [approved(PtoType.VACATION, '2025-03-03', '2025-03-22')],
        hireDate: day('2025-01-01'),
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.carriedOver).toBe(0);
    });

    it('does not carry sick days by default', async () => {
      const { service } = build({ hireDate: day('2024-01-01') });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.sick.carriedOver).toBe(0);
      expect(balance.sick.available).toBe(5);
    });

    it('carries sick days when the practice turns it on', async () => {
      const { service } = build({
        policy: { ...DEFAULT_POLICY, sickCarryoverDays: 3 },
        hireDate: day('2025-01-01'),
      });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.sick.carriedOver).toBe(3);
    });

    it('does not compound year after year beyond the cap', async () => {
      // Four untouched years would be 60 days if it compounded.
      const { service } = build({ hireDate: day('2022-01-01') });
      const balance = await service.balanceFor('emp-1', 2026);
      expect(balance.vacation.carriedOver).toBe(5);
    });

    it('adds carried days on top of the new year entitlement', async () => {
      const { service } = build({ hireDate: day('2025-01-01') });
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
});
