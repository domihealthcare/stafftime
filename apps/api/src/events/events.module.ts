import { Module } from '@nestjs/common';
import { GoogleModule } from '../google/google.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { GoogleMeetService } from './google-meet.service';
import { LunchNoticesService } from './lunch-notices.service';

@Module({
  imports: [GoogleModule],
  controllers: [EventsController],
  providers: [EventsService, GoogleMeetService, LunchNoticesService],
  // The calendar feed puts them on people's phones; the five-minute timer
  // sends the night-before rep lunch notice.
  exports: [EventsService, GoogleMeetService, LunchNoticesService],
})
export class EventsModule {}
