import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Request } from 'express';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { PasskeyRegisterOptionsDto, PasskeyResponseDto } from './dto';
import { requireSite } from './passkey-site';
import { PasskeysService } from './passkeys.service';

/// Your own Face ID (passkeys), from Your profile and Home; and an admin
/// taking somebody's away. Signing in with one is under `auth/passkey`.
@Controller('passkeys')
export class PasskeysController {
  constructor(private readonly passkeys: PasskeysService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.passkeys.list(user.id);
  }

  @Post('register/options')
  @HttpCode(HttpStatus.OK)
  registrationOptions(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Body() dto: PasskeyRegisterOptionsDto,
  ) {
    return this.passkeys.registrationOptions(
      user.id,
      tokenOf(request),
      requireSite(request.headers),
      dto.password,
    );
  }

  @Post('register')
  @HttpCode(HttpStatus.OK)
  register(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Body() dto: PasskeyResponseDto,
  ) {
    return this.passkeys.register(
      user.id,
      dto.response as unknown as RegistrationResponseJSON,
      requireSite(request.headers),
      request.header('user-agent'),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.passkeys.remove(user.id, id);
  }

  /// How many somebody has, for the Staff editor.
  @Get('employee/:id')
  @Roles(Role.ADMIN)
  async countFor(@Param('id', ParseUUIDPipe) id: string) {
    return { count: await this.passkeys.count(id) };
  }

  /// All of somebody's, say for a lost phone.
  @Delete('employee/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  removeAll(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.passkeys.removeAll(id, user.id);
  }
}

function tokenOf(request: Request): string {
  if (!request.sessionToken) throw new UnauthorizedException('Please sign in.');
  return request.sessionToken;
}
