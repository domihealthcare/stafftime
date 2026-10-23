import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { SettingsModule } from '../settings/settings.module';
import { PayController } from './pay.controller';
import { PayService } from './pay.service';
import { RotaCostController } from './rota-cost.controller';
import { RotaCostService } from './rota-cost.service';
import { StaffRecordsController } from './staff-records.controller';
import { StaffRecordsService } from './staff-records.service';

@Module({
  imports: [SettingsModule, EventsModule],
  controllers: [StaffRecordsController, RotaCostController, PayController],
  providers: [StaffRecordsService, RotaCostService, PayService],
})
export class StaffRecordsModule {}
