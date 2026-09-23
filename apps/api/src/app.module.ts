import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AppController } from './app.controller';
import { RolesGuard } from './common/auth/roles.guard';
import { AppConfigModule } from './app-config/app-config.module';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { CalendarModule } from './calendar/calendar.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { SessionAuthGuard } from './common/auth/session.guard';
import { validateEnv } from './config/env.validation';
import { CredentialsModule } from './credentials/credentials.module';
import { DirectoryModule } from './directory/directory.module';
import { EmailModule } from './email/email.module';
import { EmployeesModule } from './employees/employees.module';
import { ExportsModule } from './exports/exports.module';
import { JobRolesModule } from './job-roles/job-roles.module';
import { KioskModule } from './kiosk/kiosk.module';
import { LocationsModule } from './locations/locations.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { PrismaModule } from './prisma/prisma.module';
import { PtoModule } from './pto/pto.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DemoModule } from './demo/demo.module';
import { SettingsModule } from './settings/settings.module';
import { SetupModule } from './setup/setup.module';
import { ShiftsModule } from './shifts/shifts.module';
import { SurveysModule } from './surveys/surveys.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    EmailModule,
    AuthModule,
    AppConfigModule,
    SettingsModule,
    DemoModule,
    CalendarModule,
    LocationsModule,
    EmployeesModule,
    ShiftsModule,
    TimeEntriesModule,
    KioskModule,
    ExportsModule,
    PtoModule,
    ChecklistsModule,
    CredentialsModule,
    AnnouncementsModule,
    JobRolesModule,
    DirectoryModule,
    AvailabilityModule,
    SurveysModule,
    DashboardModule,
    MaintenanceModule,
    SetupModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: identity is established before roles are checked.
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
