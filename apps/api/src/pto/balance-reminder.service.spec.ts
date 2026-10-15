import { BalanceReminderService } from './balance-reminder.service';

/// 10am on Sunday 1 November 2026 in New Jersey.
const NOW = new Date('2026-11-01T15:00:00.000Z');

function build(person: Record<string, unknown> | null, balance: Record<string, unknown> = {}) {
  const prisma = {
    employee: {
      findUnique: jest.fn().mockResolvedValue(person),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const policy = {
    balanceFor: jest.fn().mockResolvedValue({
      vacation: { available: 15, remaining: 9 },
      sick: { available: 5, remaining: 5 },
      ...balance,
    }),
  };
  return {
    service: new BalanceReminderService(prisma as never, policy as never),
    prisma,
  };
}

const someone = {
  balanceReminderMonth: '2026-10',
  employmentStatus: 'ACTIVE',
  createdAt: new Date('2026-09-25T12:00:00.000Z'),
};

describe('BalanceReminderService', () => {
  it('is due the first time somebody opens Home in a month', async () => {
    const { service } = build(someone);
    const due = await service.due('emp-1', NOW);
    expect(due).toMatchObject({ show: true, month: '2026-11' });
  });

  it('is not shown twice in a month', async () => {
    const { service } = build({ ...someone, balanceReminderMonth: '2026-11' });
    expect(await service.due('emp-1', NOW)).toEqual({ show: false });
  });

  it('waits until next month for somebody added this month', async () => {
    const { service } = build({ ...someone, balanceReminderMonth: null, createdAt: NOW });
    expect(await service.due('emp-1', NOW)).toEqual({ show: false });
  });

  it('is not for somebody with no time off at all, or who has left', async () => {
    const none = build(someone, {
      vacation: { available: 0, remaining: 0 },
      sick: { available: 0, remaining: 0 },
    });
    expect(await none.service.due('emp-1', NOW)).toEqual({ show: false });
    const left = build({ ...someone, employmentStatus: 'TERMINATED' });
    expect(await left.service.due('emp-1', NOW)).toEqual({ show: false });
  });

  it('remembers the month it was seen, on New Jersey’s calendar', async () => {
    const { service, prisma } = build(someone);
    // 11pm on 31 October in New Jersey is already November in UTC.
    await service.seen('emp-1', new Date('2026-11-01T03:00:00.000Z'));
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { balanceReminderMonth: '2026-10' },
    });
  });
});
