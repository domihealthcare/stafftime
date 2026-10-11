import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsInt } from 'class-validator';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { RunningLateService } from './running-late.service';

class RunningLateDto {
  @IsInt()
  minutes!: number;
}

/// "Running late" — somebody's own shift, from Home.
@Controller('shifts')
export class RunningLateController {
  constructor(private readonly late: RunningLateService) {}

  @Post(':id/running-late')
  @HttpCode(HttpStatus.OK)
  say(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RunningLateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.late.say(id, dto.minutes, user);
  }
}
