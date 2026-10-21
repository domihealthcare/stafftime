import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ManagerAccessOnlyGuard } from './manager-access-only.guard';

const contextFor = (role: Role | null) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  }) as never;

describe('ManagerAccessOnlyGuard', () => {
  const guard = new ManagerAccessOnlyGuard();

  it('lets a manager in', () => {
    expect(guard.canActivate(contextFor(Role.MANAGER))).toBe(true);
  });

  it('refuses an admin, staff and nobody', () => {
    for (const role of [Role.ADMIN, Role.EMPLOYEE, null])
      expect(() => guard.canActivate(contextFor(role))).toThrow(ForbiddenException);
  });
});
