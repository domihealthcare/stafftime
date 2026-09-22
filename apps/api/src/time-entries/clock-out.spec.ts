import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, VerificationMethod } from '@prisma/client';
import { TimeEntriesService } from './time-entries.service';

const employee = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };

const OPEN_ENTRY = {
  id: 'entry-1',
  employeeId: 'emp-1',
  locationId: 'loc-1',
  method: 'WEB',
  clockInAt: new Date(),
  clockOutAt: null,
  shift: null,
};

/**
 * The compare-and-set on clock-out.
 *
 * The race itself is proved against real Postgres in `tests/browser/race.mjs`,
 * which is the only place it can be. What is checked here is the shape of the
 * guard: that the `clockOutAt: null` condition is actually in the query, and
 * that losing is a plain refusal rather than a silent no-op returning a punch
 * that says it is still open.
 */
function build(updatedCount: number) {
  const prisma = {
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(OPEN_ENTRY),
      updateMany: jest.fn().mockResolvedValue({ count: updatedCount }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        ...OPEN_ENTRY,
        clockOutAt: new Date(),
        payrollExports: [],
      }),
    },
    location: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'loc-1',
        name: 'North Bergen',
        // Prisma hands these back as Decimal, and the service converts them.
        latitude: { toNumber: () => 40.804 },
        longitude: { toNumber: () => -74.012 },
        geofenceRadiusFeet: 492,
        allowedIps: [],
      }),
    },
    employeeLocation: { findUnique: jest.fn().mockResolvedValue({ employeeId: 'emp-1' }) },
  };

  const verification = {
    verify: jest.fn().mockReturnValue({
      allowed: true,
      verificationMethod: VerificationMethod.GEOFENCE,
    }),
  };

  return {
    service: new TimeEntriesService(
      prisma as never,
      verification as never,
      new ConfigService({ PUNCH_GRACE_MINUTES: 5 }),
    ),
    prisma,
  };
}

describe('clocking out', () => {
  it('will only close a punch that is still open', async () => {
    const { service, prisma } = build(1);
    await service.clockOut({}, employee, '203.0.113.7');

    const where = prisma.timeEntry.updateMany.mock.calls[0][0].where;
    expect(where).toEqual({ id: 'entry-1', clockOutAt: null });
  });

  it('refuses when something else closed it first', async () => {
    // updateMany matching nothing means the entry was closed between the read
    // and the write. Returning the row anyway would tell the second tapper
    // their punch landed when it did not.
    const { service } = build(0);

    await expect(service.clockOut({}, employee, '203.0.113.7')).rejects.toThrow(
      ConflictException,
    );
  });

  it('gives the loser the same answer a late second tap gets', async () => {
    // Not a different message because it arrived a millisecond earlier.
    const { service } = build(0);
    await expect(service.clockOut({}, employee, '203.0.113.7')).rejects.toThrow(
      /no open time entry/i,
    );
  });
});
