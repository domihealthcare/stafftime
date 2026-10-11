import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Language } from '../lib/i18n';
import { useLanguage } from '../lib/language';
import type { Announcement } from '../lib/types';

/**
 * News in English or Spanish (October 2026, Dominguez: "staff should be able
 * to toggle from English, which is default, to Spanish"). The choice is the
 * reader's, remembered on this device; English until they pick Español.
 *
 * A post's Spanish is the admin's when they wrote or checked it, otherwise
 * the AI service's — asked for the first time somebody wants it, then kept for
 * everybody (`GET /announcements/:id/spanish`). The poll, likes and comments
 * stay as written.
 */

export type NewsLanguage = Language;

/// The reader's choice — since October 2026 the whole app's language, the
/// same on Home, News and Your profile.
export function useNewsLanguage(): [NewsLanguage, (language: NewsLanguage) => void] {
  return useLanguage();
}

export function NewsLanguageToggle({ className = '' }: { className?: string }) {
  const [language, choose] = useNewsLanguage();
  const option = (value: NewsLanguage, label: string, lang: string) => (
    <button
      type="button"
      lang={lang}
      aria-pressed={language === value}
      onClick={() => choose(value)}
      className={`px-2.5 py-1 text-xs font-medium transition ${
        language === value ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Language of the news"
      data-testid="news-language"
      className={`inline-flex overflow-hidden rounded-lg ring-1 ring-inset ring-slate-300 ${className}`}
    >
      {option('en', 'English', 'en')}
      {option('es', 'Español', 'es')}
    </div>
  );
}

interface Spanish {
  titleEs: string;
  bodyEs: string;
  spanishByAi: boolean;
}

/// Spanish fetched this visit, by post and version, so Home and News share it.
const fetched = new Map<string, Promise<Spanish | null>>();

/**
 * A post's title and words in the reader's language. In Spanish: what the
 * post carries, or what the server gives (translating it if need be), with
 * a note when the AI service made it or there is none yet.
 */
export function usePostWords(post: Announcement) {
  const [language] = useNewsLanguage();
  const carried: Spanish | null = post.titleEs
    ? { titleEs: post.titleEs, bodyEs: post.bodyEs ?? '', spanishByAi: post.spanishByAi }
    : null;
  const key = `${post.id}:${post.editedAt ?? post.createdAt}`;
  const [loaded, setLoaded] = useState<{ key: string; spanish: Spanish | null } | null>(null);

  const wanted = language === 'es' && !carried;
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    if (!fetched.has(key)) {
      fetched.set(
        key,
        api
          .announcementSpanish(post.id)
          .then((result) => result.spanish)
          .catch(() => {
            fetched.delete(key);
            return null;
          }),
      );
    }
    void fetched.get(key)!.then((spanish) => {
      if (live) setLoaded({ key, spanish });
    });
    return () => {
      live = false;
    };
  }, [wanted, key, post.id]);

  if (language === 'en') {
    return { title: post.title, body: post.body, lang: 'en', note: null, loading: false };
  }
  const spanish = carried ?? (loaded?.key === key ? loaded.spanish : undefined);
  if (spanish === undefined) {
    return { title: post.title, body: post.body, lang: 'en', note: null, loading: true };
  }
  if (spanish === null) {
    return {
      title: post.title,
      body: post.body,
      lang: 'en',
      note: 'Esta publicación aún no está en español.',
      loading: false,
    };
  }
  return {
    title: spanish.titleEs,
    body: spanish.bodyEs,
    lang: 'es',
    note: spanish.spanishByAi ? 'Traducido automáticamente.' : null,
    loading: false,
  };
}
