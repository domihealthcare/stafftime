/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OnCallSwapStatus, Role } from '@prisma/client';
import { OnCallService } from './on-call.service';

const NOW = new Date('2026-10-12T15:00:00.000Z'); // Mon 12 Oct, 11am in New Jersey
const frankie = { id: 'frankie', email: 'f@x', role: Role.EMPLOYEE };
const max = { id: 'max', email: 'm@x', role: Role.EMPLOYEE };
const manager = { id: 'mgr', email: 'g@x', role: Role.MANAGER };

// Frankie every day but Thursday, Max on Thursdays.
const ROTA = {
  startsOn: new Date('2026-10-01T00:00:00.000Z'),
  changesAt: '12:00',
  entries: [1, 2, 3, 5, 6, 7]
    .map((weekday) => ({ weekday, weekOfMonth: 0, employeeId: 'frankie' }))
    .concat([{ weekday: 4, weekOfMonth: 0, employeeId: 'max' }]),
};

function build(swap: Record<string, unknown> = {}) {
  const prisma: Record<string, any> = {
    employee: {
      count: jest.fn(async ({ where }) => (where.id?.in ? where.id.in.length : 1)),
      findMany: jest.fn(async () => [
        {
          id: 'frankie',
          firstName: 'Frankie',
          lastName: 'F',
          preferredName: null,
          postNominals: null,
          photoUpdatedAt: null,
        },
        {
          id: 'max',
          firstName: 'Max',
          lastName: 'A',
          preferredName: null,
          postNominals: 'MD',
          photoUpdatedAt: null,
        },
      ]),
    },
    onCallRota: { findMany: jest.fn().mockResolvedValue([ROTA]) },
    onCallDay: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    onCallSwap: {
      create: jest.fn().mockResolvedValue({ id: 'swap-1' }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'swap-1',
        requesterId: 'frankie',
        partnerId: 'max',
        giveDate: new Date('2026-10-19T00:00:00.000Z'),
        takeDate: new Date('2026-10-22T00:00:00.000Z'),
        status: OnCallSwapStatus.PENDING,
        ...swap,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  prisma.$transaction = jest.fn(async (work: (tx: unknown) => unknown) => work(prisma));
  const notifications = { onCall: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new OnCallService(prisma as never, notifications as never),
    prisma,
    notifications,
  };
}

describe('OnCallService swaps', () => {
  it('asks the other provider, by bell and email', async () => {
    const { service, notifications } = build();
    await service.askSwap(
      { giveDate: '2026-10-19', partnerId: 'max', takeDate: '2026-10-22' },
      frankie,
      NOW,
    );
    expect(notifications.onCall).toHaveBeenCalledWith(
      ['max'],
      expect.objectContaining({
        title: expect.stringContaining('asks you to take on call Mon, Oct 19'),
      }),
      { email: true },
    );
  });

  it('will not offer a day that is not yours', async () => {
    const { service } = build();
    await expect(
      service.askSwap({ giveDate: '2026-10-22', partnerId: 'max' }, frankie, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('on yes, gives each day to the other', async () => {
    const { service, prisma } = build();
    await service.answerSwap('swap-1', true, max, NOW);
    const writes = prisma.onCallDay.upsert.mock.calls.map((call: any[]) => [
      call[0].create.date.toISOString().slice(0, 10),
      call[0].create.employeeId,
    ]);
    expect(writes).toEqual([
      ['2026-10-19', 'max'],
      ['2026-10-22', 'frankie'],
    ]);
  });

  it('a swapped day keeps its backup, unless the backup is who takes it', async () => {
    const { service, prisma } = build();
    // Mondays: Frankie with Pat as backup; Thursdays: Max with Frankie as backup.
    prisma.onCallRota.findMany.mockResolvedValue([
      {
        ...ROTA,
        entries: ROTA.entries.map((entry) => ({
          ...entry,
          backupEmployeeId: entry.employeeId === 'max' ? 'frankie' : 'pat',
        })),
      },
    ]);
    await service.answerSwap('swap-1', true, max, NOW);
    const backups = prisma.onCallDay.upsert.mock.calls.map((call: any[]) => [
      call[0].create.date.toISOString().slice(0, 10),
      call[0].create.backupEmployeeId,
    ]);
    expect(backups).toEqual([
      ['2026-10-19', 'pat'],
      ['2026-10-22', null],
    ]);
  });

  it('only the provider asked can answer', async () => {
    const { service } = build();
    await expect(service.answerSwap('swap-1', true, manager, NOW)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses when the schedule has changed since', async () => {
    const { service, prisma } = build();
    prisma.onCallDay.findMany.mockResolvedValue([
      { date: new Date('2026-10-19T00:00:00.000Z'), employeeId: 'max', swapId: null, note: null },
    ]);
    await expect(service.answerSwap('swap-1', true, max, NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('answers once: a second yes finds it taken', async () => {
    const { service, prisma } = build();
    prisma.onCallSwap.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.answerSwap('swap-1', true, max, NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.onCallDay.upsert).not.toHaveBeenCalled();
  });
});

describe('OnCallService backups', () => {
  it('refuses a backup who is the provider', async () => {
    const { service } = build();
    await expect(
      service.saveRota(
        {
          startsOn: '2026-10-20',
          changesAt: '12:00',
          entries: [
            { weekday: 1, weekOfMonth: 0, employeeId: 'frankie', backupEmployeeId: 'frankie' },
          ],
        },
        manager,
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setDay('2026-10-20', { employeeId: 'max', backupEmployeeId: 'max' }, manager, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores a day backup', async () => {
    const { service, prisma } = build();
    await service.setDay(
      '2026-10-20',
      { employeeId: 'max', backupEmployeeId: 'frankie' },
      manager,
      NOW,
    );
    expect(prisma.onCallDay.upsert.mock.calls[0][0].create.backupEmployeeId).toBe('frankie');
  });
});
