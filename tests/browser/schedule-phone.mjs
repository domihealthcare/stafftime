import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo } from './nav.mjs';

// The Schedule on a phone (October 2026, Dominguez): a manager starts on their
// own schedule, as staff do — a phone is for checking when you are on — with
// the picker's ✕ back to everyone; the rota's name column folds to the photo and a
// first name so the week has the room; and the buttons above it sit in tidy
// full-width rows. On a laptop, where rotas are built, it still starts on
// everyone.
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

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
}

const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const phone = await phoneCtx.newPage();
phone.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(phone, 'manager@domihealthcare.com');
await goTo(phone, 'Schedule');
await phone.getByTestId('week-grid').waitFor({ timeout: 15000 });

await step('on a phone a manager starts on their own row, and can show everyone', async () => {
  await phone.getByTestId('week-person').getByText('Morgan Manager').waitFor({ timeout: 5000 });
  if ((await phone.getByTestId('rota-row-Morgan Manager').count()) !== 1) throw new Error('their own row is missing');
  if ((await phone.getByTestId('rota-row-Frankie Front-Desk').count()) !== 0) throw new Error('somebody else is shown');
  // The person picker's ✕.
  await phone.getByRole('button', { name: 'Show everyone', exact: true }).click();
  await phone.getByTestId('rota-row-Frankie Front-Desk').waitFor({ timeout: 5000 });
  if ((await phone.getByTestId('week-person').count()) !== 0) throw new Error('still says only one person');
});

await step('the name column folds to the photo and a first name, the full name kept for screen readers', async () => {
  const header = phone.getByTestId('rota-row-Frankie Front-Desk').getByRole('rowheader');
  const width = (await header.boundingBox())?.width ?? 999;
  if (width > 80) throw new Error(`the name column is ${Math.round(width)}px wide`);
  await phone.getByRole('rowheader', { name: /Frankie Front-Desk/ }).waitFor({ timeout: 5000 });
  if (!(await header.getByText('Frankie', { exact: true }).isVisible())) throw new Error('no first name under the photo');
  // Kept for screen readers only: there, but a pixel wide.
  const roles = await header.getByText(/Front Desk/).boundingBox();
  if (roles && roles.width > 2) throw new Error('the job roles are still shown');
});
await phone.screenshot({ path: `${OUT}/schedule-phone-week.png`, fullPage: false });

await step('the buttons sit in full-width rows, and the page does not scroll sideways', async () => {
  const top = async (name) => (await phone.getByRole('button', { name, exact: true }).first().boundingBox())?.y;
  const [previous, thisWeek, next] = [await top('← Previous'), await top('This week'), await top('Next →')];
  if (previous !== thisWeek || thisWeek !== next) throw new Error('Previous, This week and Next are not on one row');
  const week = await phone.getByRole('button', { name: 'Week', exact: true }).boundingBox();
  const request = await phone.getByRole('link', { name: '+ Request time off' }).boundingBox();
  if (Math.abs((week?.y ?? 0) - (request?.y ?? 99)) > 8) throw new Error('Request time off and Week / Month are not on one row');
  await phone.getByRole('button', { name: 'Copy last week' }).waitFor({ timeout: 5000 });
  const sideways = await phone.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (sideways) throw new Error('the page scrolls sideways');
});
await phone.screenshot({ path: `${OUT}/schedule-phone-top.png`, fullPage: false });

await step('the month on a phone starts on them too', async () => {
  const fresh = await phoneCtx.newPage();
  await fresh.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await fresh.getByRole('button', { name: 'Month', exact: true }).click();
  await fresh.getByTestId('month-person').getByText('Morgan Manager').waitFor({ timeout: 10000 });
  await fresh.getByRole('button', { name: 'Show everyone', exact: true }).click();
  await fresh.waitForTimeout(300);
  if ((await fresh.getByTestId('month-person').count()) !== 0) throw new Error('still one person');
  await fresh.close();
});

await step('on a laptop a manager still starts on everyone', async () => {
  const laptopCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const laptop = await laptopCtx.newPage();
  await signIn(laptop, 'manager@domihealthcare.com');
  await goTo(laptop, 'Schedule');
  await laptop.getByTestId('rota-row-Frankie Front-Desk').waitFor({ timeout: 15000 });
  if ((await laptop.getByTestId('week-person').count()) !== 0) throw new Error('narrowed to one person');
  const header = laptop.getByTestId('rota-row-Frankie Front-Desk').getByRole('rowheader');
  if (!(await header.getByText(/Front Desk/).isVisible())) throw new Error('job roles hidden on a laptop');
  await laptopCtx.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL SCHEDULE PHONE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
