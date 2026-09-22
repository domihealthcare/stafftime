import type { CookieOptions, Response } from 'express';

export const KIOSK_COOKIE = 'stafftime_kiosk';

/// A year. A front-desk tablet should not be re-paired every week; revocation
/// is server-side, which is what actually ends a device's access.
const KIOSK_COOKIE_MAX_AGE_MS = 365 * 24 * 3_600_000;

export function kioskCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: KIOSK_COOKIE_MAX_AGE_MS,
  };
}

export function clearKioskCookie(response: Response, isProduction: boolean): void {
  response.clearCookie(KIOSK_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  });
}
