import { Prisma } from '@prisma/client';
import { PunchRemindersService } from './punch-reminders.service';

describe('PunchRemindersService', () => {
  // 9:20 in New Jersey.
  const now = new Date('2026-10-05T13:20:00.000Z');
  const at = (iso: string) => new Date(iso);

  const nineOClock = {
    id: 'shift-nine',
    employeeId: 'emp-frankie',
    locationId: 'loc-nb',
    startsAt: at('2026-10-05T13:00:00.000Z'),
    isRemote: false,
    location: { name: 'North Bergen' },
  };

  function build(
    options: {
      starting?: (typeof nineOClock)[];
      openPunches?: { employeeId: string; clockInAt: Date }[];
      theirShifts?: {
        id: string;
        endsAt: Date;
        isRemote: boolean;
        location: { name: string };
        reminders: { id: string }[];
      }[];
      punches?: number;
      onLeave?: number;
      closures?: number;
      alreadyClaimed?: boolean;
    } = {},
  ) {
    const prisma = {
      shift: {
        findMany: jest
          .fn()
          // The first call finds shifts that have started; the rest, a
          // person's shifts since an open punch.
          .mockResolvedValueOnce(options.starting ?? [])
          .mockResolvedValue(options.theirShifts ?? []),
      },
      timeEntry: {
        findMany: jest.fn().mockResolvedValue(options.openPunches ?? []),
        count: jest.fn().mockResolvedValue(options.punches ?? 0),
      },
      ptoRequest: { count: jest.fn().mockResolvedValue(options.onLeave ?? 0) },
      practiceEvent: { count: jest.fn().mockResolvedValue(options.closures ?? 0) },
      punchReminder: {
        create: options.alreadyClaimed
          ? jest.fn().mockRejectedValue(
              new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
                code: 'P2002',
                clientVersion: 'test',
              }),
            )
          : jest.fn().mockResolvedValue({}),
      },
    };
    const notifications = {
      missedClockIn: jest.fn().mockResolvedValue(undefined),
      missedClockOut: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new PunchRemindersService(prisma as never, notifications as never),
      prisma,
      notifications,
    };
  }

  describe('clocking in', () => {
    it('tells somebody 15 minutes into a shift they have not clocked in for', async () => {
      const { service, notifications, prisma } = build({ starting: [nineOClock] });

      await expect(service.run(now)).resolves.toEqual({ clockIn: 1, clockOut: 0 });
      expect(prisma.punchReminder.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-nine', kind: 'CLOCK_IN' },
      });
      expect(notifications.missedClockIn).toHaveBeenCalledWith('emp-frankie', {
        startsAt: nineOClock.startsAt,
        isRemote: false,
        locationName: 'North Bergen',
      });
    });

    it('only looks at published shifts with somebody on them, started 15 minutes to 2 hours ago and not yet over, not already reminded', async () => {
      const { service, prisma } = build();
      await service.run(now);

      const where = prisma.shift.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        status: 'PUBLISHED',
        employeeId: { not: null },
        employee: { employmentStatus: 'ACTIVE' },
        startsAt: {
          gte: at('2026-10-05T11:20:00.000Z'),
          lte: at('2026-10-05T13:05:00.000Z'),
        },
        endsAt: { gt: now },
        reminders: { none: { kind: 'CLOCK_IN' } },
      });
    });

    it('says nothing to somebody who has clocked in', async () => {
      const { service, notifications, prisma } = build({ starting: [nineOClock], punches: 1 });
      await expect(service.run(now)).resolves.toEqual({ clockIn: 0, clockOut: 0 });
      expect(notifications.missedClockIn).not.toHaveBeenCalled();
      expect(prisma.punchReminder.create).not.toHaveBeenCalled();
    });

    it('counts a punch still open, or one that ran past the start, but not one that ended before it', async () => {
      const { service, prisma } = build({ starting: [nineOClock] });
      await service.run(now);

      expect(prisma.timeEntry.count).toHaveBeenCalledWith({
        where: {
          employeeId: 'emp-frankie',
          clockInAt: { lte: now },
          OR: [{ clockOutAt: null }, { clockOutAt: { gt: nineOClock.startsAt } }],
        },
      });
    });

    it('says nothing on approved time off that day', async () => {
      const { service, notifications, prisma } = build({ starting: [nineOClock], onLeave: 1 });
      await service.run(now);

      expect(notifications.missedClockIn).not.toHaveBeenCalled();
      const day = at('2026-10-05T00:00:00.000Z');
      expect(prisma.ptoRequest.count).toHaveBeenCalledWith({
        where: {
          employeeId: 'emp-frankie',
          status: 'APPROVED',
          startDate: { lte: day },
          endDate: { gte: day },
        },
      });
    });

    it('takes the day in New Jersey, not UTC, for an evening shift', async () => {
      const evening = { ...nineOClock, startsAt: at('2026-10-06T00:30:00.000Z') }; // 8:30pm on the 5th
      const { service, prisma } = build({ starting: [evening] });
      await service.run(at('2026-10-06T00:50:00.000Z'));

      expect(prisma.ptoRequest.count.mock.calls[0][0].where.startDate).toEqual({
        lte: at('2026-10-05T00:00:00.000Z'),
      });
    });

    it('says nothing when the office is closed', async () => {
      const { service, notifications, prisma } = build({ starting: [nineOClock], closures: 1 });
      await service.run(now);

      expect(notifications.missedClockIn).not.toHaveBeenCalled();
      expect(prisma.practiceEvent.count).toHaveBeenCalledWith({
        where: {
          kind: 'CLOSURE',
          startsAt: { lte: nineOClock.startsAt },
          endsAt: { gt: nineOClock.startsAt },
          OR: [{ audience: { not: 'LOCATION' } }, { locationId: 'loc-nb' }],
        },
      });
    });

    it('sends nothing when another run has already claimed it', async () => {
      const { service, notifications } = build({ starting: [nineOClock], alreadyClaimed: true });
      await expect(service.run(now)).resolves.toEqual({ clockIn: 0, clockOut: 0 });
      expect(notifications.missedClockIn).not.toHaveBeenCalled();
    });
  });

  describe('clocking out', () => {
    const openSinceNine = { employeeId: 'emp-frankie', clockInAt: at('2026-10-05T12:55:00.000Z') };
    // 9:20 in New Jersey; the shift ended at 9:00, 20 minutes ago.
    const endedAtNine = {
      id: 'shift-early',
      endsAt: at('2026-10-05T13:00:00.000Z'),
      isRemote: false,
      location: { name: 'West New York' },
      reminders: [],
    };

    it('tells somebody still clocked in 15 minutes after their shift ended', async () => {
      const { service, notifications, prisma } = build({
        openPunches: [openSinceNine],
        theirShifts: [endedAtNine],
      });

      await expect(service.run(now)).resolves.toEqual({ clockIn: 0, clockOut: 1 });
      expect(prisma.punchReminder.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-early', kind: 'CLOCK_OUT' },
      });
      expect(notifications.missedClockOut).toHaveBeenCalledWith('emp-frankie', {
        endsAt: endedAtNine.endsAt,
        isRemote: false,
        locationName: 'West New York',
      });
    });

    it('looks at their published shifts since the punch, up to one starting in half an hour, latest-ending first', async () => {
      const { service, prisma } = build({ openPunches: [openSinceNine] });
      await service.run(now);

      expect(prisma.shift.findMany.mock.calls[1][0]).toMatchObject({
        where: {
          employeeId: 'emp-frankie',
          status: 'PUBLISHED',
          endsAt: { gt: openSinceNine.clockInAt },
          startsAt: { lte: at('2026-10-05T13:50:00.000Z') },
        },
        orderBy: { endsAt: 'desc' },
      });
    });

    it('waits the full 15 minutes', async () => {
      const { service, notifications } = build({
        openPunches: [openSinceNine],
        theirShifts: [{ ...endedAtNine, endsAt: at('2026-10-05T13:10:00.000Z') }],
      });
      await service.run(now);
      expect(notifications.missedClockOut).not.toHaveBeenCalled();
    });

    it('says nothing while another shift of theirs is on or about to start', async () => {
      const { service, notifications } = build({
        openPunches: [openSinceNine],
        theirShifts: [
          { ...endedAtNine, id: 'shift-next', endsAt: at('2026-10-05T17:00:00.000Z') },
          endedAtNine,
        ],
      });
      await service.run(now);
      expect(notifications.missedClockOut).not.toHaveBeenCalled();
    });

    it('says nothing about a punch with no shift to measure it against', async () => {
      const { service, notifications } = build({ openPunches: [openSinceNine], theirShifts: [] });
      await service.run(now);
      expect(notifications.missedClockOut).not.toHaveBeenCalled();
    });

    it('says nothing about a shift that ended more than 2 hours ago', async () => {
      const { service, notifications } = build({
        openPunches: [openSinceNine],
        theirShifts: [{ ...endedAtNine, endsAt: at('2026-10-05T11:00:00.000Z') }],
      });
      await service.run(now);
      expect(notifications.missedClockOut).not.toHaveBeenCalled();
    });

    it('says it once', async () => {
      const { service, notifications, prisma } = build({
        openPunches: [openSinceNine],
        theirShifts: [{ ...endedAtNine, reminders: [{ id: 'sent' }] }],
      });
      await service.run(now);
      expect(notifications.missedClockOut).not.toHaveBeenCalled();
      expect(prisma.punchReminder.create).not.toHaveBeenCalled();
    });
  });
});
