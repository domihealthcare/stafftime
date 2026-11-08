import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { OnCallModule } from '../on-call/on-call.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { DeclineWordingController } from './decline-wording.controller';
import { PtoController } from './pto.controller';
import { PtoPolicyService } from './pto-policy.service';
import { PtoService } from './pto.service';
import { CleanTimeOffService } from './clean-time-off.service';
import { TimeOffDaysService } from './time-off-days.service';
import { PastBalanceRepairService } from './past-balance-repair.service';
import { ProviderDayOffService } from './provider-day-off.service';

@Module({
  imports: [AiModule, ShiftsModule, OnCallModule],
  controllers: [PtoController, DeclineWordingController],
  providers: [
    PtoService,
    PtoPolicyService,
    CleanTimeOffService,
    TimeOffDaysService,
    PastBalanceRepairService,
    ProviderDayOffService,
  ],
  exports: [PtoService, PtoPolicyService, TimeOffDaysService],
})
export class PtoModule {}
