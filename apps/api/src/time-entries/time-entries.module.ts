import { Module } from '@nestjs/common';
import { ClosingModule } from '../closing/closing.module';
import { AutoClockOutService } from './auto-clock-out.service';
import { LocationVerificationService } from './location-verification.service';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';

@Module({
  imports: [ClosingModule],
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService, LocationVerificationService, AutoClockOutService],
  exports: [TimeEntriesService, LocationVerificationService, AutoClockOutService],
})
export class TimeEntriesModule {}
