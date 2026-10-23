import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { hashToken } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';
import { PIN_REQUIRED, unlockedUntil, worthMoving } from './pay-lock';

/**
 * On every route that answers with pay (`pay-lock.ts`): passes only while this
 * session's PIN unlock has not run out, and moves the end on while it is in
 * use. Runs after the session and roles guards, so who may see a screen at all
 * is still theirs to say; this only asks that it is really them.
 */
@Injectable()
export class PayLockGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.sessionToken;
    if (token) {
      const session = await this.prisma.session.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { id: true, payUnlockedUntil: true },
      });
      const until = session?.payUnlockedUntil;
      if (session && until && until > new Date()) {
        if (worthMoving(until)) {
          await this.prisma.session.update({
            where: { id: session.id },
            data: { payUnlockedUntil: unlockedUntil() },
          });
        }
        return true;
      }
    }
    throw new ForbiddenException({
      message: 'Enter your PIN to see pay.',
      code: PIN_REQUIRED,
    });
  }
}
