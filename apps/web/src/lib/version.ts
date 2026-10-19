/// Filled in by vite.config.ts when the bundle is built.
declare const __BUILD__: { version: string; commit: string | null; builtAt: string };

export const BUILD = __BUILD__;

/**
 * "Version 1.2.0" - the release number, from the root package.json. It goes
 * up with every release (October 2026, Dominguez: a version number rather than
 * the build date and commit): the last part for fixes, the middle for new
 * features, the first for a big change.
 */
export function versionLabel(build = BUILD): string {
  return `Version ${build.version}`;
}

/**
 * When this release was built, which is when it went out: "Thu, Oct 15, 2026,
 * 4:12 PM ET" - on the practice's clock, whatever the reader's.
 */
export function releasedLabel(build = BUILD): string {
  const when = new Date(build.builtAt).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${when} ET`;
}
