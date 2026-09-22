import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PasswordService } from '../auth/password.service';
import { SetupService } from './setup.service';

describe('SetupService', () => {
  const passwords = new PasswordService();
  const TOKEN = 'a-long-enough-setup-token';

  function build(options: { token?: string; admins?: number; emailTaken?: boolean } = {}) {
    const prisma = {
      employee: {
        count: jest.fn().mockResolvedValue(options.admins ?? 0),
        findUnique: jest.fn().mockResolvedValue(options.emailTaken ? { id: 'e-1' } : null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'e-1', email: data.email })),
      },
    };
    const config = new ConfigService(
      'token' in options ? { SETUP_TOKEN: options.token } : { SETUP_TOKEN: TOKEN },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new SetupService(prisma as any, passwords, config), prisma };
  }

  const details = {
    setupToken: TOKEN,
    email: 'Dominguez@DomiHealthcare.com',
    firstName: 'Anthony',
    lastName: 'Dominguez',
    password: 'harbour lantern tuesday',
  };

  describe('status', () => {
    it('asks for setup on a fresh database with a token configured', async () => {
      const { service } = build();
      await expect(service.status()).resolves.toEqual({ needsSetup: true });
    });

    it('does not ask once an administrator exists', async () => {
      const { service } = build({ admins: 1 });
      await expect(service.status()).resolves.toEqual({ needsSetup: false });
    });

    it('does not ask when no token is configured', async () => {
      const { service } = build({ token: undefined });
      await expect(service.status()).resolves.toEqual({ needsSetup: false });
    });

    it('ignores a token too short to be meaningful', async () => {
      const { service } = build({ token: 'short' });
      await expect(service.status()).resolves.toEqual({ needsSetup: false });
    });

    it('only counts administrators, not staff', async () => {
      const { service, prisma } = build();
      await service.status();
      expect(prisma.employee.count).toHaveBeenCalledWith({ where: { role: Role.ADMIN } });
    });
  });

  describe('creating the first administrator', () => {
    it('creates an active admin who does not have to change their password', async () => {
      const { service, prisma } = build();
      await service.createFirstAdmin(details);

      const data = prisma.employee.create.mock.calls[0][0].data;
      expect(data.role).toBe(Role.ADMIN);
      expect(data.employmentStatus).toBe('ACTIVE');
      expect(data.mustChangePassword).toBe(false);
      expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('normalises the email', async () => {
      const { service, prisma } = build();
      await service.createFirstAdmin(details);
      expect(prisma.employee.create.mock.calls[0][0].data.email).toBe(
        'dominguez@domihealthcare.com',
      );
    });

    it('never stores the password itself', async () => {
      const { service, prisma } = build();
      await service.createFirstAdmin(details);
      expect(JSON.stringify(prisma.employee.create.mock.calls[0][0])).not.toContain(
        details.password,
      );
    });
  });

  describe('what stops it being a back door', () => {
    it('does not exist when no token is configured', async () => {
      const { service } = build({ token: undefined });
      await expect(service.createFirstAdmin(details)).rejects.toThrow(NotFoundException);
    });

    it('refuses once any administrator exists', async () => {
      const { service } = build({ admins: 1 });
      await expect(service.createFirstAdmin(details)).rejects.toThrow(/already set up/);
    });

    it('checks for existing administrators before checking the token', async () => {
      // So a second run cannot be used to probe whether a guessed token is right.
      const { service } = build({ admins: 1 });
      await expect(
        service.createFirstAdmin({ ...details, setupToken: 'completely-wrong-token' }),
      ).rejects.toThrow(/already set up/);
    });

    it('refuses a wrong token', async () => {
      const { service, prisma } = build();
      await expect(
        service.createFirstAdmin({ ...details, setupToken: 'not-the-right-token' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.employee.create).not.toHaveBeenCalled();
    });

    it('refuses a token that merely starts correctly', async () => {
      const { service } = build();
      await expect(
        service.createFirstAdmin({ ...details, setupToken: TOKEN.slice(0, 10) }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('applies the password policy', async () => {
      const { service } = build();
      await expect(
        service.createFirstAdmin({ ...details, password: 'password1234' }),
      ).rejects.toThrow();
    });

    it('refuses an email that already has an account', async () => {
      const { service } = build({ emailTaken: true });
      await expect(service.createFirstAdmin(details)).rejects.toThrow(/already has an account/);
    });
  });
});
