import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DeclineWordingController } from './decline-wording.controller';
import { PtoController } from './pto.controller';
import { PtoPolicyService } from './pto-policy.service';
import { PtoService } from './pto.service';

@Module({
  imports: [AiModule],
  controllers: [PtoController, DeclineWordingController],
  providers: [PtoService, PtoPolicyService],
  exports: [PtoService, PtoPolicyService],
})
export class PtoModule {}
