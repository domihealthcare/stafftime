import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role, ShiftStatus } from '@prisma/client';
import { ProviderDayOffService } from './provider-day-off.service';

const NOW = new Date('2026-11-08T15:00:00Z');
const manager = { id: 'mgr-1', email: 'm@x', role: Role.MANAGER };
const REQUEST = {
  id: 'pto-1',
  employeeId: 'prov-1',
  startDate: new Date('2026-11-10T00:00:00Z'),
  endDate: new Date('2026-11-11T00:00:00Z'),
};
const SHIFT = {
  id: 's1',
  employeeId: 'prov-1',
  startsAt: new Date('2026-11-10T14:00:00Z'),
  endsAt: new Date('2026-11-10T22:00:00Z'),
  status: ShiftStatus.PUBLISHED,
};

function build(over: { fit?: string; isProvider?: boolean; shifts?: unknown[] } = {}) {
  const prisma = {
    shift: {
      findMany: jest.fn().mockResolvedValue(over.shifts ?? [SHIFT]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ptoRequest: { findUnique: jest.fn().mockResolvedValue(REQUEST) },
    employeeJobRole: { count: jest.fn().mockResolvedValue(over.isProvider === false ? 0 : 1) },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const notifications = { bell: jest.fn().mockResolvedValue(undefined) };
  const cover = { ask: jest.fn().mockResolvedValue({}) };
  const coverOptions = {
    forShift: jest.fn().mockResolvedValue({
      options: [
        { employeeId: 'ana', fit: over.fit ?? 'catch' },
        { employeeId: 'cat', fit: 'cannot' },
      ],
    }),
  };
  const onCall = {
    turnsFor: jest.fn().mockResolvedValue([{ date: '2026-11-10' }, { date: '2026-11-12' }]),
  };
  const service = new ProviderDayOffService(
    prisma as never,
    notifications as never,
    cover as never,
    coverOptions as never,
    onCall as never,
  );
  return { service, prisma, notifications, cover, coverOptions, onCall };
}

describe('ProviderDayOffService', () => {
  describe('plan', () => {
    it('drops KEEP and checks that someone asked is free in swap mode', async () => {
      const { service, coverOptions } = build();
      const plan = await service.plan(
        REQUEST,
        [{ shiftId: 's1', action: 'ASK', employeeIds: ['ana'] }],
        NOW,
      );
      expect(plan).toHaveLength(1);
      expect(coverOptions.forShift).toHaveBeenCalledWith('s1', { swapRemote: true });
      expect(await build().service.plan(REQUEST, [{ shiftId: 's1', action: 'KEEP' }], NOW)).toEqual(
        [],
      );
    });

    it('refuses an ask where nobody chosen can do it, and a shift that is not theirs', async () => {
      await expect(
        build().service.plan(
          REQUEST,
          [{ shiftId: 's1', action: 'ASK', employeeIds: ['cat'] }],
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        build({ shifts: [{ ...SHIFT, employeeId: 'other' }] }).service.plan(
          REQUEST,
          [{ shiftId: 's1', action: 'OPEN' }],
          NOW,
        ),
      ).rejects.toThrow('not theirs');
    });
  });

  describe('apply', () => {
    it('removes, opens, and for ASK opens then asks with the request linked', async () => {
      const { service, prisma, cover } = build({
        shifts: [{ id: 's1', status: 'PUBLISHED' }],
      });
      const results = await service.apply(
        REQUEST,
        [
          { shiftId: 's1', action: 'REMOVE' },
          { shiftId: 's2', action: 'ASK', employeeIds: ['ana'] },
        ],
        manager,
        NOW,
      );
      expect(prisma.shift.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['s1'] }, status: { not: 'DRAFT' } },
        data: { status: 'CANCELLED' },
      });
      expect(prisma.shift.updateMany).toHaveBeenCalledWith({
        where: { id: 's2', employeeId: 'prov-1' },
        data: { employeeId: null, seriesId: null },
      });
      expect(cover.ask).toHaveBeenCalledWith('s2', ['ana'], manager, NOW, 'pto-1');
      expect(results).toEqual([
        { shiftId: 's1', action: 'REMOVE', ok: true },
        { shiftId: 's2', action: 'ASK', ok: true },
      ]);
    });

    it('leaves the shift open and says so when nobody can be asked any more', async () => {
      const { service, cover } = build();
      cover.ask.mockRejectedValue(new BadRequestException('Choose at least one person.'));
      const results = await service.apply(
        REQUEST,
        [{ shiftId: 's1', action: 'ASK', employeeIds: ['ana'] }],
        manager,
        NOW,
      );
      expect(results).toEqual([
        { shiftId: 's1', action: 'ASK', ok: false, message: 'Choose at least one person.' },
      ]);
    });
  });

  describe('on call', () => {
    it('rings the provider about on-call days inside the time off, not outside it', async () => {
      const { service, notifications } = build();
      await expect(service.tellAboutOnCall(REQUEST)).resolves.toEqual(['2026-11-10']);
      expect(notifications.bell).toHaveBeenCalledWith(
        ['prov-1'],
        'ON_CALL',
        expect.objectContaining({ link: '/on-call', body: expect.stringContaining('Tue, Nov 10') }),
      );
    });

    it('does nothing for somebody who is not a provider', async () => {
      const { service, notifications, onCall } = build({ isProvider: false });
      await expect(service.tellAboutOnCall(REQUEST)).resolves.toEqual([]);
      expect(onCall.turnsFor).not.toHaveBeenCalled();
      expect(notifications.bell).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: 's1',
      employeeId: 'prov-1',
      startsAt: SHIFT.startsAt,
      endsAt: SHIFT.endsAt,
      isRemote: false,
      status: 'PUBLISHED',
      location: { name: 'North Bergen' },
      jobRole: { name: 'Provider' },
      coverRequests: [],
      ...over,
    });
    const person = (id: string) => ({ id, firstName: id, preferredName: null, lastName: 'L' });

    it('is for managers and admins only', async () => {
      await expect(
        build().service.get('pto-1', { id: 'e', email: 'e@x', role: Role.EMPLOYEE }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists the shifts before approval with no cover, and the on-call dates', async () => {
      const { service, prisma } = build();
      prisma.shift.findMany.mockResolvedValueOnce([row()]);
      const result = await service.get('pto-1', manager, NOW);
      expect(result).toMatchObject({
        isProvider: true,
        onCallDates: ['2026-11-10'],
        shifts: [{ id: 's1', locationName: 'North Bergen', jobRoleName: 'Provider', cover: null }],
      });
    });

    it('shows an asked shift, and a covered one with the telemedicine that was released', async () => {
      const { service, prisma } = build();
      prisma.shift.findMany
        .mockResolvedValueOnce([
          row({
            employeeId: null,
            coverRequests: [
              {
                id: 'cr-1',
                closedAt: null,
                takenById: null,
                releasedShiftIds: [],
                asks: [{ answer: null, employee: person('ana') }],
              },
            ],
          }),
          row({
            id: 's2',
            employeeId: 'ana',
            coverRequests: [
              {
                id: 'cr-2',
                closedAt: NOW,
                takenById: 'ana',
                releasedShiftIds: ['t1'],
                asks: [{ answer: true, employee: person('ana') }],
              },
            ],
          }),
        ])
        .mockResolvedValueOnce([{ id: 't1', startsAt: SHIFT.startsAt, endsAt: SHIFT.endsAt }]);
      const result = await service.get('pto-1', manager, NOW);
      expect(result.shifts[0].cover).toMatchObject({
        requestId: 'cr-1',
        state: 'open',
        takenBy: null,
        asks: [{ answer: null }],
      });
      expect(result.shifts[1].cover).toMatchObject({ state: 'covered', takenBy: { id: 'ana' } });
      expect(result.shifts[1]).toMatchObject({
        releasedRemote: [{ startsAt: SHIFT.startsAt, endsAt: SHIFT.endsAt }],
      });
    });
  });
});
