import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { OnCallService } from '../on-call/on-call.service';
import { CallLogService } from './call-log.service';

/// The after-hours call log, for providers, managers and admins.
@Controller('call-routing')
export class CallRoutingController {
  constructor(
    private readonly log: CallLogService,
    private readonly onCall: OnCallService,
  ) {}

  @Get('calls')
  async calls(@CurrentUser() user: AuthUser) {
    if (!(await this.onCall.canSee(user))) {
      throw new ForbiddenException('The call log is for providers and managers.');
    }
    return this.log.list();
  }
}
