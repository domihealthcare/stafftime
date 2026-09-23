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
    jobRoles: [
      { jobRole: { id: 'ma', name: 'Medical Assistant', sortOrder: 20 } },
      { jobRole: { id: 'fd', name: 'Front Desk', sortOrder: 10 } },
    ],
    locations: [
      { isPrimary: false, location: { id: 'wny', name: 'West New York' } },
      { isPrimary: true, location: { id: 'nb', name: 'North Bergen' } },
    ],
    timeEntries: [{ clockInAt: clockedIn, location: { id: 'nb', name: 'North Bergen' } }],
    ...over,
  };
}

function build(rows: unknown[] = [person()]) {
  const prisma = { employee: { findMany: jest.fn().mockResolvedValue(rows) } };
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
    expect(row.onNow).toEqual({ location: { id: 'nb', name: 'North Bergen' } });
  });

  it('tells a manager since when', async () => {
    const { service } = build();
    const [row] = await service.list(manager, NOW);
    expect(row.onNow).toEqual({ location: { id: 'nb', name: 'North Bergen' }, since: clockedIn });
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
      { id: 'fd', name: 'Front Desk' },
      { id: 'ma', name: 'Medical Assistant' },
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
});
