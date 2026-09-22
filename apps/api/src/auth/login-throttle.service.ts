import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Throttles a single address that is guessing passwords.
 *
 * Account lockout already stops someone grinding away at one person's
 * password. It does nothing about the other shape of attack: one common
 * password tried against every address in turn, which never reaches any one
 * account's limit.
 *
 * The obvious fix — "N failures per IP" — is wrong here, because both offices
 * sit behind one address each. Twenty people fumbling their passwords on a
 * Monday morning are one IP with a lot of failures, and locking the whole
 * front desk out of the clock is a worse outage than the attack it prevents.
 *
 * So the rule counts **how many different accounts** an address has failed
 * against. Spraying means many accounts, few attempts each. A bad Monday means
 * few accounts, many attempts each — which account lockout already handles. A
 * high raw ceiling sits behind it for the degenerate cases.
 *
 * The default — ten different accounts inside ten minutes — is set above what a
 * practice of twenty could plausibly fumble and below what working through a
 * staff list looks like. Raise it if Domi grows and mornings get noisy. Note
 * that a throttled address does not stop the front desk: the kiosk clocks people
 * in on a PIN, which never goes through this route.
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);
  private readonly windowMinutes: number;
  private readonly maxAccounts: number;
  private readonly maxFailures: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.windowMinutes = config.get<number>('LOGIN_THROTTLE_WINDOW_MINUTES', 10);
    this.maxAccounts = config.get<number>('LOGIN_THROTTLE_MAX_ACCOUNTS', 10);
    this.maxFailures = config.get<number>('LOGIN_THROTTLE_MAX_FAILURES', 60);
  }

  /// Called before any password work, so a throttled address costs nothing.
  async assertNotThrottled(ipAddress: string | undefined): Promise<void> {
    if (!ipAddress) return;

    const since = this.windowStart();
    const attempts = await this.prisma.loginAttempt.findMany({
      where: { ipAddress, at: { gte: since } },
      select: { emailHash: true },
    });

    if (attempts.length === 0) return;

    const accounts = new Set(attempts.map((attempt) => attempt.emailHash)).size;
    if (accounts < this.maxAccounts && attempts.length < this.maxFailures) return;

    this.logger.warn(
      `Throttling ${ipAddress}: ${attempts.length} failed sign-ins against ${accounts} account(s) in the last ${this.windowMinutes} minutes`,
    );

    // 429, and a message that says nothing about whether any of those
    // addresses exist.
    throw new HttpException(
      `Too many failed sign-ins from this connection. Try again in ${this.windowMinutes} minutes.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async recordFailure(email: string, ipAddress: string | undefined): Promise<void> {
    if (!ipAddress) return;

    await this.prisma.loginAttempt.create({
      data: { ipAddress, emailHash: hashEmail(email) },
    });
  }

  /// Rows older than the window are dead weight. Called by the maintenance job.
  async purgeOld(): Promise<number> {
    const result = await this.prisma.loginAttempt.deleteMany({
      where: { at: { lt: this.windowStart() } },
    });
    return result.count;
  }

  private windowStart(): Date {
    return new Date(Date.now() - this.windowMinutes * 60_000);
  }
}

/// Not a password hash, so speed is the point rather than the problem: this
/// only has to group attempts against the same address without keeping a list
/// of who was targeted.
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
