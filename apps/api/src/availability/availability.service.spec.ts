import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, ShiftStatus, UnavailabilityKind } from '@prisma/client';
import { AvailabilityService } from './availability.service';

const NJ = 'America/New_York';
const frankie = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };
const max = { id: 'emp-2', email: 'max@domihealthcare.com', role: Role.EMPLOYEE };
const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };

/// Wednesday 23 September 2026, mid-morning in New Jersey.
const NOW = new Date('2026-09-23T14:00:00Z');
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    employeeId: 'emp-1',
    kind: UnavailabilityKind.WEEKLY,
    weekday: 2,
    date: null,
    startTime: null,
    endTime: null,
    note: null,
    effectiveFrom: d('2026-09-01'),
    effectiveUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

/// `publishedThrough`: the start of the last published shift at Frankie's
/// location, or null for nothing published.
function build(options: { publishedThrough?: string | null; one?: unknown } = {}) {
  const published =
    options.publishedThrough === undefined ? '2026-10-01T13:00:00Z' : options.publishedThrough;
  const prisma = {
    employeeLocation: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ isPrimary: true, location: { id: 'loc-1', timezone: NJ } }]),
    },
    shift: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          published ? { startsAt: new Date(published), location: { timezone: NJ } } : null,
        ),
    },
    unavailability: {
      findMany: jest.fn().mockResolvedValue([row()]),
      findUnique: jest.fn().mockResolvedValue('one' in options ? options.one : row()),
      create: jest.fn(async ({ data }) => row(data as Record<string, unknown>)),
      update: jest.fn(async ({ data }) => row(data as Record<string, unknown>)),
      delete: jest.fn().mockResolvedValue(row()),
    },
  };
  return { service: new AvailabilityService(prisma as never), prisma };
}

describe('AvailabilityService', () => {
  describe('the first date a change can touch', () => {
    it('is the Monday after the last published week', async () => {
      // Published through Thursday 1 October, so that week (from Mon 28 Sep)
      // is fixed and the first open day is Monday 5 October.
      const { service } = build();
      await expect(service.window('emp-1', NOW)).resolves.toEqual({
        today: '2026-09-23',
        firstOpenDate: '2026-10-05',
      });
    });

    it('is today when nothing ahead is published', async () => {
      const { service } = build({ publishedThrough: null });
      await expect(service.window('emp-1', NOW)).resolves.toMatchObject({
        firstOpenDate: '2026-09-23',
      });
    });

    it('only counts published shifts at the person’s own locations', async () => {
      const { service, prisma } = build();
      await service.window('emp-1', NOW);
      expect(prisma.shift.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ShiftStatus.PUBLISHED,
            locationId: { in: ['loc-1'] },
          }),
        }),
      );
    });
  });

  describe('adding', () => {
    it('starts a new weekly rule at the first open week, not today', async () => {
      const { service, prisma } = build();
      const rule = await service.create(
        { kind: UnavailabilityKind.WEEKLY, weekday: 6 },
        frankie,
        NOW,
      );

      expect(prisma.unavailability.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          employeeId: 'emp-1',
          weekday: 6,
          date: null,
          effectiveFrom: d('2026-10-05'),
        }),
      });
      expect(rule.description).toBe('Not available Saturdays (all day)');
    });

    it('refuses a one-off date inside a published week', async () => {
      const { service, prisma } = build();
      await expect(
        service.create({ kind: UnavailabilityKind.ONE_OFF, date: '2026-09-30' }, frankie, NOW),
      ).rejects.toThrow(/already published/);
      expect(prisma.unavailability.create).not.toHaveBeenCalled();
    });

    it('takes a one-off date in an open week', async () => {
      const { service, prisma } = build();
      await service.create(
        {
          kind: UnavailabilityKind.ONE_OFF,
          date: '2026-10-14',
          startTime: '13:00',
          endTime: '17:00',
        },
        frankie,
        NOW,
      );
      expect(prisma.unavailability.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          weekday: null,
          date: d('2026-10-14'),
          effectiveFrom: d('2026-10-14'),
          startTime: '13:00',
          endTime: '17:00',
        }),
      });
    });

    it('refuses a date that has passed', async () => {
      const { service } = build({ publishedThrough: null });
      await expect(
        service.create({ kind: UnavailabilityKind.ONE_OFF, date: '2026-09-01' }, frankie, NOW),
      ).rejects.toThrow('That date has already passed.');
    });

    it('needs both times or neither, the right way round', async () => {
      const { service } = build();
      await expect(
        service.create(
          { kind: UnavailabilityKind.WEEKLY, weekday: 2, startTime: '17:00' },
          frankie,
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create(
          { kind: UnavailabilityKind.WEEKLY, weekday: 2, startTime: '17:00', endTime: '09:00' },
          frankie,
          NOW,
        ),
      ).rejects.toThrow(/after the start/);
    });

    it('is always the signed-in person’s own', async () => {
      const { service, prisma } = build();
      await service.create({ kind: UnavailabilityKind.WEEKLY, weekday: 1 }, max, NOW);
      expect(prisma.unavailability.create.mock.calls[0][0].data.employeeId).toBe('emp-2');
    });
  });

  describe('removing', () => {
    it('ends a weekly rule that already covers a published week instead of deleting it', async () => {
      const { service, prisma } = build();
      await expect(service.remove('u-1', frankie, NOW)).resolves.toEqual({
        removed: true,
        endsAfter: '2026-10-04',
      });
      expect(prisma.unavailability.delete).not.toHaveBeenCalled();
      expect(prisma.unavailability.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { effectiveUntil: d('2026-10-04') },
      });
    });

    it('deletes a weekly rule that has not reached a published week yet', async () => {
      const { service, prisma } = build({ one: row({ effectiveFrom: d('2026-10-05') }) });
      await service.remove('u-1', frankie, NOW);
      expect(prisma.unavailability.delete).toHaveBeenCalledWith({ where: { id: 'u-1' } });
    });

    it('will not remove a one-off inside a published week', async () => {
      const one = row({
        kind: UnavailabilityKind.ONE_OFF,
        weekday: null,
        date: d('2026-09-30'),
        effectiveFrom: d('2026-09-30'),
      });
      const { service, prisma } = build({ one });
      await expect(service.remove('u-1', frankie, NOW)).rejects.toThrow(/already published/);
      expect(prisma.unavailability.delete).not.toHaveBeenCalled();
    });

    it('will not touch somebody else’s', async () => {
      const { service } = build();
      await expect(service.remove('u-1', max, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('reading', () => {
    it('lets a manager read anybody’s, and an employee only their own', async () => {
      const { service } = build();
      await expect(service.forEmployee('emp-1', manager, NOW)).resolves.toMatchObject({
        firstOpenDate: '2026-10-05',
      });
      await expect(service.forEmployee('emp-1', max, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('marks a one-off inside a published week as locked', async () => {
      const { service, prisma } = build();
      prisma.unavailability.findMany.mockResolvedValue([
        row({
          kind: UnavailabilityKind.ONE_OFF,
          weekday: null,
          date: d('2026-09-30'),
          effectiveFrom: d('2026-09-30'),
        }),
        row({
          id: 'u-2',
          kind: UnavailabilityKind.ONE_OFF,
          weekday: null,
          date: d('2026-10-14'),
          effectiveFrom: d('2026-10-14'),
        }),
      ]);
      const { rules } = await service.forEmployee('emp-1', frankie, NOW);
      expect(rules.map((rule) => rule.locked)).toEqual([true, false]);
    });
  });
});
