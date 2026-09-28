import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService],
  // The calendar feed puts them on people's phones.
  exports: [EventsService],
})
export class EventsModule {}
