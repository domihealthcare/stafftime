import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { AutoClockOutService, midnightAfter } from './auto-clock-out.service';
import { TimeEntriesService } from './time-entries.service';

describe('AutoClockOutService', () => {
  // 6:00 AM in New Jersey on Tuesday 6 October 2026.
  const now = new Date('2026-10-06T10:00:00.000Z');
  // 8:52 AM on Monday 5 October.
  const mondayMorning = new Date('2026-10-05T12:52:00.000Z');
  // Midnight between Monday and Tuesday, in New Jersey.
  const mondayMidnight = new Date('2026-10-06T04:00:00.000Z');

  function build(
    stale: { id: string; employeeId: string; clockInAt: Date }[] = [],
    closedByUs = 1,
  ) {
    const prisma = {
      timeEntry: {
        findMany: jest.fn().mockResolvedValue(stale),
        updateMany: jest.fn().mockResolvedValue({ count: closedByUs }),
      },
    };
    const notifications = { autoClockedOut: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new AutoClockOutService(prisma as never, notifications as never),
      prisma,
      notifications,
    };
  }

  it('closes a punch left open from yesterday at the midnight that ended it, and tells the person', async () => {
    const { service, prisma, notifications } = build([
      { id: 'entry-1', employeeId: 'emp-frankie', clockInAt: mondayMorning },
    ]);

    await expect(service.closeForgotten({ now })).resolves.toBe(1);

    expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'entry-1', clockOutAt: null },
      data: {
        clockOutAt: mondayMidnight,
        clockOutVerification: 'MANUAL',
        status: 'NEEDS_REVIEW',
        isMissingPunch: true,
        isEarlyDeparture: false,
        autoClockedOutAt: now,
      },
    });
    expect(notifications.autoClockedOut).toHaveBeenCalledWith('emp-frankie', {
      clockInAt: mondayMorning,
      clockOutAt: mondayMidnight,
    });
  });

  it('looks only at punches begun before today in New Jersey, with or without a shift', async () => {
    const { service, prisma } = build();
    await service.closeForgotten({ now });

    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toEqual({
      clockOutAt: null,
      // Midnight starting Tuesday, New Jersey time.
      clockInAt: { lt: mondayMidnight },
    });
  });

  it('can look at one person only — when they open Home, clock in or use the time clock', async () => {
    const { service, prisma } = build();
    await service.closeForgotten({ employeeId: 'emp-frankie', now });

    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toMatchObject({
      employeeId: 'emp-frankie',
    });
  });

  it('closes a punch forgotten for several days at its own midnight, not last night', async () => {
    // 8:00 AM on Saturday 3 October, found on Tuesday.
    const saturday = new Date('2026-10-03T12:00:00.000Z');
    const { service, prisma } = build([
      { id: 'entry-old', employeeId: 'emp-frankie', clockInAt: saturday },
    ]);
    await service.closeForgotten({ now });

    expect(prisma.timeEntry.updateMany.mock.calls[0][0].data.clockOutAt).toEqual(
      new Date('2026-10-04T04:00:00.000Z'),
    );
  });

  it('tells nobody when another run closed it first', async () => {
    const { service, notifications } = build(
      [{ id: 'entry-1', employeeId: 'emp-frankie', clockInAt: mondayMorning }],
      0,
    );
    await expect(service.closeForgotten({ now })).resolves.toBe(0);
    expect(notifications.autoClockedOut).not.toHaveBeenCalled();
  });

  describe('midnightAfter', () => {
    it('is midnight in New Jersey, summer or winter', () => {
      // An evening punch, after UTC has already moved to the next day.
      expect(midnightAfter(new Date('2026-10-06T01:30:00.000Z'))).toEqual(mondayMidnight);
      // In January, New Jersey is five hours behind.
      expect(midnightAfter(new Date('2027-01-11T14:00:00.000Z'))).toEqual(
        new Date('2027-01-12T05:00:00.000Z'),
      );
    });

    it('copes with the night the clocks go back', () => {
      // Sunday 1 November 2026 starts on daylight time and ends on standard.
      expect(midnightAfter(new Date('2026-11-01T14:00:00.000Z'))).toEqual(
        new Date('2026-11-02T05:00:00.000Z'),
      );
    });
  });
});

describe('TimeEntriesService and a punch the app clocked out at midnight', () => {
  const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };

  function build(entry: Record<string, unknown>) {
    const prisma = {
      timeEntry: {
        findUnique: jest.fn().mockResolvedValue({ payrollExports: [], ...entry }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ payrollExports: [], ...entry }),
      },
    };
    const autoClockOut = { closeForgotten: jest.fn().mockResolvedValue(0) };
    const service = new TimeEntriesService(
      prisma as never,
      {} as never,
      new ConfigService({ PUNCH_GRACE_MINUTES: 5 }),
      undefined,
      autoClockOut as never,
    );
    return { service, prisma, autoClockOut };
  }

  const autoClosed = {
    id: 'entry-1',
    clockInAt: new Date('2026-10-05T12:52:00.000Z'),
    clockOutAt: new Date('2026-10-06T04:00:00.000Z'),
    autoClockedOutAt: new Date('2026-10-06T10:00:00.000Z'),
    isMissingPunch: true,
  };

  it('will not approve it until a manager has corrected the time', async () => {
    const { service, prisma } = build(autoClosed);
    await expect(service.approve('entry-1', manager)).rejects.toThrow(/Correct the clock-out time/);
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it('approves it once corrected', async () => {
    const { service, prisma } = build({ ...autoClosed, isMissingPunch: false });
    await service.approve('entry-1', manager);
    expect(prisma.timeEntry.update).toHaveBeenCalled();
  });

  it('closes yesterday’s forgotten punch before showing Home its clock button', async () => {
    const { service, autoClockOut } = build(autoClosed);
    await service.findCurrent('emp-frankie');
    expect(autoClockOut.closeForgotten).toHaveBeenCalledWith({ employeeId: 'emp-frankie' });
  });
});
