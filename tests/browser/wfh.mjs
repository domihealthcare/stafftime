import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// Working from home: a manager marks a shift as work from home, and during it
// the person clocks in from anywhere — no location asked for, none recorded —
// and the punch says Remote wherever it is shown. Plus the rota's colours.
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

// Morgan (a manager, who also works shifts) on a laptop with location access
// never granted: if the page asked for a position, it would be refused.
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const mgr = await ctx.newPage();
mgr.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

// Anything that reads the position is a failure, whatever the browser answers.
await mgr.addInitScript(() => {
  const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  navigator.geolocation.getCurrentPosition = (...args) => {
    window.__askedForPosition = true;
    return original(...args);
  };
});

// A work-from-home shift for Morgan that is on now, published, made through
// the API so the suite does not depend on the time of day it runs at.
const shiftId = await mgr.evaluate(async () => {
  const me = await fetch('/api/profile').then((r) => r.json());
  const locations = await fetch('/api/locations').then((r) => r.json());
  const northBergen = locations.find((l) => l.name === 'North Bergen');
  const now = Date.now();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 0, 0);
  const startsAt = new Date(Math.max(now - 15 * 60_000, dayStart.getTime()));
  const endsAt = new Date(Math.min(now + 3 * 3_600_000, dayEnd.getTime()));
  const response = await fetch('/api/shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employeeId: me.id,
      locationId: northBergen.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      isRemote: true,
      status: 'PUBLISHED',
      notes: 'wfh-suite',
    }),
  });
  if (!response.ok) throw new Error(`could not make the shift: ${await response.text()}`);
  return (await response.json()).id;
});

await step('the Clock screen offers to clock in from home, and says nothing is recorded', async () => {
  await mgr.reload({ waitUntil: 'networkidle' });
  await mgr.getByText(/Today’s shift: .* · Work from home/).waitFor({ timeout: 15000 });
  await mgr.getByRole('button', { name: 'Clock in — working from home' }).waitFor({ timeout: 5000 });
  await mgr.getByText('Working from home: no location is asked for or recorded.').waitFor({ timeout: 5000 });
});

await step('clocking in from home works without a location, and none is asked for', async () => {
  const punched = mgr.waitForResponse((r) => r.url().endsWith('/api/time-entries/clock-in'));
  await mgr.getByRole('button', { name: 'Clock in — working from home' }).click();
  const response = await punched;
  if (!response.ok()) throw new Error(`clock-in refused: ${await response.text()}`);
  const body = JSON.parse(response.request().postData() ?? '{}');
  if ('latitude' in body || 'longitude' in body) throw new Error('a position was sent');
  await mgr.getByText(/Clocked in at .* · Working from home/).waitFor({ timeout: 10000 });
  if (await mgr.evaluate(() => window.__askedForPosition === true))
    throw new Error('the page asked the browser for a position');
});
await mgr.screenshot({ path: `${OUT}/110-clocked-in-from-home.png`, fullPage: true });

await step('the punch records no location and no address, only that it was from home', async () => {
  const entry = await mgr.evaluate(() => fetch('/api/time-entries/current').then((r) => r.json()));
  if (entry.clockInVerification !== 'REMOTE') throw new Error(`recorded as ${entry.clockInVerification}`);
  for (const field of ['clockInLatitude', 'clockInLongitude', 'clockInIp']) {
    if (entry[field] !== null && entry[field] !== undefined) throw new Error(`${field} was recorded`);
  }
});

// A colleague, on a phone, looking at who is in.
const fdCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const frankie = await fdCtx.newPage();
frankie.on('pageerror', (e) => errors.push(`colleague pageerror: ${e.message}`));
await signIn(frankie, 'frontdesk@domihealthcare.com');

await step('the Directory shows Morgan working from home, not at an office', async () => {
  await frankie.getByRole('button', { name: 'Team', exact: true }).click();
  await frankie.getByRole('navigation').getByRole('link', { name: 'Directory', exact: true }).click();
  const home = frankie.getByTestId('in-now-home');
  await home.waitFor({ timeout: 15000 });
  await home.getByText('Morgan', { exact: false }).waitFor({ timeout: 5000 });
  const office = frankie.getByTestId('in-now-North Bergen');
  if ((await office.count()) > 0 && (await office.getByText('Morgan').count()) > 0)
    throw new Error('Morgan is shown at North Bergen as well');
  await frankie.getByTestId('person-Morgan Manager').getByText('In now · Working from home').waitFor({ timeout: 5000 });
});
await frankie.screenshot({ path: `${OUT}/111-directory-from-home.png`, fullPage: true });

await step('a punch from home cannot be claimed without a work-from-home shift', async () => {
  // Frankie's shift today is at the office, so there is nothing to fall back on.
  const status = await frankie.evaluate(async () => {
    const response = await fetch('/api/time-entries/clock-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'WEB' }),
    });
    return response.status;
  });
  if (status < 400) throw new Error(`clocked in with no location and no home shift (${status})`);
});

await step('clocking out from home works without a location too', async () => {
  await mgr.getByRole('link', { name: 'Clock', exact: true }).click().catch(() => {});
  const punched = mgr.waitForResponse((r) => r.url().endsWith('/api/time-entries/clock-out'));
  await mgr.getByRole('button', { name: 'Clock out' }).click();
  if (!(await punched).ok()) throw new Error('clock-out refused');
  await mgr.getByText('Not clocked in').waitFor({ timeout: 10000 });
  if (await mgr.evaluate(() => window.__askedForPosition === true))
    throw new Error('the page asked the browser for a position');
});

await step('the timesheet labels the punch Work from home', async () => {
  await mgr.getByRole('link', { name: 'Timesheet', exact: true }).first().click();
  await mgr.getByText('Work from home').first().waitFor({ timeout: 15000 });
});

// The rota: colour for the office, a stripe for the job role, violet for home.
await step('the rota has a key to its colours', async () => {
  await mgr.getByRole('link', { name: 'Schedule' }).click();
  const legend = mgr.getByTestId('rota-legend');
  await legend.waitFor({ timeout: 15000 });
  for (const text of ['North Bergen', 'West New York', 'Work from home', 'Open shift', 'Draft', 'Front Desk', 'Manager'])
    await legend.getByText(text, { exact: true }).waitFor({ timeout: 5000 });
});

const morganChip = () =>
  mgr.getByTestId('rota-row-Morgan Manager').getByTestId('shift-chip').first();

await step('a work-from-home shift says Home and is tinted, with a job-role stripe', async () => {
  const chip = morganChip();
  await chip.waitFor({ timeout: 10000 });
  if ((await chip.getAttribute('data-remote')) !== 'true') throw new Error('not marked as from home');
  await chip.getByText('Home', { exact: true }).waitFor({ timeout: 5000 });
  const colours = await chip.evaluate((el) => {
    const s = getComputedStyle(el);
    return { fill: s.backgroundColor, stripe: s.borderLeftColor, width: s.borderLeftWidth };
  });
  if (colours.fill === 'rgba(0, 0, 0, 0)') throw new Error('the chip has no colour');
  if (colours.width !== '4px') throw new Error(`the stripe is ${colours.width}`);
});

await step('an office shift is tinted in its office’s colour, not left plain', async () => {
  const chip = mgr.getByTestId('rota-row-Frankie Front-Desk').getByTestId('shift-chip').first();
  await chip.waitFor({ timeout: 10000 });
  const fill = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
  if (fill === 'rgba(0, 0, 0, 0)' || fill === 'rgb(255, 255, 255)') throw new Error(`plain chip (${fill})`);
});
await mgr.screenshot({ path: `${OUT}/112-rota-colours.png`, fullPage: true });

await step('a manager can move a shift from home back to the office, and back again', async () => {
  await morganChip().click();
  const toOffice = mgr.waitForResponse((r) => r.url().endsWith(`/api/shifts/${shiftId}`) && r.request().method() === 'PATCH');
  await mgr.getByRole('button', { name: 'Make it at the office' }).click();
  if (!(await toOffice).ok()) throw new Error('could not move it to the office');
  await mgr.waitForFunction(
    () => document.querySelector('[data-testid="rota-row-Morgan Manager"] [data-remote="true"]') === null,
    null,
    { timeout: 10000 },
  );
  await morganChip().click();
  const toHome = mgr.waitForResponse((r) => r.url().endsWith(`/api/shifts/${shiftId}`) && r.request().method() === 'PATCH');
  await mgr.getByRole('button', { name: 'Make it work from home' }).click();
  if (!(await toHome).ok()) throw new Error('could not move it back home');
  await mgr.getByTestId('rota-row-Morgan Manager').locator('[data-remote="true"]').first().waitFor({ timeout: 10000 });
});

await step('the new-shift form can make a shift work from home', async () => {
  await mgr.keyboard.press('Escape').catch(() => {});
  await mgr.getByRole('button', { name: '+ Add shift' }).click();
  await mgr.getByLabel('Employee').selectOption({ label: 'Frankie Front-Desk' });
  await mgr.getByLabel('Starts').fill('2027-03-01T09:00');
  await mgr.getByLabel('Ends').fill('2027-03-01T13:00');
  await mgr.getByRole('checkbox', { name: /^Work from home/ }).check();
  const made = mgr.waitForResponse((r) => r.url().endsWith('/api/shifts') && r.request().method() === 'POST');
  await mgr.getByRole('button', { name: 'Create shift' }).click();
  const response = await made;
  if (!response.ok()) throw new Error(`refused: ${await response.text()}`);
  if ((await response.json()).isRemote !== true) throw new Error('saved as an office shift');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL WORK-FROM-HOME CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
