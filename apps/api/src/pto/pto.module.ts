import { Module } from '@nestjs/common';
import { PtoController } from './pto.controller';
import { PtoService } from './pto.service';

@Module({
  controllers: [PtoController],
  providers: [PtoService],
  exports: [PtoService],
})
export class PtoModule {}
