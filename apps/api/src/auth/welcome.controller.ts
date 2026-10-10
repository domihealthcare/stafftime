import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { loadNotSignedIn } from './not-signed-in';
import { PasswordResetService } from './password-reset.service';

/**
 * Welcome emails, sent from the Staff screen. They live beside password
 * resets because they are the same thing underneath — a one-time link to
 * choose a password — only longer-lived and with the day-one help attached.
 */
@Controller('employees')
export class WelcomeController {
  constructor(
    private readonly passwords: PasswordResetService,
    private readonly prisma: PrismaService,
  ) {}

  /// Everybody still here who has never signed in, and why that may be
  /// (October 2026). Before `:id` routes; two segments, so no clash.
  @Get('welcome/pending')
  @Roles(Role.ADMIN)
  notSignedIn() {
    return loadNotSignedIn(this.prisma);
  }

  /// Everybody who has not been sent one and has not chosen a password yet.
  @Post('welcome')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  everyone() {
    return this.passwords.sendWelcomeToEveryone();
  }

  @Post(':id/welcome')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  one(@Param('id', ParseUUIDPipe) id: string) {
    return this.passwords.sendWelcome(id);
  }
}
