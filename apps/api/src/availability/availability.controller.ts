import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { AvailabilityService } from './availability.service';
import { CreateUnavailabilityDto, QueryAvailabilityDto } from './dto/availability.dto';

/// Staff set their own. Managers read everybody's but do not change it: it is
/// the employee's statement about their own time.
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  get(@Query() query: QueryAvailabilityDto, @CurrentUser() user: AuthUser) {
    return this.availability.forEmployee(query.employeeId ?? user.id, user);
  }

  @Get('team')
  @Roles(Role.MANAGER)
  team() {
    return this.availability.team();
  }

  @Post()
  create(@Body() dto: CreateUnavailabilityDto, @CurrentUser() user: AuthUser) {
    return this.availability.create(dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.availability.remove(id, user);
  }
}
