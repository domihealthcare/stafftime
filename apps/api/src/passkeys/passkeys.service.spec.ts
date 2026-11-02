import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { hashToken } from '../auth/session.service';
import { passkeySite } from './passkey-site';
import { PASSWORD_NEEDED, signedInJustNow } from './passkeys';
import { PasskeysService } from './passkeys.service';

jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(async (options: Record<string, unknown>) => ({
    challenge: 'reg-challenge',
    ...options,
  })),
  generateAuthenticationOptions: jest.fn(async (options: Record<string, unknown>) => ({
    challenge: 'auth-challenge',
    ...options,
  })),
  verifyRegistrationResponse: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));

const webauthn = jest.requireMock('@simplewebauthn/server');

const SITE = { origin: 'https://staff.domihealthcare.com', rpID: 'staff.domihealthcare.com' };

function build(
  options: {
    sessionCreatedAt?: Date;
    shared?: boolean;
    passkey?: Record<string, unknown> | null;
    challengeSpent?: number;
  } = {},
) {
  const prisma = {
    employee: {
      findUnique: jest.fn(async () => ({
        id: 'emp-1',
        email: 'frankie@domihealthcare.com',
        firstName: 'Frances',
        preferredName: 'Frankie',
        lastName: 'Okafor',
        isSharedAccount: options.shared ?? false,
        passwordHash: 'hash',
        failedLoginAttempts: 0,
        lockedUntil: null,
      })),
      update: jest.fn(async () => ({})),
    },
    session: {
      findUnique: jest.fn(async () => ({
        createdAt: options.sessionCreatedAt ?? new Date(),
      })),
    },
    passkey: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () =>
        options.passkey === undefined
          ? {
              id: 'pk-1',
              employeeId: 'emp-1',
              credentialId: 'cred-1',
              publicKey: Buffer.from([1, 2, 3]),
              counter: BigInt(0),
              transports: ['internal'],
              employee: { employmentStatus: 'ACTIVE' },
            }
          : options.passkey,
      ),
      create: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      count: jest.fn(async () => 0),
    },
    passkeyChallenge: {
      create: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: options.challengeSpent ?? 1 })),
    },
  };
  const sessions = { issue: jest.fn(async () => ({ token: 'new', expiresAt: new Date() })) };
  const guesses = {
    check: jest.fn(async (_account: unknown, password: string) =>
      password === 'right' ? { kind: 'right' } : { kind: 'wrong' },
    ),
  };
  const throttle = { assertNotThrottled: jest.fn(async () => undefined) };
  const notifications = { personal: jest.fn(async () => undefined) };
  const service = new PasskeysService(
    prisma as never,
    sessions as never,
    guesses as never,
    throttle as never,
    notifications as never,
  );
  return { service, prisma, sessions, guesses, throttle, notifications };
}

/// Runs the challenge check the library would run, so `spend` is exercised.
function verifiesWith(result: Record<string, unknown>) {
  return async (args: { expectedChallenge: (challenge: string) => Promise<boolean> }) => {
    if (!(await args.expectedChallenge('the-challenge'))) throw new Error('challenge');
    return result;
  };
}

beforeEach(() => jest.clearAllMocks());

describe('passkeySite', () => {
  it('takes the browser origin when it names the host the request went to', () => {
    expect(
      passkeySite({ origin: 'https://staff.domihealthcare.com', host: 'staff.domihealthcare.com' }),
    ).toEqual(SITE);
  });

  it('accepts the dev proxy forwarding the host', () => {
    expect(
      passkeySite({
        origin: 'http://localhost:5173',
        host: 'localhost:3000',
        'x-forwarded-host': 'localhost:5173',
      }),
    ).toEqual({ origin: 'http://localhost:5173', rpID: 'localhost' });
  });

  it('refuses another site, or no origin at all', () => {
    expect(
      passkeySite({ origin: 'https://www.domihealthcare.com', host: 'staff.domihealthcare.com' }),
    ).toBeNull();
    expect(passkeySite({ host: 'staff.domihealthcare.com' })).toBeNull();
  });
});

describe('signedInJustNow', () => {
  it('is ten minutes', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    expect(signedInJustNow(new Date('2026-11-02T11:51:00Z'), now)).toBe(true);
    expect(signedInJustNow(new Date('2026-11-02T11:49:00Z'), now)).toBe(false);
  });
});

describe('PasskeysService', () => {
  describe('setting Face ID up', () => {
    it('needs no password just after signing in, and asks the phone to check the face', async () => {
      const { service, prisma } = build();
      const options = await service.registrationOptions('emp-1', 'tok', SITE);
      expect(prisma.session.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashToken('tok') } }),
      );
      expect(options).toMatchObject({
        rpID: 'staff.domihealthcare.com',
        userName: 'frankie@domihealthcare.com',
        userDisplayName: 'Frankie Okafor',
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      });
      expect(prisma.passkeyChallenge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          challenge: 'reg-challenge',
          purpose: 'REGISTER',
          employeeId: 'emp-1',
        }),
      });
    });

    it('asks for the password on a browser signed in a while ago', async () => {
      const { service } = build({ sessionCreatedAt: new Date(Date.now() - 60 * 60_000) });
      const refused = service.registrationOptions('emp-1', 'tok', SITE);
      await expect(refused).rejects.toBeInstanceOf(ForbiddenException);
      await expect(refused).rejects.toMatchObject({ response: { code: PASSWORD_NEEDED } });
    });

    it('takes the right password then, through the sign-in lockout, and refuses a wrong one', async () => {
      const { service, guesses } = build({ sessionCreatedAt: new Date(Date.now() - 60 * 60_000) });
      await expect(
        service.registrationOptions('emp-1', 'tok', SITE, 'right'),
      ).resolves.toBeTruthy();
      await expect(
        service.registrationOptions('emp-1', 'tok', SITE, 'wrong'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(guesses.check).toHaveBeenCalledTimes(2);
    });

    it('is not for a shared account', async () => {
      const { service } = build({ shared: true });
      await expect(service.registrationOptions('emp-1', 'tok', SITE)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('keeps only the public key, and tells the person', async () => {
      const { service, prisma, notifications } = build();
      webauthn.verifyRegistrationResponse.mockImplementation(
        verifiesWith({
          verified: true,
          registrationInfo: {
            credential: { id: 'cred-9', publicKey: new Uint8Array([9]), counter: 0 },
            credentialBackedUp: true,
          },
        }),
      );
      await service.register('emp-1', { id: 'cred-9' } as never, SITE, 'Safari');
      expect(prisma.passkeyChallenge.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          challenge: 'the-challenge',
          purpose: 'REGISTER',
          employeeId: 'emp-1',
        }),
      });
      expect(prisma.passkey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          employeeId: 'emp-1',
          credentialId: 'cred-9',
          backedUp: true,
          userAgent: 'Safari',
        }),
      });
      expect(notifications.personal).toHaveBeenCalledWith(
        ['emp-1'],
        'ACCOUNT',
        expect.objectContaining({ link: '/profile' }),
      );
    });

    it('refuses a challenge that was used already or ran out', async () => {
      const { service, prisma } = build({ challengeSpent: 0 });
      webauthn.verifyRegistrationResponse.mockImplementation(
        verifiesWith({ verified: true, registrationInfo: {} }),
      );
      await expect(service.register('emp-1', {} as never, SITE, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.passkey.create).not.toHaveBeenCalled();
    });
  });

  describe('signing in', () => {
    it('opens a session marked as Face ID for the passkey that answered', async () => {
      const { service, sessions, prisma } = build();
      webauthn.verifyAuthenticationResponse.mockImplementation(
        verifiesWith({ verified: true, authenticationInfo: { newCounter: 0 } }),
      );
      await service.signIn({ id: 'cred-1' } as never, SITE, { ipAddress: '1.2.3.4' });
      expect(prisma.passkeyChallenge.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ purpose: 'SIGN_IN', employeeId: null }),
      });
      expect(sessions.issue).toHaveBeenCalledWith('emp-1', {
        ipAddress: '1.2.3.4',
        viaPasskey: true,
      });
      expect(prisma.passkey.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pk-1' } }),
      );
    });

    it('asks the phone to check the face every time', async () => {
      const { service } = build();
      await service.signInOptions(SITE, '1.2.3.4');
      expect(webauthn.generateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({ userVerification: 'required' }),
      );
      webauthn.verifyAuthenticationResponse.mockImplementation(
        verifiesWith({ verified: true, authenticationInfo: { newCounter: 0 } }),
      );
      await service.signIn({ id: 'cred-1' } as never, SITE, {});
      expect(webauthn.verifyAuthenticationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          requireUserVerification: true,
          expectedOrigin: SITE.origin,
          expectedRPID: SITE.rpID,
        }),
      );
    });

    it('refuses a passkey that is not kept any more', async () => {
      const { service, sessions } = build({ passkey: null });
      await expect(service.signIn({ id: 'gone' } as never, SITE, {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessions.issue).not.toHaveBeenCalled();
    });

    it('refuses a failed check', async () => {
      const { service, sessions } = build();
      webauthn.verifyAuthenticationResponse.mockRejectedValue(new Error('bad signature'));
      await expect(service.signIn({ id: 'cred-1' } as never, SITE, {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessions.issue).not.toHaveBeenCalled();
    });

    it('refuses somebody who has left', async () => {
      const { service, sessions } = build({
        passkey: {
          id: 'pk-1',
          employeeId: 'emp-1',
          credentialId: 'cred-1',
          publicKey: Buffer.from([1]),
          counter: BigInt(0),
          transports: [],
          employee: { employmentStatus: 'TERMINATED' },
        },
      });
      webauthn.verifyAuthenticationResponse.mockImplementation(
        verifiesWith({ verified: true, authenticationInfo: { newCounter: 0 } }),
      );
      await expect(service.signIn({ id: 'cred-1' } as never, SITE, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(sessions.issue).not.toHaveBeenCalled();
    });
  });

  describe('opening pay', () => {
    it("offers only the person's own passkeys", async () => {
      const { service, prisma } = build();
      prisma.passkey.findMany.mockResolvedValueOnce([
        { credentialId: 'cred-1', transports: ['internal'] },
      ] as never);
      await service.payOptions('emp-1', SITE);
      expect(webauthn.generateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          allowCredentials: [{ id: 'cred-1', transports: ['internal'] }],
        }),
      );
    });

    it("refuses somebody else's passkey", async () => {
      const { service } = build();
      await expect(
        service.proveForPay('emp-2', { id: 'cred-1' } as never, SITE),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('accepts their own, against a challenge made for pay', async () => {
      const { service, prisma } = build();
      webauthn.verifyAuthenticationResponse.mockImplementation(
        verifiesWith({ verified: true, authenticationInfo: { newCounter: 0 } }),
      );
      await service.proveForPay('emp-1', { id: 'cred-1' } as never, SITE);
      expect(prisma.passkeyChallenge.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ purpose: 'PAY', employeeId: 'emp-1' }),
      });
    });
  });

  it('removes only your own', async () => {
    const { service, prisma } = build();
    await service.remove('emp-1', 'pk-1');
    expect(prisma.passkey.deleteMany).toHaveBeenCalledWith({
      where: { id: 'pk-1', employeeId: 'emp-1' },
    });
  });
});
