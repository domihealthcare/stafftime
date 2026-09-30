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
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { NewStatementDto, SavePlanDto, SaveStatementDto } from './dto/productivity.dto';
import { ProductivityService } from './productivity.service';

/// Provider productivity. Working it out is for the people an admin has chosen
/// (`canManageProductivity`), checked on every route below; a provider reads
/// only their own, and only once it is published — `mine` takes the person from
/// the session, never from the request.
@Controller('productivity')
export class ProductivityController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.productivity.mine(user);
  }

  // ---- Who may use it: admins choose ----

  @Get('access')
  @Roles(Role.ADMIN)
  accessList() {
    return this.productivity.accessList();
  }

  @Put('access/:employeeId')
  @Roles(Role.ADMIN)
  grant(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.productivity.setAccess(employeeId, true);
  }

  @Delete('access/:employeeId')
  @Roles(Role.ADMIN)
  revoke(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.productivity.setAccess(employeeId, false);
  }

  // ---- Working it out: only those with access ----

  @Get('people')
  async people(@CurrentUser() user: AuthUser) {
    await this.productivity.assertAccess(user);
    return this.productivity.people();
  }

  @Get('plans')
  async plans(@CurrentUser() user: AuthUser) {
    await this.productivity.assertAccess(user);
    return this.productivity.plans();
  }

  @Get('plans/:employeeId')
  async plan(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.productivity.assertAccess(user);
    return this.productivity.plan(employeeId);
  }

  @Put('plans/:employeeId')
  async savePlan(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: SavePlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.productivity.assertAccess(user);
    return this.productivity.savePlan(employeeId, dto);
  }

  @Delete('plans/:employeeId')
  async removePlan(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.productivity.assertAccess(user);
    return this.productivity.removePlan(employeeId);
  }

  @Get('statements')
  async statements(
    @Query('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.productivity.assertAccess(user);
    return this.productivity.statements(employeeId);
  }

  @Post('statements')
  async create(@Body() dto: NewStatementDto, @CurrentUser() user: AuthUser) {
    await this.productivity.assertAccess(user);
    return this.productivity.create(dto, user);
  }

  @Put('statements/:id')
  async save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveStatementDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.productivity.assertAccess(user);
    return this.productivity.save(id, dto);
  }

  @Post('statements/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.productivity.assertAccess(user);
    return this.productivity.publish(id, user);
  }

  @Post('statements/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.productivity.assertAccess(user);
    return this.productivity.unpublish(id);
  }

  @Delete('statements/:id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.productivity.assertAccess(user);
    return this.productivity.remove(id);
  }
}
