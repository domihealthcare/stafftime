import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, clearSessionCookie, sessionCookieOptions } from './cookie';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Ip() ip: string,
  ) {
    const session = await this.auth.login(dto.email, dto.password, {
      userAgent: request.header('user-agent'),
      ipAddress: ip,
    });

    response.cookie(
      SESSION_COOKIE,
      session.token,
      sessionCookieOptions(session.expiresAt, this.isProduction),
    );

    return this.describeCurrentUser(await this.requireEmployeeId(session.token));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    if (request.sessionToken) {
      await this.auth.logout(request.sessionToken);
    }
    clearSessionCookie(response, this.isProduction);
    return { signedOut: true };
  }

  /// Who am I? The web app calls this on load to restore the session.
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.describeCurrentUser(user.id);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    if (!request.sessionToken) {
      throw new UnauthorizedException('Please sign in.');
    }

    const result = await this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      request.sessionToken,
    );

    return { changed: true, ...result };
  }

  /// The browsers currently signed in as you, so you can spot one you do not
  /// recognise.
  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser) {
    return this.sessions.listForEmployee(user.id);
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  async revokeOtherSessions(@CurrentUser() user: AuthUser, @Req() request: Request) {
    const count = await this.sessions.revokeAllForEmployee(user.id, request.sessionToken);
    return { signedOut: count };
  }

  /// Onboarding and lockout recovery: an admin issues a temporary password that
  /// the employee must replace at next sign-in.
  @Put('employees/:id/password')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async setTemporaryPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPasswordDto,
  ) {
    await this.auth.setTemporaryPassword(id, dto.temporaryPassword);
    return { set: true, mustChangeAtNextSignIn: true };
  }

  private async requireEmployeeId(token: string): Promise<string> {
    const owner = await this.sessions.resolve(token);
    if (!owner) {
      throw new UnauthorizedException('Please sign in.');
    }
    return owner.id;
  }

  private async describeCurrentUser(employeeId: string) {
    return this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        email: true,
        role: true,
        employmentStatus: true,
        mustChangePassword: true,
        lastLoginAt: true,
        locations: {
          select: {
            locationId: true,
            isPrimary: true,
            location: { select: { id: true, name: true, slug: true, timezone: true } },
          },
        },
      },
    });
  }
}
