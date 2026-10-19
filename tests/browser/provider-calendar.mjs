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
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`);
    errors.push(`${name}: ${e.message}`);
  }
};

/**
 * Where the providers are, on the practice calendar (Dominguez, October 2026:
 * "so staff know ... who should be there and who's scheduled to be on
 * telemedicine"): published provider shifts by office, work from home as
 * Telemedicine. Everybody reads it; drafts and other staff's shifts never.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}
const call = (page, path, init) =>
  page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const desk = await signIn('frontdesk@domihealthcare.com');
let provider;
let office;

await step('set-up: Max is a provider with an office shift and a work-from-home shift', async () => {
  const role = (await call(admin, '/job-roles')).body.find((r) => r.name === 'Provider');
  const staff = (await call(admin, '/employees')).body;
  const max = staff.find((p) => p.email === 'ma@domihealthcare.com');
  provider = max;
  office = max.locations[0].locationId;
  const joined = await call(admin, `/job-roles/${role.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ employeeId: max.id }),
  });
  if (joined.status >= 300) throw new Error(`joining answered ${joined.status}`);
  for (const [day, remote, status] of [
    ['2027-03-09', false, 'PUBLISHED'],
    ['2027-03-10', true, 'PUBLISHED'],
    ['2027-03-11', false, 'DRAFT'],
  ]) {
    const made = await call(manager, '/shifts', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: max.id,
        locationId: office,
        isRemote: remote,
        startsAt: `2027-03-${day.slice(8)}T14:00:00.000Z`,
        endsAt: `2027-03-${day.slice(8)}T22:00:00.000Z`,
        status,
      }),
    });
    if (made.status !== 201) throw new Error(`a shift answered ${made.status} ${JSON.stringify(made.body)}`);
  }
});

await step('everybody sees the office and telemedicine on the calendar, never a draft', async () => {
  await desk.goto(`${BASE}/schedule/calendar?month=2027-03-01`, { waitUntil: 'networkidle' });
  await desk.getByTestId('calendar-month').getByText('March 2027').waitFor({ timeout: 15000 });
  const chips = desk.getByTestId('provider-place');
  await chips.first().waitFor({ timeout: 15000 });
  const texts = await chips.allInnerTexts();
  if (!texts.some((t) => /Telemedicine/.test(t))) throw new Error(`no telemedicine chip: ${texts}`);
  if (!texts.some((t) => !/Telemedicine/.test(t) && /(NB|WNY)/.test(t))) throw new Error(`no office chip: ${texts}`);
  if (texts.length !== 2) throw new Error(`${texts.length} chips; the draft should be left out`);
});

await step('Providers is a kind of its own in Show', async () => {
  const show = desk.getByRole('group', { name: /Show/ });
  await show.getByRole('button', { name: /Providers/ }).click();
  if ((await desk.getByTestId('provider-place').count()) < 2) throw new Error('providers hidden when picked');
  await show.getByRole('button', { name: /Closures/ }).click();
  await show.getByRole('button', { name: /Providers/ }).click();
  if (await desk.getByTestId('provider-place').count()) throw new Error('providers shown when not picked');
});

await step('the server gives names, offices and hours only', async () => {
  const found = await call(desk, '/calendar/providers?from=2027-03-01&to=2027-03-31');
  if (found.status !== 200) throw new Error(`answered ${found.status}`);
  const text = JSON.stringify(found.body);
  if (/email|phone|notes|payRate/.test(text)) throw new Error('more than names, offices and hours');
  if (found.body.shifts.length !== 2) throw new Error(`${found.body.shifts.length} shifts`);
  const far = await call(desk, '/calendar/providers?from=2027-01-01&to=2027-12-31');
  if (far.status !== 400) throw new Error('a year at once was allowed');
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL PROVIDER-CALENDAR CHECKS PASSED');
