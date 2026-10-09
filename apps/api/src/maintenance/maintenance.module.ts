import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { EventsModule } from '../events/events.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { TimeEntriesModule } from '../time-entries/time-entries.module';
import { MaintenanceController } from './maintenance.controller';
import { LicenseRemindersService } from './license-reminders.service';
import { OnboardingRemindersService } from './onboarding-reminders.service';
import { MaintenanceService } from './maintenance.service';
import { PunchRemindersService } from './punch-reminders.service';

@Module({
  imports: [AuthModule, EmailModule, EventsModule, ShiftsModule, TimeEntriesModule],
  controllers: [MaintenanceController],
  providers: [
    MaintenanceService,
    PunchRemindersService,
    LicenseRemindersService,
    OnboardingRemindersService,
  ],
})
export class MaintenanceModule {}
