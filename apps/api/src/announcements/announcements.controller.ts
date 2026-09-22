import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

/// Reading needs a session and nothing more; writing is admin only. None of it
/// is public — the login page can be opened by anyone on the internet.
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list() {
    return this.announcements.findAll();
  }

  /// What the home screen leads with. `null` only before the first post.
  @Get('primary')
  async primary() {
    return { announcement: await this.announcements.findPrimary() };
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: AuthUser) {
    return this.announcements.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcements.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.announcements.remove(id, user);
  }
}
