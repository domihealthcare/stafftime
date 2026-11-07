import { Module } from '@nestjs/common';
import { OnCallController } from './on-call.controller';
import { OnCallRoutingService } from './on-call-routing.service';
import { OnCallService } from './on-call.service';

@Module({
  controllers: [OnCallController],
  providers: [OnCallService, OnCallRoutingService],
  exports: [OnCallService, OnCallRoutingService],
})
export class OnCallModule {}
