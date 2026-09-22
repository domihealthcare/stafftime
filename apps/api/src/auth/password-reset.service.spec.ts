import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';

const SAME_ANSWER = 'If that address belongs to a Domi account, a reset link is on its way.';

describe('PasswordResetService', () => {
  const config = new ConfigService({ APP_URL: 'https://staff.domihealthcare.com/' });
  const passwords = new PasswordService();

  function build(
    options: {
      employee?: unknown;
      recentCount?: number;
      token?: unknown;
    } = {},
  ) {
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(
          options.employee === undefined
            ? {
                id: 'emp-1',
                email: 'frankie@domihealthcare.com',
                firstName: 'Frankie',
                employmentStatus: 'ACTIVE',
              }
            : options.employee,
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      passwordResetToken: {
        count: jest.fn().mockResolvedValue(options.recentCount ?? 0),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'tok-1', ...data })),
        findUnique: jest.fn().mockResolvedValue(options.token ?? null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const sessions = { revokeAllForEmployee: jest.fn().mockResolvedValue(2) };
    const notifications = { passwordReset: jest.fn() };

    return {
      service: new PasswordResetService(
        prisma as never,
        passwords,
        sessions as never,
        notifications as never,
        config,
      ),
      prisma,
      sessions,
      notifications,
    };
  }

  const validToken = (over: Record<string, unknown> = {}) => ({
    id: 'tok-1',
    employeeId: 'emp-1',
    usedAt: null,
    expiresAt: new Date(Date.now() + 600_000),
    employee: { id: 'emp-1', email: 'frankie@domihealthcare.com', employmentStatus: 'ACTIVE' },
    ...over,
  });

  describe('asking for a link', () => {
    it('emails a single-use link built on the deployment address', async () => {
      const { service, notifications, prisma } = build();
      await service.request('frankie@domihealthcare.com', '203.0.113.7');

      const [to, firstName, link, minutes] = notifications.passwordReset.mock.calls[0];
      expect(to).toBe('frankie@domihealthcare.com');
      expect(firstName).toBe('Frankie');
      expect(minutes).toBe(30);
      expect(link).toMatch(
        /^https:\/\/staff\.domihealthcare\.com\/reset-password\?token=[A-Za-z0-9_-]{43}$/,
      );

      // The link that went out is never the thing in the database.
      const stored = prisma.passwordResetToken.create.mock.calls[0][0].data.tokenHash;
      const sent = new URL(link).searchParams.get('token')!;
      expect(stored).not.toBe(sent);
      expect(stored).toBe(createHash('sha256').update(sent).digest('hex'));
    });

    it('records where the request came from', async () => {
      const { service, prisma } = build();
      await service.request('frankie@domihealthcare.com', '203.0.113.7');

      expect(prisma.passwordResetToken.create.mock.calls[0][0].data.requestedIp).toBe(
        '203.0.113.7',
      );
    });

    it('normalises the address, so case and spaces still find the account', async () => {
      const { service, prisma } = build();
      await service.request('  Frankie@DomiHealthcare.com  ');

      expect(prisma.employee.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'frankie@domihealthcare.com' } }),
      );
    });

    it('says exactly the same thing for an address with no account', async () => {
      const known = build();
      const unknown = build({ employee: null });

      await expect(known.service.request('frankie@domihealthcare.com')).resolves.toEqual({
        message: SAME_ANSWER,
      });
      await expect(unknown.service.request('nobody@domihealthcare.com')).resolves.toEqual({
        message: SAME_ANSWER,
      });
      expect(unknown.notifications.passwordReset).not.toHaveBeenCalled();
    });

    it('does not let somebody who has left back in, and does not say so', async () => {
      const { service, notifications } = build({
        employee: {
          id: 'emp-9',
          email: 'gone@domihealthcare.com',
          firstName: 'Gone',
          employmentStatus: 'TERMINATED',
        },
      });

      await expect(service.request('gone@domihealthcare.com')).resolves.toEqual({
        message: SAME_ANSWER,
      });
      expect(notifications.passwordReset).not.toHaveBeenCalled();
    });

    it('stops the form being used to bombard somebody', async () => {
      const { service, notifications } = build({ recentCount: 5 });
      await expect(service.request('frankie@domihealthcare.com')).resolves.toEqual({
        message: SAME_ANSWER,
      });
      expect(notifications.passwordReset).not.toHaveBeenCalled();
    });
  });

  describe('spending a link', () => {
    it('sets the password and signs every session out', async () => {
      const { service, prisma, sessions } = build({ token: validToken() });
      await expect(service.complete('a-token', 'harbour lantern tuesday')).resolves.toEqual({
        email: 'frankie@domihealthcare.com',
      });

      const [update] = prisma.$transaction.mock.calls[0][0];
      expect(update).toBeDefined();
      // Nobody stays signed in, including the browser doing the resetting: if
      // somebody else had the old password, leaving them signed in defeats it.
      expect(sessions.revokeAllForEmployee).toHaveBeenCalledWith('emp-1');
    });

    it('looks the token up by its hash, never by the value in the link', async () => {
      const { service, prisma } = build({ token: validToken() });
      await service.complete('a-token', 'harbour lantern tuesday');

      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: createHash('sha256').update('a-token').digest('hex') },
        }),
      );
    });

    it('spends every other outstanding link for that account at the same time', async () => {
      const { service, prisma } = build({ token: validToken() });
      await service.complete('a-token', 'harbour lantern tuesday');

      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: 'emp-1', usedAt: null } }),
      );
    });

    it('gives one message for expired, spent and never-existed alike', async () => {
      const cases = [
        build({ token: null }),
        build({ token: validToken({ usedAt: new Date() }) }),
        build({ token: validToken({ expiresAt: new Date(Date.now() - 1000) }) }),
        build({
          token: validToken({
            employee: { id: 'emp-1', email: 'x@y.com', employmentStatus: 'TERMINATED' },
          }),
        }),
      ];

      for (const { service } of cases) {
        await expect(service.complete('a-token', 'harbour lantern tuesday')).rejects.toThrow(
          'That link has expired or has already been used. Ask for a new one.',
        );
      }
    });

    it('applies the same password policy as everywhere else', async () => {
      const { service, sessions } = build({ token: validToken() });
      await expect(service.complete('a-token', 'password123')).rejects.toThrow(
        BadRequestException,
      );
      expect(sessions.revokeAllForEmployee).not.toHaveBeenCalled();
    });
  });

  describe('housekeeping', () => {
    it('clears links that are expired or already spent', async () => {
      const { service, prisma } = build();
      await expect(service.purgeExpired()).resolves.toBe(3);

      const where = prisma.passwordResetToken.deleteMany.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(2);
    });
  });
});
