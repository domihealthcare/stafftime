import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pickFromAccountMenu } from './account-menu.mjs';

// What staff see when a screen fails (maintenance pass, October 2026): plain
// words and a Reload button, never React Router's developer page with its
// stack trace. Made to happen the way it does in real life: a screen's code
// that cannot be fetched (a tab open from before a release, a dropped
// connection), with the automatic reload in main.tsx already used up.

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('frontdesk@domihealthcare.com');
await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByText('Not clocked in').waitFor({ timeout: 20000 });

// The Help screen's code: /assets/HelpPage-<hash>.js when built,
// /src/pages/HelpPage.tsx on the dev server.
const HELP_CODE = /\/HelpPage[-.][^/]*$/;

await step('a screen that fails shows plain words and a Reload button, not a stack trace', async () => {
  // As if main.tsx had just reloaded for an update, so it does not again.
  await page.evaluate(() =>
    sessionStorage.setItem('domi-staff:reloaded-for-update', String(Date.now())),
  );
  await page.route(HELP_CODE, (route) => route.abort());
  await pickFromAccountMenu(page, 'Help');
  await page
    .getByRole('heading', { name: 'Something went wrong on this screen' })
    .waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Reload' }).waitFor({ timeout: 5000 });
  await page.getByRole('link', { name: 'Go to Home' }).waitFor({ timeout: 5000 });
  const text = await page.locator('body').innerText();
  if (/Unexpected Application Error|Hey developer|at\s+\S+\s+\(/i.test(text))
    throw new Error(`the developer page or a stack trace is showing: ${text.slice(0, 200)}`);
});
await page.screenshot({ path: `${OUT}/error-screen.png`, fullPage: true });

await step('Reload brings the screen back once its code can be fetched again', async () => {
  await page.unroute(HELP_CODE);
  await page.getByRole('button', { name: 'Reload' }).click();
  await page.getByRole('heading', { name: 'Help', exact: true }).waitFor({ timeout: 15000 });
});

// --- a check that fails says so, rather than look like "nothing to warn about" ---
const fail = (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
const inAWhile = () => {
  // Far ahead and randomised, as drive.mjs does, so runs never collide.
  const d = new Date();
  d.setDate(d.getDate() + 90 + Math.floor(Math.random() * 300));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

await step('when the balance cannot be loaded, the Schedule says so', async () => {
  await page.route(/\/api\/pto\/balance/, fail);
  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await page.getByTestId('your-time-off-failed').waitFor({ timeout: 15000 });
  await page.unroute(/\/api\/pto\/balance/);
});

await step('when the rota cannot be checked, the time off form says so', async () => {
  await page.route(/\/api\/shifts\?/, fail);
  await page.goto(`${BASE}/time-off?request=1`, { waitUntil: 'networkidle' });
  const day = inAWhile();
  await page.getByLabel('First day').fill(day);
  await page.getByLabel('Last day').fill(day);
  await page.getByTestId('time-off-rota-unknown').waitFor({ timeout: 15000 });
  await page.unroute(/\/api\/shifts\?/);
});

const mgrCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const mgr = await mgrCtx.newPage();
await mgr.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await mgr.getByLabel('Email').fill('manager@domihealthcare.com');
await mgr.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await mgr.getByRole('button', { name: 'Sign in' }).click();
await mgr.getByText('Not clocked in').waitFor({ timeout: 20000 });

await step('saving a shift when overtime and closures cannot be checked asks, never a silent yes', async () => {
  await mgr.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: '+ Add', exact: true }).click();
  await mgr.getByRole('menuitem', { name: 'Shift', exact: true }).click();
  await mgr.getByLabel('Employee').selectOption({ label: 'Frankie Front-Desk' });
  const day = inAWhile();
  await mgr.getByLabel('Starts').fill(`${day}T09:00`);
  await mgr.getByLabel('Ends').fill(`${day}T17:00`);
  // Only now, so the page itself loaded normally.
  await mgr.route(/\/api\/shifts\/overtime-check/, fail);
  await mgr.route(/\/api\/events\?/, fail);
  let posted = false;
  mgr.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/shifts')) posted = true;
  });
  await mgr.getByRole('button', { name: 'Create shift' }).click();
  // The form asks about closures first, then overtime.
  const closures = mgr.getByRole('alertdialog', { name: 'Could not check for closures' });
  await closures.waitFor({ timeout: 10000 });
  await closures.getByRole('button', { name: 'Yes, add it anyway' }).click();
  const overtime = mgr.getByRole('alertdialog', { name: 'Could not check overtime' });
  await overtime.waitFor({ timeout: 10000 });
  await overtime.getByRole('button', { name: 'Go back' }).click();
  await mgr.waitForTimeout(500);
  if (posted) throw new Error('the shift was saved after Go back');
  await mgr.unroute(/\/api\/shifts\/overtime-check/);
  await mgr.unroute(/\/api\/events\?/);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL ERROR SCREEN CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
