import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/auth/public.decorator';
import { AppEnvironment } from '../config/env.validation';

/**
 * The handful of facts the web app needs before anyone signs in.
 *
 * Public on purpose: the banner has to appear on the sign-in screen too, which
 * is exactly where somebody might mistake a test deployment for the real one.
 */
@Controller('config')
export class AppConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @Public()
  get() {
    const environment = this.config.get<AppEnvironment>(
      'APP_ENVIRONMENT',
      AppEnvironment.Production,
    );

    return {
      environment,
      isTestEnvironment: environment === AppEnvironment.Test,
      // The commit this server was deployed from, so the Help page can tell a
      // stale browser tab from what is live. Null where the host does not say.
      version: this.config.get<string>('VERCEL_GIT_COMMIT_SHA')?.slice(0, 7) ?? null,
    };
  }
}
