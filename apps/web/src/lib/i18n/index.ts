import { useSyncExternalStore } from 'react';

/**
 * Spanish for the staff screens (October 2026, Dominguez). English is the
 * app's own language and the key: `t('Clock in')` gives "Marcar entrada" to
 * somebody reading in Spanish and "Clock in" to everybody else, and anything
 * not yet translated simply stays English. `{name}` in a phrase is filled in
 * from the second argument.
 *
 * The choice is each person's (`Employee.language`, on Your profile, and the
 * English | Español switch on News), remembered on the device too so the
 * screens before sign-in follow it. The Spanish is in `./es/` - written for
 * the practice and **still to be read by a native speaker**
 * (`NEEDS_NATIVE_SPEAKER_REVIEW`).
 *
 * Only the staff screens so far; the managers' screens, the Help guide and
 * what the bell and emails say are still English.
 *
 * The Spanish is loaded only for somebody reading in Spanish (October 2026):
 * about 70 kB that everybody else never needs. Until it is in, the app stays
 * English, phrases, dates and `<html lang>` alike, and switches all at once
 * when it arrives. A device already set to Spanish waits for it before the
 * first screen is drawn (`languageReady`, in `main.tsx`), and signing in as
 * somebody whose profile says Spanish waits for it too (`lib/session.tsx`),
 * so neither shows English first.
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

/// How long a first screen or a sign-in waits for the Spanish before going on
/// in English (a dead connection, say); it still switches once it arrives.
const WAIT_FOR_SPANISH_MS = 3000;

/// The Spanish phrases, once loaded.
let spanish: Record<string, string> | null = null;
let loadingSpanish: Promise<Record<string, string>> | null = null;

/// The language chosen, and the language shown: the same, except while the
/// Spanish is still on its way.
let wanted: Language = read();
let current: Language = 'en';
applyToDocument(current);

function applyToDocument(language: Language) {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}

function show(language: Language) {
  if (language === current) return;
  current = language;
  applyToDocument(language);
  listeners.forEach((listener) => listener());
}

/// Fetches the Spanish phrases once; a failed fetch can be tried again.
function loadSpanish(): Promise<Record<string, string>> {
  loadingSpanish ??= import('./es').then(
    (module) => (spanish = module.SPANISH),
    (error: unknown) => {
      loadingSpanish = null;
      throw error;
    },
  );
  return loadingSpanish;
}

/// Shows the chosen language as soon as it can: at once for English, or once
/// the Spanish is in. Settles when it is shown, or after `WAIT_FOR_SPANISH_MS`
/// whichever is first, and never fails (it stays English instead).
function applyWanted(): Promise<void> {
  if (wanted === 'en' || spanish) {
    show(wanted);
    return Promise.resolve();
  }
  const loaded = loadSpanish()
    .then(() => show(wanted))
    .catch(() => undefined);
  return Promise.race([
    loaded,
    new Promise<void>((resolve) => window.setTimeout(resolve, WAIT_FOR_SPANISH_MS)),
  ]);
}

/// Settles once this device's own language is showing, for the first screen.
export const languageReady: Promise<void> = applyWanted();

export function getLanguage(): Language {
  return current;
}

/// Changes the language on this device: at once for English, and as soon as
/// the Spanish is in (moments, the first time) for Spanish. Awaiting it waits
/// for that, three seconds at most. Saving it to the person's profile is the
/// caller's (`useLanguage` does both).
export function setLanguage(language: Language): Promise<void> {
  if (language !== wanted) {
    wanted = language;
    try {
      localStorage.setItem(KEY, language);
    } catch {
      // Private windows: the choice lasts as long as the page.
    }
  }
  return applyWanted();
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
  return inLanguage(current, english, vars);
}

/// `t`, re-rendering the component when the language changes.
export function useT(): (english: string, vars?: Vars) => string {
  const language = useLanguageValue();
  return (english, vars) => inLanguage(language, english, vars);
}

/// English while the Spanish is not loaded (it is shown only once it is).
function inLanguage(language: Language, english: string, vars?: Vars): string {
  const phrase = language === 'es' && spanish ? (spanish[english] ?? english) : english;
  return vars ? fill(phrase, vars) : phrase;
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
