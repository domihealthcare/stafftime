import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { EventInput, QueryEventsDto } from './dto/event.dto';
import { EventsService } from './events.service';

/// Anybody signed in reads the events that are for them (managers read all);
/// managers and admins make, change and remove them.
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

  @Patch(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EventInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.events.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.events.remove(id, user);
  }
}
