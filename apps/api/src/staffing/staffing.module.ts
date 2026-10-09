import { Module } from '@nestjs/common';
import { StaffingController } from './staffing.controller';

@Module({
  controllers: [StaffingController],
})
export class StaffingModule {}
