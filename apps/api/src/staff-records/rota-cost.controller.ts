import { Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RotaCostService } from './rota-cost.service';

/// What the rota costs: only for the people an admin has chosen, whatever
/// their access level (checked in the service). Admins keep the list.
@Controller('rota-cost')
export class RotaCostController {
  constructor(private readonly rotaCost: RotaCostService) {}

  @Get()
  cost(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: AuthUser) {
    return this.rotaCost.cost(user.id, from, to);
  }

  @Get('access')
  @Roles(Role.ADMIN)
  accessList() {
    return this.rotaCost.accessList();
  }

  @Put('access/:employeeId')
  @Roles(Role.ADMIN)
  grant(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.rotaCost.setAccess(employeeId, true);
  }

  @Delete('access/:employeeId')
  @Roles(Role.ADMIN)
  revoke(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.rotaCost.setAccess(employeeId, false);
  }
}
