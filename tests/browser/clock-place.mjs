import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo } from './nav.mjs';
import { clockOut } from './clock-out.mjs';

// Choosing where to clock in (October 2026, Dominguez): every one of your
// offices and Work from home is offered every day, the place of today's shift
// first. Somewhere else is allowed — a member of staff moved to the other
// office, or approved to work from home for the day — after a warning and a
// pop-up, with an optional reason, and it is flagged on the timesheet.
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

const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(page, 'manager@domihealthcare.com');
// Anything that reads the position is noted: working from home must not.
await page.addInitScript(() => {
  const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  navigator.geolocation.getCurrentPosition = (...args) => {
    window.__askedForPosition = true;
    return original(...args);
  };
});

// A published North Bergen shift for Morgan, on now — made through the API so
// the suite does not depend on the time of day it runs at.
const shiftId = await page.evaluate(async () => {
  const me = await fetch('/api/profile').then((r) => r.json());
  const locations = await fetch('/api/locations').then((r) => r.json());
  const northBergen = locations.find((l) => l.name === 'North Bergen');
  const now = Date.now();
  // Within New Jersey's day, whatever the browser's zone: Home lists only
  // shifts that start and end inside it (CI's browser is in UTC, and a shift
  // running past New Jersey's midnight was not "today's" after 9pm there).
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date(now))
      .map((part) => [part.type, Number(part.value)]),
  );
  const minutesIn = parts.hour * 60 + parts.minute;
  const dayStart = new Date(now - minutesIn * 60_000);
  const dayEnd = new Date(now + (24 * 60 - minutesIn - 1) * 60_000);
  const response = await fetch('/api/shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employeeId: me.id,
      locationId: northBergen.id,
      startsAt: new Date(Math.max(now - 15 * 60_000, dayStart.getTime())).toISOString(),
      endsAt: new Date(Math.min(now + 3 * 3_600_000, dayEnd.getTime())).toISOString(),
      status: 'PUBLISHED',
      // The runner clears these between suites.
      notes: 'wfh-suite',
    }),
  });
  if (!response.ok) throw new Error(`could not make the shift: ${await response.text()}`);
  return (await response.json()).id;
});
await page.reload({ waitUntil: 'networkidle' });
const select = page.locator('#location');

await step('every office and Work from home are offered, the shift’s office first', async () => {
  await select.waitFor({ timeout: 15000 });
  const options = await select.locator('option').allInnerTexts();
  if (options.length !== 3) throw new Error(`options: ${options.join(' | ')}`);
  if (options[0] !== 'North Bergen — your shift') throw new Error(`first: ${options[0]}`);
  if (options[2] !== 'Work from home') throw new Error(`last: ${options[2]}`);
  if ((await select.inputValue()) === 'home') throw new Error('starts on home');
  if ((await page.getByTestId('other-place').count()) !== 0) throw new Error('a warning for the shift’s own office');
});

await step('the other office warns, and asks why (optionally)', async () => {
  await select.selectOption({ label: 'West New York' });
  const warning = page.getByTestId('other-place');
  await warning.getByText('Your shift today is at North Bergen.').waitFor({ timeout: 5000 });
  await warning.getByLabel(/Why\?/).waitFor({ timeout: 5000 });
});

await step('home warns too, and the pop-up lets them go back', async () => {
  await select.selectOption({ label: 'Work from home' });
  await page.getByTestId('other-place').getByText('Your shift today is at North Bergen.').waitFor({ timeout: 5000 });
  await page.getByText('Working from home: no location is asked for or recorded.').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Clock in — working from home' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByText('Clock in from home?').waitFor({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Go back' }).click();
  await page.waitForTimeout(300);
  await page.getByText('Not clocked in').waitFor({ timeout: 5000 });
});

await step('confirmed, it clocks in from home with the reason, and no position is asked for or sent', async () => {
  await page.getByTestId('other-place').getByLabel(/Why\?/).fill('Approved by Angelica, car trouble');
  const punched = page.waitForResponse((r) => r.url().endsWith('/api/time-entries/clock-in'));
  await page.getByRole('button', { name: 'Clock in — working from home' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clock in from home' }).click();
  const response = await punched;
  if (!response.ok()) throw new Error(`refused: ${await response.text()}`);
  const body = JSON.parse(response.request().postData() ?? '{}');
  if (body.workFromHome !== true) throw new Error('not sent as from home');
  if (body.otherPlaceReason !== 'Approved by Angelica, car trouble') throw new Error(`reason: ${body.otherPlaceReason}`);
  if ('latitude' in body) throw new Error('a position was sent');
  if (await page.evaluate(() => window.__askedForPosition === true)) throw new Error('the page asked for a position');
  const saved = await response.json();
  if (saved.clockInVerification !== 'REMOTE' || saved.isOtherPlace !== true) throw new Error(JSON.stringify(saved));
  if (saved.shiftId !== shiftId) throw new Error('not attached to the shift');
  await page.getByText(/Clocked in at .* · Working from home/).waitFor({ timeout: 10000 });
});

await step('the timesheet flags it, with the reason', async () => {
  await goTo(page, 'Timesheet');
  await page.getByText('Not where scheduled', { exact: true }).first().waitFor({ timeout: 15000 });
  await page.getByTestId('other-place-reason').first().getByText(/car trouble/).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/clock-place-timesheet.png`, fullPage: false });

await step('with no shift, an office gives no warning and home does', async () => {
  await goTo(page, 'Home');
  await clockOut(page);
  await page.getByText('Not clocked in').waitFor({ timeout: 10000 });
  const removed = await page.evaluate(
    (id) => fetch(`/api/shifts/${id}`, { method: 'DELETE' }).then((r) => r.status),
    shiftId,
  );
  if (removed >= 300) throw new Error(`deleting the shift answered ${removed}`);
  await page.reload({ waitUntil: 'networkidle' });
  await select.waitFor({ timeout: 15000 });
  const options = await select.locator('option').allInnerTexts();
  if (options.some((o) => o.includes('your shift'))) throw new Error(`options: ${options.join(' | ')}`);
  await select.selectOption({ label: 'West New York' });
  await page.waitForTimeout(200);
  if ((await page.getByTestId('other-place').count()) !== 0) throw new Error('an office warns with no shift');
  await select.selectOption({ label: 'Work from home' });
  await page.getByTestId('other-place').getByText('You have no work-from-home shift today.').waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/clock-place-home.png`, fullPage: false });

await step('an older page that does not say still cannot claim home without a shift', async () => {
  const status = await page.evaluate(async () => {
    const locations = await fetch('/api/locations').then((r) => r.json());
    const response = await fetch('/api/time-entries/clock-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId: locations[0].id, method: 'WEB' }),
    });
    return response.status;
  });
  if (status !== 403) throw new Error(`answered ${status}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CLOCK-IN PLACE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
