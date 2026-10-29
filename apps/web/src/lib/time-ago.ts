import { locale, t as translate } from './i18n';

/// "just now", "5 min ago", "3 h ago", "yesterday", then the date. The bell's
/// words, shared with "Where you're signed in" on Your profile.
export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return translate('just now');
  if (minutes < 60) return translate('{n} min ago', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return translate('{n} h ago', { n: hours });
  if (hours < 48) return translate('yesterday');
  return new Date(iso).toLocaleDateString(locale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
