import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { isValidTwilioSignature, TwilioParams } from './twilio-signature';

/**
 * Lets through only requests Twilio signed. With no auth token set the line
 * refuses everything (503), so Twilio's own fallback takes over; a missing or
 * wrong signature is 403. The token is never logged.
 */
@Injectable()
export class TwilioWebhookGuard implements CanActivate {
  private readonly logger = new Logger(TwilioWebhookGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!token) {
      throw new ServiceUnavailableException('The phone line is not set up.');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const base = (
      this.config.get<string>('TWILIO_WEBHOOK_BASE_URL') ||
      this.config.get<string>('APP_URL') ||
      ''
    ).replace(/\/+$/, '');
    const body = (request.body ?? {}) as TwilioParams;
    const header = request.headers['x-twilio-signature'];
    const signature = Array.isArray(header) ? header[0] : header;

    if (!isValidTwilioSignature(token, base + request.originalUrl, body, signature)) {
      this.logger.warn('Refused a phone line request with a missing or wrong signature.');
      throw new ForbiddenException('Not signed by Twilio.');
    }

    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    if (accountSid && body.AccountSid !== accountSid) {
      this.logger.warn('Refused a phone line request from another Twilio account.');
      throw new ForbiddenException('Not from this Twilio account.');
    }
    return true;
  }
}
