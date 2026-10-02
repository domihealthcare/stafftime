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
    employeeLocation: {
      findUnique: jest.fn().mockResolvedValue({ employeeId: 'emp-1' }),
      // Assigned to this office only, so there is no other one to try.
      findMany: jest.fn().mockResolvedValue([]),
    },
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
    // Looked for alongside the shift they are on wherever it is; this is the
    // one that asks for a work-from-home shift.
    const [[{ where }]] = prisma.shift.findFirst.mock.calls.filter(
      ([args]: [{ where: { isRemote?: boolean } }]) => args.where.isRemote,
    );
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

/// Choosing where on the phone (October 2026, Dominguez): any of your offices,
/// or from home with no work-from-home shift, after a warning on the page.
/// Somewhere other than the shift is allowed, and flagged with the reason.
function buildChoice(options: {
  /// The shift they are on, wherever it is.
  scheduled: { id: string; locationId: string; isRemote: boolean } | null;
  allowedAt?: string[];
}) {
  const { service, prisma, verification, created } = build(null);
  const shift = options.scheduled && {
    ...options.scheduled,
    startsAt: new Date(Date.now() - 600_000),
    endsAt: new Date(Date.now() + 3_600_000),
  };
  prisma.shift.findFirst.mockImplementation(
    async ({ where }: { where: { isRemote?: boolean; locationId?: string } }) => {
      if (where.isRemote) return shift?.isRemote ? shift : null;
      if (where.locationId) return shift && shift.locationId === where.locationId ? shift : null;
      return shift;
    },
  );
  prisma.location.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    name: where.id === 'loc-2' ? 'West New York' : 'North Bergen',
    latitude: { toNumber: () => 40.8 },
    longitude: { toNumber: () => -74.0 },
    geofenceRadiusFeet: 500,
    allowedIps: [],
    isActive: true,
  }));
  prisma.employeeLocation.findMany.mockResolvedValue([
    { locationId: 'loc-1', isPrimary: true },
    { locationId: 'loc-2', isPrimary: false },
  ]);
  verification.verify.mockImplementation(({ location }: { location: { id: string } }) =>
    (options.allowedAt ?? []).includes(location.id)
      ? { allowed: true, verificationMethod: VerificationMethod.GEOFENCE, distanceMeters: 10 }
      : { allowed: false, reason: 'You are not at the office.' },
  );
  return { service, verification, created };
}

describe('choosing where to clock in', () => {
  it('from home with no shift at all: allowed, no office check, flagged with the reason', async () => {
    const { service, verification, created } = buildChoice({ scheduled: null });
    await service.clockIn(
      { ...punch, workFromHome: true, otherPlaceReason: '  Approved by Angelica  ' },
      employee,
      '198.51.100.4',
    );
    expect(verification.verify).not.toHaveBeenCalled();
    expect(created[0]).toMatchObject({
      clockInVerification: VerificationMethod.REMOTE,
      locationId: 'loc-1',
      isOtherPlace: true,
      otherPlaceReason: 'Approved by Angelica',
      clockInIp: null,
    });
    expect(created[0].clockInLatitude).toBeUndefined();
  });

  it('from home on a day due in at an office: flagged, and attached to that shift', async () => {
    const { service, created } = buildChoice({
      scheduled: { id: 'sh-nb', locationId: 'loc-1', isRemote: false },
    });
    await service.clockIn({ ...punch, workFromHome: true }, employee, undefined);
    expect(created[0]).toMatchObject({
      clockInVerification: VerificationMethod.REMOTE,
      shiftId: 'sh-nb',
      isOtherPlace: true,
      otherPlaceReason: null,
    });
  });

  it('from home during a work-from-home shift: as scheduled, and a reason is not kept', async () => {
    const { service, created } = buildChoice({
      scheduled: { id: 'sh-home', locationId: 'loc-1', isRemote: true },
    });
    await service.clockIn(
      { ...punch, workFromHome: true, otherPlaceReason: 'no reason needed' },
      employee,
      undefined,
    );
    expect(created[0]).toMatchObject({ isOtherPlace: false, otherPlaceReason: null });
  });

  it('at the office during a work-from-home shift: checked like any office punch, and flagged', async () => {
    const { service, verification, created } = buildChoice({
      scheduled: { id: 'sh-home', locationId: 'loc-1', isRemote: true },
      allowedAt: ['loc-1'],
    });
    await service.clockIn({ ...punch, workFromHome: false }, employee, undefined);
    expect(verification.verify).toHaveBeenCalled();
    expect(created[0]).toMatchObject({
      clockInVerification: VerificationMethod.GEOFENCE,
      isOtherPlace: true,
    });
  });

  it('at the other office from the shift: flagged; at its own office or with no shift: not', async () => {
    const elsewhere = buildChoice({
      scheduled: { id: 'sh-nb', locationId: 'loc-1', isRemote: false },
      allowedAt: ['loc-2'],
    });
    await elsewhere.service.clockIn(
      { ...punch, locationId: 'loc-2', workFromHome: false, otherPlaceReason: 'Covering WNY' },
      employee,
      undefined,
    );
    expect(elsewhere.created[0]).toMatchObject({
      locationId: 'loc-2',
      isOtherPlace: true,
      otherPlaceReason: 'Covering WNY',
    });

    const asPlanned = buildChoice({
      scheduled: { id: 'sh-nb', locationId: 'loc-1', isRemote: false },
      allowedAt: ['loc-1'],
    });
    await asPlanned.service.clockIn({ ...punch, workFromHome: false }, employee, undefined);
    expect(asPlanned.created[0]).toMatchObject({ isOtherPlace: false, shiftId: 'sh-nb' });

    const noShift = buildChoice({ scheduled: null, allowedAt: ['loc-2'] });
    await noShift.service.clockIn(
      { ...punch, locationId: 'loc-2', workFromHome: false },
      employee,
      undefined,
    );
    expect(noShift.created[0]).toMatchObject({ isOtherPlace: false });
  });

  it('an office punch still needs to be at the office', async () => {
    const { service } = buildChoice({ scheduled: null, allowedAt: [] });
    await expect(
      service.clockIn({ ...punch, workFromHome: false }, employee, undefined),
    ).rejects.toThrow(/not at the office/);
  });
});
