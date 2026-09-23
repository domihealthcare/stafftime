import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pickFromAccountMenu } from './account-menu.mjs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Defaults to the dev server; point at `vite preview` to test the built bundle
// with the deployed security headers applied.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  // Fall back to whatever Playwright downloaded when CHROMIUM_PATH is unset.
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

const newPage = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  return page;
};

const signIn = async (page, email, password) => {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

let page = await newPage();

await step('an unauthenticated visit shows the sign-in screen, not the app', async () => {
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });
  // Check for the app's own chrome, not loose text — the sign-in subtitle
  // legitimately contains the words "clock in".
  for (const name of ['Timesheet', 'Schedule']) {
    if (await page.getByRole('link', { name }).count() > 0)
      throw new Error(`app navigation (${name}) was reachable without signing in`);
  }
  if (await page.getByRole('button', { name: 'Clock in' }).count() > 0)
    throw new Error('clock-in button was reachable without signing in');
  if (await page.getByRole('button', { name: /Your account/ }).count() > 0)
    throw new Error('app header was reachable without signing in');
});
await step('the sign-in screen names the staff platform, not just a timeclock', async () => {
  await page.getByRole('heading', { name: 'Domi Staff', exact: true }).waitFor({ timeout: 5000 });
  await page
    .getByText('Sign in to clock in, check your schedule and keep up with the team.', { exact: true })
    .waitFor({ timeout: 5000 });
  if ((await page.title()) !== 'Domi Staff') throw new Error(`tab title is "${await page.title()}"`);
});
await page.screenshot({ path: `${OUT}/12-login.png`, fullPage: true });

await step('a wrong password is refused without revealing whether the account exists', async () => {
  await signIn(page, 'frontdesk@domihealthcare.com', 'definitely-wrong');
  const alert = page.getByRole('alert');
  await alert.waitFor({ timeout: 10000 });
  const wrongPw = await alert.innerText();

  await page.reload({ waitUntil: 'networkidle' });
  await signIn(page, 'nobody@domihealthcare.com', 'definitely-wrong');
  await page.getByRole('alert').waitFor({ timeout: 10000 });
  const unknown = await page.getByRole('alert').innerText();

  if (wrongPw !== unknown) throw new Error(`messages differ: "${wrongPw}" vs "${unknown}"`);
});
await page.screenshot({ path: `${OUT}/13-login-refused.png`, fullPage: true });

await step('the correct password signs in', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await signIn(page, 'frontdesk@domihealthcare.com', 'shift-change-2026');
  await page.getByText('Not clocked in').waitFor({ timeout: 15000 });
});

await step('the session cookie is httpOnly, so page scripts cannot read it', async () => {
  const visible = await page.evaluate(() => document.cookie);
  if (visible.includes('stafftime_session')) throw new Error(`session readable from JS: ${visible}`);
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === 'stafftime_session');
  if (!session) throw new Error('no session cookie was set');
  if (!session.httpOnly) throw new Error('cookie is not httpOnly');
  if (session.sameSite !== 'Lax') throw new Error(`sameSite is ${session.sameSite}`);
});

await step('the session survives a reload', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Not clocked in').waitFor({ timeout: 10000 });
});

await step('signing out returns to the sign-in screen and kills the session', async () => {
  await pickFromAccountMenu(page, 'Sign out');
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });
});

// --- forced password change ---
await step('a temporary password lands on the change-password screen, not the app', async () => {
  page = await newPage();
  await signIn(page, 'ma@domihealthcare.com', 'shift-change-2026');
  await page.getByText('Choose a new password').waitFor({ timeout: 15000 });
  if (await page.getByRole('link', { name: 'Timesheet' }).count() > 0)
    throw new Error('app navigation was reachable with a temporary password');
});
await page.screenshot({ path: `${OUT}/14-forced-change.png`, fullPage: true });

await step('a weak replacement is refused with a reason', async () => {
  await page.getByLabel('Temporary password').fill('shift-change-2026');
  await page.getByLabel('New password', { exact: true }).fill('password1234');
  await page.getByLabel('Confirm new password').fill('password1234');
  await page.getByRole('button', { name: 'Change password' }).click();
  const alert = page.getByRole('alert');
  await alert.waitFor({ timeout: 10000 });
  const text = await alert.innerText();
  if (!/common password|8 characters|easy to guess/i.test(text))
    throw new Error(`unhelpful reason: "${text}"`);
});

await step('a password with no number is refused, and the hint says why before sending', async () => {
  // The rule Dominguez chose: at least 8 characters, including a number.
  await page.getByLabel('New password', { exact: true }).fill('harbour lantern');
  await page.getByLabel('Confirm new password').fill('harbour lantern');
  if (await page.getByRole('button', { name: 'Change password' }).isEnabled())
    throw new Error('submit was enabled for a password with no number');
  await page.getByText('At least 8 characters, including a number.').waitFor({ timeout: 5000 });
});

await step('mismatched confirmation blocks submission before any request', async () => {
  await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
  await page.getByLabel('Confirm new password').fill('harbour lantern 8');
  await page.getByText('Those passwords do not match').waitFor({ timeout: 5000 });
  if (await page.getByRole('button', { name: 'Change password' }).isEnabled())
    throw new Error('submit was enabled with mismatched passwords');
});

await step('a good password is accepted and the app unlocks', async () => {
  await page.getByLabel('Temporary password').fill('shift-change-2026');
  await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
  await page.getByLabel('Confirm new password').fill('harbour lantern 7');
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 15000 });
});
await page.screenshot({ path: `${OUT}/15-unlocked.png`, fullPage: true });

await step('the new password works on a fresh sign-in, the old one does not', async () => {
  await pickFromAccountMenu(page, 'Sign out');
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });

  await signIn(page, 'ma@domihealthcare.com', 'shift-change-2026');
  await page.getByRole('alert').waitFor({ timeout: 10000 });

  await page.reload({ waitUntil: 'networkidle' });
  await signIn(page, 'ma@domihealthcare.com', 'harbour lantern 7');
  await page.getByText('Not clocked in').waitFor({ timeout: 15000 });
});

// Left until last on purpose: it throttles this address, which would break
// every sign-in after it. The runner clears login_attempts between suites.
await step('an address working through a list of accounts gets throttled', async () => {
  const fresh = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const spray = await fresh.newPage();
  await spray.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  // Ten different addresses, one guess each — far fewer attempts than the
  // per-account lockout allows, and a shape account lockout cannot see.
  for (let i = 1; i <= 10; i += 1) {
    await spray.getByLabel('Email').fill(`person${i}@domihealthcare.com`);
    await spray.getByLabel('Password', { exact: true }).fill('summer2026!');
    await spray.getByRole('button', { name: 'Sign in' }).click();
    await spray.getByRole('alert').waitFor({ timeout: 10000 });
  }

  await spray.getByLabel('Email').fill('person11@domihealthcare.com');
  await spray.getByLabel('Password', { exact: true }).fill('summer2026!');
  await spray.getByRole('button', { name: 'Sign in' }).click();
  await spray
    .getByText(/Too many failed sign-ins from this connection/)
    .waitFor({ timeout: 10000 });

  // And it says nothing about which of those addresses were real.
  const shown = await spray.getByRole('alert').innerText();
  if (/exist|unknown|no such/i.test(shown))
    throw new Error(`the refusal leaked something: ${shown}`);

  await spray.screenshot({ path: `${OUT}/45-throttled.png`, fullPage: true });
  await fresh.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL AUTH CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
