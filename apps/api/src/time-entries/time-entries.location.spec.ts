import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { TimeEntriesService } from './time-entries.service';

const admin = { id: 'adm-1', email: 'admin@domihealthcare.com', role: Role.ADMIN };

const CAPTURED = [
  'clockInLatitude',
  'clockInLongitude',
  'clockInAccuracyMeters',
  'clockInIp',
  'clockOutLatitude',
  'clockOutLongitude',
  'clockOutAccuracyMeters',
  'clockOutIp',
];

function build(entry: Record<string, unknown> | null = {}) {
  const prisma = {
    timeEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(
        entry === null
          ? null
          : {
              id: 'entry-1',
              employeeId: 'emp-1',
              clockInAt: new Date(),
              clockInLatitude: null,
              clockInLongitude: null,
              clockInAccuracyMeters: null,
              clockInIp: null,
              clockInVerification: 'GEOFENCE',
              clockOutAt: null,
              clockOutLatitude: null,
              clockOutLongitude: null,
              clockOutAccuracyMeters: null,
              clockOutIp: null,
              clockOutVerification: null,
              ...entry,
            },
      ),
    },
  };

  return {
    service: new TimeEntriesService(
      prisma as never,
      {} as never,
      new ConfigService({ PUNCH_GRACE_MINUTES: 5 }),
    ),
    prisma,
  };
}

/**
 * Where somebody physically was is captured so a browser clock-in means
 * something. It is not part of a timesheet, and it used to go out with every
 * one of them because the query said `include` rather than `select`.
 */
describe('captured location is not part of a timesheet', () => {
  it.each([
    ['a fortnight of entries', (s: TimeEntriesService) => s.findAll({})],
    ['the open punch', (s: TimeEntriesService) => s.findCurrent('emp-1')],
  ])('never asks the database for coordinates: %s', async (_name, call) => {
    const { service, prisma } = build();
    await call(service);

    const select =
      prisma.timeEntry.findMany.mock.calls[0]?.[0].select ??
      prisma.timeEntry.findFirst.mock.calls[0][0].select;

    for (const field of CAPTURED) expect(select).not.toHaveProperty(field);

    // What the check concluded is still there — that is the useful part.
    expect(select).toHaveProperty('clockInVerification', true);
  });

  it('hands the coordinates over one entry at a time, to an admin', async () => {
    const { service } = build({
      clockInLatitude: '40.804100',
      clockInLongitude: '-74.012400',
      clockInIp: '203.0.113.7',
    });

    const trail = await service.locationTrail('entry-1', admin);
    expect(trail.clockInLatitude).toBe('40.804100');
    // Not old enough for the sweep, and it has its coordinates, so nothing was
    // cleared — the caller can tell "never captured" from "aged out".
    expect(trail.cleared).toBe(false);
  });

  it('says so when the nightly sweep has already cleared them', async () => {
    const { service } = build({ clockInAt: new Date(Date.now() - 200 * 86_400_000) });

    const trail = await service.locationTrail('entry-1', admin);
    expect(trail.cleared).toBe(true);
  });

  it('does not claim a cleared punch when the punch is simply recent', async () => {
    // A kiosk punch never has coordinates. Reporting that as "cleared" would
    // invite somebody to go looking for data that never existed.
    const { service } = build({ clockInAt: new Date() });

    const trail = await service.locationTrail('entry-1', admin);
    expect(trail.cleared).toBe(false);
  });
});
