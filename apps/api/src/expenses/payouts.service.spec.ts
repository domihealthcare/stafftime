import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NotificationKind, ReimbursementMethod, Role } from '@prisma/client';
import { PayoutsService } from './payouts.service';

const angelica = { id: 'a1', email: 'a@example.com', role: Role.ADMIN };
const person = {
  id: 'e1',
  firstName: 'Casey',
  lastName: 'Lee',
  preferredName: null,
  postNominals: null,
  photoUpdatedAt: null,
};

function build() {
  const prisma = {
    employee: { findUnique: jest.fn().mockResolvedValue({ canApproveExpenses: false }) },
    practiceSettings: {
      findFirst: jest.fn().mockResolvedValue({ payPeriodStart: new Date('2026-10-19') }),
    },
    expenseRequest: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'x1',
          employeeId: 'e1',
          description: 'Printer ink',
          amountCents: 4210,
          approvedCents: 4000,
          decidedAt: new Date('2026-10-31T12:00:00Z'),
          payDeferredUntil: null,
          employee: person,
        },
        {
          id: 'x2',
          employeeId: 'e1',
          description: 'Gloves',
          amountCents: 1500,
          approvedCents: 1500,
          decidedAt: new Date('2026-10-30T12:00:00Z'),
          payDeferredUntil: new Date('2026-11-13T00:00:00Z'),
          employee: person,
        },
      ]),
      findFirst: jest.fn().mockResolvedValue({ employeeId: 'e1', description: 'Printer ink' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    cmeRequest: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'c1',
          employeeId: 'e1',
          title: 'AAFP FMX',
          registrationCents: 80000,
          travelCents: 0,
          lodgingCents: 0,
          otherCents: 0,
          approvedCents: null,
          decidedAt: new Date('2026-10-29T12:00:00Z'),
          payDeferredUntil: null,
          employee: person,
        },
      ]),
      findFirst: jest.fn().mockResolvedValue({ employeeId: 'e1', title: 'AAFP FMX' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const notifications = { personal: jest.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new PayoutsService(prisma as any, notifications as any);
  return { service, prisma, notifications };
}

const now = new Date('2026-11-01T15:00:00Z');

describe('PayoutsService', () => {
  it('lists expenses and CME together, the put-off ones apart', async () => {
    const { service } = build();
    const list = await service.list(now);
    expect(list.due.map((payout) => [payout.kind, payout.id, payout.amountCents])).toEqual([
      ['cme', 'c1', 80000],
      ['expense', 'x1', 4000],
    ]);
    expect(list.deferred.map((payout) => payout.id)).toEqual(['x2']);
    expect(list.nextPayroll).toBe('2026-11-12');
  });

  it('records a paper check outside payroll and tells the person', async () => {
    const { service, prisma, notifications } = build();
    await service.paid(
      'cme',
      'c1',
      {
        paidOn: '2026-11-01',
        paidCents: 80000,
        how: ReimbursementMethod.PAPER_CHECK,
        note: '#1042',
      },
      angelica,
      now,
    );
    expect(prisma.cmeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reimbursedCents: 80000,
          reimbursedHow: ReimbursementMethod.PAPER_CHECK,
          reimbursedNote: '#1042',
          payDeferredUntil: null,
        }),
      }),
    );
    expect(notifications.personal).toHaveBeenCalledWith(
      ['e1'],
      NotificationKind.CME,
      expect.objectContaining({ body: 'AAFP FMX: $800.00, by a paper check.' }),
    );
  });

  it('refuses a day still to come, one already paid, and your own', async () => {
    const { service, prisma } = build();
    const paid = { paidOn: '2026-11-01', paidCents: 4000, how: ReimbursementMethod.CASH };
    await expect(
      service.paid('expense', 'x1', { ...paid, paidOn: '2026-11-02' }, angelica, now),
    ).rejects.toThrow(BadRequestException);
    prisma.expenseRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.paid('expense', 'x1', paid, angelica, now)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.paid('expense', 'x1', paid, { ...angelica, id: 'e1' }, now),
    ).rejects.toThrow(ForbiddenException);
  });

  it('puts one off until the next payroll, and brings it back', async () => {
    const { service, prisma } = build();
    expect(await service.defer('expense', 'x1', angelica, now)).toEqual({
      deferredUntil: '2026-11-12',
    });
    expect(prisma.expenseRequest.update).toHaveBeenCalledWith({
      where: { id: 'x1' },
      data: { payDeferredUntil: new Date('2026-11-12T00:00:00Z') },
    });
    await service.undefer('expense', 'x1', angelica);
    expect(prisma.expenseRequest.update).toHaveBeenLastCalledWith({
      where: { id: 'x1' },
      data: { payDeferredUntil: null },
    });
  });

  it('is for managers, admins and the expense approvers', async () => {
    const { service, prisma } = build();
    expect(await service.allowed(angelica)).toBe(true);
    expect(await service.allowed({ ...angelica, role: Role.EMPLOYEE })).toBe(false);
    prisma.employee.findUnique.mockResolvedValueOnce({ canApproveExpenses: true });
    expect(await service.allowed({ ...angelica, role: Role.EMPLOYEE })).toBe(true);
  });
});
