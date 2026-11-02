/**
 * Face ID, Touch ID, a fingerprint or Windows Hello in place of a password
 * (November 2026, Dominguez: "staff can use face id through their phone to
 * login to portal"). A standard passkey: the phone checks the face itself and
 * signs a one-time challenge; Domi Staff never sees the face or fingerprint.
 *
 * The WebAuthn helper is loaded only when one of these is used, so the
 * sign-in screen downloads nothing more for it.
 */
import type { PasskeySummary } from './types';
import { api } from './api';

export type { PasskeySummary };

/// Whether this browser can use passkeys at all.
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

/// Whether this device itself has Face ID, a fingerprint reader or the like
/// (not only a phone held up to a computer). Home's offer waits for it.
export async function deviceHasFaceId(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/// What the device calls it, in English (translate at the caller): "Face ID"
/// on an iPhone, "Touch ID" on a Mac and so on. Only words: the device's own
/// prompt says what it really is.
export function unlockMethod(userAgent: string = navigator.userAgent): string {
  if (/\b(iPhone|iPad|iPod)\b/.test(userAgent)) return 'Face ID';
  if (/\bMacintosh\b/.test(userAgent)) return 'Touch ID';
  if (/\bWindows\b/.test(userAgent)) return 'Windows Hello';
  if (/\bAndroid\b/.test(userAgent)) return 'your fingerprint';
  return 'a passkey';
}

/// The person closed the prompt, looked away, or it timed out: not worth an
/// error message.
export function wasCancelled(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  const cause = (error as { cause?: { name?: string } } | null)?.cause?.name;
  return [name, cause].some((value) => value === 'NotAllowedError' || value === 'AbortError');
}

/// This device already holds a passkey for this account.
export function alreadyOnThisDevice(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  const cause = (error as { cause?: { name?: string } } | null)?.cause?.name;
  return name === 'InvalidStateError' || cause === 'InvalidStateError';
}

/// Signing in: the phone offers the passkeys it holds for Domi Staff.
export async function signInWithPasskey() {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const optionsJSON = await api.passkeySignInOptions();
  return api.passkeySignIn(await startAuthentication({ optionsJSON }));
}

/// Setting it up on this device. `password` when the server asks for it
/// (`PASSWORD_NEEDED`): signed in more than a few minutes ago.
export async function setUpPasskey(password?: string): Promise<PasskeySummary[]> {
  const { startRegistration } = await import('@simplewebauthn/browser');
  const optionsJSON = await api.passkeyRegisterOptions(password);
  return api.registerPasskey(await startRegistration({ optionsJSON }));
}

/// Opening pay with it instead of the PIN.
export async function unlockPayWithPasskey() {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const optionsJSON = await api.payPasskeyOptions();
  return api.unlockPayWithPasskey(await startAuthentication({ optionsJSON }));
}

/// Set on this device once Face ID is set up here, or the offer on Home is
/// turned down, so Home stops offering. Per device and person; a convenience
/// only, so it is fine for it to be lost.
const OFFER_KEY = (employeeId: string) => `domi:passkey-offer:${employeeId}`;

export function offerSettled(employeeId: string): boolean {
  try {
    return window.localStorage.getItem(OFFER_KEY(employeeId)) !== null;
  } catch {
    return false;
  }
}

export function settleOffer(employeeId: string, how: 'set-up' | 'not-now'): void {
  try {
    window.localStorage.setItem(OFFER_KEY(employeeId), how);
  } catch {
    // Private browsing and the like: the offer may come back, nothing worse.
  }
}
