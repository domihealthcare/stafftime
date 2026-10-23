import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { VIEW_AS_HEADER, VIEW_AS_JOB_ROLES_HEADER } from './auth-user';
import { SESSION_COOKIE } from '../../auth/cookie';
import { SessionService } from '../../auth/session.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/// Routes reachable while a temporary password is still in force. Everything
/// else is blocked until it is replaced.
export const ALLOWED_WHILE_PASSWORD_EXPIRED = new Set([
  'GET /api/auth/me',
  'POST /api/auth/change-password',
  'POST /api/auth/logout',
]);

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException('Please sign in.');
    }

    const owner = await this.sessions.resolve(token);
    if (!owner) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    // An admin-set temporary password gets you far enough to replace it, no further.
    if (owner.mustChangePassword) {
      const route = `${request.method} ${request.baseUrl || ''}${request.path}`;
      if (!ALLOWED_WHILE_PASSWORD_EXPIRED.has(route)) {
        throw new UnauthorizedException({
          message: 'You must change your temporary password before continuing.',
          code: 'PASSWORD_CHANGE_REQUIRED',
        });
      }
    }

    request.user = {
      id: owner.id,
      email: owner.email,
      role: owner.role,
      ...viewAs(request, owner.role),
    };
    request.sessionToken = token;
    return true;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * **View as** (October 2026, Dominguez: "me (as the super admin) should have
 * a way to see the views that other staff have"): an admin's browser may ask,
 * by header, to be treated as somebody with Employee or Manager access, and
 * as holding chosen job roles. Only an admin is heard, and only downwards -
 * it can never raise anybody - so the guards and every screen answer as that
 * person would be answered; the real access level rides along as
 * `actualRole` for the one place an admin must still not pass (invoices).
 */
function viewAs(
  request: Request,
  role: Role,
): Partial<{ role: Role; actualRole: Role; viewAsJobRoleIds: string[] }> {
  if (role !== Role.ADMIN) return {};
  const wanted = String(request.headers[VIEW_AS_HEADER] ?? '').toUpperCase();
  if (wanted !== Role.EMPLOYEE && wanted !== Role.MANAGER) return {};
  const ids = String(request.headers[VIEW_AS_JOB_ROLES_HEADER] ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => UUID.test(id))
    .slice(0, 20);
  return {
    role: wanted,
    actualRole: Role.ADMIN,
    ...(ids.length > 0 ? { viewAsJobRoleIds: ids } : {}),
  };
}
