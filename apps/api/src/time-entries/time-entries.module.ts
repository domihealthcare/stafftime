import { Module } from '@nestjs/common';
import { ClosingModule } from '../closing/closing.module';
import { AutoClockOutService } from './auto-clock-out.service';
import { CorrectionRequestsController } from './correction-requests.controller';
import { CorrectionRequestsService } from './correction-requests.service';
import { LocationVerificationService } from './location-verification.service';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';

@Module({
  imports: [ClosingModule],
  controllers: [TimeEntriesController, CorrectionRequestsController],
  providers: [
    TimeEntriesService,
    LocationVerificationService,
    AutoClockOutService,
    CorrectionRequestsService,
  ],
  exports: [TimeEntriesService, LocationVerificationService, AutoClockOutService],
})
export class TimeEntriesModule {}
