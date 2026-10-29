/**
 * Whether `npm run db:seed` may run against a database (maintenance pass,
 * October 2026).
 *
 * The seed resets both offices' geofence pins to placeholders and gives the
 * seeded accounts, an admin among them, the development password written in
 * the README. Run once against the live database, it would undo the real pins
 * and leave a working admin sign-in that anybody who has read the repo knows.
 * Until now the only protection was a warning in CLAUDE.md.
 *
 * So it runs only against a database on this computer (or the local Docker
 * one), never with APP_ENVIRONMENT=production, and against any other host
 * only when somebody says so on purpose with SEED_NON_LOCAL_DATABASE=yes and
 * APP_ENVIRONMENT=test (a throwaway test database somewhere else).
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres']);

export function seedRefusal(env: {
  DATABASE_URL?: string;
  APP_ENVIRONMENT?: string;
  SEED_NON_LOCAL_DATABASE?: string;
}): string | null {
  if (env.APP_ENVIRONMENT?.trim().toLowerCase() === 'production') {
    return 'APP_ENVIRONMENT is production. The seed is for local work only and never runs there.';
  }
  const host = hostOf(env.DATABASE_URL);
  if (host === null) {
    return 'DATABASE_URL is not set or cannot be read, so the seed cannot tell where it would write.';
  }
  if (LOCAL_HOSTS.has(host)) return null;
  if (
    env.SEED_NON_LOCAL_DATABASE === 'yes' &&
    env.APP_ENVIRONMENT?.trim().toLowerCase() === 'test'
  ) {
    return null;
  }
  return (
    `DATABASE_URL points at ${host}, not a database on this computer. The seed resets the ` +
    'office pins and the seeded accounts, so it never runs against the live database. For a ' +
    'throwaway test database elsewhere, set APP_ENVIRONMENT=test and SEED_NON_LOCAL_DATABASE=yes.'
  );
}

function hostOf(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}
