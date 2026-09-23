import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AnnouncementsService } from './announcements.service';

const admin = { id: 'adm-1', email: 'admin@domihealthcare.com', role: Role.ADMIN };

function post(over: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    title: 'Snow closure',
    body: 'Both offices close at 2pm today.',
    isPrimary: false,
    editedAt: null,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    author: null,
    ...over,
  };
}

/// A transaction that runs its callback against the same mocks, so the tests
/// can see every write it made and in what order.
function build(options: { primaryCount?: number; one?: unknown; next?: unknown } = {}) {
  const announcement = {
    count: jest.fn().mockResolvedValue(options.primaryCount ?? 0),
    findMany: jest.fn().mockResolvedValue([post()]),
    findFirst: jest
      .fn()
      .mockResolvedValue('next' in options ? options.next : post({ id: 'post-2' })),
    findUnique: jest.fn().mockResolvedValue('one' in options ? options.one : post()),
    create: jest.fn(async ({ data }) => post(data as Record<string, unknown>)),
    update: jest.fn(async ({ data }) => post(data as Record<string, unknown>)),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    delete: jest.fn().mockResolvedValue(post()),
  };
  const prisma = {
    announcement,
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ announcement })),
  };
  return { service: new AnnouncementsService(prisma as never), announcement };
}

describe('AnnouncementsService', () => {
  describe('posting', () => {
    it('makes the very first post primary even when not asked to', async () => {
      const { service, announcement } = build({ primaryCount: 0 });
      const row = await service.create({ title: 'Welcome', body: 'Hello' }, admin);

      expect(row.isPrimary).toBe(true);
      expect(announcement.updateMany).not.toHaveBeenCalled();
    });

    it('leaves the current primary alone when a new post is not ticked', async () => {
      const { service, announcement } = build({ primaryCount: 1 });
      const row = await service.create({ title: 'Parking', body: 'Use the back lot.' }, admin);

      expect(row.isPrimary).toBe(false);
      expect(announcement.updateMany).not.toHaveBeenCalled();
    });

    it('moves the primary to a new post that is ticked', async () => {
      const { service, announcement } = build({ primaryCount: 1 });
      const row = await service.create(
        { title: 'Snow closure', body: 'Close at 2pm.', isPrimary: true },
        admin,
      );

      expect(row.isPrimary).toBe(true);
      expect(announcement.updateMany).toHaveBeenCalledWith({
        where: { isPrimary: true },
        data: { isPrimary: false },
      });
    });

    it('trims what was typed and records who wrote it', async () => {
      const { service, announcement } = build();
      await service.create({ title: '  Parking  ', body: '\n Use the back lot. \n' }, admin);

      expect(announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Parking',
            body: 'Use the back lot.',
            authorId: 'adm-1',
          }),
        }),
      );
    });
  });

  describe('editing', () => {
    it('refuses to untick the primary, because there must always be one', async () => {
      const { service } = build({ one: post({ isPrimary: true }) });
      await expect(service.update('post-1', { isPrimary: false }, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('moves the primary here when ticked', async () => {
      const { service, announcement } = build({ one: post({ isPrimary: false }) });
      await service.update('post-1', { isPrimary: true }, admin);

      expect(announcement.updateMany).toHaveBeenCalledWith({
        where: { isPrimary: true },
        data: { isPrimary: false },
      });
      expect(announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isPrimary: true }) }),
      );
    });

    it('does nothing to other posts when the primary is ticked again', async () => {
      const { service, announcement } = build({ one: post({ isPrimary: true }) });
      await service.update('post-1', { isPrimary: true }, admin);
      expect(announcement.updateMany).not.toHaveBeenCalled();
    });

    it('marks a post as edited when its words change', async () => {
      const { service, announcement } = build();
      await service.update('post-1', { body: 'Both offices close at 1pm today.' }, admin);

      const { data } = announcement.update.mock.calls[0][0];
      expect(data.editedAt).toBeInstanceOf(Date);
    });

    it('does not mark it edited when only the primary moves', async () => {
      const { service, announcement } = build();
      await service.update('post-1', { isPrimary: true }, admin);

      const { data } = announcement.update.mock.calls[0][0];
      expect(data.editedAt).toBeUndefined();
    });

    it('does not mark it edited when the same words are saved again', async () => {
      const { service, announcement } = build();
      await service.update('post-1', { title: 'Snow closure ' }, admin);

      const { data } = announcement.update.mock.calls[0][0];
      expect(data.editedAt).toBeUndefined();
    });

    it('says so when the post has gone', async () => {
      const { service } = build({ one: null });
      await expect(service.update('gone', { title: 'x y' }, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deleting', () => {
    it('hands the primary to the newest post left', async () => {
      const { service, announcement } = build({ one: post({ isPrimary: true }) });
      await service.remove('post-1', admin);

      expect(announcement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
      expect(announcement.update).toHaveBeenCalledWith({
        where: { id: 'post-2' },
        data: { isPrimary: true },
      });
    });

    it('has nothing to hand on when the last post goes', async () => {
      const { service, announcement } = build({ one: post({ isPrimary: true }), next: null });
      await service.remove('post-1', admin);
      expect(announcement.update).not.toHaveBeenCalled();
    });

    it('leaves the primary where it is when another post is deleted', async () => {
      const { service, announcement } = build({ one: post({ isPrimary: false }) });
      await service.remove('post-1', admin);

      expect(announcement.findFirst).not.toHaveBeenCalled();
      expect(announcement.update).not.toHaveBeenCalled();
    });
  });
});
