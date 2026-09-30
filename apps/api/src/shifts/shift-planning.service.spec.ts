import { BadRequestException } from '@nestjs/common';
import { PtoStatus, ShiftStatus } from '@prisma/client';
import { fakeSettings } from '../settings/practice-settings.test-double';
import { OvertimeService } from './overtime.service';
import { ShiftPlanningService, weekdaysPhrase, weekSummary } from './shift-planning.service';

/// Overtime emails are the overtime service's own business, tested there.
function fakeOvertime() {
  return {
    snapshot: jest.fn().mockResolvedValue(new Map()),
    announceNewOvertime: jest.fn(),
  } as unknown as OvertimeService;
}

const NJ = 'America/New_York';

describe('ShiftPlanningService', () => {
  function build(
    options: {
      clash?: unknown;
      leave?: unknown;
      sourceShifts?: unknown[];
      location?: unknown;
      assigned?: boolean;
      series?: unknown;
      dueSeries?: unknown[];
      employee?: unknown;
      /// The job roles emp-1 holds.
      heldRoles?: { id: string; name: string }[];
    } = {},
  ) {
    const created: Record<string, unknown>[] = [];
    const inbox = { notify: jest.fn() };
    const prisma = {
      employeeJobRole: {
        findMany: jest
          .fn()
          .mockResolvedValue((options.heldRoles ?? []).map((jobRole) => ({ jobRole }))),
      },
      employee: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            'employee' in options ? options.employee : { id: 'emp-1', employmentStatus: 'ACTIVE' },
          ),
      },
      shiftSeries: {
        create: jest.fn().mockResolvedValue({ id: 'series-1' }),
        findMany: jest.fn().mockResolvedValue(options.dueSeries ?? []),
        findUnique: jest.fn().mockResolvedValue(options.series ?? null),
        update: jest.fn().mockResolvedValue({}),
      },
      location: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            'location' in options
              ? options.location
              : { id: 'loc-1', name: 'North Bergen', timezone: NJ, isActive: true },
          ),
      },
      employeeLocation: {
        findUnique: jest
          .fn()
          .mockResolvedValue(options.assigned === false ? null : { employeeId: 'emp-1' }),
      },
      shift: {
        findFirst: jest.fn().mockResolvedValue(options.clash ?? null),
        findMany: jest.fn().mockResolvedValue(options.sourceShifts ?? []),
        create: jest.fn().mockImplementation(({ data }) => {
          created.push(data);
          return { id: `sh-${created.length}`, ...data };
        }),
        createMany: jest.fn().mockImplementation(({ data }) => {
          created.push(...data);
          return { count: data.length };
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      jobRole: { findUnique: jest.fn().mockResolvedValue({ id: 'fd' }) },
      ptoRequest: {
        findFirst: jest.fn().mockResolvedValue(options.leave ?? null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service: new ShiftPlanningService(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma as any,
        fakeSettings(),
        fakeOvertime(),
        inbox as never,
      ),
      prisma,
      created,
      inbox,
    };
  }

  const repeat = (overrides: Record<string, unknown> = {}) => ({
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startTime: '09:00',
    endTime: '17:00',
    daysOfWeek: [2, 4],
    from: '2026-09-21',
    until: '2026-10-05',
    ...overrides,
  });

  describe('repeating a shift', () => {
    it('creates one shift per matching weekday', async () => {
      const { service, created } = build();
      const result = await service.repeat(repeat(), 'mgr-1');

      // Tuesdays 22, 29 Sep; Thursdays 24 Sep, 1 Oct — 4 in that range.
      expect(result.created).toBe(4);
      expect(created).toHaveLength(4);
      expect(result.dates).toEqual(['2026-09-22', '2026-09-24', '2026-09-29', '2026-10-01']);
    });

    it('uses the location wall-clock time, not the server timezone', async () => {
      const { service, created } = build();
      await service.repeat(
        repeat({ from: '2026-09-22', until: '2026-09-22', daysOfWeek: [2] }),
        'mgr-1',
      );

      // 9am Eastern in September is 13:00 UTC.
      expect((created[0].startsAt as Date).toISOString()).toBe('2026-09-22T13:00:00.000Z');
      expect((created[0].endsAt as Date).toISOString()).toBe('2026-09-22T21:00:00.000Z');
    });

    /// The reason the timezone helper exists.
    it('keeps 9am at 9am across the autumn clock change', async () => {
      const { service, created } = build();
      // Fridays either side of 1 November 2026.
      await service.repeat(
        repeat({ daysOfWeek: [5], from: '2026-10-30', until: '2026-11-06' }),
        'mgr-1',
      );

      expect(created).toHaveLength(2);
      expect((created[0].startsAt as Date).toISOString()).toBe('2026-10-30T13:00:00.000Z');
      // An hour later in UTC, still 9am locally.
      expect((created[1].startsAt as Date).toISOString()).toBe('2026-11-06T14:00:00.000Z');
    });

    it('defaults to draft, so staff do not see it before a manager looks', async () => {
      const { service, created } = build();
      await service.repeat(repeat(), 'mgr-1');
      expect(created[0].status).toBe(ShiftStatus.DRAFT);
    });

    it('can publish straight away when asked', async () => {
      const { service, created } = build();
      await service.repeat(repeat({ status: ShiftStatus.PUBLISHED }), 'mgr-1');
      expect(created[0].status).toBe(ShiftStatus.PUBLISHED);
    });

    it('records who created them', async () => {
      const { service, created } = build();
      await service.repeat(repeat(), 'mgr-1');
      expect(created[0].createdById).toBe('mgr-1');
    });

    it('skips a day that clashes with an existing shift, and says so', async () => {
      const { service, created } = build({ clash: { id: 'existing' } });
      const result = await service.repeat(repeat(), 'mgr-1');

      expect(result.created).toBe(0);
      expect(created).toHaveLength(0);
      expect(result.skipped).toHaveLength(4);
      expect(result.skipped[0]).toMatchObject({ reason: 'OVERLAPS_SHIFT' });
    });

    it('skips a day the employee is on approved leave, rather than scheduling over it', async () => {
      const { service } = build({ leave: { type: 'VACATION' } });
      const result = await service.repeat(repeat(), 'mgr-1');

      expect(result.created).toBe(0);
      expect(result.skipped[0]).toMatchObject({
        reason: 'ON_APPROVED_LEAVE',
        detail: 'On approved vacation leave',
      });
    });

    it('only counts approved leave as a reason to skip', async () => {
      const { service, prisma } = build();
      await service.repeat(repeat(), 'mgr-1');
      expect(prisma.ptoRequest.findFirst.mock.calls[0][0].where.status).toBe(PtoStatus.APPROVED);
    });

    it('refuses an end time before the start', async () => {
      const { service } = build();
      await expect(
        service.repeat(repeat({ startTime: '17:00', endTime: '09:00' }), 'mgr-1'),
      ).rejects.toThrow(/end time must be after/);
    });

    it('refuses a range where the weekdays never occur', async () => {
      const { service } = build();
      await expect(
        // A Monday-to-Tuesday range cannot contain a Saturday.
        service.repeat(
          repeat({ from: '2026-09-21', until: '2026-09-22', daysOfWeek: [6] }),
          'mgr-1',
        ),
      ).rejects.toThrow(/None of those weekdays/);
    });

    it('refuses a backwards date range', async () => {
      const { service } = build();
      await expect(
        service.repeat(repeat({ from: '2026-10-05', until: '2026-09-21' }), 'mgr-1'),
      ).rejects.toThrow(/cannot be before/);
    });

    it('refuses a span long enough to be a typo', async () => {
      const { service } = build();
      await expect(
        service.repeat(repeat({ from: '2026-01-01', until: '2030-01-01' }), 'mgr-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to create an unreasonable number of shifts at once', async () => {
      const { service } = build();
      await expect(
        service.repeat(
          repeat({ daysOfWeek: [1, 2, 3, 4, 5, 6, 7], from: '2026-01-01', until: '2026-12-31' }),
          'mgr-1',
        ),
      ).rejects.toThrow(/at most 200/);
    });

    it('refuses an employee not assigned to that location', async () => {
      const { service } = build({ assigned: false });
      await expect(service.repeat(repeat(), 'mgr-1')).rejects.toThrow(/not assigned/);
    });

    it('refuses an inactive location', async () => {
      const { service } = build({
        location: { id: 'loc-1', name: 'Old Office', timezone: NJ, isActive: false },
      });
      await expect(service.repeat(repeat(), 'mgr-1')).rejects.toThrow(/not an active/);
    });
  });

  describe('job roles on somebody’s shifts', () => {
    it('puts their only job role on the shifts when none is given', async () => {
      const { service, created } = build({ heldRoles: [{ id: 'fd', name: 'Front Desk' }] });
      await service.repeat(repeat(), 'mgr-1');
      expect(created.every((shift) => shift.jobRoleId === 'fd')).toBe(true);
    });

    it('refuses a job role they do not hold', async () => {
      const { service, prisma } = build({ heldRoles: [{ id: 'ma', name: 'Medical Assistant' }] });
      prisma.jobRole.findUnique.mockResolvedValue({ name: 'Front Desk' });
      await expect(service.repeat(repeat({ jobRoleId: 'fd' }), 'mgr-1')).rejects.toThrow(
        'They are not in Front Desk.',
      );
    });

    it('open shifts keep any job role, or none', async () => {
      const { service, created, prisma } = build();
      await service.repeat(repeat({ employeeId: undefined, jobRoleId: 'fd' }), 'mgr-1');
      expect(created[0].jobRoleId).toBe('fd');
      expect(prisma.employeeJobRole.findMany).not.toHaveBeenCalled();
    });

    it('a usual week day with no role given gets their first', async () => {
      const { service, created } = build({
        heldRoles: [
          { id: 'fd', name: 'Front Desk' },
          { id: 'ma', name: 'Medical Assistant' },
        ],
      });
      await service.setWeek(
        'emp-1',
        { days: [{ dayOfWeek: 1, locationId: 'loc-1', startTime: '09:00', endTime: '17:00' }] },
        'mgr-1',
        new Date('2026-09-29T14:00:00Z'),
      );
      expect(created.every((shift) => shift.jobRoleId === 'fd')).toBe(true);
    });
  });

  describe('standing shifts — no end date', () => {
    // Tuesday 29 September 2026, mid-morning in New Jersey.
    const NOW = new Date('2026-09-29T14:00:00Z');
    const mondays = (overrides: Record<string, unknown> = {}) =>
      repeat({ daysOfWeek: [1], from: '2026-10-05', until: undefined, ...overrides });

    it('writes out eight weeks ahead and keeps the rule', async () => {
      const { service, prisma, created } = build();
      const result = await service.repeat(mondays(), 'mgr-1', NOW);

      // 5 Oct is later than today, so eight weeks from then: 5 Oct to 30 Nov.
      expect(result.dates[0]).toBe('2026-10-05');
      expect(result.dates[result.dates.length - 1]).toBe('2026-11-30');
      expect(result.created).toBe(9);
      expect(result.standing).toEqual({ id: 'series-1', filledThrough: '2026-11-30' });
      expect(created.every((shift) => shift.seriesId === 'series-1')).toBe(true);
      expect(prisma.shiftSeries.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            daysOfWeek: [1],
            startTime: '09:00',
            filledThrough: new Date('2026-11-30T00:00:00Z'),
          }),
        }),
      );
    });

    it('counts from today when it started in the past', async () => {
      const { service } = build();
      const result = await service.repeat(mondays({ from: '2026-09-01' }), 'mgr-1', NOW);
      expect(result.standing?.filledThrough).toBe('2026-11-24');
    });

    it('a repeat with a last date makes no standing shift', async () => {
      const { service, prisma, created } = build();
      const result = await service.repeat(repeat(), 'mgr-1', NOW);
      expect(result.standing).toBeUndefined();
      expect(prisma.shiftSeries.create).not.toHaveBeenCalled();
      expect(created[0].seriesId).toBeNull();
    });

    it('tells the person once that it has no end date, when published', async () => {
      const { service, inbox } = build();
      await service.repeat(mondays({ status: ShiftStatus.PUBLISHED }), 'mgr-1', NOW);
      expect(inbox.notify).toHaveBeenCalledTimes(1);
      expect(inbox.notify.mock.calls[0][1]).toMatchObject({
        title: 'A regular shift on your schedule',
        body: 'Mondays from Mon, Oct 5, with no end date.',
      });
    });

    describe('the nightly top-up', () => {
      const series = (overrides: Record<string, unknown> = {}) => ({
        id: 'series-1',
        employeeId: 'emp-1',
        locationId: 'loc-1',
        jobRoleId: null,
        isRemote: false,
        openCount: 1,
        daysOfWeek: [1],
        startTime: '08:00',
        endTime: '16:00',
        status: ShiftStatus.PUBLISHED,
        notes: null,
        startsOn: new Date('2026-09-07T00:00:00Z'),
        endsOn: null,
        filledThrough: new Date('2026-11-17T00:00:00Z'),
        createdById: 'mgr-1',
        location: { timezone: NJ, isActive: true },
        employee: { employmentStatus: 'ACTIVE', locations: [{ locationId: 'loc-1' }] },
        ...overrides,
      });

      it('carries on from the day after the last one written, to eight weeks ahead', async () => {
        const { service, prisma, created, inbox } = build({ dueSeries: [series()] });
        const made = await service.extendStandingShifts(NOW);

        // 18 to 24 Nov: one Monday, the 23rd.
        expect(made).toBe(1);
        expect((created[0].startsAt as Date).toISOString()).toBe('2026-11-23T13:00:00.000Z');
        expect(created[0]).toMatchObject({ seriesId: 'series-1', status: 'PUBLISHED' });
        expect(prisma.shiftSeries.update).toHaveBeenCalledWith({
          where: { id: 'series-1' },
          data: { filledThrough: new Date('2026-11-24T00:00:00Z') },
        });
        // Told when it was made, not every night.
        expect(inbox.notify).not.toHaveBeenCalled();
      });

      it('stops at the last day of one that has been stopped', async () => {
        const { service, created, prisma } = build({
          dueSeries: [series({ endsOn: new Date('2026-11-20T00:00:00Z') })],
        });
        await service.extendStandingShifts(NOW);
        expect(created).toHaveLength(0);
        expect(prisma.shiftSeries.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { filledThrough: new Date('2026-11-20T00:00:00Z') } }),
        );
      });

      it('writes nothing for somebody who has left, and moves on', async () => {
        const { service, created, prisma } = build({
          dueSeries: [series({ employee: { employmentStatus: 'TERMINATED', locations: [] } })],
        });
        await service.extendStandingShifts(NOW);
        expect(created).toHaveLength(0);
        expect(prisma.shiftSeries.update).toHaveBeenCalled();
      });

      it('skips a day on approved leave as a repeat does', async () => {
        const { service, created } = build({ dueSeries: [series()], leave: { type: 'SICK' } });
        await service.extendStandingShifts(NOW);
        expect(created).toHaveLength(0);
      });
    });

    describe('stopping one', () => {
      const stored = {
        id: 'series-1',
        employeeId: 'emp-1',
        daysOfWeek: [1, 4],
        location: { timezone: NJ },
      };

      it('ends it and takes off the shifts after the last day', async () => {
        const { service, prisma, inbox } = build({ series: stored });
        prisma.shift.findMany.mockResolvedValue([
          { employeeId: 'emp-1', startsAt: new Date('2026-10-12T12:00:00Z') },
        ]);
        const result = await service.stopStanding('series-1', { lastDate: '2026-10-09' }, NOW);

        expect(prisma.shiftSeries.update).toHaveBeenCalledWith({
          where: { id: 'series-1' },
          data: { endsOn: new Date('2026-10-09T00:00:00Z') },
        });
        // From midnight after the last day, New Jersey time.
        const after = new Date('2026-10-10T04:00:00Z');
        expect(prisma.shift.deleteMany).toHaveBeenCalledWith({
          where: expect.objectContaining({
            seriesId: 'series-1',
            status: ShiftStatus.DRAFT,
            startsAt: { gte: after },
          }),
        });
        expect(prisma.shift.updateMany).toHaveBeenCalledWith({
          where: expect.objectContaining({ seriesId: 'series-1', startsAt: { gte: after } }),
          data: { status: ShiftStatus.CANCELLED },
        });
        expect(result).toEqual({ lastDate: '2026-10-09', removed: 5 });
        expect(inbox.notify.mock.calls[0][1]).toMatchObject({
          title: 'A shift taken off your schedule',
          body: 'Mondays and Thursdays after Fri, Oct 9 — that regular shift has ended.',
        });
      });

      it('never touches a shift that has already started', async () => {
        const { service, prisma } = build({ series: stored });
        await service.stopStanding('series-1', { lastDate: '2026-09-01' }, NOW);
        expect(prisma.shift.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ startsAt: { gte: NOW } }),
          }),
        );
      });

      it('stops today when no day is given', async () => {
        const { service } = build({ series: stored });
        const result = await service.stopStanding('series-1', {}, NOW);
        expect(result.lastDate).toBe('2026-09-29');
      });

      it('says so when there is no such standing shift', async () => {
        const { service } = build();
        await expect(service.stopStanding('nope', {}, NOW)).rejects.toThrow(
          'That standing shift does not exist.',
        );
      });
    });

    it('lists the days Sunday first, as the practice reads a week', () => {
      expect(weekdaysPhrase([7, 1, 3])).toBe('Sundays, Mondays and Wednesdays');
      expect(weekdaysPhrase([1])).toBe('Mondays');
    });
  });

  describe('setting somebody’s usual week', () => {
    // Tuesday 29 September 2026, mid-morning in New Jersey.
    const NOW = new Date('2026-09-29T14:00:00Z');
    // Sunday 4 October: the week it applies from.
    const FROM = '2026-10-04';
    const day = (dayOfWeek: number, startTime: string, endTime: string, extra = {}) => ({
      dayOfWeek,
      locationId: 'loc-1',
      startTime,
      endTime,
      ...extra,
    });
    const stored = (overrides: Record<string, unknown> = {}) => ({
      id: 'old-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      jobRoleId: null,
      isRemote: false,
      openCount: 1,
      daysOfWeek: [1, 4],
      startTime: '09:00',
      endTime: '17:00',
      status: ShiftStatus.PUBLISHED,
      notes: null,
      startsOn: new Date('2026-09-07T00:00:00Z'),
      endsOn: null,
      filledThrough: new Date('2026-11-23T00:00:00Z'),
      createdById: 'mgr-1',
      location: { timezone: NJ },
      ...overrides,
    });

    it('makes one regular shift per set of hours and place, published, eight weeks ahead', async () => {
      const { service, prisma, created } = build();
      const result = await service.setWeek(
        'emp-1',
        {
          from: FROM,
          days: [day(1, '12:00', '20:00'), day(3, '12:00', '20:00'), day(2, '09:00', '17:00')],
        },
        'mgr-1',
        NOW,
      );

      expect(prisma.shiftSeries.create).toHaveBeenCalledTimes(2);
      const made = prisma.shiftSeries.create.mock.calls.map(([args]) => args.data);
      expect(made[0]).toMatchObject({
        daysOfWeek: [1, 3],
        startTime: '12:00',
        endTime: '20:00',
        status: ShiftStatus.PUBLISHED,
        startsOn: new Date('2026-10-04T00:00:00Z'),
        filledThrough: new Date('2026-11-29T00:00:00Z'),
      });
      expect(made[1]).toMatchObject({ daysOfWeek: [2], startTime: '09:00' });
      // 4 Oct to 29 Nov: eight Mondays, eight Wednesdays, eight Tuesdays.
      expect(result.created).toBe(24);
      expect(created.every((shift) => shift.status === ShiftStatus.PUBLISHED)).toBe(true);
      expect(result.dates[0]).toBe('2026-10-05');
    });

    it('works from home on a day marked so', async () => {
      const { service, created } = build();
      await service.setWeek(
        'emp-1',
        { from: FROM, days: [day(5, '09:00', '17:00', { isRemote: true })] },
        'mgr-1',
        NOW,
      );
      expect(created.every((shift) => shift.isRemote === true)).toBe(true);
    });

    it('leaves a regular shift that still matches exactly alone', async () => {
      const { service, prisma } = build({ dueSeries: [stored()] });
      const result = await service.setWeek(
        'emp-1',
        { from: FROM, days: [day(1, '09:00', '17:00'), day(4, '09:00', '17:00')] },
        'mgr-1',
        NOW,
      );
      expect(result).toMatchObject({ kept: 1, created: 0, removed: 0 });
      expect(prisma.shiftSeries.update).not.toHaveBeenCalled();
      expect(prisma.shiftSeries.create).not.toHaveBeenCalled();
      expect(prisma.shift.deleteMany).not.toHaveBeenCalled();
    });

    it('changes the days of one whose hours still match, touching only those days', async () => {
      const { service, prisma, created } = build({ dueSeries: [stored()] });
      // A Thursday and a Monday already on the rota from it.
      prisma.shift.findMany.mockResolvedValueOnce([
        { id: 'thu', startsAt: new Date('2026-10-08T13:00:00Z'), status: ShiftStatus.PUBLISHED },
        { id: 'mon', startsAt: new Date('2026-10-05T13:00:00Z'), status: ShiftStatus.PUBLISHED },
      ]);
      const result = await service.setWeek(
        'emp-1',
        { from: FROM, days: [day(1, '09:00', '17:00'), day(5, '09:00', '17:00')] },
        'mgr-1',
        NOW,
      );

      expect(prisma.shiftSeries.update).toHaveBeenCalledWith({
        where: { id: 'old-1' },
        data: { daysOfWeek: [1, 5] },
      });
      expect(prisma.shift.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ['thu'] } }) }),
      );
      // Fridays 9 Oct to 20 Nov: what it had written out, no further.
      expect(created).toHaveLength(7);
      expect(created.every((shift) => shift.seriesId === 'old-1')).toBe(true);
      expect(prisma.shiftSeries.create).not.toHaveBeenCalled();
      expect(result.kept).toBe(0);
    });

    it('stops one that no longer fits the day before, and makes the new one', async () => {
      const { service, prisma } = build({ dueSeries: [stored()] });
      await service.setWeek(
        'emp-1',
        { from: FROM, days: [day(1, '12:00', '20:00')] },
        'mgr-1',
        NOW,
      );
      expect(prisma.shiftSeries.update).toHaveBeenCalledWith({
        where: { id: 'old-1' },
        data: { endsOn: new Date('2026-10-03T00:00:00Z') },
      });
      expect(prisma.shiftSeries.create).toHaveBeenCalledTimes(1);
    });

    it('takes the old shifts off before writing the new, so they do not clash', async () => {
      const { service, prisma } = build({ dueSeries: [stored()] });
      prisma.shift.findMany.mockResolvedValueOnce([
        { id: 'mon', startsAt: new Date('2026-10-05T13:00:00Z'), status: ShiftStatus.PUBLISHED },
      ]);
      await service.setWeek(
        'emp-1',
        { from: FROM, days: [day(1, '12:00', '20:00')] },
        'mgr-1',
        NOW,
      );
      const cancelledAt = prisma.shift.updateMany.mock.invocationCallOrder[0];
      const firstWrite = prisma.shift.create.mock.invocationCallOrder[0];
      expect(cancelledAt).toBeLessThan(firstWrite);
    });

    it('an empty week stops everything', async () => {
      const { service, prisma } = build({ dueSeries: [stored(), stored({ id: 'old-2' })] });
      await service.setWeek('emp-1', { from: FROM, days: [] }, 'mgr-1', NOW);
      expect(prisma.shiftSeries.update).toHaveBeenCalledTimes(2);
      expect(prisma.shiftSeries.create).not.toHaveBeenCalled();
    });

    it('never starts before today', async () => {
      const { service } = build();
      const result = await service.setWeek('emp-1', { from: '2026-09-01', days: [] }, 'mgr-1', NOW);
      expect(result.from).toBe('2026-09-29');
    });

    it('tells the person once, with the whole week', async () => {
      const { service, inbox } = build({ dueSeries: [stored()] });
      await service.setWeek(
        'emp-1',
        { from: FROM, days: [day(1, '12:00', '20:00'), day(2, '08:30', '17:00')] },
        'mgr-1',
        NOW,
      );
      expect(inbox.notify).toHaveBeenCalledTimes(1);
      expect(inbox.notify.mock.calls[0][1]).toMatchObject({
        title: 'Your usual week has changed',
        body: 'From Sun, Oct 4: Mondays 12pm–8pm, Tuesdays 8:30am–5pm.',
      });
    });

    it('says nothing to them about drafts', async () => {
      const { service, inbox } = build();
      await service.setWeek(
        'emp-1',
        { from: FROM, days: [day(1, '12:00', '20:00')], status: ShiftStatus.DRAFT },
        'mgr-1',
        NOW,
      );
      expect(inbox.notify).not.toHaveBeenCalled();
    });

    it('refuses the same day twice', async () => {
      const { service } = build();
      await expect(
        service.setWeek(
          'emp-1',
          { days: [day(1, '09:00', '12:00'), day(1, '13:00', '17:00')] },
          'mgr-1',
          NOW,
        ),
      ).rejects.toThrow('Monday is in there twice');
    });

    it('refuses a day that ends before it starts', async () => {
      const { service } = build();
      await expect(
        service.setWeek('emp-1', { days: [day(3, '17:00', '09:00')] }, 'mgr-1', NOW),
      ).rejects.toThrow('Wednesday: the end time must be after the start time.');
    });

    it('refuses an office they are not assigned to', async () => {
      const { service } = build({ assigned: false });
      await expect(
        service.setWeek('emp-1', { days: [day(1, '09:00', '17:00')] }, 'mgr-1', NOW),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses somebody who has left', async () => {
      const { service } = build({ employee: { id: 'emp-1', employmentStatus: 'TERMINATED' } });
      await expect(service.setWeek('emp-1', { days: [] }, 'mgr-1', NOW)).rejects.toThrow(
        'They have left the practice.',
      );
    });

    it('leaves out of the list a regular shift replaced before its first day', async () => {
      const { service } = build({
        dueSeries: [
          stored(),
          stored({
            id: 'never-ran',
            startsOn: new Date('2026-10-11T00:00:00Z'),
            endsOn: new Date('2026-10-10T00:00:00Z'),
          }),
        ],
      });
      const listed = await service.standing(NOW);
      expect(listed.map((series) => series.id)).toEqual(['old-1']);
    });

    it('sums a week up Sunday first', () => {
      expect(
        weekSummary([
          { dayOfWeek: 1, startTime: '12:00', endTime: '20:00' },
          { dayOfWeek: 7, startTime: '09:00', endTime: '13:30' },
        ]),
      ).toBe('Sundays 9am–1:30pm, Mondays 12pm–8pm');
      expect(weekSummary([])).toBe('no regular shifts');
    });
  });

  describe('open shifts — slots nobody is on yet', () => {
    const open = (overrides: Record<string, unknown> = {}) =>
      repeat({ employeeId: undefined, jobRoleId: 'fd', ...overrides });

    it('makes one open shift per matching day, for the job role', async () => {
      const { service, created } = build();
      const result = await service.repeat(open(), 'mgr-1');
      expect(result.created).toBe(4);
      for (const row of created) expect(row).toMatchObject({ employeeId: null, jobRoleId: 'fd' });
    });

    it('makes as many as are needed each day', async () => {
      const { service, created } = build();
      const result = await service.repeat(open({ openCount: 2 }), 'mgr-1');
      expect(result.created).toBe(8);
      expect(created).toHaveLength(8);
    });

    it('does not check leave or clashes — nobody is on it to clash', async () => {
      const { service, prisma } = build({ clash: { id: 'x' }, leave: { type: 'VACATION' } });
      const result = await service.repeat(open(), 'mgr-1');
      expect(result.skipped).toEqual([]);
      expect(prisma.shift.findFirst).not.toHaveBeenCalled();
    });

    it('needs no one assigned to the location', async () => {
      const { service } = build({ assigned: false });
      await expect(service.repeat(open(), 'mgr-1')).resolves.toMatchObject({ created: 4 });
    });

    it('counts every slot against the cap on one plan', async () => {
      const { service } = build();
      await expect(
        service.repeat(
          open({ openCount: 10, daysOfWeek: [1, 2, 3, 4, 5], until: '2026-12-31' }),
          'mgr-1',
        ),
      ).rejects.toThrow(/Plan at most/);
    });
  });

  describe('copying a week', () => {
    const sourceShift = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      // 9am-5pm Eastern on Tuesday 22 September.
      startsAt: new Date('2026-09-22T13:00:00.000Z'),
      endsAt: new Date('2026-09-22T21:00:00.000Z'),
      notes: 'Front desk',
      location: { timezone: NJ },
    };

    it('lands the shift on the same weekday a week later', async () => {
      const { service, created } = build({ sourceShifts: [sourceShift] });
      const result = await service.copyWeek(
        { fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' },
        'mgr-1',
      );

      expect(result.created).toBe(1);
      // Tuesday 29 September, still 9am Eastern.
      expect((created[0].startsAt as Date).toISOString()).toBe('2026-09-29T13:00:00.000Z');
      expect((created[0].endsAt as Date).toISOString()).toBe('2026-09-29T21:00:00.000Z');
    });

    it('keeps the local hours when the target week is the other side of a clock change', async () => {
      const { service, created } = build({
        sourceShifts: [
          {
            ...sourceShift,
            // 9am-5pm Eastern on Friday 30 October (daylight time).
            startsAt: new Date('2026-10-30T13:00:00.000Z'),
            endsAt: new Date('2026-10-30T21:00:00.000Z'),
          },
        ],
      });
      await service.copyWeek({ fromWeekStart: '2026-10-26', toWeekStart: '2026-11-02' }, 'mgr-1');

      // Friday 6 November is standard time: 9am is now 14:00 UTC.
      expect((created[0].startsAt as Date).toISOString()).toBe('2026-11-06T14:00:00.000Z');
      expect((created[0].endsAt as Date).toISOString()).toBe('2026-11-06T22:00:00.000Z');
    });

    it('carries the notes across', async () => {
      const { service, created } = build({ sourceShifts: [sourceShift] });
      await service.copyWeek({ fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' }, 'mgr-1');
      expect(created[0].notes).toBe('Front desk');
    });

    it('copies as drafts by default', async () => {
      const { service, created } = build({ sourceShifts: [sourceShift] });
      await service.copyWeek({ fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' }, 'mgr-1');
      expect(created[0].status).toBe(ShiftStatus.DRAFT);
    });

    it('preserves an overnight shift spanning two local dates', async () => {
      const { service, created } = build({
        sourceShifts: [
          {
            ...sourceShift,
            // 9pm Tuesday to 1am Wednesday, Eastern.
            startsAt: new Date('2026-09-23T01:00:00.000Z'),
            endsAt: new Date('2026-09-23T05:00:00.000Z'),
          },
        ],
      });
      await service.copyWeek({ fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' }, 'mgr-1');

      const start = created[0].startsAt as Date;
      const end = created[0].endsAt as Date;
      expect(start.toISOString()).toBe('2026-09-30T01:00:00.000Z');
      expect(end.toISOString()).toBe('2026-09-30T05:00:00.000Z');
      // Still a four-hour shift, not twenty.
      expect(end.getTime() - start.getTime()).toBe(4 * 3_600_000);
    });

    it('refuses copying a week onto itself', async () => {
      const { service } = build({ sourceShifts: [sourceShift] });
      await expect(
        service.copyWeek({ fromWeekStart: '2026-09-21', toWeekStart: '2026-09-21' }, 'mgr-1'),
      ).rejects.toThrow(/same week/);
    });

    it('says so when the source week is empty', async () => {
      const { service } = build({ sourceShifts: [] });
      await expect(
        service.copyWeek({ fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' }, 'mgr-1'),
      ).rejects.toThrow(/no shifts in that week/);
    });

    it('ignores cancelled shifts in the source week', async () => {
      const { service, prisma } = build({ sourceShifts: [sourceShift] });
      await service.copyWeek({ fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' }, 'mgr-1');
      expect(prisma.shift.findMany.mock.calls[0][0].where.status).toEqual({
        not: ShiftStatus.CANCELLED,
      });
    });

    it('reports a target day that clashes instead of doubling up', async () => {
      const { service } = build({ sourceShifts: [sourceShift], clash: { id: 'existing' } });
      const result = await service.copyWeek(
        { fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' },
        'mgr-1',
      );
      expect(result.created).toBe(0);
      expect(result.skipped[0]).toMatchObject({ reason: 'OVERLAPS_SHIFT' });
    });
  });

  describe('coverage', () => {
    /// The mock returns the same shifts for both of coverage's queries — the
    /// day grid and the week totals — which is what a real database would do
    /// when the window is a whole week at one location.
    function coveragePrisma(shifts: unknown[], leave: unknown[] = [], unavailable: unknown[] = []) {
      return {
        unavailability: { findMany: jest.fn().mockResolvedValue(unavailable) },
        location: { findUnique: jest.fn() },
        employeeLocation: { findUnique: jest.fn() },
        shift: {
          findMany: jest.fn().mockResolvedValue(shifts),
          findFirst: jest.fn(),
          create: jest.fn(),
        },
        ptoRequest: { findMany: jest.fn().mockResolvedValue(leave), findFirst: jest.fn() },
      };
    }

    function coverageSetup(
      shifts: unknown[],
      leave: unknown[] = [],
      settings: { overtimeThresholdHours?: number } = {},
      unavailable: unknown[] = [],
    ) {
      return new ShiftPlanningService(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        coveragePrisma(shifts, leave, unavailable) as any,
        fakeSettings(settings),
        fakeOvertime(),
        { notify: jest.fn() } as never,
      );
    }

    const shift = {
      id: 'sh-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      startsAt: new Date('2026-09-22T13:00:00.000Z'),
      endsAt: new Date('2026-09-22T21:00:00.000Z'),
      status: ShiftStatus.PUBLISHED,
      employee: { id: 'emp-1', firstName: 'Frankie', lastName: 'Front-Desk', preferredName: null },
      location: { id: 'loc-1', name: 'North Bergen', slug: 'north-bergen', timezone: NJ },
    };

    /// Availability: a warning on the shift, never a refusal.
    describe('availability', () => {
      const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
      const weekly = (over: Record<string, unknown> = {}) => ({
        id: 'u-1',
        employeeId: 'emp-1',
        kind: 'WEEKLY',
        weekday: 2, // Tuesday — the shift above is Tuesday 22 September, 9–5 Eastern
        date: null,
        startTime: null,
        endTime: null,
        note: null,
        effectiveFrom: d('2026-09-01'),
        effectiveUntil: null,
        ...over,
      });
      const coverageWith = async (rules: unknown[]) => {
        const result = await coverageSetup([shift], [], {}, rules).coverage({
          from: '2026-09-21',
          to: '2026-09-27',
        });
        return result.days.find((day) => day.date === '2026-09-22')!.shifts[0].unavailable;
      };

      it('flags a shift on a weekday somebody never works', async () => {
        await expect(coverageWith([weekly()])).resolves.toBe('Not available Tuesdays (all day)');
      });

      it('reads the hours on the location’s own clock', async () => {
        // 9–5 Eastern is 13:00–21:00 UTC. "Not after 4pm" must catch it; a
        // check done in UTC would think the shift ended at 9pm and still catch
        // it, so test the other side too: "not before 8am" must not.
        await expect(
          coverageWith([weekly({ startTime: '16:00', endTime: '23:59' })]),
        ).resolves.toBe('Not available Tuesdays, 4:00 PM–11:59 PM');
        await expect(
          coverageWith([weekly({ startTime: '00:00', endTime: '08:00' })]),
        ).resolves.toBeNull();
      });

      it('lets a shift that ends exactly when somebody stops being free through', async () => {
        await expect(
          coverageWith([weekly({ startTime: '17:00', endTime: '23:00' })]),
        ).resolves.toBeNull();
      });

      it('ignores a weekly rule outside the dates it applies between', async () => {
        await expect(
          coverageWith([weekly({ effectiveFrom: d('2026-09-28') })]),
        ).resolves.toBeNull();
        await expect(
          coverageWith([weekly({ effectiveUntil: d('2026-09-21') })]),
        ).resolves.toBeNull();
      });

      it('flags a one-off date', async () => {
        const oneOff = weekly({
          kind: 'ONE_OFF',
          weekday: null,
          date: d('2026-09-22'),
          effectiveFrom: d('2026-09-22'),
        });
        await expect(coverageWith([oneOff])).resolves.toBe(
          'Not available on Tue, Sep 22 (all day)',
        );
      });

      it('says nothing when nothing clashes', async () => {
        await expect(coverageWith([weekly({ weekday: 3 })])).resolves.toBeNull();
      });
    });

    /**
     * The overtime warning.
     *
     * Two of these are the whole point. A window is usually part of a week and
     * a screen is usually one location, and either of those, taken literally,
     * turns the warning off in exactly the case a manager needed it.
     */
    describe('overtime', () => {
      /// Takes the same shifts for both of coverage's queries — the day grid
      /// and the week totals — which is what a real database would do.
      function withShifts(shifts: unknown[]) {
        return coverageSetup(shifts);
      }

      const hourly = {
        id: 'emp-1',
        firstName: 'Frankie',
        lastName: 'Front-Desk',
        preferredName: null,
      };

      /// A shift of `hours` hours starting 9am Eastern on `date`. A long one
      /// runs past midnight UTC, which is the point — the week it belongs to is
      /// decided in New Jersey, not in UTC.
      const shiftOn = (date: string, hours: number, over: Record<string, unknown> = {}) => {
        const startsAt = new Date(`${date}T13:00:00.000Z`);
        return {
          id: `sh-${date}-${hours}`,
          employeeId: 'emp-1',
          locationId: 'loc-1',
          startsAt,
          endsAt: new Date(startsAt.getTime() + hours * 3_600_000),
          status: ShiftStatus.PUBLISHED,
          employee: hourly,
          location: { id: 'loc-1', name: 'North Bergen', slug: 'north-bergen', timezone: NJ },
          ...over,
        };
      };

      it('says nothing at forty hours, and speaks at forty-one', async () => {
        const five8s = ['21', '22', '23', '24', '25'].map((d) => shiftOn(`2026-09-${d}`, 8));

        const exactly40 = await withShifts(five8s).coverage({
          from: '2026-09-21',
          to: '2026-09-27',
        });
        expect(exactly40.overtime).toEqual([]);

        const { overtime } = await withShifts([...five8s, shiftOn('2026-09-26', 4)]).coverage({
          from: '2026-09-21',
          to: '2026-09-27',
        });

        expect(overtime).toHaveLength(1);
        expect(overtime[0]).toMatchObject({
          employeeName: 'Frankie Front-Desk',
          weekStart: '2026-09-21',
          scheduledHours: 44,
          overtimeHours: 4,
        });
      });

      it('leaves nothing standing for somebody close to the line but not over it', async () => {
        // "Close to overtime" is said while a shift is being added, not left on
        // the week once it is saved.
        const five8s = ['21', '22', '23', '24', '25'].map((d) => shiftOn(`2026-09-${d}`, 8));

        const atForty = await withShifts(five8s).coverage({ from: '2026-09-21', to: '2026-09-27' });

        expect(atForty.overtime).toEqual([]);
        expect(atForty).not.toHaveProperty('nearOvertime');
      });

      it('uses the threshold the practice set, not a constant', async () => {
        // Forty is the federal line and a sensible default. A practice that
        // wants to hear about it sooner should not need a deploy.
        const five8s = ['21', '22', '23', '24', '25'].map((d) => shiftOn(`2026-09-${d}`, 8));

        const { overtime } = await coverageSetup(five8s, [], {
          overtimeThresholdHours: 35,
        }).coverage({ from: '2026-09-21', to: '2026-09-27' });

        expect(overtime).toHaveLength(1);
        expect(overtime[0]).toMatchObject({ scheduledHours: 40, overtimeHours: 5 });
      });

      it('counts the whole week, not just the days on screen', async () => {
        // A manager looking at Thursday and Friday still has to see the
        // thirty-two hours already scheduled Monday to Wednesday, or adding a
        // sixth day looks free.
        const { overtime } = await withShifts([
          shiftOn('2026-09-21', 8),
          shiftOn('2026-09-22', 8),
          shiftOn('2026-09-23', 8),
          shiftOn('2026-09-24', 8),
          shiftOn('2026-09-25', 8),
        ]).coverage({ from: '2026-09-24', to: '2026-09-25' });

        expect(overtime).toHaveLength(0);

        const { overtime: pushed } = await withShifts([
          shiftOn('2026-09-21', 8),
          shiftOn('2026-09-22', 8),
          shiftOn('2026-09-23', 8),
          shiftOn('2026-09-24', 8),
          shiftOn('2026-09-25', 8),
          shiftOn('2026-09-26', 6),
        ]).coverage({ from: '2026-09-24', to: '2026-09-25' });

        expect(pushed[0]).toMatchObject({ scheduledHours: 46, overtimeHours: 6 });
      });

      it('asks the database for whole weeks and hourly staff only', async () => {
        // The mock returns whatever it is given regardless of the where clause,
        // so the filters that matter have to be asserted on the query itself.
        const prisma = coveragePrisma([]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await new ShiftPlanningService(prisma as any, fakeSettings(), fakeOvertime(), {
          notify: jest.fn(),
        } as never).coverage({
          from: '2026-09-24',
          to: '2026-09-25',
          locationId: 'loc-1',
        });

        // Two queries: the day grid, then the week totals.
        const [grid, weeks] = prisma.shift.findMany.mock.calls.map((call) => call[0].where);

        // The grid is the window, at one location.
        expect(grid.locationId).toBe('loc-1');
        expect(grid.startsAt.gte.toISOString()).toBe('2026-09-24T00:00:00.000Z');

        // The totals start from the Monday, and are not narrowed to a location.
        expect(weeks.startsAt.gte.toISOString()).toBe('2026-09-21T00:00:00.000Z');
        expect(weeks.locationId).toBeUndefined();
        expect(weeks.employee).toEqual({ payType: 'HOURLY' });
        expect(weeks.status).toEqual({ not: ShiftStatus.CANCELLED });
      });

      it('adds up hours from every location, not just the one being viewed', async () => {
        // 24 hours at North Bergen and 20 at West New York is 44 for the week.
        // A per-location view is exactly where that goes unnoticed.
        const elsewhere = {
          locationId: 'loc-2',
          location: { id: 'loc-2', name: 'West New York', slug: 'west-new-york', timezone: NJ },
        };

        const { overtime } = await withShifts([
          shiftOn('2026-09-21', 8),
          shiftOn('2026-09-22', 8),
          shiftOn('2026-09-23', 8),
          shiftOn('2026-09-24', 10, elsewhere),
          shiftOn('2026-09-25', 10, elsewhere),
        ]).coverage({ from: '2026-09-21', to: '2026-09-27', locationId: 'loc-1' });

        expect(overtime).toHaveLength(1);
        expect(overtime[0]).toMatchObject({
          scheduledHours: 44,
          overtimeHours: 4,
          // So the screen can say the hours are not all here.
          spansLocations: true,
        });
      });

      it('does not cry wolf when the whole week is at the location on screen', async () => {
        const { overtime } = await withShifts([
          shiftOn('2026-09-21', 12),
          shiftOn('2026-09-22', 12),
          shiftOn('2026-09-23', 12),
          shiftOn('2026-09-24', 12),
        ]).coverage({ from: '2026-09-21', to: '2026-09-27', locationId: 'loc-1' });

        expect(overtime[0]).toMatchObject({ scheduledHours: 48, spansLocations: false });
      });

      it('splits weeks at Monday in local time, matching the payroll export', async () => {
        // A Sunday evening shift belongs to the week the person experienced.
        // 9pm Eastern Sunday is Monday in UTC, which is the trap.
        const { overtime } = await withShifts([
          shiftOn('2026-09-21', 12),
          shiftOn('2026-09-22', 12),
          shiftOn('2026-09-23', 12),
          shiftOn('2026-09-24', 12),
          // Sunday the 27th, 9pm Eastern — still the 21st's week.
          {
            ...shiftOn('2026-09-27', 3),
            startsAt: new Date('2026-09-28T01:00:00.000Z'),
            endsAt: new Date('2026-09-28T04:00:00.000Z'),
          },
        ]).coverage({ from: '2026-09-21', to: '2026-09-27' });

        expect(overtime).toHaveLength(1);
        expect(overtime[0]).toMatchObject({ weekStart: '2026-09-21', scheduledHours: 51 });
      });

      it('reports the worst week first when several are over', async () => {
        const { overtime } = await withShifts([
          shiftOn('2026-09-21', 12),
          shiftOn('2026-09-22', 12),
          shiftOn('2026-09-23', 12),
          shiftOn('2026-09-24', 12),
          shiftOn('2026-09-28', 12),
          shiftOn('2026-09-29', 12),
          shiftOn('2026-09-30', 12),
          shiftOn('2026-10-01', 10),
        ]).coverage({ from: '2026-09-21', to: '2026-10-04' });

        expect(overtime.map((w) => [w.weekStart, w.overtimeHours])).toEqual([
          ['2026-09-21', 8],
          ['2026-09-28', 6],
        ]);
      });
    });

    it('returns one entry per day in the window', async () => {
      const service = coverageSetup([]);
      const { days } = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
      expect(days).toHaveLength(7);
      expect(days[0].date).toBe('2026-09-21');
      expect(days[6].date).toBe('2026-09-27');
    });

    it('totals the staffed hours for a day', async () => {
      const service = coverageSetup([shift]);
      const { days } = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
      const tuesday = days.find((day) => day.date === '2026-09-22')!;
      expect(tuesday.staffedHours).toBe(8);
      expect(tuesday.peopleScheduled).toBe(1);
    });

    it('shows a day with nobody on as an empty one', async () => {
      const service = coverageSetup([shift]);
      const { days } = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
      const monday = days.find((day) => day.date === '2026-09-21')!;
      expect(monday.shifts).toHaveLength(0);
      expect(monday.staffedHours).toBe(0);
    });

    it('files a shift under its local date, not the UTC one', async () => {
      // 9pm Eastern Tuesday is Wednesday in UTC.
      const service = coverageSetup([
        {
          ...shift,
          startsAt: new Date('2026-09-23T01:00:00.000Z'),
          endsAt: new Date('2026-09-23T05:00:00.000Z'),
        },
      ]);
      const { days } = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
      expect(days.find((day) => day.date === '2026-09-22')!.shifts).toHaveLength(1);
      expect(days.find((day) => day.date === '2026-09-23')!.shifts).toHaveLength(0);
    });

    it('lists who is away, with the leave type', async () => {
      const service = coverageSetup(
        [],
        [
          {
            employeeId: 'emp-2',
            type: 'VACATION',
            startDate: new Date('2026-09-22T00:00:00.000Z'),
            endDate: new Date('2026-09-24T00:00:00.000Z'),
            employee: { firstName: 'Max', lastName: 'Assistant', preferredName: null },
          },
        ],
      );
      const { days } = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });

      expect(days.find((day) => day.date === '2026-09-21')!.away).toHaveLength(0);
      const tuesday = days.find((day) => day.date === '2026-09-22')!;
      expect(tuesday.away).toEqual([
        { employeeId: 'emp-2', employeeName: 'Max Assistant', type: 'VACATION' },
      ]);
      expect(days.find((day) => day.date === '2026-09-24')!.away).toHaveLength(1);
      expect(days.find((day) => day.date === '2026-09-25')!.away).toHaveLength(0);
    });

    it('flags somebody scheduled while on approved leave', async () => {
      const service = coverageSetup(
        [shift],
        [
          {
            employeeId: 'emp-1',
            type: 'SICK',
            startDate: new Date('2026-09-22T00:00:00.000Z'),
            endDate: new Date('2026-09-22T00:00:00.000Z'),
            employee: { firstName: 'Frankie', lastName: 'Front-Desk', preferredName: null },
          },
        ],
      );
      const { days } = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
      expect(days.find((day) => day.date === '2026-09-22')!.shifts[0].conflictsWithLeave).toBe(
        true,
      );
    });

    it('does not flag a shift on a day the person is not away', async () => {
      const service = coverageSetup([shift]);
      const { days } = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
      expect(days.find((day) => day.date === '2026-09-22')!.shifts[0].conflictsWithLeave).toBe(
        false,
      );
    });

    it('refuses a window longer than two months', async () => {
      const service = coverageSetup([]);
      await expect(service.coverage({ from: '2026-01-01', to: '2026-06-01' })).rejects.toThrow(
        /one day and two months/,
      );
    });
  });
});
