/**
 * Unit tests give the same answer whatever is in a developer's apps/api/.env.
 *
 * Importing the Prisma client loads that file into process.env (Prisma does
 * it itself; there is no switch to stop it), and Nest's ConfigService.get()
 * reads process.env before the values a spec hands it. So `.env` copied from
 * `.env.example` — APP_ENVIRONMENT=test — quietly overrode specs that set
 * APP_ENVIRONMENT themselves, and KIOSK_REPEAT_SECONDS=0 (for the browser
 * suites) broke the kiosk specs. CI has no .env, so only local runs failed.
 *
 * Load the client once, here, before any spec does, and take back whatever
 * it added. Variables set in the shell are left alone; only the file's are
 * dropped. Jest caches the module for the rest of the test file, so it does
 * not load the file a second time.
 */
const before = new Set(Object.keys(process.env));
require('@prisma/client');
for (const key of Object.keys(process.env)) {
  if (!before.has(key)) delete process.env[key];
}
