import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CredentialKind, Role } from '@prisma/client';
import { CredentialsService, daysUntil } from './credentials.service';

const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };
const employee = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };
const other = { id: 'emp-2', email: 'mo@domihealthcare.com', role: Role.EMPLOYEE };

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

/// A whole day, the way `@db.Date` stores one — UTC midnight, not "now plus N
/// days", which carries a time of day and rounds unpredictably.
const inDays = (n: number) => {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  return new Date(today.getTime() + n * 86_400_000);
};

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'cred-1',
    kind: CredentialKind.LICENSE,
    name: 'NJ Registered Nurse licence',
    issuer: 'NJ Board of Nursing',
    issuedOn: day('2024-07-01'),
    expiresOn: inDays(30),
    notes: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    employee: {
      id: 'emp-1',
      firstName: 'Frankie',
      lastName: 'Front-Desk',
      preferredName: null,
      employmentStatus: 'ACTIVE',
    },
    recordedBy: null,
    ...over,
  };
}

function build(options: { rows?: unknown[]; one?: unknown } = {}) {
  const prisma = {
    employeeCredential: {
      findMany: jest.fn().mockResolvedValue(options.rows ?? [row()]),
      findUnique: jest.fn().mockResolvedValue('one' in options ? options.one : row()),
      create: jest.fn(async ({ data }) => row(data as Record<string, unknown>)),
      update: jest.fn(async ({ data }) => row(data as Record<string, unknown>)),
      delete: jest.fn(async () => ({ id: 'cred-1' })),
    },
    employee: { findUnique: jest.fn().mockResolvedValue({ id: 'emp-1' }) },
  };
  return { service: new CredentialsService(prisma as never), prisma };
}

describe('daysUntil', () => {
  it('counts a future expiry as positive', () => {
    expect(daysUntil(inDays(30))).toBe(30);
  });

  it('is zero on the day it runs out, which still counts as valid', () => {
    // A licence is good until the end of the day it expires.
    expect(daysUntil(inDays(0))).toBe(0);
  });

  it('goes negative once it has lapsed', () => {
    expect(daysUntil(inDays(-5))).toBe(-5);
  });
});

describe('CredentialsService', () => {
  it('counts the days and says plainly whether it has lapsed', async () => {
    const { service } = build({ rows: [row({ expiresOn: inDays(-3) }), row()] });
    const [lapsed, current] = await service.findAll({}, manager);

    expect(lapsed).toMatchObject({ expired: true, daysUntilExpiry: -3 });
    expect(current).toMatchObject({ expired: false, daysUntilExpiry: 30 });
  });

  it('shows an employee only their own, whatever they ask for', async () => {
    const { service, prisma } = build();
    await service.findAll({ employeeId: 'emp-2' }, employee);

    expect(prisma.employeeCredential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ employeeId: 'emp-1' }) }),
    );
  });

  it('includes what has already lapsed in "expiring within N days"', async () => {
    // The one that ran out last month is more urgent than the one running out
    // next month, not less.
    const { service, prisma } = build();
    await service.findAll({ withinDays: 30 }, manager);

    const where = prisma.employeeCredential.findMany.mock.calls[0][0].where;
    expect(where.expiresOn.lte).toBeInstanceOf(Date);
    expect(where.expiresOn.gte).toBeUndefined();
  });

  it('never asks the database for a licence number or a scan', async () => {
    // The point of this screen is the *date*. A licence number, a scan, a
    // signature — none of it belongs in a timekeeping app, so the query that
    // feeds every credential response must not reach for them. If somebody adds
    // a column back, this is what should stop them.
    const { service, prisma } = build();
    await service.findAll({}, manager);

    const select = prisma.employeeCredential.findMany.mock.calls[0][0].select;
    for (const field of [
      'reference',
      'storageKey',
      'filename',
      'contentType',
      'sizeBytes',
      'checksum',
    ]) {
      expect(select).not.toHaveProperty(field);
    }
  });

  it("refuses an employee sight of somebody else's, even by id", async () => {
    // findAll narrows by actor; findOne takes an id, so it has to check too.
    const { service } = build({ one: row() });
    await expect(service.findOne('cred-1', other)).rejects.toThrow(ForbiddenException);
    await expect(service.findOne('cred-1', employee)).resolves.toMatchObject({ id: 'cred-1' });
    await expect(service.findOne('cred-1', manager)).resolves.toMatchObject({ id: 'cred-1' });
  });

  it('refuses an expiry before the issue date', async () => {
    const { service } = build();
    await expect(
      service.create(
        {
          employeeId: 'emp-1',
          kind: CredentialKind.LICENSE,
          name: 'A licence',
          issuedOn: '2026-07-01',
          expiresOn: '2025-07-01',
        },
        manager,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an employee who does not exist', async () => {
    const { service, prisma } = build();
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        { employeeId: 'nope', kind: CredentialKind.LICENSE, name: 'X', expiresOn: '2027-01-01' },
        manager,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('archives rather than deletes, so "we used to hold this" has an answer', async () => {
    const { service, prisma } = build();
    await service.archive('cred-1', manager);

    expect(prisma.employeeCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt: expect.any(Date) } }),
    );
    expect(prisma.employeeCredential.delete).not.toHaveBeenCalled();
  });
});
