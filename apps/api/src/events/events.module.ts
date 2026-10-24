import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { GoogleModule } from '../google/google.module';
import { EventRepliesController } from './event-replies.controller';
import { EventRepliesService } from './event-replies.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { FindATimeService } from './find-a-time.service';
import { GoogleMeetService } from './google-meet.service';
import { LunchNoticesService } from './lunch-notices.service';
import { PhlebotomistsController } from './phlebotomists.controller';
import { PhlebotomistsService } from './phlebotomists.service';
import { ReadBookingController } from './read-booking.controller';

@Module({
  imports: [GoogleModule, AiModule],
  controllers: [
    EventsController,
    EventRepliesController,
    ReadBookingController,
    PhlebotomistsController,
  ],
  providers: [
    EventsService,
    EventRepliesService,
    FindATimeService,
    GoogleMeetService,
    LunchNoticesService,
    PhlebotomistsService,
  ],
  // The calendar feed puts them on people's phones; the five-minute timer
  // sends the night-before rep lunch notice.
  exports: [EventsService, GoogleMeetService, LunchNoticesService],
})
export class EventsModule {}
