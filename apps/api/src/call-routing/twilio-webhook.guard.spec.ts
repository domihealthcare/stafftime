import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { TwilioWebhookGuard, urlsTwilioMaySign } from './twilio-webhook.guard';
import { twilioSignature } from './twilio-signature';

const TOKEN = 'a-test-token-0123456789';
const BASE = 'https://staff.example.com';
const PATH = '/api/call-routing/voice/incoming';

function guardWith(env: Record<string, string | undefined>) {
  return new TwilioWebhookGuard({ get: (key: string) => env[key] } as never);
}

function context(body: Record<string, string>, signature?: string): ExecutionContext {
  const request = {
    body,
    originalUrl: PATH,
    headers: signature ? { 'x-twilio-signature': signature } : {},
  };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('TwilioWebhookGuard', () => {
  const body = { CallSid: 'CA1', From: '+12015550142', AccountSid: 'AC1' };
  const env = {
    TWILIO_AUTH_TOKEN: TOKEN,
    TWILIO_WEBHOOK_BASE_URL: `${BASE}/`,
    TWILIO_ACCOUNT_SID: 'AC1',
  };
  const good = twilioSignature(TOKEN, BASE + PATH, body);

  it('lets a signed request through', () => {
    expect(guardWith(env).canActivate(context(body, good))).toBe(true);
  });

  it('falls back to APP_URL for the base address', () => {
    const only = { TWILIO_AUTH_TOKEN: TOKEN, APP_URL: BASE };
    expect(guardWith(only).canActivate(context(body, good))).toBe(true);
  });

  it('is 503 with no auth token', () => {
    expect(() => guardWith({}).canActivate(context(body, good))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('is 403 for a missing or wrong signature', () => {
    expect(() => guardWith(env).canActivate(context(body))).toThrow(ForbiddenException);
    expect(() => guardWith(env).canActivate(context(body, 'nope'))).toThrow(ForbiddenException);
    expect(() => guardWith(env).canActivate(context({ ...body, From: '+1' }, good))).toThrow(
      ForbiddenException,
    );
  });

  it('is 403 when the AccountSid is another account', () => {
    const other = { ...body, AccountSid: 'AC2' };
    const signature = twilioSignature(TOKEN, BASE + PATH, other);
    expect(() => guardWith(env).canActivate(context(other, signature))).toThrow(ForbiddenException);
  });
});

describe('urlsTwilioMaySign', () => {
  it('tries the address with and without the default port', () => {
    expect(
      urlsTwilioMaySign('https://staff.domihealthcare.com/api/call-routing/voice/dial?i=1'),
    ).toEqual([
      'https://staff.domihealthcare.com/api/call-routing/voice/dial?i=1',
      'https://staff.domihealthcare.com:443/api/call-routing/voice/dial?i=1',
    ]);
    expect(urlsTwilioMaySign('https://staff.domihealthcare.com:443/api/x')).toEqual([
      'https://staff.domihealthcare.com:443/api/x',
      'https://staff.domihealthcare.com/api/x',
    ]);
  });

  it('leaves another port alone', () => {
    expect(urlsTwilioMaySign('http://localhost:3000/api/x')).toEqual([
      'http://localhost:3000/api/x',
    ]);
  });
});
