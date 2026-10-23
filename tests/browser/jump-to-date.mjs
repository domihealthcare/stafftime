import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

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

/**
 * A mini calendar on the rota (October 2026, Dominguez: "should include a mini
 * calendar to skip to certain weeks without having to go week by week").
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

const manager = await signIn('manager@domihealthcare.com');
const period = () => manager.getByTestId('schedule-period').innerText();

await step('Go to a week jumps months ahead in one go, to the week of the day pressed', async () => {
  await manager.goto(`${BASE}/schedule?week=2027-02-03`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: 'Week', exact: true }).click();
  await manager.getByRole('button', { name: /Go to a week/ }).click();
  const jump = manager.getByTestId('jump-to-date');
  await jump.waitFor({ timeout: 5000 });
  if (!/February 2027/.test(await jump.getByTestId('jump-month').innerText())) throw new Error('it did not open on the week shown');
  for (let i = 0; i < 4; i++) await jump.getByRole('button', { name: 'A month on' }).click();
  if (!/June 2027/.test(await jump.getByTestId('jump-month').innerText())) throw new Error('the arrows did not move a month');
  await jump.getByRole('button', { name: /Wednesday, June 16, 2027/ }).click();
  await manager.waitForFunction(() => /Jun 13/.test(document.querySelector('[data-testid=schedule-period]')?.textContent ?? ''), null, { timeout: 10000 });
  const text = await period();
  if (!/Jun 13 – Jun 19, 2027/.test(text)) throw new Error(`the week shown is ${text}`);
  await manager.screenshot({ path: `${OUT}/jump-to-date.png` });
});

await step('the double arrows move a year, and in Month it goes to the month', async () => {
  await manager.getByRole('button', { name: 'Month', exact: true }).click();
  await manager.getByRole('button', { name: /Go to a month/ }).click();
  const jump = manager.getByTestId('jump-to-date');
  await jump.getByRole('button', { name: 'A year on' }).click();
  if (!/2028/.test(await jump.getByTestId('jump-month').innerText())) throw new Error('a year on did not move a year');
  await jump.getByRole('button', { name: /June 1, 2028/ }).first().click();
  await manager.waitForFunction(() => /June 2028/.test(document.querySelector('[data-testid=schedule-period]')?.textContent ?? ''), null, { timeout: 10000 });
  await manager.getByRole('button', { name: 'Week', exact: true }).click();
});

await step('This week in the calendar comes back to today', async () => {
  await manager.getByRole('button', { name: /Go to a week/ }).click();
  await manager.getByTestId('jump-to-date').getByRole('button', { name: 'This week' }).click();
  const text = await period();
  if (/2028/.test(text)) throw new Error(`still on ${text}`);
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL JUMP-TO-DATE CHECKS PASSED');
