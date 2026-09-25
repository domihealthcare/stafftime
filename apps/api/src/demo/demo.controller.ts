import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { loadDemoData } from './demo-data';
import { ClearTestDataDto } from './clear-test-data.dto';
import { clearTestData, previewTestData } from './test-data';

/**
 * Fills a fresh deployment with something to look at.
 *
 * This exists as a route, and not only as a terminal command, because the
 * person setting up a deployment is in a browser. `DEPLOY.md` promises "no
 * terminal needed" and then asked for one at the last step, which is the step
 * that decides whether the managers see an empty timesheet or a realistic one.
 *
 * Two guards, and they are not belt-and-braces — either one alone would be
 * insufficient:
 *
 * - **Admin only.** It creates accounts and wipes hours.
 * - **Test deployments only.** It deletes every time entry, shift, time-off
 *   request and checklist in the database, and creates staff who all share one
 *   well-known password. On a live payroll that is not a mistake you can undo.
 */
@Controller('demo')
export class DemoController {
  private readonly logger = new Logger(DemoController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Post('load')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async load(@CurrentUser() user: AuthUser) {
    if (this.config.get<string>('APP_ENVIRONMENT') !== 'test') {
      throw new ForbiddenException(
        'Demo data can only be loaded on a test deployment. This replaces every ' +
          'shift and punch in the database with invented ones, and creates staff ' +
          'who all share one password. Set APP_ENVIRONMENT to test first.',
      );
    }

    this.logger.warn(`Demo data load started by ${user.id}`);
    const summary = await loadDemoData(this.prisma);
    this.logger.warn(
      `Demo data loaded: ${summary.staffAdded} staff, ${summary.shifts} shifts, ${summary.timeEntries} entries`,
    );

    return summary;
  }

  /** What "Clear the test data" would remove, and which accounts it keeps. */
  @Get('test-data')
  @Roles(Role.ADMIN)
  async testData() {
    this.assertTest();
    return previewTestData(this.prisma);
  }

  /**
   * The step between trying the app out and using it for real: the demo staff
   * and everything made while testing go; the practice's set-up stays (see
   * `test-data.ts`). Test deployments only, like loading the demo — on a live
   * one this would delete real hours — and the body has to spell out the
   * confirmation, so no stray request can set it off.
   */
  @Post('clear')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async clear(@CurrentUser() user: AuthUser, @Body() body: ClearTestDataDto) {
    this.assertTest();
    // The DTO has already refused anything but the spelled-out confirmation.
    this.logger.warn(`Test data cleared by ${user.id} (${body.confirm})`);
    const cleared = await clearTestData(this.prisma);
    this.logger.warn(`Test data cleared: ${JSON.stringify(cleared)}`);
    return cleared;
  }

  private assertTest() {
    if (this.config.get<string>('APP_ENVIRONMENT') !== 'test') {
      throw new ForbiddenException(
        'This is the live site. Test data can only be cleared on a test deployment — ' +
          'here it would delete real hours.',
      );
    }
  }
}
