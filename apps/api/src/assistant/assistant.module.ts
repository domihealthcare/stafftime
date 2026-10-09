import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { DirectoryModule } from '../directory/directory.module';
import { EmailModule } from '../email/email.module';
import { EventsModule } from '../events/events.module';
import { PtoModule } from '../pto/pto.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [
    AiModule,
    ShiftsModule,
    PtoModule,
    EventsModule,
    CalendarModule,
    DirectoryModule,
    EmailModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
