import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HandEntryReason, Role, TimeEntryStatus, VerificationMethod } from '@prisma/client';
import { TimeEntriesService } from './time-entries.service';

const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };
const admin = { id: 'adm-1', email: 'dominguez@domihealthcare.com', role: Role.ADMIN };

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

/// A day with no punch at all, entered by a manager — and then looked into by
/// somebody else, because every one is either a habit or a problem with the app.
function build(
  options: {
    assigned?: boolean;
    clash?: unknown;
    paidRun?: unknown;
    shift?: unknown;
    existing?: unknown;
    checked?: number;
  } = {},
) {
  const created: Record<string, unknown>[] = [];
  const tx = {
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(options.clash ?? null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'entry-1', ...data, payrollExports: [] };
      }),
    },
  };
  const prisma = {
    employee: {
      findUnique: jest.fn().mockResolvedValue({ id: 'emp-1', firstName: 'Frankie' }),
    },
    location: {
      findUnique: jest.fn().mockResolvedValue({ id: 'loc-1', name: 'North Bergen' }),
    },
    employeeLocation: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.assigned === false ? null : { employeeId: 'emp-1' }),
    },
    payrollExport: { findFirst: jest.fn().mockResolvedValue(options.paidRun ?? null) },
    shift: { findFirst: jest.fn().mockResolvedValue(options.shift ?? null) },
    timeEntry: {
      findUnique: jest.fn().mockResolvedValue(options.existing ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: options.checked ?? 1 }),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new TimeEntriesService(
    prisma as never,
    {} as never,
    new ConfigService({ PUNCH_GRACE_MINUTES: 5 }),
  );
  return { service, prisma, tx, created };
}

const request = (overrides: Record<string, unknown> = {}) => ({
  employeeId: 'emp-1',
  locationId: 'loc-1',
  clockInAt: hoursAgo(10).toISOString(),
  clockOutAt: hoursAgo(2).toISOString(),
  reason: HandEntryReason.APP_REFUSED,
  note: '  Said it could not find her location  ',
  ...overrides,
});

describe('adding hours by hand', () => {
  it('makes an ordinary completed entry, marked as entered by hand and why', async () => {
    const { service, created } = build();
    await service.addByHand(request(), manager);
    expect(created[0]).toMatchObject({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      status: TimeEntryStatus.COMPLETED,
      clockInVerification: VerificationMethod.MANUAL,
      clockOutVerification: VerificationMethod.MANUAL,
      enteredById: 'mgr-1',
      handEntryReason: HandEntryReason.APP_REFUSED,
      handEntryNote: 'Said it could not find her location',
    });
    expect(created[0].enteredByHandAt).toBeInstanceOf(Date);
    // Nobody was checked anywhere, so nothing about where is recorded.
    expect(created[0]).not.toHaveProperty('clockInLatitude');
    expect(created[0]).not.toHaveProperty('clockInIp');
    expect(created[0].method).not.toBe('KIOSK');
  });

  it('attaches the shift that day, so late and early mean what they always do', async () => {
    const { service, created } = build({
      shift: { id: 'sh-1', startsAt: hoursAgo(11), endsAt: hoursAgo(1) },
    });
    await service.addByHand(request(), manager);
    expect(created[0]).toMatchObject({ shiftId: 'sh-1', isLate: true, isEarlyDeparture: true });
  });

  it('is never for yourself', async () => {
    const { service, created } = build();
    await expect(service.addByHand(request({ employeeId: 'mgr-1' }), manager)).rejects.toThrow(
      ForbiddenException,
    );
    expect(created).toHaveLength(0);
  });

  it('refuses a finish before the start, a day too long, or hours not yet worked', async () => {
    const { service } = build();
    await expect(
      service.addByHand(
        request({ clockInAt: hoursAgo(2).toISOString(), clockOutAt: hoursAgo(3).toISOString() }),
        manager,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.addByHand(
        request({ clockInAt: hoursAgo(20).toISOString(), clockOutAt: hoursAgo(2).toISOString() }),
        manager,
      ),
    ).rejects.toThrow(/more than 16 hours/);
    await expect(
      service.addByHand(
        request({ clockInAt: hoursAgo(1).toISOString(), clockOutAt: hoursAgo(-2).toISOString() }),
        manager,
      ),
    ).rejects.toThrow(/once they have been worked/);
  });

  it('only at an office the person works at', async () => {
    const { service } = build({ assigned: false });
    await expect(service.addByHand(request(), manager)).rejects.toThrow(
      /does not work at North Bergen/,
    );
  });

  it('never over hours already there — that one is corrected instead', async () => {
    const { service, tx, created } = build({
      clash: { clockInAt: hoursAgo(9), clockOutAt: hoursAgo(5) },
    });
    await expect(service.addByHand(request(), manager)).rejects.toThrow(ConflictException);
    expect(created).toHaveLength(0);
    // An open punch counts as running until somebody closes it.
    const where = tx.timeEntry.findFirst.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ clockOutAt: null });
  });

  it('asks first when the day has already gone to payroll, then allows it', async () => {
    const paidRun = { id: 'run-1', generatedAt: new Date('2026-09-28T15:00:00Z') };
    const { service, created } = build({ paidRun });
    await expect(service.addByHand(request(), manager)).rejects.toMatchObject({
      response: { code: 'ALREADY_EXPORTED' },
    });
    expect(created).toHaveLength(0);

    await service.addByHand(request({ acknowledgeExported: true }), manager);
    expect(created).toHaveLength(1);
  });
});

describe('looking into hours entered by hand', () => {
  const handEntry = {
    enteredByHandAt: hoursAgo(1),
    enteredById: 'mgr-1',
    handEntryCheckedAt: null,
  };

  it('takes it off the list, with what was found', async () => {
    const { service, prisma } = build({ existing: handEntry });
    prisma.timeEntry.findUnique
      .mockResolvedValueOnce(handEntry)
      .mockResolvedValueOnce({ id: 'entry-1', payrollExports: [] });
    await service.checkHandEntry('entry-1', { finding: ' Location was off in Safari ' }, admin);
    expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'entry-1', handEntryCheckedAt: null },
      data: expect.objectContaining({
        handEntryCheckedById: 'adm-1',
        handEntryFinding: 'Location was off in Safari',
      }),
    });
  });

  it('is somebody other than the manager who entered them', async () => {
    const { service, prisma } = build({ existing: handEntry });
    await expect(service.checkHandEntry('entry-1', {}, manager)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled();
  });

  it('only for hours entered by hand', async () => {
    const { service } = build({
      existing: { enteredByHandAt: null, enteredById: null, handEntryCheckedAt: null },
    });
    await expect(service.checkHandEntry('entry-1', {}, admin)).rejects.toThrow(BadRequestException);
  });

  it('once — a second look does not overwrite the first', async () => {
    const { service } = build({ existing: handEntry, checked: 0 });
    await expect(service.checkHandEntry('entry-1', {}, admin)).rejects.toThrow(
      /already looked into/,
    );
  });
});
