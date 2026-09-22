import { Module } from '@nestjs/common';
import { PtoController } from './pto.controller';
import { PtoPolicyService } from './pto-policy.service';
import { PtoService } from './pto.service';

@Module({
  controllers: [PtoController],
  providers: [PtoService, PtoPolicyService],
  exports: [PtoService, PtoPolicyService],
})
export class PtoModule {}
