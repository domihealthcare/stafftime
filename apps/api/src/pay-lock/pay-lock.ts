/**
 * The PIN in front of pay (October 2026, Dominguez: "anything that shows pay -
 * ... the rota or the provider productivity or finances or invoices, etc.
 * (even if the certain user has access to view it, should prompt them to
 * insert pin to view) sometimes a log in is left open and we dont want that
 * accessible to just anyone").
 *
 * A session may show pay only after the person has entered their tablet PIN
 * on it (or their password, for somebody with no PIN, or who has forgotten
 * it). It stays open while a pay screen is in use and shuts by itself after
 * `PAY_UNLOCK_MINUTES` without one, so a sign-in left open on a front-desk
 * computer shows nobody what anybody is paid. The server is where it holds:
 * `PayLockGuard` sits on every route that answers with pay.
 */
export const PAY_UNLOCK_MINUTES = 10;

/// What a refused request says, so the screen knows to ask for the PIN.
export const PIN_REQUIRED = 'PIN_REQUIRED';

/// The new end of the unlocked spell, from now.
export function unlockedUntil(now: Date = new Date()): Date {
  return new Date(now.getTime() + PAY_UNLOCK_MINUTES * 60_000);
}

/// Whether to write a new end: only when it would move by more than a minute,
/// so a busy screen is not a write per request.
export function worthMoving(current: Date, now: Date = new Date()): boolean {
  return unlockedUntil(now).getTime() - current.getTime() > 60_000;
}
