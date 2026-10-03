import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 10_000;

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/// A Google refusal, in words, for the caller to put in its own sentence.
export class GoogleProblem extends Error {
  constructor(
    readonly reason: string,
    readonly status?: number,
  ) {
    super(reason);
  }
}

/**
 * Signs the app in to Google, for Meet links and calendar invites (September
 * 2026, Dominguez). See docs/google-meet-setup.md.
 *
 * One Google Cloud service account — a robot login belonging to the app. It
 * gets a token two ways:
 *
 * - **As the host account** (office@, `GOOGLE_MEET_HOST`), for exactly the
 *   scopes the Workspace admin has allowed it through domain-wide delegation.
 * - **As itself**, which needs nobody's permission and sees only what has
 *   been shared with the robot's own address.
 *
 * The token request is a key-signed JWT built with node:crypto rather than a
 * Google library. Each token is kept until five minutes before it expires, per
 * scope, so a scope the admin has not allowed spoils none of the others.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly key: ServiceAccountKey | null;
  readonly host: string | null;
  private readonly tokens = new Map<string, { value: string; expiresAt: number }>();

  constructor(config: ConfigService) {
    this.host = config.get<string>('GOOGLE_MEET_HOST')?.trim() || null;
    this.key = parseKey(config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON'));
    if (config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON') && !this.key) {
      this.logger.error(
        'GOOGLE_SERVICE_ACCOUNT_JSON is set but is not a service account key; Google is off',
      );
    }
  }

  /// Whether the app can act as the host account at all.
  get available(): boolean {
    return Boolean(this.key && this.host);
  }

  /// Whether the app has a key, for what it does as itself.
  get hasKey(): boolean {
    return this.key !== null;
  }

  /// The robot's own address, which a Drive folder is shared with.
  get robotEmail(): string | null {
    return this.key?.client_email ?? null;
  }

  /// A token acting as the host account, for one delegated scope.
  asHost(scope: string): Promise<string> {
    if (!this.key || !this.host) throw new GoogleProblem('Google is not set up yet');
    return this.token(scope, this.host);
  }

  /// A token as the robot itself: no delegation, only what is shared with it.
  asRobot(scope: string): Promise<string> {
    if (!this.key) throw new GoogleProblem('Google is not set up yet');
    return this.token(scope, null);
  }

  /// A request to Google with a timeout; an unreachable Google is a problem.
  /// The timeout covers reading the answer too, so a file being handed on
  /// asks for longer.
  async call(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      this.logger.error(
        `Could not reach Google: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new GoogleProblem('Google could not be reached');
    }
  }

  private async token(scope: string, subject: string | null): Promise<string> {
    const cacheKey = `${subject ?? 'robot'} ${scope}`;
    const cached = this.tokens.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 5 * 60_000) return cached.value;

    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({
      iss: this.key!.client_email,
      ...(subject ? { sub: subject } : {}),
      scope,
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
      throw new GoogleProblem('the service account key is not valid');
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
        `Google would not give a token for ${scope}${subject ? ` as ${subject}` : ''}: ${
          body.error ?? response.status
        } ${body.error_description ?? ''}`,
      );
      throw new GoogleProblem(
        body.error === 'unauthorized_client'
          ? 'the Workspace admin has not allowed it yet'
          : (body.error_description ?? body.error ?? `Google answered ${response.status}`),
        response.status,
      );
    }
    this.tokens.set(cacheKey, {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    });
    return body.access_token;
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
