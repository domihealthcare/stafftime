import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/auth/roles.decorator';
import { DashboardService } from './dashboard.service';
import { PracticeOverviewService } from './practice-overview.service';

/// Managers and admins. Per-person figures (who worked overtime) are part of
/// running the rota; staff have their own timesheet.
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly practice: PracticeOverviewService,
  ) {}

  /// Everything else a manager keeps an eye on: surveys, licenses,
  /// onboarding and offboarding, closing checklists, and what is waiting on
  /// a manager.
  @Get('practice')
  @Roles(Role.MANAGER)
  overview() {
    return this.practice.overview();
  }

  @Get()
  @Roles(Role.MANAGER)
  summary(@Query('weeks') weeks?: string) {
    return this.dashboard.summary(weeks ? Number(weeks) : undefined);
  }
}
