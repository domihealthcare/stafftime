import { Module } from '@nestjs/common';
import { StaffRecordsController } from './staff-records.controller';
import { StaffRecordsService } from './staff-records.service';

@Module({
  controllers: [StaffRecordsController],
  providers: [StaffRecordsService],
})
export class StaffRecordsModule {}
