import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ReferenceTableInput } from './dto/reference.dto';
import { ReferenceService } from './reference.service';

/// Reference tables: read by the people each is for, kept by managers and
/// admins.
@Controller('reference-tables')
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.reference.list(user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reference.get(id, user);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: ReferenceTableInput, @CurrentUser() user: AuthUser) {
    return this.reference.create(dto, user);
  }

  @Put(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReferenceTableInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reference.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reference.remove(id, user);
  }
}
