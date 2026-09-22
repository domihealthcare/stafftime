import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto';
import { ResourcesService } from './resources.service';

/// Staff read what is for them; managers keep all of it.
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  sections(@CurrentUser() user: AuthUser) {
    return this.resources.sections(user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.resources.findOne(id, user);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: CreateResourceDto, @CurrentUser() user: AuthUser) {
    return this.resources.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.resources.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.resources.remove(id, user);
  }
}
