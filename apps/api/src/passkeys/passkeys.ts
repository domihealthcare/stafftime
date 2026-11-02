/**
 * The rules for passkeys (Face ID and the like, November 2026), kept apart
 * from the database so they can be read and tested on their own.
 */

/// How long a challenge may wait for its answer.
export const CHALLENGE_MINUTES = 5;

/// Setting Face ID up asks for the password again, unless the person signed
/// in this long ago or less: they have only just typed it.
export const FRESH_SIGN_IN_MINUTES = 10;

/// ES256 (what phones use), EdDSA and RS256 (Windows Hello).
export const ALGORITHMS = [-7, -8, -257];

/// The error code that tells the screen to ask for the password.
export const PASSWORD_NEEDED = 'PASSWORD_NEEDED';

export const SET_UP_FAILED = 'Face ID could not be set up. Try again.';
export const NOT_RECOGNISED =
  'That passkey is not set up for Domi Staff any more. Sign in with your password.';
export const CHECK_FAILED = 'Face ID did not work. Try again, or use your password.';

/// Whether a session opened at `createdAt` counts as just signed in.
export function signedInJustNow(createdAt: Date, now = new Date()): boolean {
  return now.getTime() - createdAt.getTime() <= FRESH_SIGN_IN_MINUTES * 60_000;
}

/// When a challenge made now stops being any good.
export function challengeExpiry(now = new Date()): Date {
  return new Date(now.getTime() + CHALLENGE_MINUTES * 60_000);
}

/// The name a person's passkey is saved under on their phone: the name they
/// go by, then their last name.
export function displayName(person: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}): string {
  return `${person.preferredName?.trim() || person.firstName} ${person.lastName}`.trim();
}
