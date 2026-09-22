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

  @Patch()
  @Roles(Role.ADMIN)
  update(@Body() dto: UpdatePracticeSettingsDto, @CurrentUser() user: AuthUser) {
    return this.settings.update(dto, user.id);
  }
}
