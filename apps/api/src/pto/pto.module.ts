import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DeclineWordingController } from './decline-wording.controller';
import { PtoController } from './pto.controller';
import { PtoPolicyService } from './pto-policy.service';
import { PtoService } from './pto.service';
import { CleanTimeOffService } from './clean-time-off.service';
import { TimeOffDaysService } from './time-off-days.service';
import { BalanceReminderService } from './balance-reminder.service';

@Module({
  imports: [AiModule],
  controllers: [PtoController, DeclineWordingController],
  providers: [
    PtoService,
    PtoPolicyService,
    CleanTimeOffService,
    TimeOffDaysService,
    BalanceReminderService,
  ],
  exports: [PtoService, PtoPolicyService, TimeOffDaysService],
})
export class PtoModule {}
