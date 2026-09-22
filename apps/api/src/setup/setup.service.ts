import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmploymentStatus, PayType, Role } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { FirstRunSetupDto } from './setup.dto';

/**
 * Creates the very first administrator on a fresh deployment, from the browser.
 *
 * A new database has no accounts and there is no sign-up page, so without this
 * the only way in is a command line pointed at the production database. That is
 * a real obstacle for whoever is setting the practice up.
 *
 * Three things keep it from being a back door:
 *
 *  1. It does nothing unless SETUP_TOKEN is set. No token, no route.
 *  2. It refuses once any administrator exists, so it cannot be replayed.
 *  3. The token is compared in constant time.
 *
 * Remove SETUP_TOKEN once the first account exists. The route then reports
 * itself as unavailable even if the account were later deleted.
 */
@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService,
  ) {}

  /// Whether the web app should show the setup screen instead of sign-in.
  async status(): Promise<{ needsSetup: boolean }> {
    if (!this.configuredToken()) {
      return { needsSetup: false };
    }
    const admins = await this.prisma.employee.count({ where: { role: Role.ADMIN } });
    return { needsSetup: admins === 0 };
  }

  async createFirstAdmin(dto: FirstRunSetupDto) {
    const expected = this.configuredToken();
    if (!expected) {
      // Indistinguishable from a route that was never there.
      throw new NotFoundException();
    }

    const admins = await this.prisma.employee.count({ where: { role: Role.ADMIN } });
    if (admins > 0) {
      throw new ForbiddenException(
        'This practice is already set up. Sign in, or ask an administrator to add you.',
      );
    }

    if (!safeEquals(dto.setupToken, expected)) {
      this.logger.warn('First-run setup attempted with an incorrect token');
      throw new ForbiddenException('That setup token is not correct.');
    }

    const email = dto.email.trim().toLowerCase();
    const taken = await this.prisma.employee.findUnique({
      where: { email },
      select: { id: true },
    });
    if (taken) {
      throw new BadRequestException(`${email} already has an account.`);
    }

    const verdict = this.passwords.check(dto.password, {
      email,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }

    const employee = await this.prisma.employee.create({
      data: {
        email,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        role: Role.ADMIN,
        employmentStatus: EmploymentStatus.ACTIVE,
        payType: PayType.SALARY,
        hireDate: new Date(),
        passwordHash: await this.passwords.hash(dto.password),
        passwordUpdatedAt: new Date(),
        // They chose it themselves, so there is nothing to force a change of.
        mustChangePassword: false,
      },
      select: { id: true, email: true },
    });

    this.logger.log(`First administrator created: ${employee.email}`);
    return { created: true, email: employee.email, employeeId: employee.id };
  }

  private configuredToken(): string | undefined {
    const token = this.config.get<string>('SETUP_TOKEN');
    return token && token.length >= 8 ? token : undefined;
  }
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
