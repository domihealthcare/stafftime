import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeEquals } from '../auth/session.service';
import { Public } from '../common/auth/public.decorator';
import { MaintenanceService } from './maintenance.service';
import { PunchRemindersService } from './punch-reminders.service';

/**
 * The scheduled housekeeping route, called by Vercel Cron (see vercel.json).
 *
 * There is nobody signed in when a cron fires, so this cannot sit behind the
 * session guard. It is authorised with a shared secret instead, sent the way
 * Vercel sends it: `Authorization: Bearer $CRON_SECRET`.
 *
 * With no CRON_SECRET configured the route refuses everything. A maintenance
 * endpoint that quietly falls open when a variable is missing is worse than not
 * having one.
 *
 * The punch reminders are called every few minutes by an outside timer
 * (cron-job.org — Vercel's free plan runs its own once a day), so they have
 * their own secret, `PUNCH_REMINDER_SECRET`: the one handed to an outside
 * service can send reminders and nothing else, never the nightly round-up.
 * See docs/punch-reminders-setup.md.
 */
@Controller('maintenance')
export class MaintenanceController {
  private readonly logger = new Logger(MaintenanceController.name);
  private readonly secret?: string;
  private readonly reminderSecret?: string;

  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly punchReminders: PunchRemindersService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('CRON_SECRET');
    this.reminderSecret = config.get<string>('PUNCH_REMINDER_SECRET');
  }

  @Get('purge')
  @Public()
  async purge(@Headers('authorization') authorization?: string) {
    this.authorise(authorization, this.secret, 'CRON_SECRET');
    return this.maintenance.purge();
  }

  /// "You haven't clocked in" / "You're still clocked in", 15 minutes after.
  @Get('punch-reminders')
  @Public()
  async remindAboutPunches(@Headers('authorization') authorization?: string) {
    this.authorise(authorization, this.reminderSecret, 'PUNCH_REMINDER_SECRET');
    return this.punchReminders.run();
  }

  private authorise(authorization: string | undefined, secret: string | undefined, name: string) {
    if (!secret) {
      this.logger.warn(`Maintenance route called with no ${name} configured`);
      throw new ServiceUnavailableException('Scheduled maintenance is not configured.');
    }

    const offered = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
    if (!safeEquals(offered, secret)) {
      throw new ForbiddenException('Not allowed.');
    }
  }
}
