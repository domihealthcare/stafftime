import { ForbiddenException } from '@nestjs/common';
import { PAY_UNLOCK_MINUTES, PIN_REQUIRED, unlockedUntil, worthMoving } from './pay-lock';
import { PayLockGuard } from './pay-lock.guard';
import { hashToken } from '../auth/session.service';

const NOW = new Date('2026-10-23T15:00:00Z');

describe('the pay lock', () => {
  it('opens for ten minutes, and moves on only when it would move by more than a minute', () => {
    expect(unlockedUntil(NOW).getTime() - NOW.getTime()).toBe(PAY_UNLOCK_MINUTES * 60_000);
    expect(worthMoving(unlockedUntil(NOW), NOW)).toBe(false);
    expect(worthMoving(new Date(NOW.getTime() + 8 * 60_000), NOW)).toBe(true);
  });

  const contextFor = (sessionToken?: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ sessionToken }) }),
    }) as never;

  it('refuses with PIN_REQUIRED when the session was never unlocked, or the unlock ran out', async () => {
    for (const payUnlockedUntil of [null, new Date(Date.now() - 1000)]) {
      const prisma = {
        session: {
          findUnique: jest.fn().mockResolvedValue({ id: 's', payUnlockedUntil }),
          update: jest.fn(),
        },
      };
      const guard = new PayLockGuard(prisma as never);
      await expect(guard.canActivate(contextFor('token'))).rejects.toMatchObject({
        response: { code: PIN_REQUIRED },
      });
    }
    const guard = new PayLockGuard({ session: { findUnique: jest.fn() } } as never);
    await expect(guard.canActivate(contextFor(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('passes while unlocked, and keeps it open', async () => {
    const update = jest.fn();
    const prisma = {
      session: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 's', payUnlockedUntil: new Date(Date.now() + 2 * 60_000) }),
        update,
      },
    };
    await expect(new PayLockGuard(prisma as never).canActivate(contextFor('token'))).resolves.toBe(
      true,
    );
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('PayLockGuard, in detail', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
  const contextFor = (sessionToken?: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ sessionToken }) }) }) as never;

  function guardWith(session: { id: string; payUnlockedUntil: Date | null } | null) {
    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue(session),
        update: jest.fn().mockResolvedValue(session),
      },
    };
    return { guard: new PayLockGuard(prisma as never), prisma };
  }

  it('looks the session up by the hash of its token, never the token', async () => {
    const { guard, prisma } = guardWith({ id: 's', payUnlockedUntil: minutes(5) });
    await guard.canActivate(contextFor('the-token'));
    expect(prisma.session.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('the-token') },
      select: { id: true, payUnlockedUntil: true },
    });
  });

  it('slides the end to ten minutes from now while pay is in use', async () => {
    const { guard, prisma } = guardWith({ id: 's', payUnlockedUntil: minutes(3) });
    await expect(guard.canActivate(contextFor('token'))).resolves.toBe(true);
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 's' },
      data: { payUnlockedUntil: minutes(PAY_UNLOCK_MINUTES) },
    });
  });

  it('does not write on every request when the end would hardly move', async () => {
    const { guard, prisma } = guardWith({ id: 's', payUnlockedUntil: minutes(9.5) });
    await expect(guard.canActivate(contextFor('token'))).resolves.toBe(true);
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it('refuses at the very moment the unlock runs out', async () => {
    const { guard, prisma } = guardWith({ id: 's', payUnlockedUntil: minutes(0) });
    await expect(guard.canActivate(contextFor('token'))).rejects.toMatchObject({
      response: { code: PIN_REQUIRED, message: 'Enter your PIN to see pay.' },
    });
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it('refuses with 403 PIN_REQUIRED when the session is not found', async () => {
    const { guard } = guardWith(null);
    const refusal = guard.canActivate(contextFor('token'));
    await expect(refusal).rejects.toBeInstanceOf(ForbiddenException);
    await expect(refusal).rejects.toMatchObject({ status: 403, response: { code: PIN_REQUIRED } });
  });
});
