import { InboxService, NOTIFICATION_RETENTION_DAYS } from './inbox.service';

describe('InboxService', () => {
  function build() {
    const prisma = {
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(3),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
      },
    };
    return { service: new InboxService(prisma as never), prisma };
  }
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('writes one row per person, once each', async () => {
    const { service, prisma } = build();

    service.notify(['a', 'b', 'a'], { kind: 'OVERTIME', title: 'Over', link: '/schedule' });
    await flush();

    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        { employeeId: 'a', kind: 'OVERTIME', title: 'Over', body: null, link: '/schedule' },
        { employeeId: 'b', kind: 'OVERTIME', title: 'Over', body: null, link: '/schedule' },
      ],
    });
  });

  it('never throws at whoever called it, even if the write fails', async () => {
    const { service, prisma } = build();
    prisma.notification.createMany.mockRejectedValue(new Error('database down'));

    expect(() => service.notify(['a'], { kind: 'OVERTIME', title: 'Over' })).not.toThrow();
    await flush();
  });

  it('tells everybody still working here, apart from the person who wrote it', async () => {
    const { service, prisma } = build();

    await service.notifyEveryone({ kind: 'ANNOUNCEMENT', title: 'New post' }, 'author');
    await flush();

    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: 'author' });
    expect(where.employmentStatus).toEqual({ in: ['ACTIVE', 'ON_LEAVE'] });
    expect(prisma.notification.createMany).toHaveBeenCalled();
  });

  it('only ever lists and marks your own', async () => {
    const { service, prisma } = build();

    await service.list('me');
    await service.markRead('me', 'n-1');
    await service.markAllRead('me');

    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({ employeeId: 'me' });
    // The id alone would let anybody mark anybody's; the owner is part of it.
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({
      id: 'n-1',
      employeeId: 'me',
      readAt: null,
    });
    expect(prisma.notification.updateMany.mock.calls[1][0].where).toEqual({
      employeeId: 'me',
      readAt: null,
    });
  });

  it(`deletes what is older than ${NOTIFICATION_RETENTION_DAYS} days, read or not`, async () => {
    const { service, prisma } = build();

    const removed = await service.purgeOld(new Date('2026-12-30T00:00:00Z'));

    expect(removed).toBe(4);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-10-01T00:00:00Z') } },
    });
  });
});
