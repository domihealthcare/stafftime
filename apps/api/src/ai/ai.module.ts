import { Module } from '@nestjs/common';
import { AiService } from './ai.service';

/// Claude, for whoever needs it. See `ai.service.ts`.
@Module({
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
