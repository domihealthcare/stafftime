import { Prisma, PtoStatus, PtoType, Role } from '@prisma/client';
import { isoDate } from '../common/util/calendar-date.util';
import { PastBalanceRepairService } from './past-balance-repair.service';

/**
 * Putting right time off approved past the balance before 2 November 2026:
 * which requests are found, and what splitting one writes.
 */
describe('PastBalanceRepairService', () => {
  const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
  const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };
  const frankie = {
    id: 'emp-1',
    firstName: 'Frankie',
    lastName: 'Front-Desk',
    preferredName: null,
  };

  // Sick, 5 a year: Mon 2 to Fri 6 Nov is 5 days and fits; Mon 9 to Tue 10 does not.
  const fits = {
    id: 'fits',
    employeeId: 'emp-1',
    type: PtoType.SICK,
    startDate: day('2026-11-02'),
    endDate: day('2026-11-06'),
    isHalfDay: false,
    createdAt: day('2026-10-01'),
    recordedById: null,
    employee: frankie,
    _count: { changes: 0 },
  };
  const past = {
    ...fits,
    id: 'past',
    startDate: day('2026-11-09'),
    endDate: day('2026-11-10'),
    createdAt: day('2026-10-02'),
  };

  function build(requests: unknown[]) {
    const prisma = {
      ptoRequest: {
        findMany: jest.fn().mockResolvedValue(requests),
        update: jest.fn().mockImplementation(({ where }) => ({ id: where.id })),
        create: jest.fn().mockResolvedValue({ id: 'unpaid-part' }),
      },
      ptoChange: { create: jest.fn().mockResolvedValue({ id: 'change-1' }) },
      $transaction: jest.fn((writes: Promise<unknown>[]) => Promise.all(writes)),
    };
    const policy = {
      get: jest.fn().mockResolvedValue({ yearStartMonth: 1, yearStartDay: 1 }),
      policyYearOf: (date: Date) => date.getUTCFullYear(),
      yearBounds: (year: number) => ({
        start: new Date(Date.UTC(year, 0, 1)),
        end: new Date(Date.UTC(year + 1, 0, 1)),
      }),
      balancesOn: jest.fn(async (asked: unknown[]) =>
        asked.map(() => ({
          yearStart: '2026-01-01',
          yearEnd: '2026-12-31',
          sick: { available: 5, usedBefore: 0 },
          vacation: { available: 15, usedBefore: 0 },
        })),
      ),
    };
    const days = { closedByPerson: jest.fn().mockResolvedValue(new Map()) };
    const notifications = { ptoChanged: jest.fn().mockResolvedValue(undefined) };
    const service = new PastBalanceRepairService(
      prisma as never,
      policy as never,
      days as never,
      notifications as never,
    );
    return { service, prisma, notifications };
  }

  it('lists the request that went past, with what splitting it does', async () => {
    const { service } = build([fits, past]);
    const found = await service.list(manager);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: 'past',
      paidDays: 0,
      unpaidDays: 2,
      paid: null,
      unpaid: { startDate: '2026-11-09', endDate: '2026-11-10' },
    });
  });

  it('never lists the manager’s own time off', async () => {
    const { service } = build([fits, past]);
    expect(await service.list({ ...manager, id: 'emp-1' })).toEqual([]);
  });

  it('leaves alone what an admin recorded or a manager has changed, but counts its days', async () => {
    const { service } = build([{ ...fits, recordedById: 'adm-1' }, past]);
    // The recorded week used all 5, so the later one is still past it.
    expect((await service.list(manager)).map((fix) => fix.id)).toEqual(['past']);
    const changed = build([fits, { ...past, _count: { changes: 1 } }]);
    expect(await changed.service.list(manager)).toEqual([]);
  });

  it('splits a request in two, guarded on it being unchanged, records who did it and tells them', async () => {
    const longer = { ...past, endDate: day('2026-11-13') }; // Mon 9 to Fri 13: 5 days
    const { service, prisma, notifications } = build([
      { ...fits, endDate: day('2026-11-04') }, // 3 days, leaving 2
      longer,
    ]);
    await expect(service.split(['past'], manager)).resolves.toEqual({ split: 1 });

    const update = prisma.ptoRequest.update.mock.calls[0][0];
    expect(update.where).toMatchObject({ id: 'past', status: PtoStatus.APPROVED, type: 'SICK' });
    expect(isoDate(update.data.endDate)).toBe('2026-11-10');
    const part = prisma.ptoRequest.create.mock.calls[0][0].data;
    expect(part).toMatchObject({
      type: PtoType.UNPAID,
      status: PtoStatus.APPROVED,
      splitFromId: 'past',
      unpaidPastBalanceOf: PtoType.SICK,
      reviewedById: 'mgr-1',
    });
    expect(isoDate(part.startDate)).toBe('2026-11-11');
    expect(prisma.ptoChange.create.mock.calls[0][0].data).toMatchObject({
      requestId: 'past',
      changedById: 'mgr-1',
      summary:
        'Split past the sick balance: 2 days Sick, Mon, Nov 9 to Tue, Nov 10; 3 days Unpaid, Wed, Nov 11 to Fri, Nov 13',
    });
    expect(notifications.ptoChanged).toHaveBeenCalledWith('change-1');
  });

  it('only splits what was asked for, and skips one changed since it was listed', async () => {
    const { service, prisma } = build([fits, past]);
    await expect(service.split(['fits'], manager)).resolves.toEqual({ split: 0 });
    prisma.ptoRequest.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'x' }),
    );
    await expect(service.split(['past'], manager)).resolves.toEqual({ split: 0 });
  });
});
