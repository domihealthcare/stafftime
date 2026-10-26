import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DowntimeModule } from '../downtime/downtime.module';
import { EmailModule } from '../email/email.module';
import { EventsModule } from '../events/events.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { TimeEntriesModule } from '../time-entries/time-entries.module';
import { MaintenanceController } from './maintenance.controller';
import { LicenseRemindersService } from './license-reminders.service';
import { OnboardingRemindersService } from './onboarding-reminders.service';
import { MaintenanceService } from './maintenance.service';
import { PunchRemindersService } from './punch-reminders.service';
import { WeeklySummaryService } from './weekly-summary.service';

@Module({
  imports: [
    AuthModule,
    DowntimeModule,
    EmailModule,
    EventsModule,
    RequirementsModule,
    ShiftsModule,
    TimeEntriesModule,
  ],
  controllers: [MaintenanceController],
  providers: [
    MaintenanceService,
    PunchRemindersService,
    LicenseRemindersService,
    OnboardingRemindersService,
    WeeklySummaryService,
  ],
})
export class MaintenanceModule {}
