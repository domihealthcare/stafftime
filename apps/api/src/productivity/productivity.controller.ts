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

/// Provider productivity. Managers and admins work it out; a provider reads
/// only their own, and only once it is published — `mine` takes the person
/// from the session, never from the request.
@Controller('productivity')
export class ProductivityController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.productivity.mine(user);
  }

  @Get('plans')
  @Roles(Role.MANAGER)
  plans() {
    return this.productivity.plans();
  }

  @Get('plans/:employeeId')
  @Roles(Role.MANAGER)
  plan(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.productivity.plan(employeeId);
  }

  @Put('plans/:employeeId')
  @Roles(Role.MANAGER)
  savePlan(@Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() dto: SavePlanDto) {
    return this.productivity.savePlan(employeeId, dto);
  }

  @Delete('plans/:employeeId')
  @Roles(Role.MANAGER)
  removePlan(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.productivity.removePlan(employeeId);
  }

  @Get('statements')
  @Roles(Role.MANAGER)
  statements(@Query('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.productivity.statements(employeeId);
  }

  @Post('statements')
  @Roles(Role.MANAGER)
  create(@Body() dto: NewStatementDto, @CurrentUser() user: AuthUser) {
    return this.productivity.create(dto, user);
  }

  @Put('statements/:id')
  @Roles(Role.MANAGER)
  save(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveStatementDto) {
    return this.productivity.save(id, dto);
  }

  @Post('statements/:id/publish')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.productivity.publish(id, user);
  }

  @Post('statements/:id/unpublish')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  unpublish(@Param('id', ParseUUIDPipe) id: string) {
    return this.productivity.unpublish(id);
  }

  @Delete('statements/:id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productivity.remove(id);
  }
}
