import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/auth/roles.decorator';
import { CalendarInvitesService } from './invites.service';

/// How calendar invites are going, and a way to send what is waiting.
@Controller('calendar-invites')
export class InvitesController {
  constructor(private readonly invites: CalendarInvitesService) {}

  @Get('status')
  @Roles(Role.ADMIN)
  status() {
    return this.invites.status();
  }

  /// One round; the page calls again while `remaining` is above 0.
  @Post('sync')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  sync() {
    return this.invites.sync({ budget: 40 });
  }
}
