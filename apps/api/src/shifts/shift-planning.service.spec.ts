import { BadRequestException } from '@nestjs/common';
import { PtoStatus, ShiftStatus } from '@prisma/client';
import { ShiftPlanningService } from './shift-planning.service';

const NJ = 'America/New_York';

describe('ShiftPlanningService', () => {
  function build(
    options: {
      clash?: unknown;
      leave?: unknown;
      sourceShifts?: unknown[];
      location?: unknown;
      assigned?: boolean;
    } = {},
  ) {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      location: {
        findUnique: jest.fn().mockResolvedValue(
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
      },
      ptoRequest: {
        findFirst: jest.fn().mockResolvedValue(options.leave ?? null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new ShiftPlanningService(prisma as any), prisma, created };
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
      await service.repeat(repeat({ from: '2026-09-22', until: '2026-09-22', daysOfWeek: [2] }), 'mgr-1');

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
      expect(prisma.ptoRequest.findFirst.mock.calls[0][0].where.status).toBe(
        PtoStatus.APPROVED,
      );
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
      await service.copyWeek(
        { fromWeekStart: '2026-10-26', toWeekStart: '2026-11-02' },
        'mgr-1',
      );

      // Friday 6 November is standard time: 9am is now 14:00 UTC.
      expect((created[0].startsAt as Date).toISOString()).toBe('2026-11-06T14:00:00.000Z');
      expect((created[0].endsAt as Date).toISOString()).toBe('2026-11-06T22:00:00.000Z');
    });

    it('carries the notes across', async () => {
      const { service, created } = build({ sourceShifts: [sourceShift] });
      await service.copyWeek(
        { fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' },
        'mgr-1',
      );
      expect(created[0].notes).toBe('Front desk');
    });

    it('copies as drafts by default', async () => {
      const { service, created } = build({ sourceShifts: [sourceShift] });
      await service.copyWeek(
        { fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' },
        'mgr-1',
      );
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
      await service.copyWeek(
        { fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' },
        'mgr-1',
      );

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
        service.copyWeek(
          { fromWeekStart: '2026-09-21', toWeekStart: '2026-09-21' },
          'mgr-1',
        ),
      ).rejects.toThrow(/same week/);
    });

    it('says so when the source week is empty', async () => {
      const { service } = build({ sourceShifts: [] });
      await expect(
        service.copyWeek(
          { fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' },
          'mgr-1',
        ),
      ).rejects.toThrow(/no shifts in that week/);
    });

    it('ignores cancelled shifts in the source week', async () => {
      const { service, prisma } = build({ sourceShifts: [sourceShift] });
      await service.copyWeek(
        { fromWeekStart: '2026-09-21', toWeekStart: '2026-09-28' },
        'mgr-1',
      );
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
    function coverageSetup(shifts: unknown[], leave: unknown[] = []) {
      const prisma = {
        location: { findUnique: jest.fn() },
        employeeLocation: { findUnique: jest.fn() },
        shift: { findMany: jest.fn().mockResolvedValue(shifts), findFirst: jest.fn(), create: jest.fn() },
        ptoRequest: { findMany: jest.fn().mockResolvedValue(leave), findFirst: jest.fn() },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new ShiftPlanningService(prisma as any);
    }

    const shift = {
      id: 'sh-1',
      employeeId: 'emp-1',
      startsAt: new Date('2026-09-22T13:00:00.000Z'),
      endsAt: new Date('2026-09-22T21:00:00.000Z'),
      status: ShiftStatus.PUBLISHED,
      employee: { id: 'emp-1', firstName: 'Frankie', lastName: 'Front-Desk', preferredName: null },
      location: { id: 'loc-1', name: 'North Bergen', slug: 'north-bergen', timezone: NJ },
    };

    it('returns one entry per day in the window', async () => {
      const service = coverageSetup([]);
      const days = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
      expect(days).toHaveLength(7);
      expect(days[0].date).toBe('2026-09-21');
      expect(days[6].date).toBe('2026-09-27');
    });

    it('totals the staffed hours for a day', async () => {
      const service = coverageSetup([shift]);
      const days = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
      const tuesday = days.find((day) => day.date === '2026-09-22')!;
      expect(tuesday.staffedHours).toBe(8);
      expect(tuesday.peopleScheduled).toBe(1);
    });

    it('shows a day with nobody on as an empty one', async () => {
      const service = coverageSetup([shift]);
      const days = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
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
      const days = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
      expect(days.find((day) => day.date === '2026-09-22')!.shifts).toHaveLength(1);
      expect(days.find((day) => day.date === '2026-09-23')!.shifts).toHaveLength(0);
    });

    it('lists who is away, with the leave type', async () => {
      const service = coverageSetup([], [
        {
          employeeId: 'emp-2',
          type: 'VACATION',
          startDate: new Date('2026-09-22T00:00:00.000Z'),
          endDate: new Date('2026-09-24T00:00:00.000Z'),
          employee: { firstName: 'Max', lastName: 'Assistant', preferredName: null },
        },
      ]);
      const days = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });

      expect(days.find((day) => day.date === '2026-09-21')!.away).toHaveLength(0);
      const tuesday = days.find((day) => day.date === '2026-09-22')!;
      expect(tuesday.away).toEqual([
        { employeeId: 'emp-2', employeeName: 'Max Assistant', type: 'VACATION' },
      ]);
      expect(days.find((day) => day.date === '2026-09-24')!.away).toHaveLength(1);
      expect(days.find((day) => day.date === '2026-09-25')!.away).toHaveLength(0);
    });

    it('flags somebody scheduled while on approved leave', async () => {
      const service = coverageSetup([shift], [
        {
          employeeId: 'emp-1',
          type: 'SICK',
          startDate: new Date('2026-09-22T00:00:00.000Z'),
          endDate: new Date('2026-09-22T00:00:00.000Z'),
          employee: { firstName: 'Frankie', lastName: 'Front-Desk', preferredName: null },
        },
      ]);
      const days = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
      expect(days.find((day) => day.date === '2026-09-22')!.shifts[0].conflictsWithLeave).toBe(
        true,
      );
    });

    it('does not flag a shift on a day the person is not away', async () => {
      const service = coverageSetup([shift]);
      const days = await service.coverage({ from: '2026-09-21', to: '2026-09-27' });
      expect(days.find((day) => day.date === '2026-09-22')!.shifts[0].conflictsWithLeave).toBe(
        false,
      );
    });

    it('refuses a window longer than two months', async () => {
      const service = coverageSetup([]);
      await expect(
        service.coverage({ from: '2026-01-01', to: '2026-06-01' }),
      ).rejects.toThrow(/one day and two months/);
    });
  });
});
