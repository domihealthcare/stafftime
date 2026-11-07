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

    const url = base + request.originalUrl;
    if (
      !urlsTwilioMaySign(url).some((one) => isValidTwilioSignature(token, one, body, signature))
    ) {
      // The path only (no query, no token): enough to see a wrong base address.
      this.logger.warn(
        `Refused a phone line request with a missing or wrong signature: ${base}${request.path}`,
      );
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

/// The address as given, and with the default port added or taken away:
/// Twilio has signed "https://host:443/..." as well as "https://host/...",
/// and its own libraries accept both.
export function urlsTwilioMaySign(url: string): string[] {
  try {
    const parsed = new URL(url);
    const port = parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '';
    if (!port) return [url];
    const path = `${parsed.pathname}${parsed.search}`;
    const withPort = `${parsed.protocol}//${parsed.hostname}:${parsed.port || port}${path}`;
    const withoutPort =
      parsed.port && parsed.port !== port ? url : `${parsed.protocol}//${parsed.hostname}${path}`;
    return [...new Set([url, withPort, withoutPort])];
  } catch {
    return [url];
  }
}
