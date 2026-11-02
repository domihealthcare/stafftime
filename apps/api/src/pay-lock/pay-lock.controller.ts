import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { PasskeyResponseDto } from '../passkeys/dto';
import { requireSite } from '../passkeys/passkey-site';
import { PasskeysService } from '../passkeys/passkeys.service';
import { PayLockService } from './pay-lock.service';

export class PayUnlockDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'A PIN is 4 to 8 digits.' })
  pin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;
}

/// The PIN in front of pay, for the signed-in person's own session.
@Controller('pay-lock')
export class PayLockController {
  constructor(
    private readonly payLock: PayLockService,
    private readonly passkeys: PasskeysService,
  ) {}

  @Get()
  status(@Req() request: Request, @CurrentUser() user: AuthUser) {
    return this.payLock.status(tokenOf(request), user.id);
  }

  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  unlock(@Req() request: Request, @CurrentUser() user: AuthUser, @Body() dto: PayUnlockDto) {
    return this.payLock.unlock(tokenOf(request), user.id, dto);
  }

  /// Face ID instead of the PIN (November 2026): a challenge for their own
  /// passkeys only.
  @Post('passkey/options')
  @HttpCode(HttpStatus.OK)
  passkeyOptions(@Req() request: Request, @CurrentUser() user: AuthUser) {
    tokenOf(request);
    return this.passkeys.payOptions(user.id, requireSite(request.headers));
  }

  @Post('passkey')
  @HttpCode(HttpStatus.OK)
  async passkey(
    @Req() request: Request,
    @CurrentUser() user: AuthUser,
    @Body() dto: PasskeyResponseDto,
  ) {
    const token = tokenOf(request);
    await this.passkeys.proveForPay(
      user.id,
      dto.response as unknown as AuthenticationResponseJSON,
      requireSite(request.headers),
    );
    return this.payLock.open(token, user.id, 'Face ID');
  }

  @Post('touch')
  @HttpCode(HttpStatus.OK)
  touch(@Req() request: Request, @CurrentUser() user: AuthUser) {
    return this.payLock.touch(tokenOf(request), user.id);
  }

  @Post('lock')
  @HttpCode(HttpStatus.OK)
  lock(@Req() request: Request) {
    return this.payLock.lock(tokenOf(request));
  }
}

function tokenOf(request: Request): string {
  if (!request.sessionToken) throw new UnauthorizedException('Please sign in.');
  return request.sessionToken;
}
