import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RepInput } from './dto/rep.dto';
import { RepsService } from './reps.service';

/// The rep list: managers and admins only, reading and writing. Staff meet a
/// rep only on the calendar, as the lunch's name, company and medication.
@Controller('reps')
@Roles(Role.MANAGER)
export class RepsController {
  constructor(private readonly reps: RepsService) {}

  @Get()
  list() {
    return this.reps.list();
  }

  @Post()
  create(@Body() dto: RepInput, @CurrentUser() user: AuthUser) {
    return this.reps.create(dto, user);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RepInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reps.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reps.remove(id, user);
  }
}
