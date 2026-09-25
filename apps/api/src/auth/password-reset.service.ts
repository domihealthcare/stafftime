import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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

/// A welcome link waits in an inbox until somebody's first day, so it lasts
/// longer than a reset link — a week — and still works only once.
const WELCOME_VALID_DAYS = 7;

/// Resend's free plan takes two messages a second; a pause between welcome
/// emails keeps a whole-practice send inside it. Bulk sends go in batches small
/// enough to finish well inside a serverless function's time limit.
const WELCOME_PACE_MS = 600;
const WELCOME_BATCH = 20;

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
    private readonly config: ConfigService,
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

    await this.notifications.passwordReset(
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

  /**
   * Sends somebody their welcome email: a link to choose their first password,
   * with how to put the app on their phone and the day-one questions answered.
   *
   * Only for somebody who has not chosen a password yet — for anybody else a
   * "set your password" link is a password reset they did not ask for, and
   * "Forgotten your password?" is the way. Records when it went, so the Staff
   * screen shows who has been invited.
   */
  async sendWelcome(employeeId: string): Promise<{ welcomeSentAt: Date }> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        email: true,
        firstName: true,
        preferredName: true,
        employmentStatus: true,
        passwordHash: true,
      },
    });
    if (!employee) throw new NotFoundException('No such person.');
    if (employee.employmentStatus === EmploymentStatus.TERMINATED) {
      throw new BadRequestException(`${employee.firstName} is marked as no longer employed.`);
    }
    if (employee.passwordHash) {
      throw new BadRequestException(
        `${employee.firstName} has already chosen a password. If they have forgotten it, “Forgotten your password?” on the sign-in screen sends them a new link.`,
      );
    }
    const recent = await this.prisma.passwordResetToken.count({
      where: { employeeId, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= MAX_PER_HOUR) {
      throw new BadRequestException(
        `${employee.firstName} has been sent several links in the last hour. Try again later.`,
      );
    }

    const token = randomBytes(32).toString('base64url');
    const record = await this.prisma.passwordResetToken.create({
      data: {
        employeeId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + WELCOME_VALID_DAYS * 86_400_000),
      },
      select: { id: true },
    });

    const result = await this.notifications.welcome(
      {
        firstName: employee.preferredName || employee.firstName,
        email: employee.email,
        link: `${this.appUrl}/reset-password?token=${token}&welcome=1`,
        validDays: WELCOME_VALID_DAYS,
        appUrl: this.appUrl,
      },
      employee.email,
    );

    // With no email provider — a developer's machine, or a test deployment —
    // the message is written to the server log, where the link can be copied.
    // Counted as sent there; on a live deployment it is a failure.
    const loggedForTesting =
      !result.delivered &&
      result.reason === 'no email provider configured' &&
      this.config.get<string>('APP_ENVIRONMENT') === 'test';

    if (!result.delivered && !loggedForTesting) {
      // A link nobody received is a live key for nothing; take it back.
      await this.prisma.passwordResetToken.delete({ where: { id: record.id } });
      throw new BadGatewayException(
        `The welcome email to ${employee.email} could not be sent${
          result.reason ? ` (${result.reason})` : ''
        }. Nothing was changed; try again shortly.`,
      );
    }

    const welcomeSentAt = new Date();
    await this.prisma.employee.update({ where: { id: employeeId }, data: { welcomeSentAt } });
    this.logger.log(`Welcome email sent to employee ${employeeId}`);
    return { welcomeSentAt };
  }

  /**
   * Welcome emails for everybody who has not had one and has not chosen a
   * password — the first-day send, after the staff list goes in. Demo staff are
   * never included. Sent in batches; `remaining` says whether to call again.
   */
  async sendWelcomeToEveryone(): Promise<{
    sent: number;
    failed: { name: string; email: string; reason: string }[];
    remaining: number;
  }> {
    const waiting = {
      employmentStatus: { not: EmploymentStatus.TERMINATED },
      passwordHash: null,
      welcomeSentAt: null,
      OR: [{ externalId: null }, { NOT: { externalId: { startsWith: 'demo:' } } }],
    };
    const batch = await this.prisma.employee.findMany({
      where: waiting,
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: WELCOME_BATCH,
    });

    let sent = 0;
    const failed: { name: string; email: string; reason: string }[] = [];
    for (const [index, person] of batch.entries()) {
      if (index > 0) await pause(WELCOME_PACE_MS);
      try {
        await this.sendWelcome(person.id);
        sent += 1;
      } catch (error) {
        failed.push({
          name: `${person.firstName} ${person.lastName}`,
          email: person.email,
          reason: error instanceof Error ? error.message : 'Could not send.',
        });
      }
    }

    // Anybody who failed is still waiting, but calling again would only fail
    // them again straight away; they are reported instead.
    const remaining = Math.max(
      0,
      (await this.prisma.employee.count({ where: waiting })) - failed.length,
    );
    return { sent, failed, remaining };
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

function pause(ms: number): Promise<void> {
  return process.env.NODE_ENV === 'test' ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
}
