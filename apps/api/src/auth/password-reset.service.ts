import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmploymentStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

/// Deliberately short. A reset link sitting in an inbox is a key to the
/// account, and most people use one within a minute of asking for it.
const VALID_MINUTES = 30;

/// How many links one account may ask for in an hour. Stops somebody using the
/// reset form to bombard a colleague's inbox.
const MAX_PER_HOUR = 5;

/// The same answer whether or not the address belongs to anybody. Telling an
/// unauthenticated caller "no such account" hands them a list of who works here.
const ALWAYS = 'If that address belongs to a Domi account, a reset link is on its way.';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  /**
   * Always reports the same thing. Whether an email goes out, and to whom, is
   * not the caller's business — that is the whole point.
   */
  async request(email: string, ipAddress?: string): Promise<{ message: string }> {
    const employee = await this.prisma.employee.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, firstName: true, employmentStatus: true },
    });

    if (!employee) {
      this.logger.log(`Reset asked for an address with no account (${ipAddress ?? 'no ip'})`);
      return { message: ALWAYS };
    }
    if (employee.employmentStatus === EmploymentStatus.TERMINATED) {
      // Somebody who has left does not get a way back in, and does not get told
      // that is why.
      this.logger.warn(`Reset asked for terminated employee ${employee.id}`);
      return { message: ALWAYS };
    }

    const recent = await this.prisma.passwordResetToken.count({
      where: { employeeId: employee.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= MAX_PER_HOUR) {
      this.logger.warn(`Reset rate limit hit for employee ${employee.id}`);
      return { message: ALWAYS };
    }

    // 32 bytes, url-safe, never stored in the clear.
    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        employeeId: employee.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VALID_MINUTES * 60_000),
        requestedIp: ipAddress,
      },
    });

    this.notifications.passwordReset(
      employee.email,
      employee.firstName,
      `${this.appUrl}/reset-password?token=${token}`,
      VALID_MINUTES,
    );

    this.logger.log(`Reset link issued for employee ${employee.id}`);
    return { message: ALWAYS };
  }

  /**
   * Spends the token and sets the new password.
   *
   * Every session is signed out afterwards, including the browser doing the
   * resetting. If the reason for the reset was that somebody else had the old
   * password, leaving their session alive would defeat the exercise.
   */
  async complete(token: string, newPassword: string): Promise<{ email: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        employee: { select: { id: true, email: true, employmentStatus: true } },
      },
    });

    // One message for every way a link can be no good — expired, already used,
    // never existed — because distinguishing them tells an attacker which
    // guesses were close.
    const refusal = new BadRequestException(
      'That link has expired or has already been used. Ask for a new one.',
    );

    if (!record || record.usedAt || record.expiresAt < new Date()) throw refusal;
    if (record.employee.employmentStatus === EmploymentStatus.TERMINATED) throw refusal;

    const verdict = this.passwords.check(newPassword, { email: record.employee.email });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);

    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.employee.update({
        where: { id: record.employeeId },
        data: {
          passwordHash,
          passwordUpdatedAt: new Date(),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      // This one is spent, and so is every other outstanding link for that
      // account: asking twice and using the first should not leave the second
      // working.
      this.prisma.passwordResetToken.updateMany({
        where: { employeeId: record.employeeId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.sessions.revokeAllForEmployee(record.employeeId);

    this.logger.log(`Password reset completed for employee ${record.employeeId}`);
    return { email: record.employee.email };
  }

  /// Expired and spent tokens are dead weight. Called by the maintenance job.
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.passwordResetToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }],
      },
    });
    return result.count;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
