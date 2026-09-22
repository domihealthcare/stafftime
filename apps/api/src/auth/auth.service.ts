import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmploymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordService } from './password.service';
import { IssuedSession, SessionService } from './session.service';

/// One message for every failed sign-in, whatever the real cause. Saying "no
/// such account" would let anyone enumerate who works here.
const SIGN_IN_FAILED = 'Email or password is incorrect.';

export interface LoginContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly maxAttempts: number;
  private readonly lockoutMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
    config: ConfigService,
  ) {
    this.maxAttempts = config.get<number>('MAX_LOGIN_ATTEMPTS', 8);
    this.lockoutMinutes = config.get<number>('LOCKOUT_MINUTES', 15);
  }

  async login(email: string, password: string, context: LoginContext): Promise<IssuedSession> {
    // Before the lookup and before any hashing, so a throttled address costs
    // us nothing to refuse.
    await this.throttle.assertNotThrottled(context.ipAddress);

    const employee = await this.prisma.employee.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        employmentStatus: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    // Spend the same work on an unknown address as on a real one, so response
    // time does not reveal which emails exist.
    if (!employee?.passwordHash) {
      await this.passwords.verify(password, DUMMY_HASH);
      await this.throttle.recordFailure(email, context.ipAddress);
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }

    if (employee.lockedUntil && employee.lockedUntil > new Date()) {
      const minutes = Math.max(
        1,
        Math.ceil((employee.lockedUntil.getTime() - Date.now()) / 60_000),
      );
      throw new UnauthorizedException(
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or ask an administrator to reset your password.`,
      );
    }

    const correct = await this.passwords.verify(password, employee.passwordHash);
    if (!correct) {
      await this.recordFailure(employee.id, employee.failedLoginAttempts);
      await this.throttle.recordFailure(email, context.ipAddress);
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }

    // Checked only after the password is proven, so it cannot be used to probe
    // who still works here.
    if (employee.employmentStatus === EmploymentStatus.TERMINATED) {
      throw new ForbiddenException('This account is no longer active.');
    }

    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.sessions.issue(employee.id, context);
  }

  async logout(token: string): Promise<void> {
    await this.sessions.revoke(token);
  }

  /// Changing your own password. Requires the current one, even though you are
  /// already signed in — an unattended browser should not be a takeover.
  async changePassword(
    employeeId: string,
    currentPassword: string,
    newPassword: string,
    currentToken: string,
  ): Promise<{ otherSessionsSignedOut: number }> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordHash: true,
      },
    });
    if (!employee?.passwordHash) {
      throw new NotFoundException('Account not found.');
    }

    const correct = await this.passwords.verify(currentPassword, employee.passwordHash);
    if (!correct) {
      throw new UnauthorizedException('Your current password is incorrect.');
    }

    if (await this.passwords.verify(newPassword, employee.passwordHash)) {
      throw new BadRequestException('Your new password must be different from the current one.');
    }

    await this.assertAcceptable(newPassword, employee);
    await this.writePassword(employee.id, newPassword, { temporary: false });

    // Everywhere else is signed out: if the old password had leaked, this is
    // what ends the intruder's session.
    const otherSessionsSignedOut = await this.sessions.revokeAllForEmployee(
      employee.id,
      currentToken,
    );

    this.logger.log(`Password changed for employee ${employee.id}`);
    return { otherSessionsSignedOut };
  }

  /// An administrator setting a temporary password — for onboarding, or when
  /// someone is locked out. The holder must replace it at next sign-in.
  async setTemporaryPassword(employeeId: string, temporaryPassword: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    await this.assertAcceptable(temporaryPassword, employee);
    await this.writePassword(employee.id, temporaryPassword, { temporary: true });

    // Any session opened with the old credentials dies now.
    await this.sessions.revokeAllForEmployee(employee.id);
    this.logger.log(`Temporary password set for employee ${employee.id}`);
  }

  private async assertAcceptable(
    password: string,
    context: { email: string; firstName: string; lastName: string },
  ): Promise<void> {
    const verdict = this.passwords.check(password, context);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
  }

  private async writePassword(
    employeeId: string,
    password: string,
    options: { temporary: boolean },
  ): Promise<void> {
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        passwordHash: await this.passwords.hash(password),
        passwordUpdatedAt: new Date(),
        mustChangePassword: options.temporary,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  private async recordFailure(employeeId: string, previousFailures: number): Promise<void> {
    const attempts = previousFailures + 1;
    const locked = attempts >= this.maxAttempts;

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: locked ? new Date(Date.now() + this.lockoutMinutes * 60_000) : null,
      },
    });

    if (locked) {
      this.logger.warn(`Employee ${employeeId} locked out after ${attempts} failed attempts`);
    }
  }
}

/// A real argon2id hash of a value nobody knows, used to keep the timing of a
/// failed sign-in the same whether or not the account exists.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$ER3lyKcmGAdBQCK1bozaPg$Vnn6kL4cjT3v9VV8GModgQxlxkLn+z63lmUAPj71pfc';
