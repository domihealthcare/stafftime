import { Controller, Get } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { DowntimeService } from '../downtime/downtime.service';
import { InboxService } from '../email/inbox.service';
import { PtoService } from '../pto/pto.service';

/// What every screen's frame shows, in one answer.
export interface Badges {
  /// The bell's count: the person's own unread notifications.
  unread: number;
  /// The red bar: downtimes on now at one of their offices (all, for managers).
  downtime: Awaited<ReturnType<DowntimeService['active']>>;
  /// The Schedule tab's badge: time-off requests waiting for a decision,
  /// other than their own. Always 0 for Employee access.
  timeOffPending: number;
}

/**
 * The badges around every screen (October 2026): the bell's unread count, the
 * downtime bar and the managers' time-off count used to be three requests on
 * every screen change and on three timers. Now one, asked by the web's
 * `useBadgePoll`. Each part is answered by the same service, with the same
 * rules, as its own route (`/notifications/unread-count`, `/downtime/current`,
 * `/pto/pending-count`), which stay for anything else that reads them.
 *
 * Open to anybody signed in: each part is scoped to the signed-in person, and
 * the time-off count is 0 for Employee access, as `/pto/pending-count` is.
 */
@Controller('badges')
export class BadgesController {
  constructor(
    private readonly inbox: InboxService,
    private readonly downtime: DowntimeService,
    private readonly pto: PtoService,
  ) {}

  @Get()
  async badges(@CurrentUser() user: AuthUser): Promise<Badges> {
    const [unread, downtime, timeOff] = await Promise.all([
      this.inbox.unreadCount(user.id),
      this.downtime.active(user),
      this.pto.pendingCount(user),
    ]);
    return { unread, downtime, timeOffPending: timeOff.pending };
  }
}
