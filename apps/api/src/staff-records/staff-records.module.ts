import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { RotaCostController } from './rota-cost.controller';
import { RotaCostService } from './rota-cost.service';
import { StaffRecordsController } from './staff-records.controller';
import { StaffRecordsService } from './staff-records.service';

@Module({
  imports: [SettingsModule],
  controllers: [StaffRecordsController, RotaCostController],
  providers: [StaffRecordsService, RotaCostService],
})
export class StaffRecordsModule {}
