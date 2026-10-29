import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'stafftime_session';

/**
 * Session cookie settings.
 *
 * - httpOnly: JavaScript cannot read it, so an XSS bug cannot steal the session.
 * - sameSite lax: the cookie is not sent on cross-site requests, which is what
 *   blocks CSRF. Combined with the API being same-origin with the web app, no
 *   separate CSRF token is needed.
 * - secure wherever the app is served over HTTPS: never sent over plain HTTP.
 */
/**
 * Whether cookies are marked `secure`. On whenever NODE_ENV is production OR
 * the app's own address (APP_URL) is https, so the live site keeps it even if
 * NODE_ENV were ever missing (it used to depend on NODE_ENV alone, which
 * defaults to development). Off only for a plain-http address, which is the
 * local default (http://localhost:5173) and what the browser suites use.
 * Shared by the session, setup and time clock cookies.
 */
export function secureCookies(config: ConfigService): boolean {
  if (config.get<string>('NODE_ENV') === 'production') return true;
  return (config.get<string>('APP_URL') ?? '').trim().toLowerCase().startsWith('https://');
}

export function sessionCookieOptions(expiresAt: Date, secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: expiresAt,
  };
}

export function clearSessionCookie(response: Response, secure: boolean): void {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  });
}
