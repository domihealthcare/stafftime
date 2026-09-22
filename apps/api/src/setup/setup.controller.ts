import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { SESSION_COOKIE, sessionCookieOptions } from '../auth/cookie';
import { SessionService } from '../auth/session.service';
import { Public } from '../common/auth/public.decorator';
import { FirstRunSetupDto } from './setup.dto';
import { SetupService } from './setup.service';

@Controller('setup')
export class SetupController {
  private readonly isProduction: boolean;

  constructor(
    private readonly setup: SetupService,
    private readonly sessions: SessionService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  /// Public by necessity: nobody can be signed in on a database with no accounts.
  @Get('status')
  @Public()
  status() {
    return this.setup.status();
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: FirstRunSetupDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Ip() ip: string,
  ) {
    const result = await this.setup.createFirstAdmin(dto);

    // They just proved the setup token and chose the password, so sign them in
    // rather than bouncing them to a login form they would fill in twice.
    const session = await this.sessions.issue(result.employeeId, {
      userAgent: request.header('user-agent'),
      ipAddress: ip,
    });
    response.cookie(
      SESSION_COOKIE,
      session.token,
      sessionCookieOptions(session.expiresAt, this.isProduction),
    );

    return { created: true, email: result.email };
  }
}
