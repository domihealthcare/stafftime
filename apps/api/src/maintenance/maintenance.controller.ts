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
 */
@Controller('maintenance')
export class MaintenanceController {
  private readonly logger = new Logger(MaintenanceController.name);
  private readonly secret?: string;

  constructor(
    private readonly maintenance: MaintenanceService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('CRON_SECRET');
  }

  @Get('purge')
  @Public()
  async purge(@Headers('authorization') authorization?: string) {
    if (!this.secret) {
      this.logger.warn('Maintenance route called with no CRON_SECRET configured');
      throw new ServiceUnavailableException('Scheduled maintenance is not configured.');
    }

    const offered = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
    if (!safeEquals(offered, this.secret)) {
      throw new ForbiddenException('Not allowed.');
    }

    return this.maintenance.purge();
  }
}
