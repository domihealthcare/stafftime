import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Weak bases, checked against the password with its padding stripped.
 *
 * A 12-character minimum does not stop "password1234" — it invites it. So the
 * check is on the stem: strip digits and punctuation, and if what remains is one
 * of these, the length was decoration.
 */
const WEAK_STEMS = new Set([
  'password',
  'passw',
  'pass',
  'qwerty',
  'qwertyuiop',
  'asdfgh',
  'letmein',
  'welcome',
  'changeme',
  'iloveyou',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'superman',
  'trustno',
  'admin',
  'administrator',
  'login',
  'secret',
  'domi',
  'domihealthcare',
  'domihealth',
  'healthcare',
  'northbergen',
  'westnewyork',
]);

/// Keyboard runs and counting sequences, which survive stem-stripping.
const SEQUENCES = ['1234567890', 'qwertyuiopasdfghjklzxcvbnm', 'abcdefghijklmnopqrstuvwxyz'];

export const MIN_LENGTH = 8;

/// The rule in words, for every screen and error that states it.
export const PASSWORD_RULE = 'Use at least 8 characters, including a number.';

export interface PasswordProblem {
  ok: false;
  reason: string;
}

export type PasswordCheck = { ok: true } | PasswordProblem;

@Injectable()
export class PasswordService {
  /**
   * argon2id at the parameters OWASP recommends (19 MiB, 2 iterations, 1 lane),
   * which are the library's defaults. The salt is generated per hash and stored
   * inside the returned string, so no separate salt column is needed.
   */
  hash(plain: string): Promise<string> {
    return hash(plain);
  }

  async verify(plain: string, storedHash: string): Promise<boolean> {
    try {
      return await verify(storedHash, plain);
    } catch {
      // A malformed or truncated hash must read as "wrong password", never as a
      // crash that leaks which accounts have unusable credentials.
      return false;
    }
  }

  /**
   * At least 8 characters and at least one number — the rule Dominguez chose
   * in September 2026, replacing a 12-character minimum whose advice ("three
   * unrelated words") did not suit the practice.
   *
   * The blocklist below still does the real work: "password1", the practice's
   * name, somebody's own name and keyboard runs are refused however they are
   * padded, which is what stops the guesses an attacker would actually try.
   */
  check(
    plain: string,
    context: { email?: string; firstName?: string; lastName?: string } = {},
  ): PasswordCheck {
    if (plain.length < MIN_LENGTH) {
      return { ok: false, reason: PASSWORD_RULE };
    }
    if (plain.length > 200) {
      return { ok: false, reason: 'That password is too long (200 characters maximum).' };
    }

    const normalised = plain.toLowerCase().trim();

    // "password1234" and "Password!!!!" both reduce to "password".
    const stem = normalised.replace(/[^a-z]/g, '');
    if (WEAK_STEMS.has(stem)) {
      return {
        ok: false,
        reason: 'That is a common password with a number added. Choose something less obvious.',
      };
    }

    if (normalised.length > 0 && /^[0-9]+$/.test(normalised.replace(/[\s-]/g, ''))) {
      return { ok: false, reason: 'A password of only digits is too easy to guess.' };
    }

    if (!/[0-9]/.test(plain)) {
      return { ok: false, reason: 'Include at least one number.' };
    }

    // A long run straight off the keyboard is not a password.
    if (SEQUENCES.some((sequence) => containsRun(sequence, normalised, 8))) {
      return { ok: false, reason: 'That password is too easy to guess. Choose something else.' };
    }

    // Anyone targeting this app knows the staff names and the email pattern.
    const personal = [context.email?.split('@')[0], context.firstName, context.lastName]
      .filter((value): value is string => Boolean(value && value.length >= 3))
      .map((value) => value.toLowerCase());

    if (personal.some((value) => normalised.includes(value))) {
      return { ok: false, reason: 'Do not use your name or email address in your password.' };
    }

    if (normalised.includes('domi') || normalised.includes('domihealthcare')) {
      return { ok: false, reason: 'Do not use the practice name in your password.' };
    }

    // "abababab…" passes a naive repeated-character check but is no stronger.
    if (hasFewDistinctCharacters(normalised, 5)) {
      return { ok: false, reason: 'That password repeats too few characters to be strong.' };
    }

    return { ok: true };
  }
}

/// True when `candidate` contains `length` or more consecutive characters of
/// `sequence`, forwards or backwards.
function containsRun(sequence: string, candidate: string, length: number): boolean {
  const reversed = [...sequence].reverse().join('');
  for (const source of [sequence, reversed]) {
    for (let start = 0; start + length <= source.length; start += 1) {
      if (candidate.includes(source.slice(start, start + length))) {
        return true;
      }
    }
  }
  return false;
}

function hasFewDistinctCharacters(value: string, minimum: number): boolean {
  return new Set(value).size < minimum;
}
