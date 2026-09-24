import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

export type PinCheck = { ok: true } | { ok: false; reason: string };

/// Dates, repeated pairs and keypad patterns — the guesses anyone would try
/// first on a four-digit keypad.
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
 * PIN rules, which are necessarily stricter than the password rules.
 *
 * A PIN has almost no entropy — four digits is ten thousand possibilities, and
 * a keypad invites the obvious ones. The defence is three-layered: reject the
 * predictable PINs here, hash what is left with argon2, and lock the account
 * after a handful of wrong attempts (see KioskService).
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
    if (isRepeatedPattern(pin)) {
      return { ok: false, reason: 'That PIN repeats a short pattern. Choose another.' };
    }
    if (looksLikeAYear(pin)) {
      return { ok: false, reason: 'Avoid years and dates — they are easy to guess.' };
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

/// "1212", "123123" — a short block repeated to fill the length.
function isRepeatedPattern(pin: string): boolean {
  for (let size = 1; size <= pin.length / 2; size += 1) {
    if (pin.length % size !== 0) {
      continue;
    }
    const block = pin.slice(0, size);
    if (pin.split('').every((_, index) => pin[index] === block[index % size])) {
      return true;
    }
  }
  return false;
}

/// A four-digit PIN that reads as a plausible birth or current year.
function looksLikeAYear(pin: string): boolean {
  if (pin.length !== 4) {
    return false;
  }
  const value = Number(pin);
  return value >= 1900 && value <= new Date().getFullYear() + 1;
}
