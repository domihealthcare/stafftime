import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { CopyClosuresDto, EventInput, QueryEventsDto, ScopeQuery } from './dto/event.dto';
import { EventsService } from './events.service';
import { InvitesSyncInterceptor } from '../invites/invites-sync.interceptor';

/// Anybody signed in reads the events that are for them (managers read all);
/// managers and admins make, change and remove them.
// A save here can change somebody's calendar invites.
@UseInterceptors(InvitesSyncInterceptor)
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Query() query: QueryEventsDto, @CurrentUser() user: AuthUser) {
    return this.events.list(query.from, query.to, user);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: EventInput, @CurrentUser() user: AuthUser) {
    return this.events.create(dto, user);
  }

  /// "Copy last year's holidays" — every closure in one year, a year on.
  @Post('closures/copy')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  copyClosures(@Body() dto: CopyClosuresDto, @CurrentUser() user: AuthUser) {
    return this.events.copyClosures(dto.fromYear, user);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  /// `?scope=following` changes this date and every one after it in its series.
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EventInput,
    @Query() query: ScopeQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.events.update(id, dto, user, query.scope ?? 'one');
  }

  /// `?scope=following` removes this date and every one after it.
  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ScopeQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.events.remove(id, user, query.scope ?? 'one');
  }
}
