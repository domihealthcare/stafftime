import { Module } from '@nestjs/common';
import { OnCallController } from './on-call.controller';
import { OnCallService } from './on-call.service';

@Module({
  controllers: [OnCallController],
  providers: [OnCallService],
  exports: [OnCallService],
})
export class OnCallModule {}
