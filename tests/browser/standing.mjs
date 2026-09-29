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
 * Regular shifts with no end date, and weeks that start on Sunday (both asked
 * for by Dominguez, September 2026): "I always work Mondays" is one repeat
 * with no last date, kept eight weeks ahead, listed under Regular shifts and
 * stopped from there. The calendar reads Sunday to Saturday; overtime is still
 * counted as it was.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (d, n) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};
const sunday = (d) => {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
};
// The Monday of the week after next: never today, so never the seeded shift.
const firstMonday = plusDays(sunday(new Date()), 15);
const thirdMonday = plusDays(firstMonday, 14);

const frankieShifts = (page) =>
  page.evaluate(
    async ({ from, to }) => {
      const shifts = await fetch(`/api/shifts?from=${from}&to=${to}`).then((r) => r.json());
      return shifts.filter((s) => s.employee?.firstName === 'Frankie' && s.seriesId);
    },
    {
      from: `${key(plusDays(firstMonday, -1))}T00:00:00Z`,
      to: `${key(plusDays(firstMonday, 70))}T00:00:00Z`,
    },
  );

const page = await signIn('manager@domihealthcare.com');

await step('the week on the Schedule starts on Sunday', async () => {
  await page.goto(`${BASE}/schedule?week=${key(firstMonday)}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  const heading = await page.getByTestId('schedule-period').innerText();
  const expected = plusDays(firstMonday, -1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  if (!heading.startsWith(expected))
    throw new Error(`the week reads "${heading}", expected it to start ${expected}`);
  const firstColumn = await page.locator('thead th').nth(1).innerText();
  if (!/^Sun/.test(firstColumn.trim())) throw new Error(`first day column is "${firstColumn}"`);
});

await step('so does the month', async () => {
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  const grid = page.getByTestId('month-grid');
  await grid.waitFor({ timeout: 10000 });
  const first = await grid.locator('p').first().innerText();
  if (!/^S/.test(first.trim())) throw new Error(`the month starts with "${first}"`);
  await page.getByRole('button', { name: 'Week', exact: true }).click();
});

await step('the repeat form lists Sunday first', async () => {
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Repeating shifts', exact: true }).click();
  await page.getByText('One rota line at a time').waitFor({ timeout: 10000 });
  const labels = await page
    .getByRole('button', { name: /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/ })
    .allInnerTexts();
  if (labels.join(',') !== 'Sun,Mon,Tue,Wed,Thu,Fri,Sat')
    throw new Error(`the days read ${labels.join(',')}`);
});

await step('a regular Monday shift is made with no end date', async () => {
  await page.getByLabel('Employee').selectOption({ label: 'Frankie Front-Desk' });
  for (const day of ['Tue', 'Wed', 'Thu', 'Fri']) {
    await page.getByRole('button', { name: day, exact: true }).click();
  }
  await page.getByLabel('Starts').fill('09:00');
  await page.getByLabel('Ends').fill('17:00');
  await page.getByLabel('From', { exact: true }).fill(key(firstMonday));
  await page.getByLabel(/No end date/).check();
  // No date to pick any more.
  if (await page.locator('#repeat-until').count())
    throw new Error('the Until date is still asked for');
  await page.getByLabel(/Publish straight away/).check();
  await page.getByRole('button', { name: 'Create the shifts' }).click();
  // Eight weeks on from the first Monday is a Monday too: nine of them.
  await page.getByText('9 shifts created.').waitFor({ timeout: 20000 });
  await page.getByTestId('plan-standing').waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/standing-created.png`, fullPage: true });

await step('every one of them belongs to the regular shift', async () => {
  const shifts = await frankieShifts(page);
  if (shifts.length !== 9) throw new Error(`${shifts.length} shifts carry the series`);
  if (new Set(shifts.map((s) => s.seriesId)).size !== 1)
    throw new Error('they belong to more than one series');
  if (shifts.some((s) => new Date(s.startsAt).getUTCDay() !== 1))
    throw new Error('one of them is not on a Monday');
});

await step('it is listed under Regular shifts', async () => {
  const card = page.getByTestId('standing-shifts-card');
  await card.getByText('Frankie Front-Desk').waitFor({ timeout: 10000 });
  await card.getByText(/Mondays, 9:00 AM–5:00 PM · North Bergen/).waitFor({ timeout: 5000 });
  await card.getByTestId('standing-shift').getByText(/· no end date/).waitFor({ timeout: 5000 });
});

await step('a shift from it says it is part of a regular shift', async () => {
  await page.goto(`${BASE}/schedule?week=${key(firstMonday)}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  const row = page.getByTestId('rota-row-Frankie Front-Desk');
  await row.getByTestId('shift-chip').first().click();
  await page.getByTestId('shift-is-regular').waitFor({ timeout: 10000 });
  await page.keyboard.press('Escape');
});

await step('Frankie is told once, that it has no end date', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  const notes = await frankie.evaluate(() => fetch('/api/notifications').then((r) => r.json()));
  const list = notes.items;
  const regular = list.filter((n) => n.title === 'A regular shift on your schedule');
  if (regular.length !== 1) throw new Error(`${regular.length} notices about it`);
  if (!/with no end date/.test(regular[0].body)) throw new Error(regular[0].body);
  await frankie.context().close();
});

await step('stopping it asks first, then takes off the shifts after the last day', async () => {
  await page.goto(`${BASE}/schedule?week=${key(firstMonday)}`, { waitUntil: 'networkidle' });
  const card = page.getByTestId('standing-shifts-card');
  await card.getByRole('button', { name: 'Stop…' }).click();
  await card.getByLabel('Last day it runs').fill(key(thirdMonday));
  await card.getByRole('button', { name: 'Stop it' }).click();
  // The confirmation pop-up, never the browser's own.
  await page.getByRole('button', { name: 'Keep it going' }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Yes, stop it' }).click();
  await card.getByText(/6 shifts taken off the rota/).waitFor({ timeout: 15000 });
  await card.getByText(/· ends /).waitFor({ timeout: 5000 });
  if (await card.getByRole('button', { name: 'Stop…' }).count())
    throw new Error('it can still be stopped');

  const shifts = await frankieShifts(page);
  const live = shifts.filter((s) => s.status !== 'CANCELLED');
  if (live.length !== 3) throw new Error(`${live.length} are still on the rota`);
  if (live.some((s) => s.startsAt.slice(0, 10) > key(thirdMonday)))
    throw new Error('a shift after the last day is still on');
});
await page.screenshot({ path: `${OUT}/standing-stopped.png`, fullPage: true });

await step('a repeat with an end date makes no regular shift', async () => {
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Repeating shifts', exact: true }).click();
  await page.getByLabel('Employee').selectOption({ label: 'Frankie Front-Desk' });
  await page.getByLabel('From', { exact: true }).fill('2027-03-01');
  await page.getByLabel('Until', { exact: true }).fill('2027-03-05');
  await page.getByRole('button', { name: 'Create the shifts' }).click();
  await page.getByText('5 shifts created.').waitFor({ timeout: 20000 });
  if (await page.getByTestId('plan-standing').count())
    throw new Error('it was treated as having no end date');
  const card = page.getByTestId('standing-shifts-card');
  if ((await card.getByTestId('standing-shift').count()) !== 1)
    throw new Error('a second regular shift appeared');
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL STANDING-SHIFT CHECKS PASSED');
