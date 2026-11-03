import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { PayLockGuard } from '../pay-lock/pay-lock.guard';
import { SignaturesService } from './signatures.service';

export class SaveSignatureDto {
  /// A PNG, base64, with or without a `data:image/png;base64,` prefix.
  @IsString()
  @MaxLength(100_000)
  image!: string;
}

/// Saved signatures for Fill and sign a PDF (November 2026). The pictures
/// themselves are behind the PIN, like pay: a login left open should not
/// hand anybody a provider's signature.
@Controller('signatures')
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.signatures.overview(user);
  }

  @Get('mine')
  @UseGuards(PayLockGuard)
  mine(@CurrentUser() user: AuthUser) {
    return this.signatures.mine(user);
  }

  @Put('mine')
  @UseGuards(PayLockGuard)
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveSignatureDto) {
    return this.signatures.save(user, dto.image);
  }

  @Delete(':employeeId')
  remove(@CurrentUser() user: AuthUser, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.signatures.remove(user, employeeId);
  }

  @Post(':employeeId/stamp')
  @UseGuards(PayLockGuard)
  stamp(@CurrentUser() user: AuthUser, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.signatures.stamp(user, employeeId);
  }
}
