import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { OnCallModule } from '../on-call/on-call.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [EventsModule, OnCallModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
