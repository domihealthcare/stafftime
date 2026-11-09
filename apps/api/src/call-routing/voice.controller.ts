import { Body, Controller, Header, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Public } from '../common/auth/public.decorator';
import { TwilioWebhookGuard } from './twilio-webhook.guard';
import { VoiceService } from './voice.service';

type Form = Record<string, string>;
type Query_ = Record<string, string>;

/// Twilio's webhooks for the on-call line. Signed, never signed in.
@Controller('call-routing/voice')
@Public()
@UseGuards(TwilioWebhookGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Post('incoming')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  incoming(@Body() body: Form) {
    return this.voice.incoming(body ?? {});
  }

  @Post('language')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  language(@Body() body: Form, @Query() query: Query_) {
    return this.voice.language(body ?? {}, query ?? {});
  }

  @Post('answered')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  answered(@Body() body: Form, @Query() query: Query_) {
    return this.voice.answered(body ?? {}, query ?? {});
  }

  @Post('whisper')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  whisper() {
    return this.voice.whisper();
  }

  @Post('dial')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  dial(@Body() body: Form, @Query() query: Query_) {
    return this.voice.dialResult(body ?? {}, query ?? {});
  }

  @Post('status')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  status(@Body() body: Form) {
    return this.voice.status(body ?? {});
  }
}
