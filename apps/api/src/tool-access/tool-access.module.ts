import { Global, Module } from '@nestjs/common';
import { ToolAccessController } from './tool-access.controller';
import { ToolAccessService } from './tool-access.service';

/// Global: the session, the guides, the phone book and the diagnostics board
/// all ask it who may use what.
@Global()
@Module({
  controllers: [ToolAccessController],
  providers: [ToolAccessService],
  exports: [ToolAccessService],
})
export class ToolAccessModule {}
