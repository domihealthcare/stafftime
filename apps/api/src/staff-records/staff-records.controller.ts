import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { EmploymentChangeDto, PersonalRecordDto } from './dto/staff-records.dto';
import { StaffRecordsService } from './staff-records.service';

/// A staff profile's private side. Admins only, every route: not managers,
/// and never the person themselves (October 2026, Dominguez).
@Controller('staff-records')
@Roles(Role.ADMIN)
export class StaffRecordsController {
  constructor(private readonly records: StaffRecordsService) {}

  @Get(':employeeId')
  get(@Param('employeeId', ParseUUIDPipe) employeeId: string, @CurrentUser() user: AuthUser) {
    return this.records.get(employeeId, user.id);
  }

  @Put(':employeeId/personal')
  updatePersonal(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: PersonalRecordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.records.updatePersonal(employeeId, dto, user.id);
  }

  @Post(':employeeId/changes')
  addChange(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: EmploymentChangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.records.addChange(employeeId, dto, user.id);
  }

  @Put('changes/:id')
  updateChange(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmploymentChangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.records.updateChange(id, dto, user.id);
  }

  @Delete('changes/:id')
  @HttpCode(HttpStatus.OK)
  removeChange(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.records.removeChange(id, user.id);
  }
}
