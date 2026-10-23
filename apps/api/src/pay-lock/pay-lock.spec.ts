import { ForbiddenException } from '@nestjs/common';
import { PAY_UNLOCK_MINUTES, PIN_REQUIRED, unlockedUntil, worthMoving } from './pay-lock';
import { PayLockGuard } from './pay-lock.guard';

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
