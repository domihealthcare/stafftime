import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthController } from './auth.controller';
import { SessionService, hashToken } from './session.service';

/// "Where you're signed in" on Your profile (October 2026): the list marks
/// the browser asking, never sends the IP address, and one other browser can
/// be signed out on its own.
describe('Where you are signed in', () => {
  const config = new ConfigService({
    SESSION_TTL_HOURS: 12,
    SESSION_IDLE_TIMEOUT_HOURS: 8,
  });

  function build(rows: unknown[] = [], found: unknown = null, revoked = 1) {
    const prisma = {
      session: {
        findMany: jest.fn().mockResolvedValue(rows),
        findFirst: jest.fn().mockResolvedValue(found),
        updateMany: jest.fn().mockResolvedValue({ count: revoked }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new SessionService(prisma as any, config), prisma };
  }

  const row = (id: string, token: string) => ({
    id,
    createdAt: new Date('2026-10-28T13:00:00Z'),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
    userAgent: 'Mozilla/5.0',
    tokenHash: hashToken(token),
  });

  describe('listing', () => {
    it('marks the session asking as current, and only that one', async () => {
      const { service } = build([row('a', 'mine'), row('b', 'theirs')]);
      const list = await service.listForEmployee('emp-1', 'mine');
      expect(list.map((s) => [s.id, s.current])).toEqual([
        ['a', true],
        ['b', false],
      ]);
    });

    it('marks none as current without a token', async () => {
      const { service } = build([row('a', 'mine')]);
      const [only] = await service.listForEmployee('emp-1');
      expect(only.current).toBe(false);
    });

    it('sends neither the token hash nor the IP address to the browser', async () => {
      const { service, prisma } = build([row('a', 'mine')]);
      const [only] = await service.listForEmployee('emp-1', 'mine');
      expect(only).not.toHaveProperty('tokenHash');
      expect(only).not.toHaveProperty('ipAddress');
      expect(prisma.session.findMany.mock.calls[0][0].select.ipAddress).toBeUndefined();
    });

    it('leaves out sessions that are revoked, expired or idle past the timeout', async () => {
      const { service, prisma } = build();
      await service.listForEmployee('emp-1', 'mine');
      const where = prisma.session.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ employeeId: 'emp-1', revokedAt: null });
      expect(where.expiresAt.gt.getTime()).toBeCloseTo(Date.now(), -3);
      const idleHours = (Date.now() - where.lastUsedAt.gt.getTime()) / 3_600_000;
      expect(idleHours).toBeCloseTo(8, 1);
    });
  });

  describe('signing out one', () => {
    it('signs out another of your own sessions', async () => {
      const { service, prisma } = build([], { id: 'b', tokenHash: hashToken('theirs') });
      await expect(service.revokeOneForEmployee('emp-1', 'b', 'mine')).resolves.toBe(1);
      const lookup = prisma.session.findFirst.mock.calls[0][0].where;
      expect(lookup).toMatchObject({ id: 'b', employeeId: 'emp-1', revokedAt: null });
      const write = prisma.session.updateMany.mock.calls[0][0];
      expect(write.where).toEqual({ id: 'b', employeeId: 'emp-1', revokedAt: null });
      expect(write.data.revokedAt).toBeInstanceOf(Date);
    });

    it("says not found for somebody else's session or one already gone", async () => {
      const { service, prisma } = build([], null);
      await expect(service.revokeOneForEmployee('emp-1', 'x', 'mine')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('refuses the session asking - that is Sign out', async () => {
      const { service, prisma } = build([], { id: 'a', tokenHash: hashToken('mine') });
      await expect(service.revokeOneForEmployee('emp-1', 'a', 'mine')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('says not found when it ended between the look and the write', async () => {
      const { service } = build([], { id: 'b', tokenHash: hashToken('theirs') }, 0);
      await expect(service.revokeOneForEmployee('emp-1', 'b', 'mine')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('the routes', () => {
    function controller() {
      const sessions = {
        listForEmployee: jest.fn().mockResolvedValue([]),
        revokeOneForEmployee: jest.fn().mockResolvedValue(1),
      };
      const nothing = {} as never;
      const routes = new AuthController(nothing, sessions as never, nothing, nothing, nothing, {
        get: () => undefined,
      } as never);
      return { routes, sessions };
    }
    const user = { id: 'emp-1' } as never;
    const request = { sessionToken: 'mine' } as Request;

    it('passes the session token so the list can mark this device', async () => {
      const { routes, sessions } = controller();
      await routes.listSessions(user, request);
      expect(sessions.listForEmployee).toHaveBeenCalledWith('emp-1', 'mine');
    });

    it('signs out one by id, as the person asking', async () => {
      const { routes, sessions } = controller();
      await expect(routes.revokeOneSession('sess-b', user, request)).resolves.toEqual({
        signedOut: 1,
      });
      expect(sessions.revokeOneForEmployee).toHaveBeenCalledWith('emp-1', 'sess-b', 'mine');
    });
  });
});
