import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`);
    errors.push(`${name}: ${e.message}`);
  }
};

/**
 * Idle sign-out (October 2026): a sign-in ends after 8 hours unused, and
 * "unused" now means nobody did anything. The screen's own polls (the bell
 * every minute, the downtime bar every two, a tab coming back into view) send
 * X-Background-Request and do not count as use, so a tab left open on the
 * front-desk computer is signed out like any other.
 *
 * - a background read is answered but leaves lastUsedAt alone;
 * - the header means nothing on a save, and an ordinary read counts as use;
 * - the app's own polls carry the header and move nothing;
 * - past 8 hours a background read is refused, and the page goes back to
 *   the sign-in screen on its next poll.
 *
 * The session it ends is its own; nothing else is changed.
 */
function sql(statement) {
  return execFileSync(
    'psql',
    [
      '-h',
      process.env.PGHOST_LOCAL || '127.0.0.1',
      '-p',
      process.env.PGPORT_LOCAL || '5433',
      '-U',
      process.env.PGUSER_LOCAL || 'postgres',
      '-d',
      process.env.PGDATABASE_LOCAL || 'stafftime',
      '-q',
      '-t',
      '-A',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      statement,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
    .toString()
    .trim();
}

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const unlocked = page.getByText('Not clocked in');
  const mustChange = page.getByText('Choose a new password');
  await unlocked.or(mustChange).first().waitFor({ timeout: 20000 });
  if (await mustChange.isVisible()) {
    await page.getByLabel('Temporary password').fill('shift-change-2026');
    await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
    await page.getByLabel('Confirm new password').fill('harbour lantern 7');
    await page.getByRole('button', { name: 'Change password' }).click();
    await unlocked.waitFor({ timeout: 15000 });
  }
  return page;
}

/// From the page, so the session cookie goes with it; `background` adds the
/// header the app's own polls send.
const call = (page, path, { method = 'GET', background = false } = {}) =>
  page.evaluate(
    async ({ path, method, background }) => {
      const r = await fetch(`/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(background ? { 'X-Background-Request': '1' } : {}),
        },
      });
      return r.status;
    },
    { path, method, background },
  );

const page = await signIn('frontdesk@domihealthcare.com');
await page.waitForLoadState('networkidle');

// This browser's own session, found by its token as the server stores it.
const cookie = (await page.context().cookies()).find((c) => c.name === 'stafftime_session');
if (!cookie) throw new Error('no session cookie after signing in');
const tokenHash = createHash('sha256').update(cookie.value).digest('hex');
const where = `"tokenHash" = '${tokenHash}'`;

const lastUsed = (interval) =>
  sql(`update sessions set "lastUsedAt" = now() - interval '${interval}' where ${where}`);
/// Whether lastUsedAt is still about two hours back (so nothing moved it).
const stillTwoHoursAgo = () =>
  sql(
    `select ("lastUsedAt" < now() - interval '119 minutes')::text from sessions where ${where}`,
  ) === 'true';
/// Whether it was moved to just now.
const justNow = () =>
  sql(`select ("lastUsedAt" > now() - interval '1 minute')::text from sessions where ${where}`) ===
  'true';

/// The tab "coming back into view", which the bell, the downtime bar and Home
/// all answer with a background look.
const comeBackIntoView = () =>
  page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

await step('a background read is answered but does not count as use', async () => {
  lastUsed('2 hours');
  const status = await call(page, '/notifications/unread-count', { background: true });
  if (status !== 200) throw new Error(`answered ${status}`);
  if (!stillTwoHoursAgo()) throw new Error('lastUsedAt moved');
});

await step('the header means nothing on a save', async () => {
  lastUsed('2 hours');
  const status = await call(page, '/pay-lock/lock', { method: 'POST', background: true });
  if (status !== 200) throw new Error(`answered ${status}`);
  if (!justNow()) throw new Error('lastUsedAt did not move');
});

await step('an ordinary read counts as use', async () => {
  lastUsed('2 hours');
  const status = await call(page, '/notifications/unread-count');
  if (status !== 200) throw new Error(`answered ${status}`);
  if (!justNow()) throw new Error('lastUsedAt did not move');
});

await step("the app's own polls say they are background and move nothing", async () => {
  lastUsed('2 hours');
  const asked = page.waitForRequest((r) => r.url().endsWith('/api/notifications/unread-count'), {
    timeout: 10000,
  });
  await comeBackIntoView();
  const request = await asked;
  if (request.headers()['x-background-request'] !== '1') {
    throw new Error(
      `the bell's look carried no background header: ${JSON.stringify(request.headers())}`,
    );
  }
  await page.waitForLoadState('networkidle');
  if (!stillTwoHoursAgo()) throw new Error('lastUsedAt moved');
  await page.getByText('Not clocked in').waitFor({ timeout: 5000 });
});

await step('idle 8 hours: a background read is refused', async () => {
  lastUsed('8 hours 1 minute');
  const status = await call(page, '/notifications/unread-count', { background: true });
  if (status !== 401) throw new Error(`answered ${status}`);
});

await step('the page goes back to the sign-in screen on its next poll', async () => {
  await comeBackIntoView();
  await page.getByLabel('Email').waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}/idle-signout.png` });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByLabel('Email').waitFor({ timeout: 10000 });
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL IDLE SIGN-OUT STEPS PASSED');
