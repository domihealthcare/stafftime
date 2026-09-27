import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClockMethod, Role, VerificationMethod } from '@prisma/client';
import { TimeEntriesService } from './time-entries.service';

const employee = { id: 'emp-1', email: 'maria@domihealthcare.com', role: Role.EMPLOYEE };

const office = (id: string, name: string) => ({
  id,
  name,
  latitude: { toNumber: () => 40.8 },
  longitude: { toNumber: () => -74.0 },
  geofenceRadiusFeet: 500,
  allowedIps: [],
  isActive: true,
});

/**
 * Everybody works at both offices. The phone picks one before it knows where
 * the person is, so standing at the other one must clock them in there — not
 * be refused as "outside North Bergen".
 */
function build(passesAt: string | null, otherOffices = ['wny']) {
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
    shift: { findFirst: jest.fn().mockResolvedValue(null) },
    location: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        office(where.id, where.id === 'nb' ? 'North Bergen' : 'West New York'),
      ),
    },
    employeeLocation: {
      findUnique: jest.fn().mockResolvedValue({ employeeId: 'emp-1' }),
      findMany: jest.fn().mockResolvedValue(otherOffices.map((locationId) => ({ locationId }))),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const verification = {
    verify: jest.fn(({ location }: { location: { id: string; name: string } }) =>
      location.id === passesAt
        ? { allowed: true, verificationMethod: VerificationMethod.GEOFENCE }
        : { allowed: false, reason: `You are outside ${location.name}.` },
    ),
  };
  const service = new TimeEntriesService(
    prisma as never,
    verification as never,
    new ConfigService({ PUNCH_GRACE_MINUTES: 5 }),
  );
  return { service, prisma, created };
}

const punch = {
  locationId: 'nb',
  method: ClockMethod.MOBILE,
  latitude: 40.79,
  longitude: -74.02,
  accuracyMeters: 20,
};

describe('clocking in at whichever office you are at', () => {
  it('uses the other office when that is where you are standing', async () => {
    const { service, created } = build('wny');
    await service.clockIn(punch, employee, undefined);
    expect(created[0]).toMatchObject({ locationId: 'wny' });
  });

  it('keeps the office asked for when you are there', async () => {
    const { service, created, prisma } = build('nb');
    await service.clockIn(punch, employee, undefined);
    expect(created[0]).toMatchObject({ locationId: 'nb' });
    expect(prisma.employeeLocation.findMany).not.toHaveBeenCalled();
  });

  it('still refuses, with the first office’s reason, when you are at neither', async () => {
    const { service } = build(null);
    await expect(service.clockIn(punch, employee, undefined)).rejects.toThrow(
      new ForbiddenException('You are outside nb.'.replace('nb', 'North Bergen')),
    );
  });

  it('only tries offices you are assigned to', async () => {
    const { service, prisma } = build(null);
    await service.clockIn(punch, employee, undefined).catch(() => undefined);
    expect(prisma.employeeLocation.findMany.mock.calls[0][0].where).toMatchObject({
      employeeId: 'emp-1',
      locationId: { not: 'nb' },
    });
  });
});
