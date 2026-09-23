import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pickFromAccountMenu } from './account-menu.mjs';

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

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
}

// --- the practice's colours, before anybody signs in ---
const visitorCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const visitor = await visitorCtx.newPage();
visitor.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await step('the sign-in screen carries the Domi Healthcare name and blue', async () => {
  await visitor.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await visitor.getByText('Domi Healthcare', { exact: true }).waitFor({ timeout: 10000 });
  // #3A6888, the blue on domihealthcare.com.
  const background = await visitor
    .getByRole('button', { name: 'Sign in' })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  if (background !== 'rgb(58, 104, 136)') throw new Error(`sign-in button is ${background}`);
  const theme = await visitor.locator('meta[name="theme-color"]').getAttribute('content');
  if (theme?.toLowerCase() !== '#3a6888') throw new Error(`theme-color is ${theme}`);
});
await visitor.screenshot({ path: `${OUT}/95-login-brand.png`, fullPage: true });
await visitorCtx.close();

// --- an employee, on a phone ---
const empCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const emp = await empCtx.newPage();
emp.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(emp, 'frontdesk@domihealthcare.com');

await step('the header says Domi Staff and leads home', async () => {
  const home = emp.getByRole('link', { name: 'Domi Staff' });
  await home.waitFor({ timeout: 5000 });
  if ((await home.getAttribute('href')) !== '/') throw new Error('the wordmark does not link home');
});

await step('Help is in the account menu for everyone', async () => {
  await pickFromAccountMenu(emp, 'Help');
  await emp.getByRole('heading', { name: 'Help', exact: true }).waitFor({ timeout: 10000 });
  await emp.getByRole('heading', { name: 'Clocking in and out' }).waitFor({ timeout: 5000 });
});

await step('an employee gets the staff guide only, with no managers tab', async () => {
  if ((await emp.getByRole('tab', { name: 'For managers' }).count()) > 0)
    throw new Error('an employee was offered the managers guide');
  if ((await emp.getByRole('heading', { name: 'Hours and payroll' }).count()) > 0)
    throw new Error('the managers guide showed to an employee');
});

await step('a question opens to its answer', async () => {
  const answer = emp.getByText(/Tap your name, type your four-digit PIN/);
  if (await answer.isVisible()) throw new Error('answers should start closed');
  await emp.getByText('How do I use the front-desk tablet?').click();
  await answer.waitFor({ state: 'visible', timeout: 5000 });
});

await step('the password answer states the current rule', async () => {
  await emp.getByText('How do I change my password?').click();
  await emp.getByText(/At least 8 characters, including a number/).waitFor({ state: 'visible', timeout: 5000 });
});

await step('asking for the managers guide by address still shows the staff one', async () => {
  await emp.goto(`${BASE}/help?guide=managers`, { waitUntil: 'networkidle' });
  await emp.getByRole('heading', { name: 'Clocking in and out' }).waitFor({ timeout: 10000 });
  if ((await emp.getByRole('heading', { name: 'Hours and payroll' }).count()) > 0)
    throw new Error('the managers guide was reachable by URL');
});

await step('it fits a phone', async () => {
  const wide = await emp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (wide) throw new Error('the help page scrolls sideways on a phone');
});
await emp.screenshot({ path: `${OUT}/96-help-staff.png`, fullPage: true });
await empCtx.close();

// --- a manager ---
const mgrCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const mgr = await mgrCtx.newPage();
mgr.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

await step('a manager can switch to the managers guide', async () => {
  await pickFromAccountMenu(mgr, 'Help');
  const staffTab = mgr.getByRole('tab', { name: 'For everyone' });
  await staffTab.waitFor({ timeout: 10000 });
  if ((await staffTab.getAttribute('aria-selected')) !== 'true')
    throw new Error('the guide should open on the one for everyone');
  await mgr.getByRole('tab', { name: 'For managers' }).click();
  await mgr.getByRole('heading', { name: 'Hours and payroll' }).waitFor({ timeout: 5000 });
  await mgr.getByRole('heading', { name: 'Admins only' }).waitFor({ timeout: 5000 });
  if (!mgr.url().includes('guide=managers')) throw new Error('the tab is not in the address');
});

await step('the managers guide survives a reload', async () => {
  await mgr.reload({ waitUntil: 'networkidle' });
  await mgr.getByRole('heading', { name: 'Hours and payroll' }).waitFor({ timeout: 10000 });
});
await mgr.screenshot({ path: `${OUT}/97-help-managers.png`, fullPage: true });

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL HELP CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
