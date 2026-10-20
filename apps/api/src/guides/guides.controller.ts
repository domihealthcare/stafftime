import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { GuideMoveInput, GuideSectionInput } from './dto/guides.dto';
import { GuidesService } from './guides.service';

/// The guides: read as `guides.ts` says, kept by managers and admins. Every
/// change answers with the whole guide, as it now stands.
@Controller('guides')
export class GuidesController {
  constructor(private readonly guides: GuidesService) {}

  @Get(':slug')
  guide(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.guides.guide(slug, user);
  }

  @Post(':slug/sections')
  @Roles(Role.MANAGER)
  create(
    @Param('slug') slug: string,
    @Body() dto: GuideSectionInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.guides.create(slug, dto, user);
  }

  @Put('sections/:id')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuideSectionInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.guides.update(id, dto, user);
  }

  @Post('sections/:id/move')
  @Roles(Role.MANAGER)
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuideMoveInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.guides.move(id, dto.by, user);
  }

  @Delete('sections/:id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.guides.remove(id, user);
  }
}
