import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { findPublicPosts } from './public-posts';
import { Roles } from '../common/auth/roles.decorator';
import { AnnouncementsService } from './announcements.service';
import {
  CommentDto,
  CreateAnnouncementDto,
  PollStateDto,
  UpdateAnnouncementDto,
  VoteDto,
} from './dto/announcement.dto';

/// Reading needs a session and nothing more; writing posts is admin only.
/// Liking, commenting and voting are for anybody signed in, under their own
/// name. The one exception is `public`: the posts an admin ticked to show
/// publicly, title and words only, for the sign-in page — which anyone on the
/// internet can open — and the front-desk time clock.
@Controller('announcements')
export class AnnouncementsController {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly prisma: PrismaService,
  ) {}

  /// Before `:id`, which would otherwise take "public" for a post's id.
  @Get('public')
  @Public()
  publicPosts() {
    return findPublicPosts(this.prisma);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.announcements.findAll(user);
  }

  /// What the home screen leads with. `null` only before the first post.
  @Get('primary')
  async primary(@CurrentUser() user: AuthUser) {
    return { announcement: await this.announcements.findPrimary(user) };
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.announcements.findOne(id, user);
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

  @Post(':id/like')
  like(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.announcements.like(id, user);
  }

  @Delete(':id/like')
  unlike(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.announcements.unlike(id, user);
  }

  @Post(':id/comments')
  comment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcements.addComment(id, dto.body, user);
  }

  /// Your own comments only — checked in the service.
  @Patch(':id/comments/:commentId')
  editComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: CommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcements.editComment(id, commentId, dto.body, user);
  }

  /// Your own, or anybody's for a manager or admin — checked in the service.
  @Delete(':id/comments/:commentId')
  removeComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcements.removeComment(id, commentId, user);
  }

  @Put(':id/vote')
  vote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcements.vote(id, dto.optionIds, user);
  }

  @Patch(':id/poll')
  @Roles(Role.ADMIN)
  setPollState(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PollStateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcements.setPollClosed(id, dto.closed, user);
  }
}
