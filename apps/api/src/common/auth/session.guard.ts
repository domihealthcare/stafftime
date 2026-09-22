import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
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

    request.user = { id: owner.id, email: owner.email, role: owner.role };
    request.sessionToken = token;
    return true;
  }
}
