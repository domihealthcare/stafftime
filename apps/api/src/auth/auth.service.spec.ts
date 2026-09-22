import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

/**
 * The rules that decide whether someone gets in. Prisma and the session store
 * are stubbed; what is under test is the decision logic and, importantly, what
 * a failure does and does not reveal.
 */
describe('AuthService', () => {
  const config = new ConfigService({ MAX_LOGIN_ATTEMPTS: 3, LOCKOUT_MINUTES: 15 });
  const passwords = new PasswordService();

  let goodHash: string;
  beforeAll(async () => {
    goodHash = await passwords.hash('breakfast tuesday lamp');
  });

  function build(employee: Record<string, unknown> | null) {
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(employee),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const sessions = {
      issue: jest.fn().mockResolvedValue({ token: 'tok', expiresAt: new Date() }),
      revoke: jest.fn().mockResolvedValue(undefined),
      revokeAllForEmployee: jest.fn().mockResolvedValue(2),
    };
    const throttle = {
      assertNotThrottled: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      passwords,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sessions as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throttle as any,
      config,
    );
    return { service, prisma, sessions, throttle };
  }

  const active = () => ({
    id: 'emp-1',
    email: 'frankie@domihealthcare.com',
    firstName: 'Frankie',
    lastName: 'Front-Desk',
    passwordHash: goodHash,
    employmentStatus: 'ACTIVE',
    failedLoginAttempts: 0,
    lockedUntil: null,
  });

  describe('login', () => {
    it('issues a session for the right password', async () => {
      const { service, sessions } = build(active());
      await service.login('frankie@domihealthcare.com', 'breakfast tuesday lamp', {});
      expect(sessions.issue).toHaveBeenCalledWith('emp-1', {});
    });

    it('normalises the email, so case and stray spaces still sign in', async () => {
      const { service, prisma } = build(active());
      await service.login('  Frankie@DomiHealthcare.com ', 'breakfast tuesday lamp', {});
      expect(prisma.employee.findUnique.mock.calls[0][0].where.email).toBe(
        'frankie@domihealthcare.com',
      );
    });

    it('clears the failure counter on success', async () => {
      const { service, prisma } = build({ ...active(), failedLoginAttempts: 2 });
      await service.login('frankie@domihealthcare.com', 'breakfast tuesday lamp', {});
      expect(prisma.employee.update.mock.calls[0][0].data).toMatchObject({
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
    });

    it('rejects the wrong password', async () => {
      const { service } = build(active());
      await expect(
        service.login('frankie@domihealthcare.com', 'wrong', {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('gives the same message for an unknown account as for a wrong password', async () => {
      const unknown = build(null);
      const wrong = build(active());

      const unknownError = await unknown.service
        .login('nobody@domihealthcare.com', 'whatever', {})
        .catch((e: Error) => e.message);
      const wrongError = await wrong.service
        .login('frankie@domihealthcare.com', 'wrong', {})
        .catch((e: Error) => e.message);

      expect(unknownError).toBe(wrongError);
    });

    it('does the same hashing work for an unknown account, so timing does not leak', async () => {
      const { service } = build(null);
      const started = Date.now();
      await service.login('nobody@domihealthcare.com', 'whatever', {}).catch(() => undefined);
      // A skipped verify would return in well under a millisecond.
      expect(Date.now() - started).toBeGreaterThan(5);
    });

    it('treats an account with no password set as a failed sign-in', async () => {
      const { service } = build({ ...active(), passwordHash: null });
      await expect(service.login('frankie@domihealthcare.com', 'x', {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('counts a failure', async () => {
      const { service, prisma } = build({ ...active(), failedLoginAttempts: 0 });
      await service.login('frankie@domihealthcare.com', 'wrong', {}).catch(() => undefined);
      expect(prisma.employee.update.mock.calls[0][0].data.failedLoginAttempts).toBe(1);
    });

    it('records the failure against the address as well as the account', async () => {
      const { service, throttle } = build({ ...active(), failedLoginAttempts: 0 });
      await service
        .login('frankie@domihealthcare.com', 'wrong', { ipAddress: '203.0.113.7' })
        .catch(() => undefined);

      expect(throttle.recordFailure).toHaveBeenCalledWith(
        'frankie@domihealthcare.com',
        '203.0.113.7',
      );
    });

    it('records a failure for an unknown account too, so spraying is counted', async () => {
      const { service, throttle } = build(null);
      await service
        .login('nobody@domihealthcare.com', 'whatever', { ipAddress: '203.0.113.7' })
        .catch(() => undefined);

      expect(throttle.recordFailure).toHaveBeenCalledWith(
        'nobody@domihealthcare.com',
        '203.0.113.7',
      );
    });

    it('checks the address throttle before doing any password work', async () => {
      const { service, prisma, throttle } = build(active());
      throttle.assertNotThrottled.mockRejectedValue(new Error('throttled'));

      await expect(
        service.login('frankie@domihealthcare.com', 'breakfast tuesday lamp', {
          ipAddress: '203.0.113.7',
        }),
      ).rejects.toThrow('throttled');

      // Not even a lookup: a throttled address costs nothing to refuse.
      expect(prisma.employee.findUnique).not.toHaveBeenCalled();
    });

    it('locks the account at the configured attempt limit', async () => {
      const { service, prisma } = build({ ...active(), failedLoginAttempts: 2 });
      await service.login('frankie@domihealthcare.com', 'wrong', {}).catch(() => undefined);
      expect(prisma.employee.update.mock.calls[0][0].data.lockedUntil).toBeInstanceOf(Date);
    });

    it('refuses while locked, even with the correct password', async () => {
      const { service, sessions } = build({
        ...active(),
        lockedUntil: new Date(Date.now() + 10 * 60_000),
      });
      await expect(
        service.login('frankie@domihealthcare.com', 'breakfast tuesday lamp', {}),
      ).rejects.toThrow(/Too many failed attempts/);
      expect(sessions.issue).not.toHaveBeenCalled();
    });

    it('lets a lapsed lockout through again', async () => {
      const { service, sessions } = build({
        ...active(),
        lockedUntil: new Date(Date.now() - 1000),
      });
      await service.login('frankie@domihealthcare.com', 'breakfast tuesday lamp', {});
      expect(sessions.issue).toHaveBeenCalled();
    });

    it('refuses a terminated employee — but only after the password checks out', async () => {
      const { service } = build({ ...active(), employmentStatus: 'TERMINATED' });

      // Correct password: told the account is closed.
      await expect(
        service.login('frankie@domihealthcare.com', 'breakfast tuesday lamp', {}),
      ).rejects.toThrow(ForbiddenException);

      // Wrong password: indistinguishable from any other failure, so the status
      // of a former employee cannot be probed.
      await expect(service.login('frankie@domihealthcare.com', 'wrong', {})).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('changePassword', () => {
    it('requires the current password', async () => {
      const { service } = build(active());
      await expect(
        service.changePassword('emp-1', 'wrong', 'a whole new passphrase', 'tok'),
      ).rejects.toThrow(/current password is incorrect/);
    });

    it('refuses a new password that fails the policy', async () => {
      const { service } = build(active());
      await expect(
        service.changePassword('emp-1', 'breakfast tuesday lamp', 'short', 'tok'),
      ).rejects.toThrow(/12 characters/);
    });

    it('refuses reusing the current password', async () => {
      const { service } = build(active());
      await expect(
        service.changePassword(
          'emp-1',
          'breakfast tuesday lamp',
          'breakfast tuesday lamp',
          'tok',
        ),
      ).rejects.toThrow(/different from the current one/);
    });

    it('stores a new hash and clears the must-change flag', async () => {
      const { service, prisma } = build(active());
      await service.changePassword('emp-1', 'breakfast tuesday lamp', 'a whole new phrase', 'tok');

      const data = prisma.employee.update.mock.calls[0][0].data;
      expect(data.passwordHash).toMatch(/^\$argon2id\$/);
      expect(data.passwordHash).not.toBe(goodHash);
      expect(data.mustChangePassword).toBe(false);
    });

    it('signs out other browsers but keeps the current one', async () => {
      const { service, sessions } = build(active());
      const result = await service.changePassword(
        'emp-1',
        'breakfast tuesday lamp',
        'a whole new phrase',
        'current-token',
      );
      expect(sessions.revokeAllForEmployee).toHaveBeenCalledWith('emp-1', 'current-token');
      expect(result.otherSessionsSignedOut).toBe(2);
    });
  });

  describe('setTemporaryPassword', () => {
    it('forces a change at next sign-in', async () => {
      const { service, prisma } = build(active());
      await service.setTemporaryPassword('emp-1', 'temporary welcome phrase');
      expect(prisma.employee.update.mock.calls[0][0].data.mustChangePassword).toBe(true);
    });

    it('signs out every existing session', async () => {
      const { service, sessions } = build(active());
      await service.setTemporaryPassword('emp-1', 'temporary welcome phrase');
      expect(sessions.revokeAllForEmployee).toHaveBeenCalledWith('emp-1');
    });

    it('applies the password policy to admin-set passwords too', async () => {
      const { service } = build(active());
      await expect(service.setTemporaryPassword('emp-1', 'password123')).rejects.toThrow();
    });
  });
});
