import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { GoogleModule } from '../google/google.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { GoogleMeetService } from './google-meet.service';
import { LunchNoticesService } from './lunch-notices.service';
import { ReadBookingController } from './read-booking.controller';

@Module({
  imports: [GoogleModule, AiModule],
  controllers: [EventsController, ReadBookingController],
  providers: [EventsService, GoogleMeetService, LunchNoticesService],
  // The calendar feed puts them on people's phones; the five-minute timer
  // sends the night-before rep lunch notice.
  exports: [EventsService, GoogleMeetService, LunchNoticesService],
})
export class EventsModule {}
