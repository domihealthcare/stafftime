import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EmploymentStatus, NotificationKind, PasskeyPurpose, Prisma } from '@prisma/client';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PasswordGuessService } from '../auth/password-guesses.service';
import { LoginThrottleService } from '../auth/login-throttle.service';
import { IssuedSession, SessionService, hashToken } from '../auth/session.service';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PasskeySite } from './passkey-site';
import {
  ALGORITHMS,
  CHECK_FAILED,
  NOT_RECOGNISED,
  PASSWORD_NEEDED,
  SET_UP_FAILED,
  challengeExpiry,
  displayName,
  signedInJustNow,
} from './passkeys';

export interface PasskeySummary {
  id: string;
  userAgent: string | null;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const SUMMARY = {
  id: true,
  userAgent: true,
  backedUp: true,
  createdAt: true,
  lastUsedAt: true,
} as const;

/**
 * Face ID, Touch ID, a fingerprint or Windows Hello in place of a password
 * (November 2026, Dominguez). A standard passkey (WebAuthn): the phone checks
 * the face itself and signs a one-time challenge; only the public key is kept
 * here. Optional for each person; the password always still works.
 *
 * Used three ways: setting one up (signed in), signing in with one, and
 * opening the PIN in front of pay (signed in).
 */
@Injectable()
export class PasskeysService {
  private readonly logger = new Logger(PasskeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly guesses: PasswordGuessService,
    private readonly throttle: LoginThrottleService,
    private readonly notifications: NotificationsService,
  ) {}

  list(employeeId: string): Promise<PasskeySummary[]> {
    return this.prisma.passkey.findMany({
      where: { employeeId },
      select: SUMMARY,
      orderBy: { createdAt: 'asc' },
    });
  }

  count(employeeId: string): Promise<number> {
    return this.prisma.passkey.count({ where: { employeeId } });
  }

  // ---------------------------------------------------------------------
  // Setting one up
  // ---------------------------------------------------------------------

  /**
   * The challenge for setting Face ID up on this device. Asks for the
   * password again unless they signed in in the last few minutes: a browser
   * left signed in should not be a way to add somebody else's face.
   */
  async registrationOptions(
    employeeId: string,
    token: string,
    site: PasskeySite,
    password?: string,
  ) {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        isSharedAccount: true,
      },
    });
    if (!person) throw new NotFoundException('Account not found.');
    if (person.isSharedAccount) {
      // A shared account is used by several people; a passkey on one
      // person's phone would stay with them after they left.
      throw new ForbiddenException('A shared account cannot use Face ID. Use the password.');
    }
    await this.assertJustSignedIn(employeeId, token, password);

    const existing = await this.prisma.passkey.findMany({
      where: { employeeId },
      select: { credentialId: true, transports: true },
    });
    const options = await generateRegistrationOptions({
      rpName: 'Domi Staff',
      rpID: site.rpID,
      userName: person.email,
      userID: new TextEncoder().encode(person.id),
      userDisplayName: displayName(person),
      attestationType: 'none',
      // Not the same device twice.
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports,
      })),
      // Kept on the device (so it can sign in with no email typed), and the
      // face, fingerprint or device passcode checked every time.
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      preferredAuthenticatorType: 'localDevice',
      supportedAlgorithmIDs: ALGORITHMS,
    });
    await this.keepChallenge(options.challenge, PasskeyPurpose.REGISTER, employeeId);
    return options;
  }

  async register(
    employeeId: string,
    response: RegistrationResponseJSON,
    site: PasskeySite,
    userAgent: string | undefined,
  ): Promise<PasskeySummary[]> {
    let verified;
    try {
      verified = await verifyRegistrationResponse({
        response,
        expectedChallenge: (challenge) =>
          this.spend(challenge, PasskeyPurpose.REGISTER, employeeId),
        expectedOrigin: site.origin,
        expectedRPID: site.rpID,
        requireUserVerification: true,
        supportedAlgorithmIDs: ALGORITHMS,
      });
    } catch (error) {
      this.logger.warn(`Passkey set-up refused for ${employeeId}: ${(error as Error).message}`);
      throw new BadRequestException(SET_UP_FAILED);
    }
    if (!verified.verified) throw new BadRequestException(SET_UP_FAILED);

    const { credential, credentialBackedUp } = verified.registrationInfo;
    try {
      await this.prisma.passkey.create({
        data: {
          employeeId,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
          transports: credential.transports ?? [],
          backedUp: credentialBackedUp,
          userAgent: userAgent?.slice(0, 500),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Face ID is already set up on this device.');
      }
      throw error;
    }
    this.logger.log(`Passkey set up for ${employeeId}`);

    // Told on the bell and by email, so a passkey nobody meant to add is
    // noticed.
    await this.notifications.personal([employeeId], NotificationKind.ACCOUNT, {
      title: 'Face ID was set up on your account',
      body:
        'Face ID (a passkey) can now be used to sign in to Domi Staff as you. ' +
        'If this was not you, remove it on Your profile and change your password.',
      link: '/profile',
    });
    return this.list(employeeId);
  }

  // ---------------------------------------------------------------------
  // Signing in
  // ---------------------------------------------------------------------

  /// No email asked for: the phone offers the passkeys it holds for this site.
  async signInOptions(site: PasskeySite, ipAddress: string | undefined) {
    await this.throttle.assertNotThrottled(ipAddress);
    const options = await generateAuthenticationOptions({
      rpID: site.rpID,
      userVerification: 'required',
    });
    await this.keepChallenge(options.challenge, PasskeyPurpose.SIGN_IN, null);
    return options;
  }

  async signIn(
    response: AuthenticationResponseJSON,
    site: PasskeySite,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<IssuedSession> {
    const passkey = await this.findByCredential(response);
    if (!passkey) throw new UnauthorizedException(NOT_RECOGNISED);
    await this.check(response, passkey, site, PasskeyPurpose.SIGN_IN, null);

    // After the passkey is proven, as with the password.
    if (passkey.employee.employmentStatus === EmploymentStatus.TERMINATED) {
      throw new ForbiddenException('This account is no longer active.');
    }
    await this.prisma.employee.update({
      where: { id: passkey.employeeId },
      data: { lastLoginAt: new Date() },
    });
    this.logger.log(`Signed in with a passkey: ${passkey.employeeId}`);
    return this.sessions.issue(passkey.employeeId, { ...context, viaPasskey: true });
  }

  // ---------------------------------------------------------------------
  // Opening pay
  // ---------------------------------------------------------------------

  /// Only their own passkeys are offered.
  async payOptions(employeeId: string, site: PasskeySite) {
    const theirs = await this.prisma.passkey.findMany({
      where: { employeeId },
      select: { credentialId: true, transports: true },
    });
    if (theirs.length === 0) {
      throw new BadRequestException('Face ID is not set up for you. Use your PIN.');
    }
    const options = await generateAuthenticationOptions({
      rpID: site.rpID,
      userVerification: 'required',
      allowCredentials: theirs.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports,
      })),
    });
    await this.keepChallenge(options.challenge, PasskeyPurpose.PAY, employeeId);
    return options;
  }

  /// Throws unless it is one of their own passkeys, answered just now.
  async proveForPay(
    employeeId: string,
    response: AuthenticationResponseJSON,
    site: PasskeySite,
  ): Promise<void> {
    const passkey = await this.findByCredential(response);
    if (!passkey || passkey.employeeId !== employeeId) {
      throw new UnauthorizedException(CHECK_FAILED);
    }
    await this.check(response, passkey, site, PasskeyPurpose.PAY, employeeId);
  }

  // ---------------------------------------------------------------------
  // Taking them away
  // ---------------------------------------------------------------------

  /// One of your own.
  async remove(employeeId: string, id: string): Promise<PasskeySummary[]> {
    const { count } = await this.prisma.passkey.deleteMany({ where: { id, employeeId } });
    if (count === 0) throw new NotFoundException('That passkey is not on your account.');
    this.logger.log(`Passkey ${id} removed by ${employeeId}`);
    return this.list(employeeId);
  }

  /// All of somebody's, by an admin (a lost phone).
  async removeAll(employeeId: string, removedBy: string): Promise<{ removed: number }> {
    const { count } = await this.prisma.passkey.deleteMany({ where: { employeeId } });
    this.logger.log(`${count} passkey(s) of ${employeeId} removed by admin ${removedBy}`);
    return { removed: count };
  }

  // ---------------------------------------------------------------------

  private findByCredential(response: AuthenticationResponseJSON) {
    if (typeof response?.id !== 'string' || response.id.length > 1024) return null;
    return this.prisma.passkey.findUnique({
      where: { credentialId: response.id },
      select: {
        id: true,
        employeeId: true,
        credentialId: true,
        publicKey: true,
        counter: true,
        transports: true,
        employee: { select: { employmentStatus: true } },
      },
    });
  }

  private async check(
    response: AuthenticationResponseJSON,
    passkey: {
      id: string;
      credentialId: string;
      publicKey: Uint8Array;
      counter: bigint;
      transports: string[];
    },
    site: PasskeySite,
    purpose: PasskeyPurpose,
    employeeId: string | null,
  ): Promise<void> {
    let verified;
    try {
      verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: (challenge) => this.spend(challenge, purpose, employeeId),
        expectedOrigin: site.origin,
        expectedRPID: site.rpID,
        requireUserVerification: true,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: Number(passkey.counter),
          transports: passkey.transports,
        },
      });
    } catch (error) {
      this.logger.warn(`Passkey refused (${purpose}): ${(error as Error).message}`);
      throw new UnauthorizedException(CHECK_FAILED);
    }
    if (!verified.verified) throw new UnauthorizedException(CHECK_FAILED);
    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: BigInt(verified.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
  }

  /// Passes when the session began in the last few minutes, or with their
  /// password (counted against the sign-in lockout, like anywhere it is asked).
  private async assertJustSignedIn(employeeId: string, token: string, password?: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { createdAt: true },
    });
    if (session && signedInJustNow(session.createdAt)) return;
    if (!password) {
      throw new ForbiddenException({
        message: 'Enter your password to set up Face ID.',
        code: PASSWORD_NEEDED,
      });
    }
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
    const guess = await this.guesses.check(
      { ...person, passwordHash: person.passwordHash },
      password,
    );
    if (guess.kind === 'locked') throw new UnauthorizedException(guess.message);
    if (guess.kind === 'wrong') throw new UnauthorizedException('That password is not right.');
  }

  /// Kept for a few minutes; old ones are cleared on the way.
  private async keepChallenge(
    challenge: string,
    purpose: PasskeyPurpose,
    employeeId: string | null,
  ): Promise<void> {
    await this.prisma.passkeyChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.prisma.passkeyChallenge.create({
      data: { challenge, purpose, employeeId, expiresAt: challengeExpiry() },
    });
  }

  /// True once, for a challenge made for this purpose and person and still
  /// in time; it is deleted as it is used, so it can never be answered twice.
  private async spend(
    challenge: string,
    purpose: PasskeyPurpose,
    employeeId: string | null,
  ): Promise<boolean> {
    const { count } = await this.prisma.passkeyChallenge.deleteMany({
      where: { challenge, purpose, employeeId, expiresAt: { gt: new Date() } },
    });
    return count === 1;
  }
}
