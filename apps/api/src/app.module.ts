import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { DevAuthGuard } from './common/auth/dev-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { validateEnv } from './config/env.validation';
import { EmployeesModule } from './employees/employees.module';
import { LocationsModule } from './locations/locations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ShiftsModule } from './shifts/shifts.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    LocationsModule,
    EmployeesModule,
    ShiftsModule,
    TimeEntriesModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: identity is established before roles are checked.
    { provide: APP_GUARD, useClass: DevAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
