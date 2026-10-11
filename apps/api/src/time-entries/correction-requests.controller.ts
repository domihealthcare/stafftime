import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsBoolean, IsDateString, IsOptional, IsString, Length } from 'class-validator';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { CorrectionRequestsService } from './correction-requests.service';

class AskCorrectionDto {
  @IsDateString()
  clockInAt!: string;

  @IsDateString()
  clockOutAt!: string;

  @IsString()
  @Length(3, 500)
  reason!: string;
}

class ApproveCorrectionDto {
  /// The hours already went to payroll, and the manager means to correct
  /// them anyway — as for Edit.
  @IsOptional()
  @IsBoolean()
  acknowledgeExported?: boolean;
}

class DeclineCorrectionDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}

/// "Ask for a correction": staff ask about their own entries; managers decide.
@Controller()
export class CorrectionRequestsController {
  constructor(private readonly corrections: CorrectionRequestsService) {}

  @Post('time-entries/:id/correction')
  ask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AskCorrectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.corrections.ask(id, dto, user);
  }

  @Get('corrections')
  @Roles(Role.MANAGER)
  pending() {
    return this.corrections.pending();
  }

  @Post('corrections/:id/approve')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveCorrectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.corrections.approve(id, user, dto.acknowledgeExported ?? false);
  }

  @Post('corrections/:id/decline')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclineCorrectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.corrections.decline(id, dto.reason, user);
  }
}
