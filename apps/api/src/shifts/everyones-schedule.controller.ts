import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { EveryonesScheduleService } from './everyones-schedule.service';

/// The whole rota, read-only, for the people an admin has chosen (and
/// managers and admins). See `EveryonesScheduleService`.
@Controller('schedule-view')
export class EveryonesScheduleController {
  constructor(private readonly schedule: EveryonesScheduleService) {}

  @Get()
  async read(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: AuthUser) {
    await this.schedule.assertCanSee(user);
    return this.schedule.read(from, to);
  }
}
