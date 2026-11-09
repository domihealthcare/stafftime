/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OnCallSwapStatus, Role } from '@prisma/client';
import { daysWords, OnCallService } from './on-call.service';

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
    onCallDay: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    onCallSwap: {
      create: jest.fn().mockResolvedValue({ id: 'swap-1' }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'swap-1',
        requesterId: 'frankie',
        partnerId: 'max',
        giveDate: new Date('2026-10-19T00:00:00.000Z'),
        takeDate: new Date('2026-10-22T00:00:00.000Z'),
        giveDates: [],
        takeDates: [],
        status: OnCallSwapStatus.PENDING,
        ...swap,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  prisma.$transaction = jest.fn(async (work: unknown) =>
    Array.isArray(work) ? Promise.all(work) : (work as (tx: unknown) => unknown)(prisma),
  );
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

describe('several on-call days at once', () => {
  it('asks for several days in one request, and checks each is the asker’s', async () => {
    const { service, prisma, notifications } = build();
    await service.askSwap(
      { giveDate: '2026-10-20', giveDates: ['2026-10-19', '2026-10-21'], partnerId: 'max' },
      frankie,
      NOW,
    );
    const data = prisma.onCallSwap.create.mock.calls[0][0].data;
    expect(data.giveDate.toISOString().slice(0, 10)).toBe('2026-10-19');
    expect(data.giveDates.map((d: Date) => d.toISOString().slice(0, 10))).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
    ]);
    expect(notifications.onCall.mock.calls[0][1].title).toContain(
      'Mon, Oct 19, Tue, Oct 20 and Wed, Oct 21',
    );
    // Thursday 22 is Max's, not Frankie's.
    await expect(
      service.askSwap(
        { giveDate: '2026-10-21', giveDates: ['2026-10-22'], partnerId: 'max' },
        frankie,
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a yes moves every day of the request', async () => {
    const { service, prisma } = build({
      giveDate: new Date('2026-10-19T00:00:00.000Z'),
      giveDates: [new Date('2026-10-19T00:00:00.000Z'), new Date('2026-10-20T00:00:00.000Z')],
      takeDate: null,
      takeDates: [],
    });
    await service.answerSwap('swap-1', true, max, NOW);
    const moved = prisma.onCallDay.upsert.mock.calls.map((call: any) => [
      call[0].create.date.toISOString().slice(0, 10),
      call[0].create.employeeId,
    ]);
    expect(moved).toEqual([
      ['2026-10-19', 'max'],
      ['2026-10-20', 'max'],
    ]);
  });

  it('a manager changes a run of days, and each person is told once', async () => {
    const { service, prisma, notifications } = build();
    await service.setDay(
      '2026-10-19',
      { employeeId: 'max', until: '2026-10-23', note: 'Conference' },
      manager,
      NOW,
    );
    expect(prisma.onCallDay.upsert).toHaveBeenCalledTimes(5);
    expect(notifications.onCall).toHaveBeenCalledTimes(1);
    const [who, words] = notifications.onCall.mock.calls[0];
    expect(new Set(who)).toEqual(new Set(['frankie', 'max']));
    // Thursday was already Max's, so four days moved.
    expect(words.title).toBe('On call 4 days, Mon, Oct 19 to Fri, Oct 23: now Dr. Max A');
  });

  it('puts a run of days back to the usual', async () => {
    const { service, prisma } = build();
    await service.setDay('2026-10-19', { employeeId: null, until: '2026-10-21' }, manager, NOW);
    expect(prisma.onCallDay.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('refuses more than two months at once', async () => {
    const { service } = build();
    await expect(
      service.setDay('2026-10-19', { employeeId: 'max', until: '2027-01-31' }, manager, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('words the days', () => {
    expect(daysWords(['2026-10-19'])).toBe('Mon, Oct 19');
    expect(daysWords(['2026-10-20', '2026-10-19'])).toBe('Mon, Oct 19 and Tue, Oct 20');
    expect(daysWords(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'])).toBe(
      'Mon, Oct 19 to Thu, Oct 22 (4 days)',
    );
  });
});
