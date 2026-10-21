import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { OfficeAdminDayInput, OfficeAdminPatternInput } from './dto/office-admins.dto';
import { OfficeAdminsService } from './office-admins.service';

/// Who is the admin in each office. Everybody signed in reads it; managers
/// and admins change it.
@Controller('office-admins')
export class OfficeAdminsController {
  constructor(private readonly admins: OfficeAdminsService) {}

  @Get()
  days(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: AuthUser) {
    return this.admins.days(from, to, user);
  }

  @Get('pattern')
  @Roles(Role.MANAGER)
  pattern() {
    return this.admins.pattern();
  }

  @Put('pattern')
  @Roles(Role.MANAGER)
  savePattern(@Body() dto: OfficeAdminPatternInput, @CurrentUser() user: AuthUser) {
    return this.admins.savePattern(dto, user);
  }

  @Put('days/:date/:locationId')
  @Roles(Role.MANAGER)
  setDay(
    @Param('date') date: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: OfficeAdminDayInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admins.setDay(date, locationId, dto, user);
  }

  @Delete('days/:date/:locationId')
  @Roles(Role.MANAGER)
  clearDay(
    @Param('date') date: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admins.clearDay(date, locationId, user);
  }
}
