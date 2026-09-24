import { KioskService, formatPairingCode, hashSecret, normalisePairingCode } from './kiosk.service';
import { createHash } from 'node:crypto';

describe('pairing code helpers', () => {
  it('hashes with SHA-256', () => {
    expect(hashSecret('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });

  it('groups a code for reading aloud', () => {
    expect(formatPairingCode('ABCDEFGHJK')).toBe('ABCD-EFGH-JK');
  });

  it('normalises what someone types on a tablet', () => {
    expect(normalisePairingCode('abcd-efgh-jk')).toBe('ABCDEFGHJK');
    expect(normalisePairingCode(' ABCD EFGH JK ')).toBe('ABCDEFGHJK');
  });
});

describe('KioskService', () => {
  const activeLocation = {
    id: 'loc-1',
    name: 'North Bergen',
    kioskEnabled: true,
    isActive: true,
  };

  function build(
    overrides: {
      location?: unknown;
      device?: unknown;
    } = {},
  ) {
    const prisma = {
      location: { findUnique: jest.fn().mockResolvedValue(overrides.location ?? activeLocation) },
      kioskDevice: {
        create: jest.fn().mockResolvedValue({
          id: 'dev-1',
          name: 'Front desk',
          pairingExpiresAt: new Date(Date.now() + 900_000),
        }),
        findUnique: jest.fn().mockResolvedValue(overrides.device ?? null),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      employee: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new KioskService(prisma as any), prisma };
  }

  describe('createDevice', () => {
    it('returns a readable pairing code and stores only its hash', async () => {
      const { service, prisma } = build();
      const result = await service.createDevice({
        name: 'Front desk',
        locationId: 'loc-1',
        createdById: 'emp-1',
      });

      expect(result.pairingCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/);
      const stored = prisma.kioskDevice.create.mock.calls[0][0].data.pairingCodeHash;
      expect(stored).toBe(hashSecret(result.pairingCode.replace(/-/g, '')));
    });

    it('avoids characters that are ambiguous when read aloud', async () => {
      const { service } = build();
      for (let i = 0; i < 20; i += 1) {
        const { pairingCode } = await service.createDevice({
          name: 'Front desk',
          locationId: 'loc-1',
          createdById: 'emp-1',
        });
        expect(pairingCode).not.toMatch(/[OI015SZ]/);
      }
    });

    it('refuses a location with kiosk mode turned off', async () => {
      const { service } = build({ location: { ...activeLocation, kioskEnabled: false } });
      await expect(
        service.createDevice({ name: 'x', locationId: 'loc-1', createdById: 'emp-1' }),
      ).rejects.toThrow(/Kiosk mode is turned off/);
    });

    it('refuses an inactive location', async () => {
      const { service } = build({ location: { ...activeLocation, isActive: false } });
      await expect(
        service.createDevice({ name: 'x', locationId: 'loc-1', createdById: 'emp-1' }),
      ).rejects.toThrow(/not an active location/);
    });
  });

  describe('pair', () => {
    const pairable = {
      id: 'dev-1',
      name: 'Front desk',
      revokedAt: null,
      pairingExpiresAt: new Date(Date.now() + 600_000),
      location: activeLocation,
    };

    it('issues a device token and stores only its hash', async () => {
      const { service, prisma } = build({ device: pairable });
      const { token, device } = await service.pair('ABCD-EFGH-JK');

      expect(token).toHaveLength(43);
      const data = prisma.kioskDevice.update.mock.calls[0][0].data;
      expect(data.tokenHash).toBe(hashSecret(token));
      expect(device.locationName).toBe('North Bergen');
    });

    it('consumes the code, so it cannot be replayed on a second device', async () => {
      const { service, prisma } = build({ device: pairable });
      await service.pair('ABCD-EFGH-JK');
      expect(prisma.kioskDevice.update.mock.calls[0][0].data.pairingCodeHash).toBeNull();
    });

    it('accepts a code typed without hyphens or in lower case', async () => {
      const { service, prisma } = build({ device: pairable });
      await service.pair('abcdefghjk');
      expect(prisma.kioskDevice.findUnique.mock.calls[0][0].where.pairingCodeHash).toBe(
        hashSecret('ABCDEFGHJK'),
      );
    });

    it('rejects an unknown code', async () => {
      const { service } = build({ device: null });
      await expect(service.pair('ABCD-EFGH-JK')).rejects.toThrow(/not valid/);
    });

    it('rejects an expired code', async () => {
      const { service } = build({
        device: { ...pairable, pairingExpiresAt: new Date(Date.now() - 1000) },
      });
      await expect(service.pair('ABCD-EFGH-JK')).rejects.toThrow(/expired/);
    });

    it('rejects a code for a revoked device', async () => {
      const { service } = build({ device: { ...pairable, revokedAt: new Date() } });
      await expect(service.pair('ABCD-EFGH-JK')).rejects.toThrow(/not valid/);
    });

    it('rejects pairing to a location that has since disabled kiosks', async () => {
      const { service } = build({
        device: { ...pairable, location: { ...activeLocation, kioskEnabled: false } },
      });
      await expect(service.pair('ABCD-EFGH-JK')).rejects.toThrow(/not available/);
    });
  });

  describe('resolveDevice', () => {
    const live = {
      id: 'dev-1',
      name: 'Front desk',
      revokedAt: null,
      lastSeenAt: new Date(),
      location: activeLocation,
    };

    it('resolves a live device to its bound location', async () => {
      const { service } = build({ device: live });
      await expect(service.resolveDevice('tok')).resolves.toMatchObject({
        locationId: 'loc-1',
        locationName: 'North Bergen',
      });
    });

    it('returns null for an unknown token', async () => {
      const { service } = build({ device: null });
      await expect(service.resolveDevice('tok')).resolves.toBeNull();
    });

    it('returns null once the device is revoked', async () => {
      const { service } = build({ device: { ...live, revokedAt: new Date() } });
      await expect(service.resolveDevice('tok')).resolves.toBeNull();
    });

    it('stops working when the location turns kiosk mode off', async () => {
      const { service } = build({
        device: { ...live, location: { ...activeLocation, kioskEnabled: false } },
      });
      await expect(service.resolveDevice('tok')).resolves.toBeNull();
    });

    it('stops working when the location is deactivated', async () => {
      const { service } = build({
        device: { ...live, location: { ...activeLocation, isActive: false } },
      });
      await expect(service.resolveDevice('tok')).resolves.toBeNull();
    });

    it('does not write on every request', async () => {
      const { service, prisma } = build({ device: live });
      await service.resolveDevice('tok');
      expect(prisma.kioskDevice.update).not.toHaveBeenCalled();
    });
  });

  describe('listEligibleEmployees', () => {
    it('asks only for active staff at this location who have a PIN', async () => {
      const { service, prisma } = build();
      await service.listEligibleEmployees('loc-1');

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      expect(where.employmentStatus).toBe('ACTIVE');
      expect(where.pinHash).toEqual({ not: null });
      expect(where.locations).toEqual({ some: { locationId: 'loc-1' } });
    });
  });
});
