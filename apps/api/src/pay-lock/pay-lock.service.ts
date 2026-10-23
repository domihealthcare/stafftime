import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordGuessService } from '../auth/password-guesses.service';
import { hashToken } from '../auth/session.service';
import { PinService } from '../kiosk/pin.service';
import { PrismaService } from '../prisma/prisma.service';
import { PAY_UNLOCK_MINUTES, unlockedUntil, worthMoving } from './pay-lock';

export interface PayLockStatus {
  unlocked: boolean;
  /// When it shuts, if it is open.
  until: string | null;
  /// Whether they have a tablet PIN; without one they use their password.
  hasPin: boolean;
  minutes: number;
}

/// Opening, keeping open and shutting the PIN in front of pay, per session.
@Injectable()
export class PayLockService {
  private readonly logger = new Logger(PayLockService.name);
  private readonly maxAttempts: number;
  private readonly lockoutMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pins: PinService,
    private readonly passwords: PasswordGuessService,
    config: ConfigService,
  ) {
    // The time clock's limits: the PIN is the same PIN.
    this.maxAttempts = config.get<number>('MAX_PIN_ATTEMPTS', 5);
    this.lockoutMinutes = config.get<number>('PIN_LOCKOUT_MINUTES', 10);
  }

  async status(token: string, employeeId: string): Promise<PayLockStatus> {
    const [session, person] = await Promise.all([
      this.prisma.session.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { payUnlockedUntil: true },
      }),
      this.prisma.employee.findUnique({ where: { id: employeeId }, select: { pinHash: true } }),
    ]);
    const until = session?.payUnlockedUntil ?? null;
    const unlocked = until !== null && until > new Date();
    return {
      unlocked,
      until: unlocked ? until.toISOString() : null,
      hasPin: Boolean(person?.pinHash),
      minutes: PAY_UNLOCK_MINUTES,
    };
  }

  /// Still at the screen: keeps it open, if it is.
  async touch(token: string, employeeId: string): Promise<PayLockStatus> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, payUnlockedUntil: true },
    });
    const until = session?.payUnlockedUntil;
    if (session && until && until > new Date() && worthMoving(until)) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { payUnlockedUntil: unlockedUntil() },
      });
    }
    return this.status(token, employeeId);
  }

  async lock(token: string): Promise<{ locked: true }> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { payUnlockedUntil: null },
    });
    return { locked: true };
  }

  /// Their tablet PIN - counted against the same lockout as at the time clock
  /// - or their password, counted against the sign-in lockout.
  async unlock(
    token: string,
    employeeId: string,
    proof: { pin?: string; password?: string },
  ): Promise<PayLockStatus> {
    if (proof.pin) await this.checkPin(employeeId, proof.pin);
    else if (proof.password) await this.checkPassword(employeeId, proof.password);
    else throw new BadRequestException('Enter your PIN.');

    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { payUnlockedUntil: unlockedUntil() },
    });
    this.logger.log(`Pay unlocked for ${employeeId} by ${proof.pin ? 'PIN' : 'password'}`);
    return this.status(token, employeeId);
  }

  private async checkPin(employeeId: string, pin: string) {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, pinHash: true, pinLockedUntil: true },
    });
    if (!person?.pinHash) {
      throw new BadRequestException(
        'You have no PIN yet. Use your password, or choose a PIN on Your profile.',
      );
    }
    if (person.pinLockedUntil && person.pinLockedUntil > new Date()) {
      throw new UnauthorizedException(locked(person.pinLockedUntil));
    }
    // Counted before it is checked, by the database, as at the time clock.
    const { pinFailedAttempts: attempt } = await this.prisma.employee.update({
      where: { id: person.id },
      data: person.pinLockedUntil
        ? { pinFailedAttempts: 1, pinLockedUntil: null }
        : { pinFailedAttempts: { increment: 1 } },
      select: { pinFailedAttempts: true },
    });
    if (attempt > this.maxAttempts) {
      throw new UnauthorizedException(locked(new Date(Date.now() + this.lockoutMinutes * 60_000)));
    }
    if (!(await this.pins.verify(pin, person.pinHash))) {
      if (attempt >= this.maxAttempts) {
        await this.prisma.employee.update({
          where: { id: person.id },
          data: { pinLockedUntil: new Date(Date.now() + this.lockoutMinutes * 60_000) },
        });
        this.logger.warn(
          `Employee ${person.id} PIN-locked after ${attempt} wrong PINs at the pay lock`,
        );
      }
      throw new UnauthorizedException('That PIN is not right.');
    }
    await this.prisma.employee.update({
      where: { id: person.id },
      data: { pinFailedAttempts: 0, pinLockedUntil: null },
    });
  }

  private async checkPassword(employeeId: string, password: string) {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordHash: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });
    if (!person?.passwordHash) throw new UnauthorizedException('That password is not right.');
    const guess = await this.passwords.check(
      { ...person, passwordHash: person.passwordHash },
      password,
    );
    if (guess.kind === 'locked') throw new UnauthorizedException(guess.message);
    if (guess.kind === 'wrong') throw new UnauthorizedException('That password is not right.');
  }
}

function locked(until: Date): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return `Too many incorrect PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or use your password.`;
}
