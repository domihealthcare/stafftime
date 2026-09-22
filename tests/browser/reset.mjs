import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Defaults to the dev server; point at `vite preview` to test the built bundle
// with the deployed security headers applied.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

/**
 * Where the API writes its log.
 *
 * With no email provider configured — which is the default, and what the suites
 * run against — the reset email is written to the server log instead of being
 * sent. That is also how a developer gets the link locally, so reading it from
 * there tests the real path rather than a test-only shortcut.
 *
 * The alternative, handing the link back in the HTTP response when
 * APP_ENVIRONMENT is "test", was rejected: one mistyped environment variable on
 * a real deployment would make every account takeable by anyone who knows an
 * address.
 */
const API_LOG = process.env.API_LOG || '/tmp/api.log';

const browser = await chromium.launch(
  // Fall back to whatever Playwright downloaded when CHROMIUM_PATH is unset.
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

function latestResetLink() {
  let log;
  try {
    log = readFileSync(API_LOG, 'utf8');
  } catch {
    // Each suite runs with tests/browser as its working directory, so a
    // relative API_LOG resolves against that rather than the repo root.
    throw new Error(
      `cannot read the API log at ${API_LOG} (resolved from ${process.cwd()}). Set API_LOG to an absolute path.`,
    );
  }
  const links = [...log.matchAll(/\/reset-password\?token=([A-Za-z0-9_-]+)/g)];
  if (links.length === 0) throw new Error(`no reset link in ${API_LOG}`);
  return links[links.length - 1][1];
}

const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

await step('the sign-in screen offers a way out of a forgotten password', async () => {
  await page.getByRole('link', { name: 'Forgotten your password?' }).click();
  await page.getByText('Reset your password').waitFor({ timeout: 15000 });
});
await page.screenshot({ path: `${OUT}/57-forgot.png`, fullPage: true });

let answerForUnknown;
await step('an address with no account is answered, not rejected', async () => {
  await page.getByLabel('Email').fill('nobody-at-all@domihealthcare.com');
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await page.getByRole('alert').waitFor({ timeout: 15000 });
  answerForUnknown = await page.getByRole('alert').innerText();
});

await step('a real address is answered in exactly the same words', async () => {
  // Any difference here — wording, timing, a different screen — is a way to
  // find out who works at the practice.
  await page.goto(`${BASE}/forgot-password`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await page.getByRole('alert').waitFor({ timeout: 15000 });

  const answer = await page.getByRole('alert').innerText();
  if (answer !== answerForUnknown)
    throw new Error(`a known address is answered differently:\n  "${answer}"\n  "${answerForUnknown}"`);
});

await step('a link with no token explains itself rather than breaking', async () => {
  await page.goto(`${BASE}/reset-password`, { waitUntil: 'networkidle' });
  await page.getByText('That link is not complete').waitFor({ timeout: 15000 });
  await page.getByRole('link', { name: 'Ask for a new link' }).waitFor({ timeout: 5000 });
});

let token;
await step('the emailed link opens the new-password screen', async () => {
  token = latestResetLink();
  await page.goto(`${BASE}/reset-password?token=${token}`, { waitUntil: 'networkidle' });
  await page.getByText('Choose a new password').waitFor({ timeout: 15000 });
});

await step('mismatched confirmation blocks submission before any request', async () => {
  await page.getByLabel('New password', { exact: true }).fill('harbour lantern tuesday');
  await page.getByLabel('Confirm new password').fill('harbour lantern wednesday');
  await page.getByText('Those passwords do not match').waitFor({ timeout: 5000 });
  if (await page.getByRole('button', { name: 'Set my password' }).isEnabled())
    throw new Error('submit was enabled with mismatched passwords');
});

await step('a weak password is refused with a reason', async () => {
  await page.getByLabel('New password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm new password').fill('password123');
  await page.getByRole('button', { name: 'Set my password' }).click();
  await page.getByText(/at least 12 characters/).waitFor({ timeout: 15000 });
});

await step('a good password is accepted, and it says you are signed out everywhere', async () => {
  await page.getByLabel('New password', { exact: true }).fill('harbour lantern tuesday');
  await page.getByLabel('Confirm new password').fill('harbour lantern tuesday');
  await page.getByRole('button', { name: 'Set my password' }).click();
  await page.getByText('Your password is set').waitFor({ timeout: 20000 });
  await page.getByText(/signed out everywhere/).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/58-reset-done.png`, fullPage: true });

await step('the new password signs in and the old one does not', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('alert').waitFor({ timeout: 15000 });

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await page.getByLabel('Password', { exact: true }).fill('harbour lantern tuesday');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
});

await step('the same link cannot be spent twice', async () => {
  const fresh = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const second = await fresh.newPage();
  await second.goto(`${BASE}/reset-password?token=${token}`, { waitUntil: 'networkidle' });

  await second.getByLabel('New password', { exact: true }).fill('another good phrase here');
  await second.getByLabel('Confirm new password').fill('another good phrase here');
  await second.getByRole('button', { name: 'Set my password' }).click();
  await second.getByText(/expired or has already been used/).waitFor({ timeout: 15000 });
  await fresh.close();
});

await step('a made-up token is refused in the same words', async () => {
  const fresh = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const guesser = await fresh.newPage();
  await guesser.goto(
    `${BASE}/reset-password?token=${'x'.repeat(43)}`,
    { waitUntil: 'networkidle' },
  );

  await guesser.getByLabel('New password', { exact: true }).fill('another good phrase here');
  await guesser.getByLabel('Confirm new password').fill('another good phrase here');
  await guesser.getByRole('button', { name: 'Set my password' }).click();
  await guesser.getByText(/expired or has already been used/).waitFor({ timeout: 15000 });
  await fresh.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL RESET CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
