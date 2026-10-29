import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pickFromAccountMenu } from './account-menu.mjs';

// Where you're signed in (October 2026, Dominguez: "sometimes a log in is
// left open"): Your profile lists every phone and computer signed in as you,
// marks this one, and signs out another one, or all but this one.
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
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`);
    errors.push(`${name}: ${e.message}`);
  }
};

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Your account/ }).waitFor({ timeout: 20000 });
}

/// What the server says to the browser's next request: 200 while signed in,
/// 401 once that sign-in has been ended from somewhere else.
const meStatus = (page) => page.evaluate(() => fetch('/api/auth/me').then((r) => r.status));

const rows = (page) => page.getByTestId('signed-in-device');
const row = (page, text) => rows(page).filter({ hasText: text });

async function showCard(page) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Where you’re signed in' }).waitFor({ timeout: 15000 });
  await rows(page).first().waitFor({ timeout: 10000 });
}

// Frankie on her iPhone, and the same account left open on a Windows computer.
const phoneCtx = await browser.newContext({
  userAgent: IPHONE_SAFARI,
  viewport: { width: 390, height: 844 },
  isMobile: true,
});
const phone = await phoneCtx.newPage();
phone.on('pageerror', (e) => errors.push(`pageerror (phone): ${e.message}`));
await signIn(phone, 'frontdesk@domihealthcare.com');
// Earlier suites leave Frankie signed in elsewhere; start from this phone alone
// so the list below is exactly the two this suite makes.
await phone.evaluate(() => fetch('/api/auth/sessions', { method: 'DELETE' }));

const pcCtx = await browser.newContext({
  userAgent: WINDOWS_CHROME,
  viewport: { width: 1280, height: 900 },
});
const pc = await pcCtx.newPage();
pc.on('pageerror', (e) => errors.push(`pageerror (pc): ${e.message}`));
await signIn(pc, 'frontdesk@domihealthcare.com');

await step(
  'Your profile lists both, described in plain words, with This device on the phone',
  async () => {
    await pickFromAccountMenu(phone, 'Your profile');
    await phone.getByRole('heading', { name: 'Your profile' }).waitFor({ timeout: 15000 });
    await showCard(phone);
    const count = await rows(phone).count();
    if (count !== 2) throw new Error(`expected 2 signed-in devices, found ${count}`);
    const here = row(phone, 'Safari on iPhone');
    await here.waitFor({ timeout: 5000 });
    await here.getByText('This device', { exact: true }).waitFor({ timeout: 5000 });
    await here.getByText(/In use now/).waitFor({ timeout: 5000 });
    if ((await here.getByRole('button').count()) !== 0)
      throw new Error('this device has a Sign out button of its own');
    const there = row(phone, 'Chrome on Windows');
    await there.waitFor({ timeout: 5000 });
    if ((await there.getByText('This device', { exact: true }).count()) !== 0) {
      throw new Error('the computer is marked as this device');
    }
    await there.getByText(/Signed in (just now|\d+ min ago)/).waitFor({ timeout: 5000 });
    await there.getByText(/Last used (just now|\d+ min ago)/).waitFor({ timeout: 5000 });
    await phone.screenshot({ path: `${OUT}/signed-in-devices.png`, fullPage: true });
  },
);

await step('the list never carries an IP address', async () => {
  const list = await phone.evaluate(() => fetch('/api/auth/sessions').then((r) => r.json()));
  if (list.some((s) => 'ipAddress' in s)) throw new Error('an IP address was sent to the browser');
  if (list.filter((s) => s.current).length !== 1)
    throw new Error('not exactly one session is marked current');
});

await step(
  'the server will not sign out this device that way, nor one that is not yours',
  async () => {
    const statuses = await phone.evaluate(async () => {
      const list = await fetch('/api/auth/sessions').then((r) => r.json());
      const mine = list.find((s) => s.current);
      const self = (await fetch(`/api/auth/sessions/${mine.id}`, { method: 'DELETE' })).status;
      const nobody = (
        await fetch('/api/auth/sessions/00000000-0000-4000-8000-000000000000', { method: 'DELETE' })
      ).status;
      return { self, nobody };
    });
    if (statuses.self !== 400)
      throw new Error(`signing out this device by id answered ${statuses.self}`);
    if (statuses.nobody !== 404) throw new Error(`an unknown session answered ${statuses.nobody}`);
    if ((await meStatus(phone)) !== 200) throw new Error('the phone was signed out');
  },
);

await step('Sign out on the computer asks first, then ends that sign-in', async () => {
  if ((await meStatus(pc)) !== 200) throw new Error('the computer was not signed in to start with');
  await phone.getByRole('button', { name: 'Sign out Chrome on Windows' }).click();
  const dialog = phone.getByRole('alertdialog', { name: 'Sign out Chrome on Windows?' });
  await dialog.waitFor({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Yes, sign it out' }).click();
  await phone
    .getByText('Signed out Chrome on Windows.', { exact: true })
    .waitFor({ timeout: 10000 });
  await phone.getByText('Only this device is signed in as you.').waitFor({ timeout: 10000 });
  if ((await rows(phone).count()) !== 1) throw new Error('the computer is still listed');
  const status = await meStatus(pc);
  if (status !== 401) throw new Error(`the computer's next request answered ${status}, not 401`);
  await pc.reload({ waitUntil: 'networkidle' });
  await pc.getByLabel('Email').waitFor({ timeout: 15000 });
  if ((await meStatus(phone)) !== 200) throw new Error('the phone was signed out too');
});

await step(
  'Sign out everywhere else asks first, then ends the others and keeps this one',
  async () => {
    await signIn(pc, 'frontdesk@domihealthcare.com');
    await showCard(phone);
    await row(phone, 'Chrome on Windows').waitFor({ timeout: 10000 });
    await phone.getByRole('button', { name: 'Sign out everywhere else' }).click();
    const dialog = phone.getByRole('alertdialog', { name: 'Sign out everywhere else?' });
    await dialog.waitFor({ timeout: 5000 });
    await dialog.getByRole('button', { name: 'Yes, sign them out' }).click();
    await phone
      .getByText('Signed out 1 other device.', { exact: true })
      .waitFor({ timeout: 10000 });
    await phone.getByText('Only this device is signed in as you.').waitFor({ timeout: 10000 });
    if ((await phone.getByRole('button', { name: 'Sign out everywhere else' }).count()) !== 0) {
      throw new Error('Sign out everywhere else is still offered with nothing else signed in');
    }
    const status = await meStatus(pc);
    if (status !== 401) throw new Error(`the computer's next request answered ${status}, not 401`);
    if ((await meStatus(phone)) !== 200) throw new Error('the phone was signed out too');
  },
);

await step('it fits a phone', async () => {
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (wide) throw new Error('the profile page scrolls sideways on a phone');
});

await browser.close();
console.log(
  `\n${errors.length === 0 ? 'ALL SIGNED-IN DEVICES CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`,
);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
