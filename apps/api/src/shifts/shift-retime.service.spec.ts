import { BadRequestException } from '@nestjs/common';
import { ShiftStatus } from '@prisma/client';
import { zonedTimeToUtc } from '../common/util/zoned-time.util';
import { ShiftRetimeService } from './shift-retime.service';

const NJ = 'America/New_York';
const NOW = new Date('2026-10-05T12:00:00Z');

/// A shift at North Bergen on `date`, `from`–`to` on the office's clock.
function shiftOn(
  id: string,
  date: string,
  from = '07:00',
  to = '14:00',
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    employeeId: 'gaby',
    locationId: 'nb',
    jobRoleId: 'ma',
    isRemote: false,
    status: ShiftStatus.PUBLISHED as ShiftStatus,
    seriesId: null as string | null,
    startsAt: zonedTimeToUtc(date, from, NJ),
    endsAt: zonedTimeToUtc(date, to, NJ),
    location: { timezone: NJ },
    ...extra,
  };
}

describe('ShiftRetimeService', () => {
  function build(options: {
    shifts: ReturnType<typeof shiftOn>[];
    series?: unknown;
    clashOn?: string[];
  }) {
    const byId = new Map(options.shifts.map((s) => [s.id, s]));
    const updates: { id: string; startsAt: Date; endsAt: Date }[] = [];
    const prisma = {
      shift: {
        findUnique: jest.fn(({ where }) => byId.get(where.id) ?? null),
        findMany: jest.fn(({ where }) =>
          where.seriesId
            ? options.shifts.filter((s) => s.seriesId === where.seriesId)
            : options.shifts.filter((s) => s.status !== ShiftStatus.CANCELLED),
        ),
        findFirst: jest.fn(({ where }) =>
          (options.clashOn ?? []).includes(where.id.not) ? { id: 'other' } : null,
        ),
        update: jest.fn(({ where, data }) => {
          updates.push({ id: where.id, ...data });
          return {};
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shiftSeries: {
        findUnique: jest.fn().mockResolvedValue(options.series ?? null),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation(() => ({ id: `new-series` })),
      },
    };
    const shifts = { update: jest.fn() };
    const planning = { overtimeAfterPlanning: jest.fn().mockResolvedValue([]) };
    const overtime = {
      workweekStartsOn: jest.fn().mockResolvedValue(1),
      snapshot: jest.fn().mockResolvedValue(new Map()),
      announceNewOvertime: jest.fn(),
    };
    const inbox = { notify: jest.fn() };
    const service = new ShiftRetimeService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      shifts as never,
      planning as never,
      overtime as never,
      inbox as never,
    );
    return { service, prisma, shifts, inbox, updates };
  }

  it('changes one shift through the ordinary update, on the office clock', async () => {
    const { service, shifts } = build({ shifts: [shiftOn('wed', '2026-10-14')] });
    await service.retime('wed', { startTime: '13:00', endTime: '20:00', scope: 'ONE' }, NOW);
    expect(shifts.update).toHaveBeenCalledWith('wed', {
      startsAt: '2026-10-14T17:00:00.000Z',
      endsAt: '2026-10-15T00:00:00.000Z',
    });
  });

  it('refuses an end before the start', async () => {
    const { service } = build({ shifts: [shiftOn('wed', '2026-10-14')] });
    await expect(
      service.retime('wed', { startTime: '13:00', endTime: '08:00', scope: 'LATER' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes every later shift at the same hours, and tells them once', async () => {
    const { service, updates, inbox } = build({
      shifts: [
        shiftOn('wed', '2026-10-14'),
        shiftOn('thu', '2026-10-15'),
        shiftOn('fri-late', '2026-10-16', '09:00', '17:00'),
        shiftOn('wed2', '2026-10-21'),
      ],
    });
    const result = await service.retime(
      'wed',
      { startTime: '13:00', endTime: '20:00', scope: 'LATER' },
      NOW,
    );
    expect(updates.map((u) => u.id)).toEqual(['wed', 'thu', 'wed2']);
    expect(result.created).toBe(3);
    expect(result.action).toBe('changed');
    expect(inbox.notify).toHaveBeenCalledTimes(1);
    expect(inbox.notify.mock.calls[0][1].body).toBe(
      'Your 7am–2pm shifts from Wed, Oct 14 are now 1pm–8pm.',
    );
  });

  it('can keep to the same weekday', async () => {
    const { service, updates, inbox } = build({
      shifts: [
        shiftOn('wed', '2026-10-14'),
        shiftOn('thu', '2026-10-15'),
        shiftOn('wed2', '2026-10-21'),
      ],
    });
    await service.retime(
      'wed',
      { startTime: '13:00', endTime: '20:00', scope: 'SAME_WEEKDAY' },
      NOW,
    );
    expect(updates.map((u) => u.id)).toEqual(['wed', 'wed2']);
    expect(inbox.notify.mock.calls[0][1].body).toBe(
      'Wednesdays from Wed, Oct 14: 1pm–8pm, not 7am–2pm.',
    );
  });

  it('skips a day where the new hours would overlap another shift', async () => {
    const { service, updates } = build({
      shifts: [shiftOn('wed', '2026-10-14'), shiftOn('wed2', '2026-10-21')],
      clashOn: ['wed2'],
    });
    const result = await service.retime(
      'wed',
      { startTime: '13:00', endTime: '20:00', scope: 'LATER' },
      NOW,
    );
    expect(updates.map((u) => u.id)).toEqual(['wed']);
    expect(result.skipped).toEqual([
      expect.objectContaining({ date: '2026-10-21', reason: 'OVERLAPS_SHIFT' }),
    ]);
  });

  it('says nothing to the person about drafts', async () => {
    const { service, inbox } = build({
      shifts: [shiftOn('wed', '2026-10-14', '07:00', '14:00', { status: ShiftStatus.DRAFT })],
    });
    await service.retime('wed', { startTime: '13:00', endTime: '20:00', scope: 'LATER' }, NOW);
    expect(inbox.notify).not.toHaveBeenCalled();
  });

  describe('a regular shift behind them', () => {
    const series = (extra: Record<string, unknown> = {}) => ({
      id: 's1',
      employeeId: 'gaby',
      locationId: 'nb',
      jobRoleId: 'ma',
      isRemote: false,
      openCount: 1,
      daysOfWeek: [1, 3, 5],
      everyWeeks: 1,
      weeksOfMonth: [],
      cycleFrom: null,
      startTime: '07:00',
      endTime: '14:00',
      status: ShiftStatus.PUBLISHED,
      notes: null,
      startsOn: new Date('2026-09-07T00:00:00Z'),
      endsOn: null,
      filledThrough: new Date('2026-11-30T00:00:00Z'),
      createdById: 'celeste',
      ...extra,
    });

    it('ends it the day before and carries on at the new hours', async () => {
      const { service, prisma } = build({
        shifts: [shiftOn('wed', '2026-10-14', '07:00', '14:00', { seriesId: 's1' })],
        series: series(),
      });
      const result = await service.retime(
        'wed',
        { startTime: '13:00', endTime: '20:00', scope: 'LATER' },
        NOW,
      );
      expect(result.regular).toBe(true);
      expect(prisma.shiftSeries.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { endsOn: new Date('2026-10-13T00:00:00Z') },
      });
      expect(prisma.shiftSeries.create).toHaveBeenCalledTimes(1);
      expect(prisma.shiftSeries.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          daysOfWeek: [1, 3, 5],
          startTime: '13:00',
          endTime: '20:00',
          startsOn: new Date('2026-10-14T00:00:00Z'),
          filledThrough: new Date('2026-11-30T00:00:00Z'),
        }),
      );
    });

    it('splits off only the weekday when asked to', async () => {
      const { service, prisma } = build({
        shifts: [shiftOn('wed', '2026-10-14', '07:00', '14:00', { seriesId: 's1' })],
        series: series(),
      });
      await service.retime(
        'wed',
        { startTime: '13:00', endTime: '20:00', scope: 'SAME_WEEKDAY' },
        NOW,
      );
      const made = prisma.shiftSeries.create.mock.calls.map((call) => call[0].data);
      expect(made).toEqual([
        expect.objectContaining({ daysOfWeek: [3], startTime: '13:00', endTime: '20:00' }),
        expect.objectContaining({ daysOfWeek: [1, 5], startTime: '07:00', endTime: '14:00' }),
      ]);
    });

    it('changes it in place when it starts that day', async () => {
      const { service, prisma } = build({
        shifts: [shiftOn('wed', '2026-10-14', '07:00', '14:00', { seriesId: 's1' })],
        series: series({ startsOn: new Date('2026-10-14T00:00:00Z') }),
      });
      await service.retime('wed', { startTime: '13:00', endTime: '20:00', scope: 'LATER' }, NOW);
      expect(prisma.shiftSeries.create).not.toHaveBeenCalled();
      expect(prisma.shiftSeries.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { startTime: '13:00', endTime: '20:00' },
      });
    });

    it('leaves one at other hours alone', async () => {
      const { service, prisma } = build({
        shifts: [shiftOn('wed', '2026-10-14', '07:00', '14:00', { seriesId: 's1' })],
        series: series({ startTime: '08:00' }),
      });
      const result = await service.retime(
        'wed',
        { startTime: '13:00', endTime: '20:00', scope: 'LATER' },
        NOW,
      );
      expect(result.regular).toBe(false);
      expect(prisma.shiftSeries.update).not.toHaveBeenCalled();
    });
  });
});
