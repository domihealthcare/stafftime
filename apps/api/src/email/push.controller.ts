import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/auth/roles.decorator';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { PushEndpointInput, PushSubscriptionInput } from './push.dto';
import { PushService } from './push.service';

/// Phone notifications: each person turns them on and off for their own
/// devices. Nobody sees anybody else's.
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.push.status(user.id);
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  subscribe(@Body() dto: PushSubscriptionInput, @CurrentUser() user: AuthUser) {
    return this.push.subscribe(user.id, dto);
  }

  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  unsubscribe(@Body() dto: PushEndpointInput, @CurrentUser() user: AuthUser) {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }

  /// Admins: switch phone notifications on for the whole practice.
  @Post('switch-on')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  switchOn(@CurrentUser() user: AuthUser) {
    return this.push.switchOn(user.id);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  test(@CurrentUser() user: AuthUser) {
    return this.push.test(user.id);
  }
}
