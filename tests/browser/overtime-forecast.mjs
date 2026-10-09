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
 * Heading for overtime on hours actually worked (Dominguez, October 2026 —
 * making the app smarter): hours worked so far this week plus what the rota
 * still has them down for, past the line. Dashboard and nightly email,
 * managers only, never a banner.
 *
 * "This week" moves with the calendar, so the set-up works on any day: Max
 * clocked in two hours ago and is still in, with a 40-hour draft shift
 * starting in a minute — 42 hours, whatever the weekday. Written straight into
 * the database, tagged `overtime-forecast-suite`; run-all.sh removes it.
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
const TAG = 'overtime-forecast-suite';
const cleanUp = () => {
  sql(`delete from time_entries where "editReason" = '${TAG}'`);
  sql(`delete from shifts where notes = '${TAG}'`);
};

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

await step('set-up: Max clocked in two hours ago, with 40 more hours on the rota', async () => {
  cleanUp();
  // Any punch of Max's still open would count too; close them first.
  sql(`update time_entries set "clockOutAt" = "clockInAt" + interval '1 hour', status = 'COMPLETED'
       where "clockOutAt" is null and "employeeId" = (select id from employees where email = 'ma@domihealthcare.com')`);
  sql(`insert into time_entries (id, "employeeId", "locationId", method, status, "clockInAt", "clockInVerification", "editReason", "updatedAt")
       select gen_random_uuid(), e.id, l.id, 'WEB', 'OPEN', now() - interval '2 hours', 'GEOFENCE', '${TAG}', now()
       from employees e, locations l where e.email = 'ma@domihealthcare.com' and l.slug = 'west-new-york'`);
  sql(`insert into shifts (id, "employeeId", "locationId", "startsAt", "endsAt", status, notes, "updatedAt")
       select gen_random_uuid(), e.id, l.id, now() + interval '1 minute', now() + interval '40 hours 1 minute', 'DRAFT', '${TAG}', now()
       from employees e, locations l where e.email = 'ma@domihealthcare.com' and l.slug = 'west-new-york'`);
});

const mgr = await signIn('manager@domihealthcare.com');
const card = mgr.getByTestId('overview-overtime-forecast');

await step('the Dashboard names Max, with hours worked and still on the rota', async () => {
  await mgr.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  const line = card.getByTestId('overtime-heading').filter({ hasText: 'Max Assistant' });
  await line.waitFor({ timeout: 15000 });
  const text = await line.innerText();
  // Earlier suites may have left Max other hours this week, so read the
  // numbers back rather than expect exactly 2 + 40.
  const overview = await mgr.evaluate(() => fetch('/api/dashboard/practice').then((r) => r.json()));
  const max = overview.overtimeForecast.people.find((p) => p.employeeName === 'Max Assistant');
  if (!max || max.worked < 1.9 || max.stillScheduled < 39.9 || max.projected <= 40)
    throw new Error(`forecast: ${JSON.stringify(max)}`);
  if (!/^Max Assistant — [\d.]+ hrs \([\d.]+ worked \+ [\d.]+ still on the rota\) · (rota alone: [\d.]+|the rota already had them over)$/.test(text.trim()))
    throw new Error(`read "${text}"`);
});
await card.screenshot({ path: `${OUT}/overtime-forecast.png` });

await step('the nightly round-up carries the same line, under Hours', async () => {
  const attention = await mgr.evaluate(() => fetch('/api/attention').then((r) => r.json()));
  const line = attention.overtimeHeading.find((l) => l.startsWith('Max Assistant'));
  if (!line || !line.includes('still on the rota') || !/the rota (alone|already)/.test(line))
    throw new Error(`round-up: ${JSON.stringify(attention.overtimeHeading)}`);
});

await step('it is never on a banner', async () => {
  await mgr.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  await mgr.getByRole('heading', { name: 'Timesheet' }).waitFor({ timeout: 15000 });
  if (await mgr.getByText('Heading for overtime this week').count())
    throw new Error('it is on the Timesheet banner');
});

await step('staff cannot read it', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  const status = await frankie.evaluate(async () => (await fetch('/api/dashboard/practice')).status);
  if (status !== 403) throw new Error(`staff were answered ${status}`);
});

cleanUp();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL OVERTIME-FORECAST CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
