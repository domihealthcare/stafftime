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

describe('SessionAuthGuard: signing in', () => {
  const JOB_ROLE_A = '11111111-1111-4111-8111-111111111111';
  const JOB_ROLE_B = '22222222-2222-4222-8222-222222222222';

  function guardFor(options: {
    owner?: unknown;
    isPublic?: boolean;
    cookies?: Record<string, string> | undefined;
    method?: string;
    baseUrl?: string;
    path?: string;
    headers?: Record<string, string>;
  }) {
    const owner =
      'owner' in options
        ? options.owner
        : {
            id: 'emp-1',
            email: 'frankie@domihealthcare.com',
            role: Role.EMPLOYEE,
            mustChangePassword: false,
          };
    const resolve = jest.fn().mockResolvedValue(owner);
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(options.isPublic ?? false) };
    const guard = new SessionAuthGuard(
      reflector as unknown as Reflector,
      { resolve } as unknown as SessionService,
    );
    const request = {
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
      baseUrl: options.baseUrl ?? '/api',
      path: options.path ?? '/shifts',
      cookies: 'cookies' in options ? options.cookies : { [SESSION_COOKIE]: 'token' },
    } as unknown as Request;
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { run: () => guard.canActivate(context), resolve, request };
  }

  const admin = {
    id: 'admin-1',
    email: 'dominguez@domihealthcare.com',
    role: Role.ADMIN,
    mustChangePassword: false,
  };

  it('lets a public route through without looking for a session', async () => {
    const { run, resolve, request } = guardFor({ isPublic: true, cookies: undefined });
    await expect(run()).resolves.toBe(true);
    expect(resolve).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('asks to sign in with no session cookie, or an empty one', async () => {
    const none: (Record<string, string> | undefined)[] = [undefined, {}, { [SESSION_COOKIE]: '' }];
    for (const cookies of none) {
      const { run, resolve } = guardFor({ cookies });
      await expect(run()).rejects.toThrow('Please sign in.');
      expect(resolve).not.toHaveBeenCalled();
    }
  });

  it('refuses a session that has ended', async () => {
    const { run } = guardFor({ owner: null });
    await expect(run()).rejects.toThrow('Your session has expired. Please sign in again.');
  });

  it('signs the person in, keeping the token for the handler', async () => {
    const { run, request } = guardFor({});
    await expect(run()).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'emp-1',
      email: 'frankie@domihealthcare.com',
      role: Role.EMPLOYEE,
    });
    expect(request.sessionToken).toBe('token');
  });

  describe('with a temporary password still in force', () => {
    const owner = {
      id: 'emp-1',
      email: 'frankie@domihealthcare.com',
      role: Role.EMPLOYEE,
      mustChangePassword: true,
    };

    it('allows only seeing who they are, changing it and signing out', async () => {
      for (const [method, path] of [
        ['GET', '/auth/me'],
        ['POST', '/auth/change-password'],
        ['POST', '/auth/logout'],
      ]) {
        const { run } = guardFor({ owner, method, path });
        await expect(run()).resolves.toBe(true);
      }
    });

    it('refuses everything else, saying why', async () => {
      for (const [method, path] of [
        ['GET', '/shifts'],
        ['POST', '/auth/me'],
        ['GET', '/auth/change-password'],
        ['POST', '/time-entries/clock-in'],
      ]) {
        const { run, request } = guardFor({ owner, method, path });
        const refusal = run();
        await expect(refusal).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(refusal).rejects.toMatchObject({
          response: { code: 'PASSWORD_CHANGE_REQUIRED' },
        });
        expect(request.user).toBeUndefined();
      }
    });

    it('reads the route with its /api prefix', async () => {
      const { run } = guardFor({ owner, method: 'GET', baseUrl: '', path: '/auth/me' });
      await expect(run()).rejects.toMatchObject({
        response: { code: 'PASSWORD_CHANGE_REQUIRED' },
      });
    });
  });

  describe('View as', () => {
    it('lets an admin be answered as an employee or a manager', async () => {
      for (const wanted of ['EMPLOYEE', 'MANAGER', 'manager']) {
        const { run, request } = guardFor({ owner: admin, headers: { 'x-view-as': wanted } });
        await expect(run()).resolves.toBe(true);
        expect(request.user).toEqual({
          id: 'admin-1',
          email: 'dominguez@domihealthcare.com',
          role: wanted.toUpperCase(),
          actualRole: Role.ADMIN,
        });
      }
    });

    it('stands the chosen job roles in for their own', async () => {
      const { run, request } = guardFor({
        owner: admin,
        headers: {
          'x-view-as': 'EMPLOYEE',
          'x-view-as-job-roles': `${JOB_ROLE_A}, ${JOB_ROLE_B}`,
        },
      });
      await run();
      expect(request.user?.viewAsJobRoleIds).toEqual([JOB_ROLE_A, JOB_ROLE_B]);
    });

    it('drops anything in the job roles that is not an id, and takes at most twenty', async () => {
      const many = Array.from(
        { length: 25 },
        (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
      );
      const { run, request } = guardFor({
        owner: admin,
        headers: {
          'x-view-as': 'EMPLOYEE',
          'x-view-as-job-roles': ['not-an-id', "'; drop table", ...many].join(','),
        },
      });
      await run();
      expect(request.user?.viewAsJobRoleIds).toEqual(many.slice(0, 20));
    });

    it('leaves the job roles alone when none given are ids', async () => {
      const { run, request } = guardFor({
        owner: admin,
        headers: { 'x-view-as': 'MANAGER', 'x-view-as-job-roles': 'front-desk' },
      });
      await run();
      expect(request.user).not.toHaveProperty('viewAsJobRoleIds');
      expect(request.user?.role).toBe(Role.MANAGER);
    });

    it('is ignored for anything but employee or manager, so never upwards', async () => {
      for (const wanted of ['ADMIN', 'SUPERADMIN', '', 'employee ']) {
        const { run, request } = guardFor({ owner: admin, headers: { 'x-view-as': wanted } });
        await run();
        expect(request.user).toEqual({
          id: 'admin-1',
          email: 'dominguez@domihealthcare.com',
          role: Role.ADMIN,
        });
      }
    });

    it('is heard only from an admin', async () => {
      for (const role of [Role.EMPLOYEE, Role.MANAGER]) {
        for (const wanted of ['EMPLOYEE', 'MANAGER', 'ADMIN']) {
          const { run, request } = guardFor({
            owner: { ...admin, id: 'emp-2', role },
            headers: { 'x-view-as': wanted, 'x-view-as-job-roles': JOB_ROLE_A },
          });
          await run();
          expect(request.user).toEqual({
            id: 'emp-2',
            email: 'dominguez@domihealthcare.com',
            role,
          });
        }
      }
    });

    it('cannot get round a temporary password', async () => {
      const { run } = guardFor({
        owner: { ...admin, mustChangePassword: true },
        headers: { 'x-view-as': 'EMPLOYEE' },
      });
      await expect(run()).rejects.toMatchObject({
        response: { code: 'PASSWORD_CHANGE_REQUIRED' },
      });
    });
  });
});
