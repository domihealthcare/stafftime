import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/// Unambiguous when read aloud or typed on a tablet: no O/0, I/1, S/5, Z/2.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY346789';
const CODE_LENGTH = 10;
const PAIRING_TTL_MINUTES = 15;
const DEVICE_TOKEN_BYTES = 32;

export interface PairedDevice {
  deviceId: string;
  deviceName: string;
  locationId: string;
  locationName: string;
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/// Grouped for readability on screen: "ABCD-EFGH-JK".
export function formatPairingCode(code: string): string {
  return code.replace(/(.{4})(.{4})(.*)/, '$1-$2-$3');
}

export function normalisePairingCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

@Injectable()
export class KioskService {
  private readonly logger = new Logger(KioskService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registers a device and returns a single-use pairing code.
   *
   * The code exists so nobody has to type a 43-character token on a tablet
   * keyboard. It is short-lived, single-use, and stored only as a hash.
   */
  async createDevice(input: { name: string; locationId: string; createdById: string }) {
    const location = await this.prisma.location.findUnique({
      where: { id: input.locationId },
      select: { id: true, name: true, kioskEnabled: true, isActive: true },
    });
    if (!location) {
      throw new NotFoundException(`Location ${input.locationId} not found`);
    }
    if (!location.isActive) {
      throw new BadRequestException(`${location.name} is not an active location.`);
    }
    if (!location.kioskEnabled) {
      throw new BadRequestException(
        `Kiosk mode is turned off for ${location.name}. Enable it on the location first.`,
      );
    }

    const code = this.generateCode();
    const device = await this.prisma.kioskDevice.create({
      data: {
        name: input.name,
        locationId: input.locationId,
        createdById: input.createdById,
        pairingCodeHash: hashSecret(code),
        pairingExpiresAt: new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000),
      },
      select: { id: true, name: true, pairingExpiresAt: true },
    });

    this.logger.log(`Kiosk device ${device.id} created for location ${location.id}`);

    // The plain code is returned exactly once, here.
    return {
      id: device.id,
      name: device.name,
      pairingCode: formatPairingCode(code),
      pairingExpiresAt: device.pairingExpiresAt,
      locationName: location.name,
    };
  }

  /// Re-issues a code for a device that was never paired, or needs re-pairing
  /// after a tablet is wiped.
  async regeneratePairingCode(deviceId: string) {
    const device = await this.prisma.kioskDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, name: true, revokedAt: true, location: { select: { name: true } } },
    });
    if (!device) {
      throw new NotFoundException(`Kiosk ${deviceId} not found`);
    }
    if (device.revokedAt) {
      throw new BadRequestException('That kiosk has been revoked. Add a new one instead.');
    }

    const code = this.generateCode();
    const updated = await this.prisma.kioskDevice.update({
      where: { id: deviceId },
      data: {
        pairingCodeHash: hashSecret(code),
        pairingExpiresAt: new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000),
        // Re-pairing invalidates the old device token.
        tokenHash: null,
        pairedAt: null,
      },
      select: { id: true, name: true, pairingExpiresAt: true },
    });

    return {
      id: updated.id,
      name: updated.name,
      pairingCode: formatPairingCode(code),
      pairingExpiresAt: updated.pairingExpiresAt,
      locationName: device.location.name,
    };
  }

  /// Exchanges a pairing code for the long-lived device token.
  async pair(rawCode: string): Promise<{ token: string; device: PairedDevice }> {
    const code = normalisePairingCode(rawCode);
    const device = await this.prisma.kioskDevice.findUnique({
      where: { pairingCodeHash: hashSecret(code) },
      select: {
        id: true,
        name: true,
        revokedAt: true,
        pairingExpiresAt: true,
        location: { select: { id: true, name: true, kioskEnabled: true, isActive: true } },
      },
    });

    if (!device || device.revokedAt) {
      throw new UnauthorizedException('That pairing code is not valid.');
    }
    if (!device.pairingExpiresAt || device.pairingExpiresAt <= new Date()) {
      throw new UnauthorizedException(
        'That pairing code has expired. Generate a new one and try again.',
      );
    }
    if (!device.location.isActive || !device.location.kioskEnabled) {
      throw new UnauthorizedException(`Kiosk mode is not available for ${device.location.name}.`);
    }

    const token = randomBytes(DEVICE_TOKEN_BYTES).toString('base64url');
    await this.prisma.kioskDevice.update({
      where: { id: device.id },
      data: {
        tokenHash: hashSecret(token),
        // Single use: the code cannot be replayed to pair a second device.
        pairingCodeHash: null,
        pairingExpiresAt: null,
        pairedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    this.logger.log(`Kiosk device ${device.id} paired to location ${device.location.id}`);

    return {
      token,
      device: {
        deviceId: device.id,
        deviceName: device.name,
        locationId: device.location.id,
        locationName: device.location.name,
      },
    };
  }

  /// Resolves a device token, or null. Also the point where a revoked kiosk or a
  /// location with kiosk mode switched off stops working.
  async resolveDevice(token: string): Promise<PairedDevice | null> {
    const device = await this.prisma.kioskDevice.findUnique({
      where: { tokenHash: hashSecret(token) },
      select: {
        id: true,
        name: true,
        revokedAt: true,
        lastSeenAt: true,
        location: { select: { id: true, name: true, kioskEnabled: true, isActive: true } },
      },
    });

    if (!device || device.revokedAt) {
      return null;
    }
    if (!device.location.isActive || !device.location.kioskEnabled) {
      return null;
    }

    // Touch at most once a minute, as with user sessions.
    if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 60_000) {
      await this.prisma.kioskDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      });
    }

    return {
      deviceId: device.id,
      deviceName: device.name,
      locationId: device.location.id,
      locationName: device.location.name,
    };
  }

  async revoke(deviceId: string): Promise<void> {
    const device = await this.prisma.kioskDevice.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });
    if (!device) {
      throw new NotFoundException(`Kiosk ${deviceId} not found`);
    }

    await this.prisma.kioskDevice.update({
      where: { id: deviceId },
      data: { revokedAt: new Date(), tokenHash: null, pairingCodeHash: null },
    });
    this.logger.log(`Kiosk device ${deviceId} revoked`);
  }

  listDevices() {
    return this.prisma.kioskDevice.findMany({
      where: { revokedAt: null },
      select: {
        id: true,
        name: true,
        pairedAt: true,
        lastSeenAt: true,
        pairingExpiresAt: true,
        createdAt: true,
        location: { select: { id: true, name: true } },
      },
      orderBy: [{ location: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  /// The staff a given kiosk may sign in — assigned to its location, still
  /// employed, and with a PIN set. Anyone without a PIN simply is not offered.
  async listEligibleEmployees(locationId: string) {
    const employees = await this.prisma.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        pinHash: { not: null },
        locations: { some: { locationId } },
      },
      select: { id: true, firstName: true, lastName: true, preferredName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return employees.map((employee) => ({
      id: employee.id,
      firstName: employee.preferredName ?? employee.firstName,
      lastName: employee.lastName,
    }));
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return code;
  }
}
