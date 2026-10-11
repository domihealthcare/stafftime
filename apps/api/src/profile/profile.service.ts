import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationKind } from '@prisma/client';
import { PasswordGuessService } from '../auth/password-guesses.service';
import { InboxService } from '../email/inbox.service';
import { PinService } from '../kiosk/pin.service';
import { mainFirst } from '../job-roles/main-job-role';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/profile.dto';
import { checkPhoto, PhotoError } from './photo';

const PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  pronouns: true,
  language: true,
  email: true,
  phone: true,
  about: true,
  photoUpdatedAt: true,
  birthdayMonth: true,
  birthdayDay: true,
  pinUpdatedAt: true,
  pinHash: true,
  role: true,
  jobRoles: {
    select: {
      isPrimary: true,
      jobRole: { select: { id: true, name: true, colour: true, sortOrder: true } },
    },
  },
  locations: { select: { isPrimary: true, location: { select: { id: true, name: true } } } },
} as const;

/**
 * Your own profile: how colleagues see you in the Directory.
 *
 * Legal name, email, access level, job roles, offices and birthday are shown
 * but are an admin's or manager's to change — payroll and sign-in depend on them. The
 * rest is yours.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly guesses: PasswordGuessService,
    private readonly pins: PinService,
    private readonly inbox: InboxService,
  ) {}

  /// Choose the PIN you clock in with at the front-desk tablet.
  async setOwnPin(employeeId: string, currentPassword: string, pin: string) {
    const person = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { id: true, passwordHash: true, failedLoginAttempts: true, lockedUntil: true },
    });
    if (!person.passwordHash) {
      throw new ForbiddenException('That password is not right.');
    }
    // Wrong guesses count against signing in, like everywhere a password is
    // asked for. A 403, not a 401: this is about the password, and a 401 would
    // sign them out.
    const guess = await this.guesses.check(
      { ...person, passwordHash: person.passwordHash },
      currentPassword,
    );
    if (guess.kind === 'locked') throw new ForbiddenException(guess.message);
    if (guess.kind === 'wrong') throw new ForbiddenException('That password is not right.');
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
      // Their main job role first.
      jobRoles: mainFirst(
        jobRoles.map((entry) => ({ ...entry.jobRole, isPrimary: entry.isPrimary })),
      ).map(({ id, name, colour, isPrimary }) => ({ id, name, colour, isPrimary })),
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
        language: dto.language,
      },
    });
    return this.get(employeeId);
  }

  /// Your own, or — for an admin — anybody's, who is then told.
  async setPhoto(employeeId: string, image: string, setBy: string = employeeId) {
    const byAdmin = setBy !== employeeId;
    if (byAdmin) {
      const exists = await this.prisma.employee.count({ where: { id: employeeId } });
      if (!exists) throw new NotFoundException('That employee does not exist.');
    }
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
    if (byAdmin) {
      this.logger.log(`Photo for ${employeeId} set by admin ${setBy}`);
      await this.inbox.notify([employeeId], {
        kind: NotificationKind.PROFILE_PHOTO,
        title: 'Your profile photo was added for you',
        body: 'An admin put up your photo. You can change it or take it down on Your profile.',
        link: '/profile',
      });
    }
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
