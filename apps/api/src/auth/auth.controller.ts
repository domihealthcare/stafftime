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
  Patch,
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
import { UpdatePreferencesDto } from './dto/preferences.dto';
import {
  CompletePasswordResetDto,
  RequestPasswordResetDto,
} from './dto/password-reset.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { PasswordResetService } from './password-reset.service';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly resets: PasswordResetService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  /**
   * Asking for a reset link.
   *
   * Always answers the same way, whether or not the address belongs to anyone.
   * "No such account" here is a way to find out who works at the practice.
   */
  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: RequestPasswordResetDto, @Ip() ip: string) {
    return this.resets.request(dto.email, ip);
  }

  /// Spending the link. Signs out every session afterwards, including this one.
  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: CompletePasswordResetDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.resets.complete(dto.token, dto.newPassword);
    clearSessionCookie(response, this.isProduction);
    return { ...result, signedOutEverywhere: true };
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

  /**
   * Your own notification preferences.
   *
   * Only one so far: whether you get the nightly round-up. Yours to set rather
   * than an admin's, because an unwanted daily email is one you filter, and a
   * filtered folder is where the one that mattered ends up too.
   */
  @Patch('preferences')
  async updatePreferences(
    @Body() dto: UpdatePreferencesDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.prisma.employee.update({
      where: { id: user.id },
      data: { wantsDailyDigest: dto.wantsDailyDigest },
    });
    return this.describeCurrentUser(user.id);
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
        wantsDailyDigest: true,
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
