import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { OnCallModule } from '../on-call/on-call.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CallLogService } from './call-log.service';
import { CallRoutingController } from './call-routing.controller';
import { TwilioWebhookGuard } from './twilio-webhook.guard';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [PrismaModule, OnCallModule, EmailModule],
  controllers: [VoiceController, CallRoutingController],
  providers: [VoiceService, CallLogService, TwilioWebhookGuard],
  exports: [CallLogService],
})
export class CallRoutingModule {}
