import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';

/// What a password check needs to know about the account.
export interface GuessedAccount {
  id: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

export type GuessOutcome =
  { kind: 'right' } | { kind: 'wrong' } | { kind: 'locked'; message: string };

/**
 * Every place that asks for somebody's password — signing in, changing it,
 * choosing a tablet PIN — counts a wrong one against the same lockout.
 * Otherwise a browser left signed in would offer unlimited guesses at the
 * password behind it.
 *
 * The guess is counted before the password is checked, with an increment the
 * database does itself, so a burst of guesses sent at once cannot all read the
 * same count and slip past the limit together.
 */
@Injectable()
export class PasswordGuessService {
  private readonly logger = new Logger(PasswordGuessService.name);
  private readonly maxAttempts: number;
  private readonly lockoutMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    config: ConfigService,
  ) {
    this.maxAttempts = config.get<number>('MAX_LOGIN_ATTEMPTS', 8);
    this.lockoutMinutes = config.get<number>('LOCKOUT_MINUTES', 15);
  }

  /// A right password clears the count; a wrong one may lock the account.
  async check(account: GuessedAccount, password: string): Promise<GuessOutcome> {
    const now = new Date();
    if (account.lockedUntil && account.lockedUntil > now) {
      return this.locked(account.lockedUntil);
    }

    // A lockout that has run out starts the count afresh, rather than the
    // first typo afterwards locking the account again.
    const lapsed = account.lockedUntil !== null;
    const { failedLoginAttempts: attempt } = await this.prisma.employee.update({
      where: { id: account.id },
      data: lapsed
        ? { failedLoginAttempts: 1, lockedUntil: null }
        : { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    // Only when guesses arrive together: the ones before this used the rest.
    if (attempt > this.maxAttempts) {
      return this.locked(new Date(now.getTime() + this.lockoutMinutes * 60_000));
    }

    if (await this.passwords.verify(password, account.passwordHash)) {
      await this.prisma.employee.update({
        where: { id: account.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
      return { kind: 'right' };
    }

    if (attempt >= this.maxAttempts) {
      await this.prisma.employee.update({
        where: { id: account.id },
        data: { lockedUntil: new Date(Date.now() + this.lockoutMinutes * 60_000) },
      });
      this.logger.warn(`Employee ${account.id} locked out after ${attempt} failed attempts`);
    }
    return { kind: 'wrong' };
  }

  private locked(until: Date): GuessOutcome {
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
    return {
      kind: 'locked',
      message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or ask an administrator to reset your password.`,
    };
  }
}
