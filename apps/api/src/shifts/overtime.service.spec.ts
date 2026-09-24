import { NotificationsService } from '../email/notifications.service';
import { fakeSettings } from '../settings/practice-settings.test-double';
import { OvertimeService, overtimeLevel } from './overtime.service';

const NJ = 'America/New_York';

/// A shift on a local NJ date, `hours` long from 9am (EDT, so 13:00 UTC).
function shiftOn(date: string, hours: number, employeeId = 'emp-1') {
  const startsAt = new Date(`${date}T13:00:00Z`);
  return {
    employeeId,
    startsAt,
    endsAt: new Date(startsAt.getTime() + hours * 3_600_000),
    location: { timezone: NJ },
  };
}

describe('overtimeLevel', () => {
  it('is over only past the line, and close within four hours of it', () => {
    expect(overtimeLevel(40.25, 40)).toBe('over');
    expect(overtimeLevel(40, 40)).toBe('near');
    expect(overtimeLevel(36, 40)).toBe('near');
    expect(overtimeLevel(35.75, 40)).toBe('ok');
    // The practice's own line, not forty.
    expect(overtimeLevel(21, 20)).toBe('over');
    expect(overtimeLevel(30, 40)).toBe('ok');
  });
});

describe('OvertimeService', () => {
  function build(
    options: {
      shifts?: unknown[];
      payType?: 'HOURLY' | 'SALARIED';
      threshold?: number;
    } = {},
  ) {
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({ payType: options.payType ?? 'HOURLY' }),
      },
      location: { findUnique: jest.fn().mockResolvedValue({ timezone: NJ }) },
      shift: { findMany: jest.fn().mockResolvedValue(options.shifts ?? []) },
    };
    const notifications = { scheduledIntoOvertime: jest.fn().mockResolvedValue(undefined) };
    const service = new OvertimeService(
      prisma as never,
      fakeSettings(
        options.threshold === undefined ? {} : { overtimeThresholdHours: options.threshold },
      ),
      notifications as unknown as NotificationsService,
    );
    return { service, prisma, notifications };
  }

  describe('checking a shift before it is saved', () => {
    const tuesday = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      startsAt: new Date('2026-10-06T13:00:00Z'),
      endsAt: new Date('2026-10-06T21:00:00Z'),
    };

    it('adds the new shift to the rest of the week and says it goes over', async () => {
      const { service } = build({
        shifts: ['2026-10-05', '2026-10-07', '2026-10-08', '2026-10-09'].map((d) => shiftOn(d, 9)),
      });

      const result = await service.check(tuesday);

      expect(result).toEqual({
        hourly: true,
        weekStart: '2026-10-05',
        hoursBefore: 36,
        hoursAfter: 44,
        thresholdHours: 40,
        level: 'over',
      });
    });

    it('says close when it lands within four hours of the line', async () => {
      const { service } = build({
        shifts: ['2026-10-05', '2026-10-07', '2026-10-08'].map((d) => shiftOn(d, 10)),
      });

      const result = await service.check(tuesday);

      expect(result).toMatchObject({ hoursBefore: 30, hoursAfter: 38, level: 'near' });
    });

    it('counts only the week the shift is in, whatever else is loaded', async () => {
      // The query reaches a day either side; the Sunday before and the Monday
      // after belong to other weeks and must not be added in.
      const { service } = build({
        shifts: [shiftOn('2026-10-04', 12), shiftOn('2026-10-12', 12), shiftOn('2026-10-05', 8)],
      });

      const result = await service.check(tuesday);

      expect(result).toMatchObject({ hoursBefore: 8, hoursAfter: 16, level: 'ok' });
    });

    it('leaves the shift being assigned out of its own "before"', async () => {
      const { service, prisma } = build();

      await service.check({ ...tuesday, shiftId: 'shift-9' });

      const where = prisma.shift.findMany.mock.calls[0][0].where;
      expect(where.id).toEqual({ not: 'shift-9' });
      expect(where.status).toEqual({ not: 'CANCELLED' });
      expect(where.employee).toEqual({ payType: 'HOURLY' });
    });

    it('never warns about salaried staff', async () => {
      const { service } = build({ payType: 'SALARIED' });

      const result = await service.check({
        ...tuesday,
        endsAt: new Date('2026-10-07T13:00:00Z'),
      });

      expect(result.hourly).toBe(false);
      expect(result.level).toBe('ok');
    });
  });

  describe('somebody’s own weeks', () => {
    beforeAll(() => jest.useFakeTimers({ now: new Date('2026-10-07T15:00:00Z') }));
    afterAll(() => jest.useRealTimers());

    it('lists this week and later ones that go over — not close ones, not past weeks', async () => {
      const { service, prisma } = build({
        shifts: [
          // Last week, over — finished, so not mentioned.
          ...['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((d) =>
            shiftOn(d, 9),
          ),
          // This week: 44.
          ...['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d) => shiftOn(d, 11)),
          // Next week: 38, close — agreed and under the line, so not mentioned.
          ...['2026-10-12', '2026-10-13'].map((d) => shiftOn(d, 19)),
          // The week after: 16, fine.
          shiftOn('2026-10-19', 16),
        ],
      });

      const weeks = await service.mine('emp-1');

      expect(weeks).toEqual([
        {
          weekStart: '2026-10-05',
          scheduledHours: 44,
          thresholdHours: 40,
          overtimeHours: 4,
        },
      ]);
      // Only what they can see: their own, published shifts.
      const where = prisma.shift.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ employeeId: 'emp-1', status: 'PUBLISHED' });
    });

    it('is empty for salaried staff without asking for shifts', async () => {
      const { service, prisma } = build({ payType: 'SALARIED' });

      expect(await service.mine('emp-1')).toEqual([]);
      expect(prisma.shift.findMany).not.toHaveBeenCalled();
    });
  });

  describe('telling somebody their rota has put them over', () => {
    const flush = () => new Promise((resolve) => setImmediate(resolve));

    it('emails when a published change crosses the line', async () => {
      const { service, notifications } = build({
        shifts: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d) => shiftOn(d, 11)),
      });

      service.announceNewOvertime(new Map([['emp-1:2026-10-05', 33]]), ['emp-1'], ['2026-10-05']);
      await flush();

      expect(notifications.scheduledIntoOvertime).toHaveBeenCalledWith(
        'emp-1',
        '2026-10-05',
        44,
        40,
      );
    });

    it('does not email again for a week that was already over', async () => {
      const { service, notifications } = build({
        shifts: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d) => shiftOn(d, 11)),
      });

      service.announceNewOvertime(new Map([['emp-1:2026-10-05', 41]]), ['emp-1'], ['2026-10-05']);
      await flush();

      expect(notifications.scheduledIntoOvertime).not.toHaveBeenCalled();
    });

    it('does not email for a week that stays under', async () => {
      const { service, notifications } = build({ shifts: [shiftOn('2026-10-05', 8)] });

      service.announceNewOvertime(new Map(), ['emp-1'], ['2026-10-05']);
      await flush();

      expect(notifications.scheduledIntoOvertime).not.toHaveBeenCalled();
    });

    it('counts only published shifts, since that is the rota they can see', async () => {
      const { service, prisma } = build();

      await service.snapshot(['emp-1'], ['2026-10-05']);

      expect(prisma.shift.findMany.mock.calls[0][0].where.status).toBe('PUBLISHED');
    });
  });
});
