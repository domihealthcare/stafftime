import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { FindTimeInput, ReplyInput } from './dto/find-time.dto';
import { EventRepliesService } from './event-replies.service';
import { FindATimeService } from './find-a-time.service';

/// Replies to meetings, and "Find a time" when booking one. Apart from
/// `EventsController` because neither changes anybody's calendar, so neither
/// should start a round of calendar invites.
@Controller('events')
export class EventRepliesController {
  constructor(
    private readonly replies: EventRepliesService,
    private readonly times: FindATimeService,
  ) {}

  /// The best few times for a meeting being booked. Managers and admins, who
  /// book them.
  @Post('find-a-time')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  findATime(@Body() dto: FindTimeInput) {
    return this.times.find(dto);
  }

  /// Who is going - for the people it is for, and managers.
  @Get(':id/replies')
  list(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.replies.replies(id, user);
  }

  /// The signed-in person's own answer.
  @Put(':id/reply')
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.replies.reply(id, dto.answer, user);
  }
}
