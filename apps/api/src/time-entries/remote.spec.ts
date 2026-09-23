import { ConfigService } from '@nestjs/config';
import { ClockMethod, Role, VerificationMethod } from '@prisma/client';
import { TimeEntriesService } from './time-entries.service';

const employee = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };

const REMOTE_SHIFT = {
  id: 'sh-home',
  locationId: 'loc-1',
  startsAt: new Date(Date.now() - 3_600_000),
  endsAt: new Date(Date.now() + 3_600_000),
};

/// Working from home: a published remote shift covering now lets somebody
/// clock in without the office check — and nothing about where they are is
/// kept.
function build(remoteShift: unknown) {
  const created: Record<string, unknown>[] = [];
  const tx = {
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'entry-1', ...data };
      }),
    },
  };
  const prisma = {
    employee: {
      findUnique: jest.fn().mockResolvedValue({ id: 'emp-1', employmentStatus: 'ACTIVE' }),
    },
    shift: { findFirst: jest.fn().mockResolvedValue(remoteShift) },
    location: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'loc-1',
        name: 'North Bergen',
        latitude: { toNumber: () => 40.804 },
        longitude: { toNumber: () => -74.012 },
        geofenceRadiusFeet: 500,
        allowedIps: [],
        isActive: true,
      }),
    },
    employeeLocation: { findUnique: jest.fn().mockResolvedValue({ employeeId: 'emp-1' }) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const verification = {
    verify: jest.fn().mockReturnValue({ allowed: false, reason: 'You are not at the office.' }),
  };
  const service = new TimeEntriesService(
    prisma as never,
    verification as never,
    new ConfigService({ PUNCH_GRACE_MINUTES: 5 }),
  );
  return { service, prisma, verification, created };
}

const punch = {
  locationId: 'loc-1',
  method: ClockMethod.MOBILE,
  latitude: 40.9,
  longitude: -74.2,
  accuracyMeters: 20,
};

describe('clocking in from home', () => {
  it('needs no office check during a work-from-home shift, and is marked Remote', async () => {
    const { service, verification, created } = build(REMOTE_SHIFT);
    await service.clockIn(punch, employee, '198.51.100.4');
    expect(verification.verify).not.toHaveBeenCalled();
    expect(created[0]).toMatchObject({
      clockInVerification: VerificationMethod.REMOTE,
      shiftId: 'sh-home',
      locationId: 'loc-1',
    });
  });

  it('records no location and no IP, even when the phone sends them', async () => {
    const { service, created } = build(REMOTE_SHIFT);
    await service.clockIn(punch, employee, '198.51.100.4');
    expect(created[0].clockInLatitude).toBeUndefined();
    expect(created[0].clockInLongitude).toBeUndefined();
    expect(created[0].clockInIp).toBeNull();
  });

  it('asks only for a published remote shift for this person, covering now', async () => {
    const { service, prisma } = build(REMOTE_SHIFT);
    await service.clockIn(punch, employee, undefined);
    const where = prisma.shift.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ employeeId: 'emp-1', isRemote: true, status: 'PUBLISHED' });
    expect(where.endsAt.gt).toBeInstanceOf(Date);
  });

  it('without one, it is an ordinary office punch — and the office check still applies', async () => {
    const { service, verification } = build(null);
    await expect(service.clockIn(punch, employee, undefined)).rejects.toThrow(/not at the office/);
    expect(verification.verify).toHaveBeenCalled();
  });

  it('never applies to the front-desk tablet', async () => {
    const { service, prisma } = build(REMOTE_SHIFT);
    await service
      .clockIn(
        { ...punch, method: ClockMethod.KIOSK, employeeId: 'emp-1' },
        { ...employee, role: Role.MANAGER },
        undefined,
      )
      .catch(() => undefined);
    expect(
      prisma.shift.findFirst.mock.calls.every(
        ([args]: [{ where: { isRemote?: boolean } }]) => !args.where.isRemote,
      ),
    ).toBe(true);
  });
});
