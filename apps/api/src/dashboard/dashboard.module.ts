import { Module } from '@nestjs/common';
import { ShiftsModule } from '../shifts/shifts.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ShiftsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
