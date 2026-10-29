import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { SESSION_COOKIE } from '../../auth/cookie';
import type { SessionService } from '../../auth/session.service';
import { BACKGROUND_HEADER } from './auth-user';
import { SessionAuthGuard, isBackground } from './session.guard';

describe('isBackground', () => {
  const asked = (method: string, headers: Record<string, string> = {}) =>
    isBackground({ method, headers } as Pick<Request, 'method' | 'headers'>);

  it('hears the header on a read', () => {
    expect(asked('GET', { [BACKGROUND_HEADER]: '1' })).toBe(true);
    expect(asked('HEAD', { [BACKGROUND_HEADER]: '1' })).toBe(true);
  });

  it('ignores it on anything that changes something', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(asked(method, { [BACKGROUND_HEADER]: '1' })).toBe(false);
    }
  });

  it('is not background without the header, or with another value', () => {
    expect(asked('GET')).toBe(false);
    expect(asked('GET', { [BACKGROUND_HEADER]: 'yes' })).toBe(false);
  });
});

describe('SessionAuthGuard', () => {
  const owner = {
    id: 'emp-1',
    email: 'frankie@domihealthcare.com',
    role: Role.EMPLOYEE,
    mustChangePassword: false,
  };

  function run(method: string, headers: Record<string, string>, found: unknown = owner) {
    const resolve = jest.fn().mockResolvedValue(found);
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const guard = new SessionAuthGuard(
      reflector as unknown as Reflector,
      { resolve } as unknown as SessionService,
    );
    const request = {
      method,
      headers,
      path: '/notifications/unread-count',
      baseUrl: '/api',
      cookies: { [SESSION_COOKIE]: 'token' },
    } as unknown as Request;
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { result: guard.canActivate(context), resolve, request };
  }

  it('counts an ordinary request as use', async () => {
    const { result, resolve } = run('GET', {});
    await expect(result).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledWith('token', { touch: true });
  });

  it('does not count a background read as use, but still signs it in', async () => {
    const { result, resolve, request } = run('GET', { [BACKGROUND_HEADER]: '1' });
    await expect(result).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledWith('token', { touch: false });
    expect(request.user).toMatchObject({ id: 'emp-1' });
  });

  it('counts a save as use even if it claims to be background', async () => {
    const { result, resolve } = run('POST', { [BACKGROUND_HEADER]: '1' });
    await expect(result).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledWith('token', { touch: true });
  });

  it('refuses a background read once the session has ended', async () => {
    const { result } = run('GET', { [BACKGROUND_HEADER]: '1' }, null);
    await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
