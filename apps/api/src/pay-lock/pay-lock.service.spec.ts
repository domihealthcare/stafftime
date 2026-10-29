import { BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { hashToken } from '../auth/session.service';
import { PAY_UNLOCK_MINUTES } from './pay-lock';
import { PayLockService } from './pay-lock.service';

const NOW = new Date('2026-10-23T15:00:00.000Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

interface Person {
  id: string;
  pinHash: string | null;
  pinFailedAttempts: number;
  pinLockedUntil: Date | null;
  passwordHash: string | null;
}

function build(options: { person?: Partial<Person>; session?: { payUnlockedUntil: Date | null } }) {
  const person: Person = {
    id: 'emp-1',
    pinHash: 'pin-hash',
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    passwordHash: 'password-hash',
    ...options.person,
  };
  const session = { id: 'sess-1', payUnlockedUntil: null as Date | null, ...options.session };
  const prisma = {
    session: {
      findUnique: jest.fn(async () => ({ ...session })),
      update: jest.fn(async ({ data }: { data: { payUnlockedUntil: Date } }) => {
        session.payUnlockedUntil = data.payUnlockedUntil;
        return session;
      }),
      updateMany: jest.fn(async ({ data }: { data: { payUnlockedUntil: Date | null } }) => {
        session.payUnlockedUntil = data.payUnlockedUntil;
        return { count: 1 };
      }),
    },
    employee: {
      findUnique: jest.fn(async () => ({ ...person })),
      // The database's own increment, as at the time clock.
      update: jest.fn(
        async ({ data }: { data: Record<string, unknown> & { pinFailedAttempts?: unknown } }) => {
          const attempts = data.pinFailedAttempts;
          if (typeof attempts === 'number') person.pinFailedAttempts = attempts;
          else if (attempts && typeof attempts === 'object') person.pinFailedAttempts += 1;
          if ('pinLockedUntil' in data) person.pinLockedUntil = data.pinLockedUntil as Date | null;
          return { pinFailedAttempts: person.pinFailedAttempts };
        },
      ),
    },
  };
  const pins = { verify: jest.fn(async (pin: string) => pin === '2580') };
  const passwords = {
    check: jest.fn(async (_account: unknown, password: string) =>
      password === 'right' ? { kind: 'right' } : { kind: 'wrong' },
    ),
  };
  const config = {
    get: jest.fn((key: string, fallback: number) =>
      key === 'MAX_PIN_ATTEMPTS' ? 3 : key === 'PIN_LOCKOUT_MINUTES' ? 10 : fallback,
    ),
  };
  const service = new PayLockService(
    prisma as never,
    pins as never,
    passwords as never,
    config as never,
  );
  return { service, prisma, pins, passwords, person, session };
}

describe('PayLockService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('status', () => {
    it('is locked until unlocked, saying whether they have a PIN', async () => {
      const { service, prisma } = build({});
      await expect(service.status('token', 'emp-1')).resolves.toEqual({
        unlocked: false,
        until: null,
        hasPin: true,
        minutes: PAY_UNLOCK_MINUTES,
      });
      expect(prisma.session.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashToken('token') } }),
      );
    });

    it('is open until the end, and shut once it has passed', async () => {
      const open = build({ session: { payUnlockedUntil: minutes(4) } });
      await expect(open.service.status('token', 'emp-1')).resolves.toMatchObject({
        unlocked: true,
        until: minutes(4).toISOString(),
      });
      const shut = build({ session: { payUnlockedUntil: minutes(-1) } });
      await expect(shut.service.status('token', 'emp-1')).resolves.toMatchObject({
        unlocked: false,
        until: null,
      });
    });

    it('says when somebody has no PIN, so the screen offers the password', async () => {
      const { service } = build({ person: { pinHash: null } });
      await expect(service.status('token', 'emp-1')).resolves.toMatchObject({ hasPin: false });
    });
  });

  describe('unlock with the PIN', () => {
    it('opens this session for ten minutes and clears the count', async () => {
      const { service, prisma, person, session } = build({ person: { pinFailedAttempts: 2 } });
      await expect(service.unlock('token', 'emp-1', { pin: '2580' })).resolves.toMatchObject({
        unlocked: true,
        until: minutes(PAY_UNLOCK_MINUTES).toISOString(),
      });
      expect(session.payUnlockedUntil).toEqual(minutes(PAY_UNLOCK_MINUTES));
      // Only this session, and only while it is still signed in.
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: hashToken('token'), revokedAt: null },
        data: { payUnlockedUntil: minutes(PAY_UNLOCK_MINUTES) },
      });
      expect(person.pinFailedAttempts).toBe(0);
    });

    it('refuses a wrong PIN, counting it, and opens nothing', async () => {
      const { service, person, session } = build({});
      await expect(service.unlock('token', 'emp-1', { pin: '1111' })).rejects.toThrow(
        'That PIN is not right.',
      );
      expect(person.pinFailedAttempts).toBe(1);
      expect(session.payUnlockedUntil).toBeNull();
    });

    it('counts the guess before checking it, with the database increment', async () => {
      const { service, prisma } = build({});
      await service.unlock('token', 'emp-1', { pin: '1111' }).catch(() => undefined);
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { pinFailedAttempts: { increment: 1 } } }),
      );
    });

    it('locks the PIN on the last wrong guess allowed', async () => {
      const { service, person } = build({ person: { pinFailedAttempts: 2 } });
      await expect(service.unlock('token', 'emp-1', { pin: '1111' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(person.pinLockedUntil).toEqual(minutes(10));
    });

    it('refuses while locked, even the right PIN, without checking it', async () => {
      const { service, pins, session } = build({ person: { pinLockedUntil: minutes(3) } });
      await expect(service.unlock('token', 'emp-1', { pin: '2580' })).rejects.toThrow(
        'Too many incorrect PINs. Try again in 3 minutes, or use your password.',
      );
      expect(pins.verify).not.toHaveBeenCalled();
      expect(session.payUnlockedUntil).toBeNull();
    });

    it('refuses a guess past the limit that arrived with others, without checking it', async () => {
      const { service, pins } = build({ person: { pinFailedAttempts: 3 } });
      await expect(service.unlock('token', 'emp-1', { pin: '2580' })).rejects.toThrow(
        /Too many incorrect PINs/,
      );
      expect(pins.verify).not.toHaveBeenCalled();
    });

    it('starts the count afresh once a lockout has run out', async () => {
      const { service, person, session } = build({
        person: { pinFailedAttempts: 3, pinLockedUntil: minutes(-1) },
      });
      await service.unlock('token', 'emp-1', { pin: '2580' });
      expect(session.payUnlockedUntil).toEqual(minutes(PAY_UNLOCK_MINUTES));
      expect(person.pinFailedAttempts).toBe(0);
      expect(person.pinLockedUntil).toBeNull();
    });

    it('points somebody with no PIN to their password', async () => {
      const { service } = build({ person: { pinHash: null } });
      await expect(service.unlock('token', 'emp-1', { pin: '2580' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('unlock with the password', () => {
    it('opens it for the right password, through the sign-in lockout', async () => {
      const { service, passwords, session } = build({});
      await service.unlock('token', 'emp-1', { password: 'right' });
      expect(passwords.check).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'emp-1', passwordHash: 'password-hash' }),
        'right',
      );
      expect(session.payUnlockedUntil).toEqual(minutes(PAY_UNLOCK_MINUTES));
    });

    it('refuses a wrong password, or one while the account is locked', async () => {
      const wrong = build({});
      await expect(wrong.service.unlock('token', 'emp-1', { password: 'nope' })).rejects.toThrow(
        'That password is not right.',
      );
      expect(wrong.session.payUnlockedUntil).toBeNull();

      const locked = build({});
      locked.passwords.check.mockResolvedValue({
        kind: 'locked',
        message: 'Too many failed attempts.',
      } as never);
      await expect(locked.service.unlock('token', 'emp-1', { password: 'right' })).rejects.toThrow(
        'Too many failed attempts.',
      );
      expect(locked.session.payUnlockedUntil).toBeNull();
    });

    it('refuses an account with no password at all', async () => {
      const { service, passwords } = build({ person: { passwordHash: null } });
      await expect(service.unlock('token', 'emp-1', { password: 'right' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(passwords.check).not.toHaveBeenCalled();
    });

    it('asks for something when given nothing', async () => {
      const { service } = build({});
      await expect(service.unlock('token', 'emp-1', {})).rejects.toThrow('Enter your PIN.');
    });
  });

  describe('keeping it open, and shutting it', () => {
    it('slides the end on while pay is in use, ten minutes from the last use', async () => {
      const { service, session } = build({ session: { payUnlockedUntil: minutes(2) } });
      await service.touch('token', 'emp-1');
      expect(session.payUnlockedUntil).toEqual(minutes(PAY_UNLOCK_MINUTES));
    });

    it('does not write when the end would hardly move', async () => {
      const { service, prisma } = build({ session: { payUnlockedUntil: minutes(9.5) } });
      await service.touch('token', 'emp-1');
      expect(prisma.session.update).not.toHaveBeenCalled();
    });

    it('never reopens one that has shut', async () => {
      const { service, prisma } = build({ session: { payUnlockedUntil: minutes(-1) } });
      await expect(service.touch('token', 'emp-1')).resolves.toMatchObject({ unlocked: false });
      expect(prisma.session.update).not.toHaveBeenCalled();
    });

    it('shuts it at once on Lock pay now', async () => {
      const { service, session } = build({ session: { payUnlockedUntil: minutes(5) } });
      await expect(service.lock('token')).resolves.toEqual({ locked: true });
      expect(session.payUnlockedUntil).toBeNull();
    });

    it('shuts by itself ten minutes after the last use', async () => {
      const { service } = build({});
      await service.unlock('token', 'emp-1', { pin: '2580' });
      jest.setSystemTime(minutes(PAY_UNLOCK_MINUTES - 1));
      await expect(service.status('token', 'emp-1')).resolves.toMatchObject({ unlocked: true });
      jest.setSystemTime(minutes(PAY_UNLOCK_MINUTES + 1));
      await expect(service.status('token', 'emp-1')).resolves.toMatchObject({ unlocked: false });
    });
  });
});
