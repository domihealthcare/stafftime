import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ReviewMeetingsController, Reviews360Controller } from './reviews360.controller';
import { Reviews360Service } from './reviews360.service';

@Module({
  imports: [EventsModule],
  controllers: [Reviews360Controller, ReviewMeetingsController],
  providers: [Reviews360Service],
})
export class Reviews360Module {}
