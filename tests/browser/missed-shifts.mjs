import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
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
 * Shifts nobody turned up for (Dominguez, October 2026 — making the app
 * smarter): a published shift that is over, in the last two weeks, with no
 * punch that day, no approved time off and no closure. On the Timesheet
 * banner, the Dashboard and in the nightly email — managers only. Settled by
 * adding the hours by hand, recording the time off, or removing the shift.
 *
 * Max gets a published shift six days ago, 9 to 5 at West New York; written
 * straight into the database, tagged `missed-shifts-suite`, and run-all.sh
 * removes it.
 */
function sql(statement) {
  return execFileSync(
    'psql',
    [
      '-h', process.env.PGHOST_LOCAL || '127.0.0.1',
      '-p', process.env.PGPORT_LOCAL || '5433',
      '-U', process.env.PGUSER_LOCAL || 'postgres',
      '-d', process.env.PGDATABASE_LOCAL || 'stafftime',
      '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', statement,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  ).toString().trim();
}
const TAG = 'missed-shifts-suite';
const cleanUp = () => {
  sql(`delete from time_entries where "editReason" = '${TAG}'`);
  sql(`delete from shifts where notes = '${TAG}'`);
};

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const inDays = (n) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const DAY = inDays(-6);
// 9am–5pm in New Jersey, whatever the season.
const at = (hour) => `(timestamp '${DAY} ${hour}:00' at time zone 'America/New_York')`;
const label = new Date(`${DAY}T12:00:00Z`).toLocaleDateString('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const LINE = `Max Assistant — ${label}, 9:00 AM–5:00 PM at West New York`;

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

await step('set-up: Max on the rota six days ago, and never clocked in', async () => {
  cleanUp();
  sql(`delete from time_entries where "employeeId" = (select id from employees where email = 'ma@domihealthcare.com')
       and "clockInAt" between ${at(0)} and ${at(23)}`);
  sql(`insert into shifts (id, "employeeId", "locationId", "startsAt", "endsAt", status, notes, "updatedAt")
       select gen_random_uuid(), e.id, l.id, ${at(9)}, ${at(17)}, 'PUBLISHED', '${TAG}', now()
       from employees e, locations l where e.email = 'ma@domihealthcare.com' and l.slug = 'west-new-york'`);
});

const mgr = await signIn('manager@domihealthcare.com');

await step('the Timesheet banner names the shift, and says what to do', async () => {
  await mgr.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  const banner = mgr.getByTestId('needs-attention');
  await banner.getByText('Shifts with no clock-in', { exact: true }).waitFor({ timeout: 15000 });
  await banner.getByText(LINE).waitFor({ timeout: 5000 });
  await banner.screenshot({ path: `${OUT}/missed-shifts-banner.png` });
});

await step('the nightly round-up carries the same line, under Hours', async () => {
  const attention = await mgr.evaluate(() => fetch('/api/attention').then((r) => r.json()));
  if (!attention.missedShifts.includes(LINE))
    throw new Error(`round-up: ${JSON.stringify(attention.missedShifts)}`);
});

await step('the Dashboard counts it among what is waiting', async () => {
  const overview = await mgr.evaluate(() => fetch('/api/dashboard/practice').then((r) => r.json()));
  if (!(overview.waiting.missedShifts >= 1)) throw new Error(`waiting: ${JSON.stringify(overview.waiting)}`);
  await mgr.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await mgr.getByText('Shifts with no clock-in').first().waitFor({ timeout: 15000 });
});

await step('hours added by hand for that day settle it', async () => {
  sql(`insert into time_entries (id, "employeeId", "locationId", method, status, "clockInAt", "clockOutAt",
         "clockInVerification", "enteredByHandAt", "handEntryReason", "editReason", "updatedAt")
       select gen_random_uuid(), e.id, l.id, 'WEB', 'COMPLETED', ${at(9)}, ${at(17)}, 'GEOFENCE', now(), 'FORGOT', '${TAG}', now()
       from employees e, locations l where e.email = 'ma@domihealthcare.com' and l.slug = 'west-new-york'`);
  const attention = await mgr.evaluate(() => fetch('/api/attention').then((r) => r.json()));
  if (attention.missedShifts.includes(LINE)) throw new Error('still listed after the hours were added');
});

await step('staff cannot read the list', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  const status = await frankie.evaluate(async () => (await fetch('/api/attention')).status);
  if (status !== 403) throw new Error(`staff were answered ${status}`);
});

cleanUp();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL MISSED-SHIFT CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
