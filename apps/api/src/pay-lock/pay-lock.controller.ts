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
  constructor(private readonly payLock: PayLockService) {}

  @Get()
  status(@Req() request: Request, @CurrentUser() user: AuthUser) {
    return this.payLock.status(tokenOf(request), user.id);
  }

  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  unlock(@Req() request: Request, @CurrentUser() user: AuthUser, @Body() dto: PayUnlockDto) {
    return this.payLock.unlock(tokenOf(request), user.id, dto);
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
