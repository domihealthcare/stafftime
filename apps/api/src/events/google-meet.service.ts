import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'node:crypto';

/// The one thing the app may do as the host account: create Meet meetings.
/// Nothing in its calendar, mail or files.
export const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.created';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SPACES_URL = 'https://meet.googleapis.com/v2/spaces';
const TIMEOUT_MS = 10_000;

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/**
 * Creates Google Meet links for events (September 2026, Dominguez), hosted
 * by the practice's shared account (office@domihealthcare.com).
 *
 * A Google Cloud service account, allowed by the Workspace admin to act as
 * that one account for creating meetings and nothing else (domain-wide
 * delegation, one scope). See docs/google-meet-setup.md.
 *
 * Each meeting is "Open": anybody with the link joins without knocking.
 * Dominguez first asked for "Trusted" (practice accounts walk in, others
 * knock), then chose Open once it was clear most staff are on personal
 * Google accounts and would all have been left knocking.
 *
 * Off until both settings are present; the form only offers the tick box
 * when it is on, and a pasted link always works.
 */
@Injectable()
export class GoogleMeetService {
  private readonly logger = new Logger(GoogleMeetService.name);
  private readonly key: ServiceAccountKey | null;
  private readonly host: string | null;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(config: ConfigService) {
    this.host = config.get<string>('GOOGLE_MEET_HOST')?.trim() || null;
    this.key = parseKey(config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON'));
    if (config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON') && !this.key) {
      this.logger.error(
        'GOOGLE_SERVICE_ACCOUNT_JSON is set but is not a service account key; Meet links are off',
      );
    }
  }

  get available(): boolean {
    return Boolean(this.key && this.host);
  }

  /// A new Meet link, e.g. "https://meet.google.com/abc-defg-hij".
  async createLink(): Promise<string> {
    if (!this.key || !this.host) {
      throw new BadRequestException(
        'Google Meet is not set up yet, so the app cannot make a link. Paste one instead.',
      );
    }
    const response = await this.call(SPACES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config: { accessType: 'OPEN' } }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      meetingUri?: string;
      error?: { message?: string };
    };
    if (!response.ok || !body.meetingUri?.startsWith('https://')) {
      this.logger.error(
        `Meet refused to create a meeting (${response.status}): ${body.error?.message ?? 'no reason given'}`,
      );
      throw this.failure(body.error?.message);
    }
    this.logger.log(`Meet link created, hosted by ${this.host}`);
    return body.meetingUri;
  }

  /**
   * An access token acting as the host, from a key-signed request (the
   * standard server-to-server grant). Kept until five minutes before it
   * expires, so a series of saves does not ask Google each time.
   */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 5 * 60_000) return this.token.value;

    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({
      iss: this.key!.client_email,
      sub: this.host,
      scope: MEET_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })}`;
    let signature: string;
    try {
      signature = createSign('RSA-SHA256')
        .update(unsigned)
        .sign(this.key!.private_key, 'base64url');
    } catch {
      this.logger.error('The Google service account key could not sign; is it the whole key?');
      throw this.failure('the service account key is not valid');
    }

    const response = await this.call(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }).toString(),
    });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !body.access_token) {
      // unauthorized_client almost always means the admin step — domain-wide
      // delegation for this scope — is missing or has a typo.
      this.logger.error(
        `Google would not let the app act as ${this.host}: ${body.error ?? response.status} ${body.error_description ?? ''}`,
      );
      throw this.failure(
        body.error === 'unauthorized_client'
          ? 'the Workspace admin has not allowed the app to create meetings yet'
          : (body.error_description ?? body.error),
      );
    }
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
    return body.access_token;
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      this.logger.error(
        `Could not reach Google: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw this.failure('Google could not be reached');
    }
  }

  private failure(reason?: string) {
    return new BadGatewayException(
      `Google did not make a Meet link${reason ? ` (${reason})` : ''}. Nothing was saved — try again, or paste a link instead.`,
    );
  }
}

/// The key as Google gives it: the whole downloaded JSON file.
function parseKey(raw: string | undefined): ServiceAccountKey | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountKey>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
      return null;
    }
    // Pasted into a one-line setting, the key's line breaks can arrive as "\n".
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
