import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'stafftime_session';

/**
 * Session cookie settings.
 *
 * - httpOnly: JavaScript cannot read it, so an XSS bug cannot steal the session.
 * - sameSite lax: the cookie is not sent on cross-site requests, which is what
 *   blocks CSRF. Combined with the API being same-origin with the web app, no
 *   separate CSRF token is needed.
 * - secure in production: never sent over plain HTTP.
 */
export function sessionCookieOptions(expiresAt: Date, isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    expires: expiresAt,
  };
}

export function clearSessionCookie(response: Response, isProduction: boolean): void {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  });
}
