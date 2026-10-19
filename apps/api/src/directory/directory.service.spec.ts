import { Role } from '@prisma/client';
import { DirectoryService, ON_NOW_WINDOW_HOURS } from './directory.service';

const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };
const employee = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };

const NOW = new Date('2026-09-22T15:00:00Z');
const clockedIn = new Date('2026-09-22T13:02:00Z');

function person(over: Record<string, unknown> = {}) {
  return {
    id: 'emp-1',
    firstName: 'Frankie',
    lastName: 'Front-Desk',
    preferredName: null,
    email: 'frankie@domihealthcare.com',
    phone: '201-555-0100',
    employmentStatus: 'ACTIVE',
    clocksIn: true,
    jobRoles: [
      {
        isPrimary: false,
        jobRole: { id: 'ma', name: 'Medical Assistant', sortOrder: 20, colour: 'orange' },
      },
      {
        isPrimary: false,
        jobRole: { id: 'fd', name: 'Front Desk', sortOrder: 10, colour: 'blue' },
      },
    ],
    locations: [
      { isPrimary: false, location: { id: 'wny', name: 'West New York' } },
      { isPrimary: true, location: { id: 'nb', name: 'North Bergen' } },
    ],
    timeEntries: [{ clockInAt: clockedIn, location: { id: 'nb', name: 'North Bergen' } }],
    shifts: [],
    ...over,
  };
}

function build(
  rows: unknown[] = [person()],
  extra: { shifts?: unknown[]; timeOff?: unknown[] } = {},
) {
  const prisma = {
    employee: { findMany: jest.fn().mockResolvedValue(rows) },
    shift: { findMany: jest.fn().mockResolvedValue(extra.shifts ?? []) },
    ptoRequest: { findMany: jest.fn().mockResolvedValue(extra.timeOff ?? []) },
  };
  return { service: new DirectoryService(prisma as never), prisma };
}

describe('DirectoryService', () => {
  it('leaves out anyone who has left, and anyone not started yet', async () => {
    const { service, prisma } = build();
    await service.list(employee, NOW);

    const { where } = prisma.employee.findMany.mock.calls[0][0];
    expect(where.employmentStatus).toEqual({ in: ['ACTIVE', 'ON_LEAVE'] });
  });

  it('holds work contact details and nothing from the personnel side', async () => {
    const { service, prisma } = build();
    await service.list(employee, NOW);

    const { select } = prisma.employee.findMany.mock.calls[0][0];
    for (const field of ['payType', 'hireDate', 'role', 'passwordHash', 'pinHash', 'badgeId']) {
      expect(select).not.toHaveProperty(field);
    }
    const [row] = await service.list(employee, NOW);
    expect(row).toMatchObject({ email: 'frankie@domihealthcare.com', phone: '201-555-0100' });
    expect(row).not.toHaveProperty('employmentStatus');
  });

  it('only counts a punch from the last few hours as "on now"', async () => {
    const { service, prisma } = build();
    await service.list(employee, NOW);

    const { select } = prisma.employee.findMany.mock.calls[0][0];
    expect(select.timeEntries.where).toEqual({
      clockOutAt: null,
      clockInAt: { gte: new Date(NOW.getTime() - ON_NOW_WINDOW_HOURS * 3_600_000) },
    });
  });

  it('tells a colleague somebody is in, and where, but not since when', async () => {
    const { service } = build();
    const [row] = await service.list(employee, NOW);
    expect(row.onNow).toEqual({
      location: { id: 'nb', name: 'North Bergen' },
      remote: false,
      jobRole: null,
    });
  });

  it('tells a manager since when', async () => {
    const { service } = build();
    const [row] = await service.list(manager, NOW);
    expect(row.onNow).toEqual({
      location: { id: 'nb', name: 'North Bergen' },
      remote: false,
      jobRole: null,
      since: clockedIn,
    });
  });

  it('says when somebody is on from home', async () => {
    const { service } = build([
      person({
        timeEntries: [
          {
            clockInAt: clockedIn,
            clockInVerification: 'REMOTE',
            location: { id: 'nb', name: 'North Bergen' },
          },
        ],
      }),
    ]);
    const [row] = await service.list(employee, NOW);
    expect(row.onNow).toEqual({
      location: { id: 'nb', name: 'North Bergen' },
      remote: true,
      jobRole: null,
    });
  });

  it('looks for a published work-from-home shift today that has not ended', async () => {
    const { service, prisma } = build();
    await service.list(employee, NOW);

    const { select } = prisma.employee.findMany.mock.calls[0][0];
    expect(select.shifts.where).toEqual({
      isRemote: true,
      status: 'PUBLISHED',
      // Midnight tonight in New Jersey (EDT), not the server's UTC midnight.
      startsAt: { lt: new Date('2026-09-23T04:00:00Z') },
      endsAt: { gt: NOW },
    });
    // When, and nothing else about the shift.
    expect(select.shifts.select).toEqual({ startsAt: true, endsAt: true });
  });

  it('says who is working from home today, before they clock in', async () => {
    const startsAt = new Date('2026-09-22T17:00:00Z');
    const endsAt = new Date('2026-09-22T21:00:00Z');
    const { service } = build([person({ timeEntries: [], shifts: [{ startsAt, endsAt }] })]);
    const [row] = await service.list(employee, NOW);
    expect(row.onNow).toBeNull();
    expect(row.homeToday).toEqual({ startsAt, endsAt });
    expect(row).not.toHaveProperty('shifts');
  });

  it('says nothing about home when there is no work-from-home shift today', async () => {
    const { service } = build();
    const [row] = await service.list(employee, NOW);
    expect(row.homeToday).toBeNull();
  });

  it('says nobody is on when there is no open punch', async () => {
    const { service } = build([person({ timeEntries: [] })]);
    const [row] = await service.list(employee, NOW);
    expect(row.onNow).toBeNull();
  });

  it('lists every job role in the practice’s order, and the primary location first', async () => {
    const { service } = build();
    const [row] = await service.list(employee, NOW);

    expect(row.jobRoles).toEqual([
      { id: 'fd', name: 'Front Desk', colour: 'blue', sortOrder: 10, isPrimary: false },
      { id: 'ma', name: 'Medical Assistant', colour: 'orange', sortOrder: 20, isPrimary: false },
    ]);
    expect(row.locations.map((l: { name: string }) => l.name)).toEqual([
      'North Bergen',
      'West New York',
    ]);
  });

  it('marks somebody on leave so nobody wonders why they do not answer', async () => {
    const { service } = build([person({ employmentStatus: 'ON_LEAVE', timeEntries: [] })]);
    const [row] = await service.list(employee, NOW);
    expect(row.onLeave).toBe(true);
  });

  it('lists their main job role first, whatever the practice’s order', async () => {
    const roles = person().jobRoles.map((row) => ({ ...row, isPrimary: row.jobRole.id === 'ma' }));
    const { service } = build([person({ jobRoles: roles })]);
    const [row] = await service.list(employee, NOW);
    expect(row.jobRoles.map((role: { id: string }) => role.id)).toEqual(['ma', 'fd']);
    expect(row.jobRoles[0].isPrimary).toBe(true);
  });

  it('says what somebody is working as: the job role of the shift they clocked in to', async () => {
    const admin = { id: 'adm', name: 'Administrative', sortOrder: 40, colour: 'violet' };
    const { service, prisma } = build([
      person({
        timeEntries: [
          {
            clockInAt: clockedIn,
            location: { id: 'nb', name: 'North Bergen' },
            shift: { jobRole: admin },
          },
        ],
      }),
    ]);
    const [row] = await service.list(employee, NOW);
    expect(row.onNow?.jobRole).toEqual(admin);
    // The role only - never the shift's times.
    const { select } = prisma.employee.findMany.mock.calls[0][0];
    expect(select.timeEntries.select.shift).toEqual({
      select: { jobRole: { select: { id: true, name: true, sortOrder: true, colour: true } } },
    });
  });

  describe('somebody who does not clock in', () => {
    const provider = person({ id: 'prov-1', clocksIn: false, timeEntries: [] });
    const shiftNow = {
      employeeId: 'prov-1',
      startsAt: new Date('2026-09-22T13:00:00Z'),
      isRemote: false,
      location: { id: 'wny', name: 'West New York' },
      jobRole: { id: 'prov', name: 'Provider', sortOrder: 30, colour: 'green' },
    };

    it('is in now at the office of the shift they are on', async () => {
      const { service, prisma } = build([provider], { shifts: [shiftNow] });
      const [row] = await service.list(employee, NOW);
      expect(row.onNow).toEqual({
        location: { id: 'wny', name: 'West New York' },
        remote: false,
        jobRole: shiftNow.jobRole,
        scheduled: true,
      });
      expect(row).not.toHaveProperty('clocksIn');
      const { where } = prisma.shift.findMany.mock.calls[0][0];
      expect(where).toEqual({
        employeeId: { in: ['prov-1'] },
        status: 'PUBLISHED',
        startsAt: { lte: NOW },
        endsAt: { gt: NOW },
      });
    });

    it('tells a manager since the shift started', async () => {
      const { service } = build([provider], { shifts: [shiftNow] });
      const [row] = await service.list(manager, NOW);
      expect(row.onNow?.since).toEqual(shiftNow.startsAt);
    });

    it('is working from home on a work-from-home shift', async () => {
      const { service } = build([provider], { shifts: [{ ...shiftNow, isRemote: true }] });
      const [row] = await service.list(employee, NOW);
      expect(row.onNow?.remote).toBe(true);
    });

    it('is not in with no shift running, or on approved time off', async () => {
      expect((await build([provider]).service.list(employee, NOW))[0].onNow).toBeNull();
      const { service } = build([provider], {
        shifts: [shiftNow],
        timeOff: [{ employeeId: 'prov-1' }],
      });
      expect((await service.list(employee, NOW))[0].onNow).toBeNull();
    });

    it('looks up nobody’s shifts when everybody clocks in', async () => {
      const { service, prisma } = build();
      await service.list(employee, NOW);
      expect(prisma.shift.findMany).not.toHaveBeenCalled();
    });
  });
});
