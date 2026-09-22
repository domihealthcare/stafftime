import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { AddMemberDto, CreateJobRoleDto, UpdateJobRoleDto } from './dto/job-role.dto';
import { JobRolesService } from './job-roles.service';

/// Managers keep the list and who is in it. Everybody signed in can read it:
/// it is who does what, which the staff directory shows anyway.
@Controller('job-roles')
export class JobRolesController {
  constructor(private readonly jobRoles: JobRolesService) {}

  @Get()
  list() {
    return this.jobRoles.findAll();
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: CreateJobRoleDto, @CurrentUser() user: AuthUser) {
    return this.jobRoles.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobRoleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobRoles.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.jobRoles.remove(id, user);
  }

  @Post(':id/members')
  @Roles(Role.MANAGER)
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobRoles.addMember(id, dto.employeeId, user);
  }

  @Delete(':id/members/:employeeId')
  @Roles(Role.MANAGER)
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobRoles.removeMember(id, employeeId, user);
  }
}
