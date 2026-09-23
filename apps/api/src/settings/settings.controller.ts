import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { UpdatePracticeSettingsDto } from './dto/practice-settings.dto';
import { PracticeSettingsService } from './practice-settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: PracticeSettingsService) {}

  /// Managers read them — the numbers explain what the screens are telling
  /// them — but only an admin changes them.
  @Get()
  @Roles(Role.MANAGER)
  get() {
    return this.settings.get();
  }

  /// This pay period and the last, for the date shortcuts on the Timesheet and
  /// Export screens. Any signed-in person: staff pick "this pay period" too.
  @Get('pay-period')
  payPeriod() {
    return this.settings.payPeriod();
  }

  @Patch()
  @Roles(Role.ADMIN)
  update(@Body() dto: UpdatePracticeSettingsDto, @CurrentUser() user: AuthUser) {
    return this.settings.update(dto, user.id);
  }
}
