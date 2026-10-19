import { Role, ShiftStatus } from '@prisma/client';
import { noShowWords, runningLateWords } from './running-late';
import { RunningLateService } from './running-late.service';

const NOW = new Date('2026-10-05T12:30:00Z'); // 8:30 in New Jersey
const ana = { id: 'emp-ana', email: 'a@x', role: Role.EMPLOYEE };
const SHIFT = {
  id: 'shift-1',
  employeeId: 'emp-ana',
  locationId: 'loc-nb',
  startsAt: new Date('2026-10-05T13:00:00Z'),
  endsAt: new Date('2026-10-05T21:00:00Z'),
  status: ShiftStatus.PUBLISHED,
  isRemote: false,
  location: { name: 'North Bergen' },
  employee: { firstName: 'Ana', preferredName: null, lastName: 'Lopez' },
};

function build(shift: object | null = SHIFT, punches = 0) {
  const prisma = {
    shift: { findUnique: jest.fn().mockResolvedValue(shift) },
    timeEntry: { count: jest.fn().mockResolvedValue(punches) },
    runningLate: { upsert: jest.fn().mockResolvedValue({ minutes: 20, createdAt: NOW }) },
    employee: { findMany: jest.fn().mockResolvedValue([{ id: 'mgr-nb' }]) },
  };
  const notifications = { bell: jest.fn() };
  return {
    service: new RunningLateService(prisma as never, notifications as never),
    prisma,
    notifications,
  };
}

describe('running late', () => {
  it('words for the managers', () => {
    const shift = { startsAt: SHIFT.startsAt, isRemote: false, locationName: 'North Bergen' };
    expect(runningLateWords('Ana Lopez', shift, 20)).toEqual({
      title: 'Ana Lopez is running late',
      body: 'About 20 minutes late for 9:00 AM at North Bergen - expected around 9:20 AM.',
      link: '/directory',
    });
    expect(noShowWords('Ana Lopez', { ...shift, isRemote: true }, null).title).toBe(
      "Ana Lopez isn't clocked in for 9:00 AM working from home",
    );
  });

  it("saves it and tells that office's managers on the bell", async () => {
    const { service, prisma, notifications } = build();
    await service.say('shift-1', 20, ana, NOW);
    expect(prisma.runningLate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shiftId: 'shift-1' },
        update: { minutes: 20, createdAt: NOW },
      }),
    );
    expect(notifications.bell).toHaveBeenCalledWith(
      ['mgr-nb'],
      'RUNNING_LATE',
      expect.objectContaining({ title: 'Ana Lopez is running late' }),
    );
  });

  it('only for your own published shift, not yet over, within three hours, not clocked in', async () => {
    await expect(
      build({ ...SHIFT, employeeId: 'emp-bea' }).service.say('shift-1', 20, ana, NOW),
    ).rejects.toThrow('not one of your shifts');
    await expect(
      build({ ...SHIFT, status: ShiftStatus.DRAFT }).service.say('shift-1', 20, ana, NOW),
    ).rejects.toThrow();
    await expect(
      build().service.say('shift-1', 20, ana, new Date('2026-10-05T22:00:00Z')),
    ).rejects.toThrow('over');
    await expect(
      build().service.say('shift-1', 20, ana, new Date('2026-10-05T09:00:00Z')),
    ).rejects.toThrow('three hours');
    await expect(build(SHIFT, 1).service.say('shift-1', 20, ana, NOW)).rejects.toThrow(
      'already clocked in',
    );
    await expect(build().service.say('shift-1', 7, ana, NOW)).rejects.toThrow('Choose one of');
  });
});
