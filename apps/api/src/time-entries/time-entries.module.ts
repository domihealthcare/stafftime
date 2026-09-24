import { Module } from '@nestjs/common';
import { ClosingModule } from '../closing/closing.module';
import { LocationVerificationService } from './location-verification.service';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';

@Module({
  imports: [ClosingModule],
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService, LocationVerificationService],
  exports: [TimeEntriesService, LocationVerificationService],
})
export class TimeEntriesModule {}
