import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';

export const DEV_USER_HEADER = 'x-dev-employee-id';

/**
 * TEMPORARY identity for local development.
 *
 * Trusts the `x-dev-employee-id` header and loads that employee from the database.
 * This exists so the API is usable before login is built — it is NOT authentication
 * and env validation refuses to boot with AUTH_MODE=dev under NODE_ENV=production.
 *
 * Replace with a JWT strategy in the auth pass; the guard contract (request.user)
 * and the @Roles decorator stay the same, so call sites will not need to change.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
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
    const employeeId = request.header(DEV_USER_HEADER);
    if (!employeeId) {
      throw new UnauthorizedException(
        `Missing ${DEV_USER_HEADER} header (dev auth mode). Pass an employee id to identify the caller.`,
      );
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, email: true, role: true },
    });
    if (!employee) {
      throw new UnauthorizedException('Unknown employee');
    }

    request.user = employee;
    return true;
  }
}
