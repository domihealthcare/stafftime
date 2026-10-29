import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { AuthUser } from './auth-user';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

/// The guard as Nest runs it, for a route marked with `metadata` and a
/// request signed in as `user`.
function check(metadata: { public?: boolean; roles?: Role[] }, user: AuthUser | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === IS_PUBLIC_KEY ? metadata.public : key === ROLES_KEY ? metadata.roles : undefined,
    ),
  };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return () => new RolesGuard(reflector as unknown as Reflector).canActivate(context);
}

const person = (role: Role, extra: Partial<AuthUser> = {}): AuthUser => ({
  id: 'emp-1',
  email: 'frankie@domihealthcare.com',
  role,
  ...extra,
});

describe('RolesGuard', () => {
  it('lets anybody through a public route, signed in or not', () => {
    expect(check({ public: true, roles: [Role.ADMIN] }, undefined)()).toBe(true);
  });

  it('lets any signed-in person through a route that names no roles', () => {
    expect(check({}, person(Role.EMPLOYEE))()).toBe(true);
    expect(check({ roles: [] }, person(Role.EMPLOYEE))()).toBe(true);
  });

  it('lets in the roles a route names', () => {
    expect(check({ roles: [Role.MANAGER] }, person(Role.MANAGER))()).toBe(true);
    expect(check({ roles: [Role.EMPLOYEE, Role.MANAGER] }, person(Role.EMPLOYEE))()).toBe(true);
  });

  it('always lets an admin in', () => {
    expect(check({ roles: [Role.MANAGER] }, person(Role.ADMIN))()).toBe(true);
    expect(check({ roles: [Role.EMPLOYEE] }, person(Role.ADMIN))()).toBe(true);
  });

  it('refuses a role the route does not name', () => {
    expect(check({ roles: [Role.MANAGER] }, person(Role.EMPLOYEE))).toThrow(ForbiddenException);
    expect(check({ roles: [Role.ADMIN] }, person(Role.MANAGER))).toThrow('Requires one of: ADMIN');
  });

  it('refuses a route with roles when nobody is signed in', () => {
    expect(check({ roles: [Role.MANAGER] }, undefined)).toThrow('Not authenticated');
  });

  it('goes by the role being viewed as, not the admin behind it', () => {
    // An admin viewing as an employee is answered as an employee would be.
    const viewing = person(Role.EMPLOYEE, { actualRole: Role.ADMIN });
    expect(check({ roles: [Role.MANAGER] }, viewing)).toThrow(ForbiddenException);
    expect(check({ roles: [Role.ADMIN] }, viewing)).toThrow(ForbiddenException);
    const asManager = person(Role.MANAGER, { actualRole: Role.ADMIN });
    expect(check({ roles: [Role.MANAGER] }, asManager)()).toBe(true);
    expect(check({ roles: [Role.ADMIN] }, asManager)).toThrow(ForbiddenException);
  });
});
