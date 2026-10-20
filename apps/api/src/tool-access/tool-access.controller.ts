import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ToolAccessInput } from './dto/tool-access.dto';
import { ToolAccessService } from './tool-access.service';

/// Who may use each built-in form and guide: everybody signed in reads it
/// (Resources places each tool by it), managers and admins change it.
@Controller('tool-access')
export class ToolAccessController {
  constructor(private readonly access: ToolAccessService) {}

  @Get()
  settings() {
    return this.access.settings();
  }

  @Put(':key')
  @Roles(Role.MANAGER)
  save(@Param('key') key: string, @Body() dto: ToolAccessInput, @CurrentUser() user: AuthUser) {
    return this.access.save(key, dto.everyone, dto.jobRoleIds, user);
  }
}
