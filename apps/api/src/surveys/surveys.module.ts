import { Module } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FeedbackController, SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';

@Module({
  controllers: [SurveysController, FeedbackController],
  providers: [SurveysService, FeedbackService],
})
export class SurveysModule {}
