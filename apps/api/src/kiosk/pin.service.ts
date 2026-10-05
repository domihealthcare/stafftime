import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

export type PinCheck = { ok: true } | { ok: false; reason: string };

/// The handful of PINs anyone would try first on a four-digit keypad: repeated
/// pairs, keypad shapes, and the few years that top every list of common PINs.
/// Kept short on purpose — see `check`.
const BANNED_PINS = new Set([
  '0000',
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  '1234',
  '4321',
  '0123',
  '9876',
  '1212',
  '2121',
  '1122',
  '6969',
  '1004',
  '2580',
  '0852',
  '1379',
  '9731',
  '1010',
  '2000',
  '1313',
  '2001',
  '1999',
  '123456',
  '654321',
  '111111',
  '000000',
  '121212',
  '112233',
  '123123',
]);

/**
 * PIN rules.
 *
 * A PIN has almost no entropy — four digits is ten thousand possibilities, and
 * a keypad invites the obvious ones. The defence is three-layered: reject the
 * most predictable PINs here, hash what is left with argon2, and lock the
 * account after a handful of wrong attempts (see KioskService). A PIN also
 * works only at a paired time clock, never to sign in.
 *
 * Deliberately light since October 2026 (Dominguez: "please don't make it too
 * strict on the PIN"): every year from 1900 on and every repeated pattern
 * (3636) used to be refused too, which turned away PINs people chose and
 * remember — 1911 among them. What is left refuses only the same digit
 * repeated, a straight run, and the short list above; the lockouts carry the
 * rest.
 */
@Injectable()
export class PinService {
  hash(pin: string): Promise<string> {
    return hash(pin);
  }

  async verify(pin: string, storedHash: string): Promise<boolean> {
    try {
      return await verify(storedHash, pin);
    } catch {
      return false;
    }
  }

  check(pin: string): PinCheck {
    if (!/^\d+$/.test(pin)) {
      return { ok: false, reason: 'A PIN must be digits only.' };
    }
    if (pin.length < 4 || pin.length > 8) {
      return { ok: false, reason: 'A PIN must be between 4 and 8 digits.' };
    }
    if (BANNED_PINS.has(pin)) {
      return { ok: false, reason: 'That PIN is too easy to guess. Choose another.' };
    }
    if (new Set(pin).size === 1) {
      return { ok: false, reason: 'A PIN cannot be the same digit repeated.' };
    }
    if (isSequential(pin)) {
      return { ok: false, reason: 'A PIN cannot be a run of consecutive digits.' };
    }
    return { ok: true };
  }

  /// Digits only, so the keypad can show how many are left without ever
  /// revealing the PIN itself.
  mask(pin: string): string {
    return '•'.repeat(pin.length);
  }
}

function isSequential(pin: string): boolean {
  let ascending = true;
  let descending = true;
  for (let i = 1; i < pin.length; i += 1) {
    const step = Number(pin[i]) - Number(pin[i - 1]);
    if (step !== 1) ascending = false;
    if (step !== -1) descending = false;
  }
  return ascending || descending;
}
