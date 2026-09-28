import { Module } from '@nestjs/common';
import { GoogleModule } from '../google/google.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { GoogleMeetService } from './google-meet.service';

@Module({
  imports: [GoogleModule],
  controllers: [EventsController],
  providers: [EventsService, GoogleMeetService],
  // The calendar feed puts them on people's phones.
  exports: [EventsService, GoogleMeetService],
})
export class EventsModule {}
