import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { KioskPunchService } from './kiosk-punch.service';
import { PinService } from './pin.service';
import type { PairedDevice } from './kiosk.service';

describe('KioskPunchService', () => {
  const config = new ConfigService({ MAX_PIN_ATTEMPTS: 3, PIN_LOCKOUT_MINUTES: 10 });
  const pins = new PinService();

  const device: PairedDevice = {
    deviceId: 'dev-1',
    deviceName: 'Front desk',
    locationId: 'loc-nb',
    locationName: 'North Bergen',
  };

  let pinHash: string;
  beforeAll(async () => {
    pinHash = await pins.hash('4817');
  });

  function build(
    employee: Record<string, unknown> | null,
    options: { openEntry?: unknown } = {},
  ) {
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(employee),
        update: jest.fn().mockResolvedValue({}),
      },
      timeEntry: { findFirst: jest.fn().mockResolvedValue(options.openEntry ?? null) },
    };
    const timeEntries = {
      clockIn: jest.fn().mockResolvedValue({
        clockInAt: new Date('2026-09-21T13:04:00Z'),
        isLate: false,
      }),
      clockOut: jest.fn().mockResolvedValue({
        clockInAt: new Date('2026-09-21T13:00:00Z'),
        clockOutAt: new Date('2026-09-21T21:30:00Z'),
        isLate: false,
      }),
    };
    const service = new KioskPunchService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      pins,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      timeEntries as any,
      config,
    );
    return { service, prisma, timeEntries };
  }

  const active = () => ({
    id: 'emp-1',
    firstName: 'Frankie',
    preferredName: null,
    lastName: 'Front-Desk',
    pinHash,
    employmentStatus: 'ACTIVE',
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    locations: [{ locationId: 'loc-nb' }],
  });

  describe('a correct PIN', () => {
    it('clocks in when there is no open entry', async () => {
      const { service, timeEntries } = build(active());
      const result = await service.punch(device, 'emp-1', '4817');

      expect(result.action).toBe('CLOCKED_IN');
      expect(result.employeeName).toBe('Frankie');
      expect(result.locationName).toBe('North Bergen');
      expect(timeEntries.clockIn).toHaveBeenCalled();
    });

    it('punches with the device location and KIOSK method, never the caller position', async () => {
      const { service, timeEntries } = build(active());
      await service.punch(device, 'emp-1', '4817');

      const [dto] = timeEntries.clockIn.mock.calls[0];
      expect(dto).toEqual({ locationId: 'loc-nb', method: 'KIOSK', employeeId: 'emp-1' });
    });

    it('clocks out when an entry is already open, and reports the time worked', async () => {
      const { service, timeEntries } = build(active(), {
        openEntry: { id: 'te-1', clockInAt: new Date('2026-09-21T13:00:00Z') },
      });
      const result = await service.punch(device, 'emp-1', '4817');

      expect(result.action).toBe('CLOCKED_OUT');
      expect(result.workedMinutes).toBe(510); // 8h30m
      expect(timeEntries.clockOut).toHaveBeenCalled();
    });

    it('prefers a preferred name on the confirmation screen', async () => {
      const { service } = build({ ...active(), preferredName: 'Frank' });
      const result = await service.punch(device, 'emp-1', '4817');
      expect(result.employeeName).toBe('Frank');
    });

    it('clears the failure counter', async () => {
      const { service, prisma } = build({ ...active(), pinFailedAttempts: 2 });
      await service.punch(device, 'emp-1', '4817');
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { pinFailedAttempts: 0, pinLockedUntil: null },
        }),
      );
    });
  });

  describe('a wrong PIN', () => {
    it('is refused', async () => {
      const { service } = build(active());
      await expect(service.punch(device, 'emp-1', '9999')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('never punches the clock', async () => {
      const { service, timeEntries } = build(active());
      await service.punch(device, 'emp-1', '9999').catch(() => undefined);
      expect(timeEntries.clockIn).not.toHaveBeenCalled();
      expect(timeEntries.clockOut).not.toHaveBeenCalled();
    });

    it('counts the failure', async () => {
      const { service, prisma } = build(active());
      await service.punch(device, 'emp-1', '9999').catch(() => undefined);
      expect(prisma.employee.update.mock.calls[0][0].data.pinFailedAttempts).toBe(1);
    });

    it('locks the keypad at the attempt limit', async () => {
      const { service, prisma } = build({ ...active(), pinFailedAttempts: 2 });
      await service.punch(device, 'emp-1', '9999').catch(() => undefined);
      expect(prisma.employee.update.mock.calls[0][0].data.pinLockedUntil).toBeInstanceOf(Date);
    });

    it('keeps refusing while locked, even once the PIN is right', async () => {
      const { service, timeEntries } = build({
        ...active(),
        pinLockedUntil: new Date(Date.now() + 600_000),
      });
      await expect(service.punch(device, 'emp-1', '4817')).rejects.toThrow(
        /Too many incorrect PINs/,
      );
      expect(timeEntries.clockIn).not.toHaveBeenCalled();
    });

    it('works again once the lockout lapses', async () => {
      const { service } = build({
        ...active(),
        pinLockedUntil: new Date(Date.now() - 1000),
      });
      await expect(service.punch(device, 'emp-1', '4817')).resolves.toMatchObject({
        action: 'CLOCKED_IN',
      });
    });
  });

  describe('what the keypad refuses to reveal', () => {
    it('gives the same message for an unknown employee as for a wrong PIN', async () => {
      const unknown = build(null);
      const wrong = build(active());

      const unknownError = await unknown.service
        .punch(device, 'emp-x', '4817')
        .catch((e: Error) => e.message);
      const wrongError = await wrong.service
        .punch(device, 'emp-1', '9999')
        .catch((e: Error) => e.message);

      expect(unknownError).toBe(wrongError);
    });

    it('does the same hashing work for an unknown employee, so timing does not leak', async () => {
      const { service } = build(null);
      const started = Date.now();
      await service.punch(device, 'emp-x', '4817').catch(() => undefined);
      expect(Date.now() - started).toBeGreaterThan(5);
    });

    it('treats an employee with no PIN set as an ordinary failure', async () => {
      const { service } = build({ ...active(), pinHash: null });
      await expect(service.punch(device, 'emp-1', '4817')).rejects.toThrow(
        /not recognised/,
      );
    });

    it('checks employment status only after the PIN is proven', async () => {
      const { service } = build({ ...active(), employmentStatus: 'TERMINATED' });

      // Right PIN: told the account is inactive.
      await expect(service.punch(device, 'emp-1', '4817')).rejects.toThrow(ForbiddenException);
      // Wrong PIN: indistinguishable from any other failure.
      await expect(service.punch(device, 'emp-1', '9999')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('location binding', () => {
    it('refuses someone not assigned to this kiosk location', async () => {
      const { service, timeEntries } = build({
        ...active(),
        locations: [{ locationId: 'loc-wny' }],
      });
      await expect(service.punch(device, 'emp-1', '4817')).rejects.toThrow(
        /not assigned to North Bergen/,
      );
      expect(timeEntries.clockIn).not.toHaveBeenCalled();
    });

    it('allows someone assigned to several locations including this one', async () => {
      const { service } = build({
        ...active(),
        locations: [{ locationId: 'loc-wny' }, { locationId: 'loc-nb' }],
      });
      await expect(service.punch(device, 'emp-1', '4817')).resolves.toMatchObject({
        action: 'CLOCKED_IN',
      });
    });
  });

  describe('setPin / clearPin', () => {
    it('stores a hash, never the PIN', async () => {
      const { service, prisma } = build(active());
      await service.setPin('emp-1', '4817');

      const data = prisma.employee.update.mock.calls[0][0].data;
      expect(data.pinHash).toMatch(/^\$argon2id\$/);
      expect(data.pinHash).not.toContain('4817');
      expect(data.pinFailedAttempts).toBe(0);
    });

    it('clearing a PIN removes it and the lockout together', async () => {
      const { service, prisma } = build(active());
      await service.clearPin('emp-1');

      expect(prisma.employee.update.mock.calls[0][0].data).toEqual({
        pinHash: null,
        pinUpdatedAt: null,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      });
    });
  });
});
