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
      starting?: object[];
      noShow?: object[];
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
        // The managers' no-show look has its own answer; otherwise the first
        // call finds shifts that have started, the rest a person's shifts
        // since an open punch.
        findMany: (() => {
          let first = true;
          return jest.fn(async (args: { where?: { reminders?: { none?: { kind?: string } } } }) => {
            if (args?.where?.reminders?.none?.kind === 'NO_SHOW') return options.noShow ?? [];
            if (first) {
              first = false;
              return options.starting ?? [];
            }
            return options.theirShifts ?? [];
          });
        })(),
      },
      timeEntry: {
        findMany: jest.fn().mockResolvedValue(options.openPunches ?? []),
        count: jest.fn().mockResolvedValue(options.punches ?? 0),
      },
      employee: { findMany: jest.fn().mockResolvedValue([{ id: 'mgr-nb' }]) },
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
    const autoClockOut = { closeForgotten: jest.fn().mockResolvedValue(0) };
    const lunchNotices = { send: jest.fn().mockResolvedValue(0) };
    const notifications = {
      missedClockIn: jest.fn().mockResolvedValue(undefined),
      missedClockOut: jest.fn().mockResolvedValue(undefined),
      shiftTomorrow: jest.fn().mockResolvedValue(undefined),
      bell: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new PunchRemindersService(
        prisma as never,
        notifications as never,
        autoClockOut as never,
        lunchNotices as never,
        { send: jest.fn().mockResolvedValue(0) } as never,
        { send: jest.fn().mockResolvedValue(0) } as never,
        { nudge: jest.fn().mockResolvedValue(0) } as never,
        { send: jest.fn().mockResolvedValue(0) } as never,
      ),
      autoClockOut,
      prisma,
      notifications,
    };
  }

  it('first clocks out anybody still clocked in from yesterday, and says how many', async () => {
    const { service, autoClockOut, prisma } = build();
    autoClockOut.closeForgotten.mockResolvedValue(3);
    await expect(service.run(now)).resolves.toEqual({
      autoClockedOut: 3,
      clockIn: 0,
      clockOut: 0,
      lunchNotices: 0,
      licenseReminders: 0,
      onboardingReminders: 0,
      requiredReminders: 0,
      tomorrowReminders: 0,
      noShows: 0,
      weeklySummaries: 0,
    });
    expect(autoClockOut.closeForgotten).toHaveBeenCalledWith({ now });
    // Before looking for shifts nobody has clocked in for.
    expect(autoClockOut.closeForgotten.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.shift.findMany.mock.invocationCallOrder[0],
    );
  });

  describe('clocking in', () => {
    it('tells somebody 15 minutes into a shift they have not clocked in for', async () => {
      const { service, notifications, prisma } = build({ starting: [nineOClock] });

      await expect(service.run(now)).resolves.toEqual({
        autoClockedOut: 0,
        clockIn: 1,
        clockOut: 0,
        lunchNotices: 0,
        licenseReminders: 0,
        onboardingReminders: 0,
        requiredReminders: 0,
        tomorrowReminders: 0,
        noShows: 0,
        weeklySummaries: 0,
      });
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
      await expect(service.run(now)).resolves.toEqual({
        autoClockedOut: 0,
        clockIn: 0,
        clockOut: 0,
        lunchNotices: 0,
        licenseReminders: 0,
        onboardingReminders: 0,
        requiredReminders: 0,
        tomorrowReminders: 0,
        noShows: 0,
        weeklySummaries: 0,
      });
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
      await expect(service.run(now)).resolves.toEqual({
        autoClockedOut: 0,
        clockIn: 0,
        clockOut: 0,
        lunchNotices: 0,
        licenseReminders: 0,
        onboardingReminders: 0,
        requiredReminders: 0,
        tomorrowReminders: 0,
        noShows: 0,
        weeklySummaries: 0,
      });
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

      await expect(service.run(now)).resolves.toEqual({
        autoClockedOut: 0,
        clockIn: 0,
        clockOut: 1,
        lunchNotices: 0,
        licenseReminders: 0,
        onboardingReminders: 0,
        requiredReminders: 0,
        tomorrowReminders: 0,
        noShows: 0,
        weeklySummaries: 0,
      });
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

  describe("you're on tomorrow", () => {
    // 6:30pm in New Jersey on Mon, Oct 5.
    const evening = at('2026-10-05T22:30:00.000Z');
    const tomorrowSeven = {
      id: 'shift-tue',
      employeeId: 'emp-frankie',
      locationId: 'loc-wny',
      startsAt: at('2026-10-06T11:00:00.000Z'),
      endsAt: at('2026-10-06T18:00:00.000Z'),
      isRemote: false,
      notes: '7-12 upstairs',
      location: { name: 'West New York' },
      jobRole: { name: 'Front Desk' },
    };

    it('tells each person once, in the evening, with hours, place, role and note', async () => {
      const { service, prisma, notifications } = build({ starting: [tomorrowSeven] });
      await expect(service.remindAboutTomorrow(evening)).resolves.toBe(1);
      expect(prisma.shift.findMany.mock.calls[0][0].where).toMatchObject({
        status: 'PUBLISHED',
        employee: { employmentStatus: 'ACTIVE', wantsShiftReminders: true },
        startsAt: {
          gte: at('2026-10-06T04:00:00.000Z'),
          lt: at('2026-10-07T04:00:00.000Z'),
        },
        reminders: { none: { kind: 'TOMORROW' } },
      });
      expect(prisma.punchReminder.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-tue', kind: 'TOMORROW' },
      });
      expect(notifications.shiftTomorrow).toHaveBeenCalledWith('emp-frankie', {
        title: "You're on tomorrow, 7:00 AM–2:00 PM at West New York",
        body: 'Tuesday, Oct 6\n7:00 AM–2:00 PM at West New York (Front Desk)\nNote: 7-12 upstairs',
        link: '/schedule?week=2026-10-06',
      });
    });

    it('puts two shifts in one message', async () => {
      const { service, notifications } = build({
        starting: [
          tomorrowSeven,
          {
            ...tomorrowSeven,
            id: 'shift-tue-2',
            startsAt: at('2026-10-06T19:00:00.000Z'),
            endsAt: at('2026-10-06T22:00:00.000Z'),
            isRemote: true,
            notes: null,
          },
        ],
      });
      await service.remindAboutTomorrow(evening);
      expect(notifications.shiftTomorrow).toHaveBeenCalledTimes(1);
      expect(notifications.shiftTomorrow.mock.calls[0][1].title).toBe(
        "You're on tomorrow: 2 shifts, from 7:00 AM",
      );
      expect(notifications.shiftTomorrow.mock.calls[0][1].body).toContain(
        '3:00 PM–6:00 PM working from home (Front Desk)',
      );
    });

    it('waits until 6pm', async () => {
      const { service, prisma } = build({ starting: [tomorrowSeven] });
      await expect(service.remindAboutTomorrow(now)).resolves.toBe(0);
      expect(prisma.shift.findMany).not.toHaveBeenCalled();
    });

    it('says nothing on time off, in a closure, or twice', async () => {
      const onLeave = build({ starting: [tomorrowSeven], onLeave: 1 });
      await onLeave.service.remindAboutTomorrow(evening);
      expect(onLeave.notifications.shiftTomorrow).not.toHaveBeenCalled();

      const closed = build({ starting: [tomorrowSeven], closures: 1 });
      await closed.service.remindAboutTomorrow(evening);
      expect(closed.notifications.shiftTomorrow).not.toHaveBeenCalled();

      const twice = build({ starting: [tomorrowSeven], alreadyClaimed: true });
      await twice.service.remindAboutTomorrow(evening);
      expect(twice.notifications.shiftTomorrow).not.toHaveBeenCalled();
    });
  });

  describe('no-shows, to the managers', () => {
    // 9:40 in New Jersey: the 9 o'clock shift is 40 minutes in.
    const nineForty = at('2026-10-05T13:40:00.000Z');
    const nineShift = {
      ...nineOClock,
      employee: { firstName: 'Frankie', preferredName: null, lastName: 'Front-Desk' },
      runningLate: null as { minutes: number } | null,
    };

    it("tells the office's managers once, 30 minutes in, on the bell", async () => {
      const { service, prisma, notifications } = build({ noShow: [nineShift] });
      await expect(service.tellManagersOfNoShows(nineForty)).resolves.toBe(1);
      const where = prisma.shift.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        status: 'PUBLISHED',
        startsAt: { gte: at('2026-10-05T11:40:00.000Z'), lte: at('2026-10-05T13:10:00.000Z') },
        reminders: { none: { kind: 'NO_SHOW' } },
      });
      expect(prisma.punchReminder.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-nine', kind: 'NO_SHOW' },
      });
      expect(notifications.bell).toHaveBeenCalledWith(['mgr-nb'], 'NO_SHOW', {
        title: "Frankie Front-Desk isn't clocked in for 9:00 AM at North Bergen",
        body: expect.stringContaining('nothing has been heard'),
        link: '/directory',
      });
    });

    it('waits out a "running late" plus a quarter of an hour', async () => {
      const said = { ...nineShift, runningLate: { minutes: 20 } };
      // 20 minutes late plus 15: nothing before 9:35.
      const early = build({ noShow: [said] });
      await early.service.tellManagersOfNoShows(at('2026-10-05T13:34:00.000Z'));
      expect(early.notifications.bell).not.toHaveBeenCalled();
      const past = build({ noShow: [said] });
      await past.service.tellManagersOfNoShows(nineForty);
      expect(past.notifications.bell.mock.calls[0][2].body).toContain('about 20 minutes late');
    });

    it('says nothing once they have clocked in, on time off, or in a closure', async () => {
      for (const extra of [{ punches: 1 }, { onLeave: 1 }, { closures: 1 }]) {
        const { service, notifications } = build({ noShow: [nineShift], ...extra });
        await service.tellManagersOfNoShows(nineForty);
        expect(notifications.bell).not.toHaveBeenCalled();
      }
    });
  });
});
