import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { PinService } from '../kiosk/pin.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/profile.dto';
import { checkPhoto, PhotoError } from './photo';

const PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  pronouns: true,
  email: true,
  phone: true,
  about: true,
  photoUpdatedAt: true,
  pinUpdatedAt: true,
  pinHash: true,
  role: true,
  jobRoles: { select: { jobRole: { select: { id: true, name: true, colour: true } } } },
  locations: { select: { isPrimary: true, location: { select: { id: true, name: true } } } },
} as const;

/**
 * Your own profile: how colleagues see you in the Directory.
 *
 * Legal name, email, access level, job roles and offices are shown but are an
 * admin's or manager's to change — payroll and sign-in depend on them. The
 * rest is yours.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly pins: PinService,
  ) {}

  /// Choose the PIN you clock in with at the front-desk tablet.
  async setOwnPin(employeeId: string, currentPassword: string, pin: string) {
    const person = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { passwordHash: true },
    });
    if (
      !person.passwordHash ||
      !(await this.passwords.verify(currentPassword, person.passwordHash))
    ) {
      throw new ForbiddenException('That password is not right.');
    }
    const verdict = this.pins.check(pin);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        pinHash: await this.pins.hash(pin),
        pinUpdatedAt: new Date(),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    });
    this.logger.log(`Tablet PIN changed by ${employeeId} themselves`);
    return this.get(employeeId);
  }

  async get(employeeId: string) {
    const row = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: PROFILE_SELECT,
    });
    const { jobRoles, locations, pinHash, ...rest } = row;
    return {
      ...rest,
      // Whether a PIN is set, and when — never the PIN, which is only ever
      // stored hashed and so cannot be shown to anybody.
      hasPin: pinHash !== null,
      jobRoles: jobRoles.map((entry) => entry.jobRole),
      locations: locations.map((entry) => ({ ...entry.location, isPrimary: entry.isPrimary })),
    };
  }

  async update(employeeId: string, dto: UpdateProfileDto) {
    const clean = (value: string | undefined) =>
      value === undefined ? undefined : value.trim().replace(/\s+/g, ' ') || null;
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        preferredName: clean(dto.preferredName),
        pronouns: clean(dto.pronouns),
        phone: clean(dto.phone),
        about: clean(dto.about),
      },
    });
    return this.get(employeeId);
  }

  async setPhoto(employeeId: string, image: string) {
    let bytes: Buffer;
    try {
      bytes = checkPhoto(image);
    } catch (error) {
      if (error instanceof PhotoError) throw new BadRequestException(error.message);
      throw error;
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.employeePhoto.upsert({
        where: { employeeId },
        create: { employeeId, bytes, contentType: 'image/jpeg' },
        update: { bytes, contentType: 'image/jpeg' },
      }),
      this.prisma.employee.update({ where: { id: employeeId }, data: { photoUpdatedAt: now } }),
    ]);
    return this.get(employeeId);
  }

  /// Your own, or — for an admin — anybody's, say one that should not be there.
  async removePhoto(employeeId: string, removedBy: string) {
    await this.prisma.$transaction([
      this.prisma.employeePhoto.deleteMany({ where: { employeeId } }),
      this.prisma.employee.update({ where: { id: employeeId }, data: { photoUpdatedAt: null } }),
    ]);
    if (removedBy !== employeeId) {
      this.logger.log(`Photo for ${employeeId} removed by admin ${removedBy}`);
    }
    return this.get(employeeId);
  }

  async photo(employeeId: string) {
    const row = await this.prisma.employeePhoto.findUnique({
      where: { employeeId },
      select: { bytes: true, contentType: true },
    });
    if (!row) throw new NotFoundException('No photo.');
    return { bytes: Buffer.from(row.bytes), contentType: row.contentType };
  }
}
