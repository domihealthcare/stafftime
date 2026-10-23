import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

/**
 * The one place an admin does not pass: a route for people with Manager
 * access only (October 2026, Dominguez: "managers only should be able to
 * access invoices", since a provider paid directly may need their home
 * address on one). `@Roles` always lets an admin through, so this guard is
 * added beside it.
 */
@Injectable()
export class ManagerAccessOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user;
    // An admin viewing as a manager (October 2026) is still the admin.
    if (user?.role === Role.MANAGER && user.actualRole !== Role.ADMIN) return true;
    throw new ForbiddenException('This is for people with Manager access only.');
  }
}
