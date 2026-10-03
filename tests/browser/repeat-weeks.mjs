import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { showRegularShifts } from './nav.mjs';

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
 * Which weeks a repeating shift is on (Dominguez, October 2026: "repeat
 * shifts on like 1st Saturday of the month"): every week, every 2–4 weeks,
 * or certain weeks of the month — from Repeating shifts, the ＋ on the rota,
 * and a regular shift's Edit.
 */
async function signIn(email, viewport = { width: 1280, height: 1100 }) {
  const ctx = await browser.newContext({ viewport, timezoneId: 'America/New_York' });
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
const isLastOfItsKind = (d) => plusDays(d, 7).getMonth() !== d.getMonth();

// The first of the month after next: always ahead, whatever today is.
const today = new Date();
const start = new Date(today.getFullYear(), today.getMonth() + 2, 1);
// Every Saturday from then to eight weeks on, as a regular shift writes them.
const saturdays = [];
for (let d = new Date(start); d <= plusDays(start, 56); d = plusDays(d, 1)) {
  if (d.getDay() === 6) saturdays.push(new Date(d));
}
const firstSaturdays = saturdays.filter((d) => d.getDate() <= 7).map(key);
const lastSaturdays = saturdays.filter(isLastOfItsKind).map(key);

const frankieShifts = (page) =>
  page.evaluate(
    async ({ from, to }) => {
      const shifts = await fetch(`/api/shifts?from=${from}&to=${to}`).then((r) => r.json());
      return shifts.filter((s) => s.employee?.firstName === 'Frankie' && s.seriesId);
    },
    { from: `${key(plusDays(start, -1))}T00:00:00Z`, to: `${key(plusDays(start, 70))}T00:00:00Z` },
  );
const localDay = (iso) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

const page = await signIn('manager@domihealthcare.com');
await page.goto(`${BASE}/schedule?week=${key(start)}`, { waitUntil: 'networkidle' });

await step('Repeating shifts asks which weeks, every week to start with', async () => {
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Repeating shifts', exact: true }).click();
  await page.getByText('One rota line at a time').waitFor({ timeout: 10000 });
  const weeks = page.getByLabel('Which weeks');
  if ((await weeks.inputValue()) !== '1')
    throw new Error(`starts on "${await weeks.inputValue()}"`);
  // Nothing to preview for every week: the days say it all.
  if (await page.getByTestId('repeat-preview').count()) throw new Error('a preview for every week');
});

await step('the first Saturday of the month, with the dates it makes shown first', async () => {
  await page.getByLabel('Employee').selectOption({ label: 'Frankie Front-Desk' });
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    await page.getByRole('button', { name: day, exact: true }).click();
  }
  await page.getByLabel('Which weeks').selectOption('month');
  const first = page.getByRole('button', { name: 'The first of the month' });
  if ((await first.getAttribute('aria-pressed')) !== 'true') throw new Error('1st was not picked');
  await page.getByLabel('Starts').fill('09:00');
  await page.getByLabel('Ends').fill('13:00');
  await page.getByLabel('From', { exact: true }).fill(key(start));
  await page.getByLabel(/No end date/).check();
  const preview = await page.getByTestId('repeat-preview').innerText();
  const firstDay = new Date(`${firstSaturdays[0]}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (!preview.includes(firstDay))
    throw new Error(`the preview reads "${preview}", not ${firstDay}`);
  // The last one cannot be turned off: "Every week" is in the list.
  await first.click();
  if ((await first.getAttribute('aria-pressed')) !== 'true')
    throw new Error('every week was unticked');
  await page.screenshot({ path: `${OUT}/repeat-weeks-form.png`, fullPage: true });

  await page.getByLabel(/Publish straight away/).check();
  const saved = page.waitForResponse((r) => r.url().includes('/api/shifts/repeat'));
  await page.getByRole('button', { name: 'Create the shifts' }).click();
  const response = await saved;
  if (!response.ok()) throw new Error(`refused: ${await response.text()}`);
});

await step('only first Saturdays are on the rota', async () => {
  const shifts = await frankieShifts(page);
  const days = shifts.map((s) => localDay(s.startsAt)).sort();
  if (days.join() !== firstSaturdays.join())
    throw new Error(`made ${days.join(', ')}; expected ${firstSaturdays.join(', ')}`);
});

await step('Regular shifts says so in words', async () => {
  const card = page.getByTestId('standing-shifts-card');
  await showRegularShifts(page);
  await card
    .getByText(/The first Saturday of the month, 9:00 AM–\s*1:00 PM · North Bergen/)
    .waitFor({ timeout: 10000 });
});

await step('Frankie is told it is the first Saturday of the month', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  const notes = await frankie.evaluate(() => fetch('/api/notifications').then((r) => r.json()));
  const regular = notes.items.find((n) => n.title === 'A regular shift on your schedule');
  if (!regular || !/^The first Saturday of the month from /.test(regular.body))
    throw new Error(regular ? regular.body : 'no notice');
  await frankie.context().close();
});

await step('editing it to the last Saturday rewrites the shifts', async () => {
  const card = page.getByTestId('standing-shifts-card');
  await card.getByRole('button', { name: 'Edit…' }).click();
  await card.getByRole('button', { name: 'The last of the month' }).click();
  await card.getByRole('button', { name: 'The first of the month' }).click();
  await card.getByLabel('Change applies from').fill(key(start));
  await card.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText(/it becomes the last Saturday of the month/).waitFor({ timeout: 5000 });
  const saved = page.waitForResponse((r) => r.url().includes('/update'));
  await page.getByRole('button', { name: 'Yes, change it' }).click();
  const response = await saved;
  if (!response.ok()) throw new Error(`refused: ${await response.text()}`);
  await card.getByText(/The last Saturday of the month, 9:00 AM/).waitFor({ timeout: 10000 });

  const live = (await frankieShifts(page)).filter((s) => s.status !== 'CANCELLED');
  const days = live.map((s) => localDay(s.startsAt)).sort();
  if (days.join() !== lastSaturdays.join())
    throw new Error(`on the rota: ${days.join(', ')}; expected ${lastSaturdays.join(', ')}`);
});

await step('their usual week leaves it alone: Saturday is not one of their days', async () => {
  const card = page.getByTestId('standing-shifts-card');
  await card.getByRole('button', { name: 'Their week…' }).click();
  // Saturday is off: "Saturday — off".
  const saturday = page.getByTestId('week-day-6').getByRole('checkbox');
  await saturday.waitFor({ timeout: 10000 });
  if (await saturday.isChecked()) throw new Error('Saturday shows as a usual-week day');
});

await step(
  'the + on the rota offers the week of the day clicked, and every other week',
  async () => {
    // The week of the second Saturday after the start.
    const second = saturdays.find((d) => d.getDate() >= 8 && d.getDate() <= 14);
    await page.goto(`${BASE}/schedule?week=${key(second)}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await page
      .getByTestId('rota-row-Frankie Front-Desk')
      .getByRole('button', { name: /^Add a shift for Frankie Front-Desk on Saturday/ })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
    await dialog.waitFor({ timeout: 10000 });
    await dialog.getByLabel('Repeat this shift').check();
    await dialog.getByLabel('Which weeks').selectOption('month');
    if (
      (await dialog
        .getByRole('button', { name: 'The second of the month' })
        .getAttribute('aria-pressed')) !== 'true'
    )
      throw new Error('the 2nd was not picked for a second Saturday');

    await dialog.getByLabel('Which weeks').selectOption('2');
    const preview = await dialog.getByTestId('repeat-preview').innerText();
    // Two before the 4-week end it starts with.
    const expected = [0, 14].map((n) =>
      plusDays(second, n).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    );
    if (!expected.every((d) => preview.includes(d)))
      throw new Error(`the preview reads "${preview}", expected ${expected.join(' · ')}`);
    await page.screenshot({ path: `${OUT}/repeat-weeks-quick-add.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  },
);

await step('on a phone the choice fits the screen', async () => {
  const phone = await signIn('manager@domihealthcare.com', { width: 390, height: 900 });
  await phone.goto(`${BASE}/schedule?week=${key(start)}`, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: '+ Add', exact: true }).click();
  await phone.getByRole('menuitem', { name: 'Repeating shifts', exact: true }).click();
  await phone.getByLabel('Which weeks').selectOption('month');
  await phone.getByRole('button', { name: 'The last of the month' }).waitFor({ timeout: 5000 });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (wide) throw new Error('the page scrolls sideways');
  await phone.screenshot({ path: `${OUT}/repeat-weeks-phone.png`, fullPage: true });
  await phone.context().close();
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL REPEAT-WEEKS CHECKS PASSED');
