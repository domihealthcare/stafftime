import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the web app's pure logic (October 2026): dates and times,
 * repeat patterns, the phone book, the guides' markup and the clinical forms'
 * scoring. Files named `*.test.ts` beside what they test. Run with
 * `npm test` (both apps) or `npm test --workspace @stafftime/web`.
 *
 * Kept apart from vite.config.ts, which reads vercel.json and the commit for
 * the build; none of that is wanted here.
 *
 * The tests run with the clock in New Jersey, where the practice's browsers
 * are, so the screen's own-time-zone helpers meet a real clock change. Tests
 * that must hold in any zone (practice-time.ts) switch the zone themselves.
 * Set here, before the test workers start, so they all inherit it.
 */
process.env.TZ = 'America/New_York';

export default defineConfig({
  // What vite.config.ts writes in at build time, for code that reads it
  // (the Help page's version card, imported by the Help accuracy check).
  define: {
    __BUILD__: JSON.stringify({ version: 'test', commit: null, builtAt: '2026-01-01T00:00:00Z' }),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
