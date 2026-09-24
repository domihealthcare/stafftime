/// Filled in by vite.config.ts when the bundle is built.
declare const __BUILD__: { commit: string | null; builtAt: string };

export const BUILD = __BUILD__;

/**
 * "2026.09.24 (feda444)" — the day it was built, in the practice's time, and
 * the commit it was built from. The date is for people ("is this Tuesday's?"),
 * the commit for matching it to what was merged.
 */
export function versionLabel(build = BUILD): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(build.builtAt))
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}.${parts.month}.${parts.day}`;
  return build.commit ? `${date} (${build.commit})` : date;
}
