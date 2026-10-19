import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo } from './nav.mjs';

// Staff who do not clock in (October 2026, Dominguez: "an option for some
// employees that do not have to clock in (i.e. the providers at the moment)
// though it still should show where they are for that shift in the
// directory"). An admin unticks Clocks in on the Staff editor; Home then shows
// the shift instead of a Clock in button, and the Directory shows them at their
// shift's office while it runs. The runner ticks everybody back between suites.
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

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror (${email}): ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Max is seeded with a temporary password, to be changed on first sign-in.
  const home = page.getByTestId('home-clock');
  const mustChange = page.getByText('Choose a new password');
  await home.or(mustChange).first().waitFor({ timeout: 20000 });
  if (await mustChange.isVisible()) {
    await page.getByLabel('Temporary password').fill('shift-change-2026');
    await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
    await page.getByLabel('Confirm new password').fill('harbour lantern 7');
    await page.getByRole('button', { name: 'Change password' }).click();
    await home.waitFor({ timeout: 15000 });
  }
  return page;
}

// Max, at West New York: unlike Frankie, the seed puts no shift on today.
const MAX = 'ma@domihealthcare.com';
const admin = await signIn('admin@domihealthcare.com');

async function setClocksIn(on) {
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId(`staff-${MAX}`);
  await card.getByRole('button', { name: /^Edit / }).click();
  const box = admin.getByRole('checkbox', { name: /Clocks in/ });
  await box.waitFor({ timeout: 10000 });
  await box.setChecked(on);
  const saved = admin.waitForResponse((r) => r.url().includes('/api/employees/') && r.request().method() === 'PATCH');
  await admin.getByRole('button', { name: 'Save changes' }).click();
  const response = await saved;
  if (!response.ok()) throw new Error(`the change was refused: ${response.status()}`);
  if ((await response.json()).clocksIn !== on) throw new Error('clocksIn not saved');
}

await step('an admin unticks Clocks in, and the Staff card says so', async () => {
  await setClocksIn(false);
  await admin.getByTestId(`staff-${MAX}`).getByText('Doesn’t clock in').waitFor({ timeout: 10000 });
});

// A published West New York shift for Max, on now - made through the API
// so the suite does not depend on the time of day it runs at. Kept inside New
// Jersey's day, like clock-place.mjs, so Home calls it today's.
const manager = await signIn('manager@domihealthcare.com');
await step('Max is on the rota at West New York now', async () => {
  await manager.evaluate(async (email) => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const locations = await fetch('/api/locations').then((r) => r.json());
    const now = Date.now();
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
        .formatToParts(new Date(now))
        .map((part) => [part.type, Number(part.value)]),
    );
    const minutesIn = parts.hour * 60 + parts.minute;
    const dayStart = now - minutesIn * 60_000;
    const dayEnd = now + (24 * 60 - minutesIn - 1) * 60_000;
    const response = await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: staff.find((person) => person.email === email).id,
        locationId: locations.find((l) => l.name === 'West New York').id,
        startsAt: new Date(Math.max(now - 5 * 60_000, dayStart)).toISOString(),
        endsAt: new Date(Math.min(now + 3 * 3_600_000, dayEnd)).toISOString(),
        status: 'PUBLISHED',
        notes: 'clocks-in-suite',
      }),
    });
    if (!response.ok) throw new Error(`could not make the shift: ${await response.text()}`);
  }, MAX);
});

const max = await signIn(MAX);

await step('Home shows the shift, with no Clock in button or location to choose', async () => {
  const card = max.getByTestId('home-clock');
  await card.getByTestId('clock-status').getByText('No need to clock in').waitFor({ timeout: 15000 });
  await card.getByText('West New York').first().waitFor();
  await card.getByText('The Directory shows you there while your shift is on.').waitFor();
  if (await card.getByRole('button', { name: /^Clock in/ }).count()) throw new Error('a Clock in button');
  if (await max.locator('#location').count()) throw new Error('a location to choose');
  await max.screenshot({ path: `${OUT}/clocks-in-home.png`, fullPage: true });
});

await step('the Directory shows Max on shift at West New York, with no punch', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  await goTo(frankie, 'Directory');
  await frankie.getByTestId('in-now-West New York').getByText(/Max/).waitFor({ timeout: 15000 });
  const entry = await frankie.evaluate(async (email) => {
    const people = await fetch('/api/directory').then((r) => r.json());
    return people.find((person) => person.email === email);
  }, MAX);
  if (entry.onNow?.location?.name !== 'West New York') throw new Error(`onNow: ${JSON.stringify(entry.onNow)}`);
  if (!entry.onNow.scheduled) throw new Error('not marked as on the rota');
  if ('since' in entry.onNow) throw new Error('a colleague is told since when');
  if ('clocksIn' in entry) throw new Error('the Directory sends clocksIn');
  await frankie.getByText('On shift · West New York').first().waitFor({ timeout: 10000 });
  await frankie.screenshot({ path: `${OUT}/clocks-in-directory.png`, fullPage: true });
});

await step('ticked again, Home has the Clock in button back', async () => {
  await setClocksIn(true);
  await max.reload({ waitUntil: 'networkidle' });
  await max.getByTestId('home-clock').getByRole('button', { name: /^Clock in/ }).waitFor({ timeout: 15000 });
  await max.getByTestId('clock-status').getByText('Not clocked in').waitFor();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CLOCKS-IN CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
