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
 * Somebody's usual week, set in one go (asked for by Dominguez, September
 * 2026): "Mondays 12 to 8 at North Bergen, Tuesdays 9 to 5 at West New York,
 * Fridays from home" used to be a regular shift made for each day by hand.
 * Set under Schedule → Regular shifts, and on the Staff editor; a change
 * leaves the days that did not change alone.
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
// The Sunday after next: clear of anything seeded for today.
const firstSunday = (() => {
  const s = new Date();
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay() + 14);
  return s;
})();

/// Ada's shifts from regular shifts, by local weekday.
const adaShifts = (page) =>
  page.evaluate(
    async ({ from, to }) => {
      const shifts = await fetch(`/api/shifts?from=${from}&to=${to}`).then((r) => r.json());
      return shifts
        .filter((s) => s.employee?.firstName === 'Ada' && s.seriesId)
        .map((s) => ({
          id: s.id,
          status: s.status,
          isRemote: s.isRemote,
          office: s.location.name,
          day: new Date(s.startsAt).toLocaleDateString('en-US', {
            weekday: 'short',
            timeZone: 'America/New_York',
          }),
          start: new Date(s.startsAt).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/New_York',
          }),
        }));
    },
    {
      from: `${key(firstSunday)}T00:00:00Z`,
      to: `${key(plusDays(firstSunday, 70))}T00:00:00Z`,
    },
  );

const count = (shifts, fn) => shifts.filter(fn).length;

const page = await signIn('manager@domihealthcare.com');
const box = page.getByTestId('usual-week');

async function setDay(day, { start, end, place }) {
  const row = box.getByTestId(`week-day-${day}`);
  const tick = row.getByRole('checkbox');
  if (!(await tick.isChecked())) await tick.check();
  const name = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day];
  if (start) await row.getByLabel(`${name} starts`).fill(start);
  if (end) await row.getByLabel(`${name} ends`).fill(end);
  if (place) await row.getByLabel(`${name} place`).selectOption({ label: place });
}

async function saveWeek() {
  await box.getByLabel('Starting').fill(key(firstSunday));
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/shifts/weekly/') && r.request().method() === 'POST',
  );
  await box.getByRole('button', { name: 'Save their week' }).click();
  await page.getByRole('button', { name: 'Yes, save it' }).click();
  const response = await saved;
  if (!response.ok()) throw new Error(`the save answered ${response.status()}`);
  await box.getByText(/^Saved from/).waitFor({ timeout: 10000 });
}

await step('a manager picks somebody under Regular shifts and gets their week', async () => {
  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await box.getByLabel(/usual week/).selectOption({ label: 'Ada Admin' });
  await box.getByTestId('weekly-schedule').waitFor({ timeout: 10000 });
  // Sunday first, as the calendar reads, and all off to begin with.
  const days = await box.locator('[data-testid^="week-day-"]').allInnerTexts();
  if (!/^Sunday/.test(days[0].trim())) throw new Error(`the first day is "${days[0]}"`);
  if ((await box.getByRole('checkbox', { checked: true }).count()) !== 0)
    throw new Error('some days start ticked');
});

await step('different hours and places on different days, saved in one go', async () => {
  await setDay(1, { start: '12:00', end: '20:00', place: 'North Bergen' });
  await setDay(2, { start: '09:00', end: '17:00', place: 'West New York' });
  await setDay(5, { start: '09:00', end: '17:00', place: 'Work from home' });
  await box.getByTestId('week-total').getByText('3 days, 24 hours a week.').waitFor();
  await saveWeek();
  await box.getByText('24 shifts put on the rota', { exact: false }).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/usual-week-saved.png`, fullPage: true });

let before = [];
await step('the rota has each day as it was set, eight weeks of them', async () => {
  before = await adaShifts(page);
  const mondays = before.filter((s) => s.day === 'Mon');
  const tuesdays = before.filter((s) => s.day === 'Tue');
  const fridays = before.filter((s) => s.day === 'Fri');
  if (mondays.length !== 8 || tuesdays.length !== 8 || fridays.length !== 8)
    throw new Error(`${mondays.length} Mon, ${tuesdays.length} Tue, ${fridays.length} Fri`);
  if (mondays.some((s) => s.start !== '12:00' || s.office !== 'North Bergen'))
    throw new Error('a Monday is not 12pm at North Bergen');
  if (tuesdays.some((s) => s.start !== '09:00' || s.office !== 'West New York'))
    throw new Error('a Tuesday is not 9am at West New York');
  if (fridays.some((s) => !s.isRemote)) throw new Error('a Friday is not from home');
  if (before.some((s) => s.status !== 'PUBLISHED')) throw new Error('not all published');
});

await step('they are listed as regular shifts, each with a way back to the week', async () => {
  const list = page.getByTestId('standing-shift').filter({ hasText: 'Ada Admin' });
  await list.first().waitFor({ timeout: 5000 });
  if ((await list.count()) !== 3) throw new Error(`${await list.count()} listed`);
  await list.first().getByRole('button', { name: 'Their week…' }).waitFor();
});

await step('a change leaves the days that did not change alone', async () => {
  await setDay(1, { start: '13:00' });
  await box.getByTestId('week-day-5').getByRole('checkbox').uncheck();
  await setDay(3, { start: '09:00', end: '17:00', place: 'West New York' });
  await saveWeek();

  const after = await adaShifts(page);
  const live = after.filter((s) => s.status !== 'CANCELLED');
  const tuesdayIds = (list) => list.filter((s) => s.day === 'Tue').map((s) => s.id).sort().join();
  if (tuesdayIds(live) !== tuesdayIds(before)) throw new Error('the Tuesdays were rewritten');
  if (count(live, (s) => s.day === 'Fri') !== 0) throw new Error('Fridays are still on');
  if (count(after, (s) => s.day === 'Fri' && s.status === 'CANCELLED') !== 8)
    throw new Error('the published Fridays were not kept as cancelled');
  if (count(live, (s) => s.day === 'Mon' && s.start === '13:00') !== 8)
    throw new Error('the Mondays did not move to 1pm');
  if (count(live, (s) => s.day === 'Wed' && s.office === 'West New York') < 7)
    throw new Error('the Wednesdays were not added');
});

await step('the replaced regular shifts, which never ran, are gone from the list', async () => {
  const list = page.getByTestId('standing-shift').filter({ hasText: 'Ada Admin' });
  await page.waitForTimeout(500);
  const texts = await list.allInnerTexts();
  if (texts.length !== 2) throw new Error(`${texts.length} listed: ${texts.join(' | ')}`);
  if (!texts.some((t) => /Tuesdays and Wednesdays/.test(t))) throw new Error('no Tue+Wed line');
  if (!texts.some((t) => /Mondays, 1:00 PM/.test(t))) throw new Error('no 1pm Monday line');
});

const admin = await signIn('admin@domihealthcare.com');
const editor = admin.getByTestId('staff-editor');

await step('the same week is on their Staff editor', async () => {
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: 'Edit Ada Admin' }).click();
  const week = editor.getByTestId('weekly-schedule');
  await week.waitFor({ timeout: 10000 });
  await week.getByLabel('Monday starts').waitFor({ timeout: 10000 });
  if ((await week.getByLabel('Monday starts').inputValue()) !== '13:00')
    throw new Error('Monday does not read 1pm');
  if (!(await week.getByTestId('week-day-3').getByRole('checkbox').isChecked()))
    throw new Error('Wednesday is not ticked');
  if (await week.getByTestId('week-day-5').getByRole('checkbox').isChecked())
    throw new Error('Friday is still ticked');
});
await admin.screenshot({ path: `${OUT}/usual-week-staff-editor.png`, fullPage: true });

await step('closing the editor with the week half-changed asks first', async () => {
  await editor.getByTestId('week-day-6').getByRole('checkbox').check();
  await editor.getByRole('button', { name: 'Close' }).click();
  await admin.getByText(/usual week have not been saved/).waitFor({ timeout: 5000 });
  await admin.getByRole('button', { name: 'Keep editing' }).click();
});

await browser.close();
if (errors.length) {
  console.log(`\n${errors.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
