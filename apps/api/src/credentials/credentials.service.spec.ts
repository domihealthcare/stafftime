import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialKind, Role } from '@prisma/client';
import { CredentialsService, daysUntil } from './credentials.service';

const admin = { id: 'adm-1', email: 'admin@domihealthcare.com', role: Role.ADMIN };
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
    reference: '26NR12345600',
    issuedOn: day('2024-07-01'),
    expiresOn: inDays(30),
    notes: null,
    filename: null,
    contentType: null,
    sizeBytes: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    storageKey: null,
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
  const storage = {
    put: jest.fn(async (bytes: Buffer) => ({
      storageKey: '2026/09/3f6a5c1d2e4b8a7f9c0d1e2f3a4b5c6d',
      sizeBytes: bytes.byteLength,
      checksum: 'deadbeef',
    })),
    get: jest.fn(async () => Buffer.from('%PDF-1.7 scan')),
    delete: jest.fn(),
  };

  return {
    service: new CredentialsService(
      prisma as never,
      new ConfigService({ MAX_UPLOAD_MB: 10 }),
      storage as never,
    ),
    prisma,
    storage,
  };
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

  it('keeps the licence number from a manager, but not from the person it belongs to', async () => {
    // A manager needs to know the credential is current, not to be handed its
    // identifier.
    const forManager = await build().service.findAll({}, manager);
    expect(forManager[0].reference).toBeNull();

    const forOwner = await build().service.findAll({}, employee);
    expect(forOwner[0].reference).toBe('26NR12345600');

    const forAdmin = await build().service.findAll({}, admin);
    expect(forAdmin[0].reference).toBe('26NR12345600');
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

describe('the scan', () => {
  const file = {
    originalname: 'licence.pdf',
    mimetype: 'application/pdf',
    size: 20,
    buffer: Buffer.from('%PDF-1.7 the scan'),
  };

  it('is refused to a manager — a licence document carries more than a date', async () => {
    const { service, storage } = build({ one: { ...row(), employeeId: 'emp-1' } });
    await expect(service.downloadScan('cred-1', manager)).rejects.toThrow(ForbiddenException);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it('is available to an admin and to the person it belongs to', async () => {
    const withScan = {
      ...row(),
      employeeId: 'emp-1',
      storageKey: '2026/09/3f6a5c1d2e4b8a7f9c0d1e2f3a4b5c6d',
      filename: 'licence.pdf',
      contentType: 'application/pdf',
    };

    await expect(build({ one: withScan }).service.downloadScan('cred-1', admin)).resolves
      .toMatchObject({ filename: 'licence.pdf' });
    await expect(build({ one: withScan }).service.downloadScan('cred-1', employee)).resolves
      .toMatchObject({ filename: 'licence.pdf' });
    await expect(
      build({ one: withScan }).service.downloadScan('cred-1', other),
    ).rejects.toThrow(ForbiddenException);
  });

  it('applies the same upload rules as every other document', async () => {
    const { service } = build({ one: { ...row(), employeeId: 'emp-1' } });
    await expect(
      service.attach(
        'cred-1',
        { ...file, mimetype: 'application/pdf', buffer: Buffer.from('<html>') },
        admin,
      ),
    ).rejects.toThrow(/not really a PDF/);
  });

  it('clears up the scan it replaced', async () => {
    const { service, storage } = build({
      one: { ...row(), employeeId: 'emp-1', storageKey: '2026/08/oldkey' },
    });
    await service.attach('cred-1', file, admin);

    expect(storage.put).toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith('2026/08/oldkey');
  });
});
