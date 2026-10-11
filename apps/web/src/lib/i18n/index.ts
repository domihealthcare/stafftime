import { useSyncExternalStore } from 'react';
import { SPANISH } from './es';

/**
 * Spanish for the staff screens (October 2026, Dominguez). English is the
 * app's own language and the key: `t('Clock in')` gives "Marcar entrada" to
 * somebody reading in Spanish and "Clock in" to everybody else, and anything
 * not yet translated simply stays English. `{name}` in a phrase is filled in
 * from the second argument.
 *
 * The choice is each person's (`Employee.language`, on Your profile, and the
 * English | Español switch on News), remembered on the device too so the
 * screens before sign-in follow it. The Spanish is in `./es/` — written for
 * the practice and **still to be read by a native speaker**
 * (`NEEDS_NATIVE_SPEAKER_REVIEW`).
 *
 * Only the staff screens so far; the managers' screens, the Help guide and
 * what the bell and emails say are still English.
 */

export type Language = 'en' | 'es';

export const NEEDS_NATIVE_SPEAKER_REVIEW = true;

// The key News used before the whole app had a language, so a choice made
// there carries over.
const KEY = 'domi.newsLanguage';
const listeners = new Set<() => void>();

function read(): Language {
  try {
    return localStorage.getItem(KEY) === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

let current: Language = read();
applyToDocument(current);

function applyToDocument(language: Language) {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}

export function getLanguage(): Language {
  return current;
}

/// Changes the language on this device at once. Saving it to the person's
/// profile is the caller's (`useLanguage` does both).
export function setLanguage(language: Language) {
  if (language === current) return;
  current = language;
  try {
    localStorage.setItem(KEY, language);
  } catch {
    // Private windows: the choice lasts as long as the page.
  }
  applyToDocument(language);
  listeners.forEach((listener) => listener());
}

export function useLanguageValue(): Language {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

export type Vars = Record<string, string | number>;

/// The phrase in the reader's language. Outside React (a helper that formats
/// something), this reads the language as it is now.
export function t(english: string, vars?: Vars): string {
  const phrase = current === 'es' ? (SPANISH[english] ?? english) : english;
  return vars ? fill(phrase, vars) : phrase;
}

/// `t`, re-rendering the component when the language changes.
export function useT(): (english: string, vars?: Vars) => string {
  const language = useLanguageValue();
  return (english, vars) => {
    const phrase = language === 'es' ? (SPANISH[english] ?? english) : english;
    return vars ? fill(phrase, vars) : phrase;
  };
}

/// One of two phrases by a count: `plural(n, '{n} shift', '{n} shifts')`.
export function plural(count: number, one: string, many: string): string {
  return t(count === 1 ? one : many, { n: count });
}

/// For `toLocaleDateString` and friends: Spanish month and day names when
/// reading in Spanish, the browser's own otherwise.
export function locale(): string | undefined {
  return current === 'es' ? 'es-US' : undefined;
}

function fill(phrase: string, vars: Vars): string {
  return phrase.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
