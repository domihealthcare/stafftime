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
 * The practice calendar (October 2026, Dominguez: "a calendar that staff can
 * reference for multiple things — events, diagnostic schedule,
 * holidays/office closures"), under Schedule → Calendar.
 *
 * Diagnostics are at an office and for everyone; a holiday names a day and
 * shuts nothing; pay days are worked out from the pay period (the Friday after
 * it ends) and never entered. Managers add; everybody reads; it all reaches
 * phones through the calendar feed.
 *
 * Built in March 2027 — far enough ahead to be the future, near enough to be
 * inside the feed's year.
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').first().waitFor({ timeout: 20000 });
  return page;
}

const MONTH = '2027-03-01';
const calendar = async (page) => {
  await page.goto(`${BASE}/schedule/calendar?month=${MONTH}`, { waitUntil: 'networkidle' });
  await page.getByTestId('calendar-month').getByText('March 2027').waitFor({ timeout: 10000 });
};
const day = (page, date) => page.getByTestId(`calendar-day-${date}`);

// Periods start on Sundays from 18 October 2026, so March 2027 is paid on
// Fridays the 12th and the 26th.
const admin = await signIn('admin@domihealthcare.com');
await step('an admin sets the pay period', async () => {
  const status = await admin.evaluate(async () => {
    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payPeriodStart: '2026-10-18' }),
    });
    return response.status;
  });
  if (status !== 200) throw new Error(`settings answered ${status}`);
});

const manager = await signIn('manager@domihealthcare.com');

await step('Calendar is a tab of Schedule', async () => {
  await manager.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await manager.getByRole('navigation', { name: 'Schedule or calendar' }).getByRole('link', { name: 'Calendar' }).click();
  await manager.getByRole('heading', { name: 'Calendar', level: 1 }).waitFor({ timeout: 10000 });
  // Schedule stays the tab that is lit.
  const lit = await manager.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Schedule/ }).getAttribute('aria-current');
  if (lit !== 'page') throw new Error('Schedule is not marked as the page you are on');
});

await step('a manager adds a diagnostics date at an office', async () => {
  await calendar(manager);
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Diagnostics date' }).click();
  const form = manager.getByRole('form', { name: 'New diagnostics date' });
  await form.getByLabel('Which tests?').fill('US + ECHO');
  // For everyone, at an office: no "who", no place, no call.
  if (await form.getByLabel('Who is it for?').count()) throw new Error('diagnostics ask who they are for');
  if (await form.getByLabel('Where (optional)').count()) throw new Error('diagnostics ask where');
  await form.getByLabel('Which office?').selectOption({ label: 'West New York' });
  await form.getByLabel('Starts').fill('2027-03-07T08:00');
  await form.getByLabel('Ends').fill('2027-03-07T14:00');
  await form.getByRole('button', { name: 'Add diagnostics date' }).click();
  const chip = day(manager, '2027-03-07').getByTestId('diagnostic-chip');
  await chip.waitFor({ timeout: 10000 });
  const text = await chip.innerText();
  if (!text.includes('US + ECHO') || !text.includes('8am') || !text.includes('WNY')) {
    throw new Error(`the chip reads "${text}"`);
  }
});

await step('"Add another date like this" copies it to a new day and office', async () => {
  await day(manager, '2027-03-07').getByTestId('diagnostic-chip').click();
  const dialog = manager.getByRole('dialog', { name: 'US + ECHO' });
  await dialog.getByText('West New York').waitFor();
  await dialog.getByRole('button', { name: 'Add another date like this' }).click();
  const form = manager.getByRole('form', { name: 'New diagnostics date' });
  if ((await form.getByLabel('Which tests?').inputValue()) !== 'US + ECHO') throw new Error('the tests were not copied');
  const starts = await form.getByLabel('Starts').inputValue();
  if (!starts.endsWith('T08:00')) throw new Error(`the time was not copied: ${starts}`);
  await form.getByLabel('Starts').fill('2027-03-14T08:00');
  await form.getByLabel('Ends').fill('2027-03-14T14:00');
  await form.getByLabel('Which office?').selectOption({ label: 'North Bergen' });
  await form.getByRole('button', { name: 'Add diagnostics date' }).click();
  await day(manager, '2027-03-14').getByTestId('diagnostic-chip').getByText('NB').waitFor({ timeout: 10000 });
  // The first is untouched.
  await day(manager, '2027-03-07').getByTestId('diagnostic-chip').getByText('WNY').waitFor();
});

await step('a holiday is a whole day, for everyone, and shuts nothing', async () => {
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Holiday' }).click();
  const form = manager.getByRole('form', { name: 'New holiday' });
  await form.getByLabel('Which holiday?').fill('St Patrick’s Day');
  if (await form.getByLabel('All day').count()) throw new Error('a holiday offers a time of day');
  if (await form.getByLabel('Which offices are closed?').count()) throw new Error('a holiday asks which office is closed');
  await form.getByLabel('First day').fill('2027-03-17');
  await form.getByLabel('Last day').fill('2027-03-17');
  await form.getByRole('button', { name: 'Add holiday' }).click();
  await day(manager, '2027-03-17').getByTestId('holiday-chip').getByText('St Patrick’s Day').waitFor({ timeout: 10000 });
  // Listed with the closures, as open.
  await manager.getByTestId('closures-card').getByText('Open as usual').waitFor();
});

await step('pay days are the Friday after each period, worked out', async () => {
  await day(manager, '2027-03-12').getByTestId('payday-chip').waitFor({ timeout: 10000 });
  await day(manager, '2027-03-26').getByTestId('payday-chip').waitFor();
  if (await day(manager, '2027-03-19').getByTestId('payday-chip').count()) throw new Error('a pay day on the 19th');
  await manager.screenshot({ path: `${OUT}/practice-calendar-month.png`, fullPage: true });
});

const frankie = await signIn('frontdesk@domihealthcare.com');

await step('staff see all of it, and cannot add', async () => {
  await calendar(frankie);
  await day(frankie, '2027-03-07').getByTestId('diagnostic-chip').waitFor({ timeout: 10000 });
  await day(frankie, '2027-03-17').getByTestId('holiday-chip').waitFor();
  await day(frankie, '2027-03-12').getByTestId('payday-chip').waitFor();
  if (await frankie.getByRole('button', { name: '+ Add', exact: true }).count()) throw new Error('staff can add');
  await day(frankie, '2027-03-07').getByTestId('diagnostic-chip').click();
  const dialog = frankie.getByRole('dialog', { name: 'US + ECHO' });
  await dialog.waitFor();
  if (await dialog.getByRole('button', { name: 'Edit' }).count()) throw new Error('staff can edit');
  await dialog.getByRole('button', { name: 'Close' }).click();
});

await step('the key hides a kind, and an office narrows the diagnostics', async () => {
  const key = frankie.getByRole('group', { name: 'Show on the calendar' });
  await key.getByRole('button', { name: 'Pay days' }).click();
  if (await day(frankie, '2027-03-12').getByTestId('payday-chip').count()) throw new Error('pay days still shown');
  await key.getByRole('button', { name: 'Pay days' }).click();
  await day(frankie, '2027-03-12').getByTestId('payday-chip').waitFor();

  await frankie.getByLabel('Show office').selectOption({ label: 'North Bergen' });
  if (await day(frankie, '2027-03-07').getByTestId('diagnostic-chip').count()) throw new Error('West New York’s diagnostics shown for North Bergen');
  await day(frankie, '2027-03-14').getByTestId('diagnostic-chip').waitFor();
  // Practice-wide entries stay.
  await day(frankie, '2027-03-17').getByTestId('holiday-chip').waitFor();
  await frankie.getByLabel('Show office').selectOption({ label: 'Both offices' });
});

await step('the list shows the month day by day', async () => {
  await frankie.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  const list = frankie.getByTestId('calendar-list');
  await list.getByTestId('calendar-list-2027-03-07').getByText('US + ECHO').waitFor({ timeout: 10000 });
  await list.getByTestId('calendar-list-2027-03-26').getByTestId('payday-chip').waitFor();
  if (await list.getByTestId('calendar-list-2027-03-08').count()) throw new Error('an empty day is listed');
  await frankie.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Month' }).click();
});

await step('it all reaches the phone through the calendar feed', async () => {
  const feed = (
    await frankie.evaluate(async () => {
      const { token } = await fetch('/api/calendar/link', { method: 'POST' }).then((r) => r.json());
      return fetch(`/api/calendar/${token}/domi.ics`, { cache: 'no-store' }).then((r) => r.text());
    })
  ).replace(/\r\n /g, '');
  for (const expected of [
    'SUMMARY:US + ECHO — West New York',
    'SUMMARY:US + ECHO — North Bergen',
    'SUMMARY:St Patrick’s Day',
    'UID:payday-2027-03-12@staff.domihealthcare.com',
  ]) {
    if (!feed.includes(expected)) throw new Error(`the feed has no "${expected}"`);
  }
});

await step('a holiday rings nobody’s bell; diagnostics do', async () => {
  const titles = await frankie.evaluate(async () => {
    const list = await fetch('/api/notifications').then((r) => r.json());
    return list.items.map((item) => item.title);
  });
  if (!titles.includes('Diagnostics: US + ECHO')) throw new Error(`bell: ${titles.join(' | ')}`);
  if (titles.some((t) => t.includes('Patrick'))) throw new Error('a holiday rang the bell');
});

await step('on a phone, staff start on the list', async () => {
  const phone = await signIn('frontdesk@domihealthcare.com', { width: 390, height: 844 });
  await phone.evaluate(() => window.localStorage.removeItem('domi-staff:calendar-view'));
  await calendar(phone);
  await phone.getByTestId('calendar-list').getByText('US + ECHO').first().waitFor({ timeout: 10000 });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (wide) throw new Error('the page scrolls sideways on a phone');
  await phone.screenshot({ path: `${OUT}/practice-calendar-phone.png`, fullPage: true });
});

await step('nothing on the page takes a file', async () => {
  await calendar(manager);
  if (await manager.locator('input[type=file]').count()) throw new Error('a file input on the calendar');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL PRACTICE CALENDAR CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
