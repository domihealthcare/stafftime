import { Module } from '@nestjs/common';
import { LocationVerificationService } from './location-verification.service';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';

@Module({
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService, LocationVerificationService],
  exports: [TimeEntriesService, LocationVerificationService],
})
export class TimeEntriesModule {}
