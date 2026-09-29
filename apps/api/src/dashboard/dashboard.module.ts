import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { SurveysModule } from '../surveys/surveys.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PracticeOverviewService } from './practice-overview.service';

@Module({
  imports: [ShiftsModule, CredentialsModule, SurveysModule],
  controllers: [DashboardController],
  providers: [DashboardService, PracticeOverviewService],
})
export class DashboardModule {}
