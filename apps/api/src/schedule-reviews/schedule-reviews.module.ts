import { Module } from '@nestjs/common';
import { ScheduleReviewsController } from './schedule-reviews.controller';
import { ScheduleReviewsService } from './schedule-reviews.service';

@Module({
  controllers: [ScheduleReviewsController],
  providers: [ScheduleReviewsService],
})
export class ScheduleReviewsModule {}
