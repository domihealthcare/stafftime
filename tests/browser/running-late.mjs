import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const API = process.env.API_URL || 'http://127.0.0.1:3000/api';
const SECRET = process.env.PUNCH_REMINDER_SECRET;
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

/**
 * "Running late" and the managers' no-show alert (October 2026, Dominguez - 
 * two "smarter" ideas). From Home, somebody not clocked in tells the managers
 * of the office they will be about N minutes late; the timesheet shows it;
 * 30 minutes into a shift with no clock-in the office's managers are told - 
 * not before the "running late" time plus a quarter of an hour.
 * Shifts here are noted 'running-late-suite', which run-all.sh clears.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
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
const runTimer = () =>
  fetch(`${API}/maintenance/punch-reminders`, { headers: { Authorization: `Bearer ${SECRET}` } }).then((r) => r.json());
const bell = async (page, kind) => (await call(page, '/notifications')).body.items.filter((n) => n.kind === kind);

const morgan = await signIn('manager@domihealthcare.com');
const staff = (await call(morgan, '/employees')).body;
const idOf = (email) => staff.find((p) => p.email === email).id;
const nb = (await call(morgan, '/locations')).body.find((l) => l.name === 'North Bergen').id;
const frankieId = idOf('frontdesk@domihealthcare.com');
const maxId = idOf('ma@domihealthcare.com');

// Within New Jersey's day, so Home counts it as today's.
const now = Date.now();
const parts = Object.fromEntries(
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date(now))
    .map((part) => [part.type, Number(part.value)]),
);
const minutesIn = parts.hour * 60 + parts.minute;
const dayStart = now - minutesIn * 60_000;
const dayEnd = now + (24 * 60 - minutesIn - 1) * 60_000;
// Max works at whichever office he is assigned to.
const officeOf = (employeeId) =>
  staff.find((p) => p.id === employeeId).locations?.[0]?.locationId ?? nb;
const shiftFor = async (employeeId, fromMinutes, toMinutes, { clamp = true } = {}) => {
  const made = await call(morgan, '/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId,
      locationId: employeeId === maxId ? officeOf(maxId) : nb,
      startsAt: new Date(clamp ? Math.max(now + fromMinutes * 60_000, dayStart) : now + fromMinutes * 60_000).toISOString(),
      endsAt: new Date(clamp ? Math.min(now + toMinutes * 60_000, dayEnd) : now + toMinutes * 60_000).toISOString(),
      status: 'PUBLISHED',
      notes: 'running-late-suite',
    }),
  });
  if (made.status !== 201) throw new Error(`making a shift answered ${made.status}: ${JSON.stringify(made.body)}`);
  return made.body;
};

// Frankie's only shift today is the suite's: started 10 minutes ago.
sql(`delete from shifts where "employeeId" = '${frankieId}' and "startsAt" < now() + interval '1 day' and "endsAt" > now() - interval '1 day'`);
// Earlier suites' punches count as "already clocked in" for these shifts:
// run-all.sh closes an open one at an hour after it began, which can still be
// running now. In CI, where all suites run within the hour, it was.
sql(`delete from time_entries where "employeeId" in ('${frankieId}', '${maxId}') and ("clockOutAt" is null or "clockOutAt" > now() - interval '3 hours')`);
const frankieShift = await shiftFor(frankieId, -10, 40);
const frankie = await signIn('frontdesk@domihealthcare.com');

await step('Home offers "Running late?", and Frankie says about 20 minutes', async () => {
  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const late = frankie.getByTestId('running-late');
  await late.getByRole('button', { name: 'Running late?' }).click();
  await late.getByRole('button', { name: '20 min' }).click();
  await late.getByText('You told your managers: about 20 minutes late.').waitFor({ timeout: 10000 });
  await frankie.screenshot({ path: `${OUT}/running-late.png` });
});

await step('the office’s managers are told on the bell; reloading Home still says so', async () => {
  const told = await bell(morgan, 'RUNNING_LATE');
  if (!told.some((n) => n.title === 'Frankie Front-Desk is running late' && n.body.startsWith('About 20 minutes late')))
    throw new Error(`Morgan's bell: ${JSON.stringify(told)}`);
  await frankie.reload({ waitUntil: 'networkidle' });
  await frankie.getByTestId('running-late').getByText('about 20 minutes late').waitFor({ timeout: 10000 });
});

await step('only ever for your own shift', async () => {
  const other = await call(morgan, `/shifts/${frankieShift.id}/running-late`, { method: 'POST', body: JSON.stringify({ minutes: 10 }) });
  if (other.status !== 404) throw new Error(`somebody else saying it answered ${other.status}`);
});

await step('the timesheet shows it beside the entry', async () => {
  const location = sql(`select id from locations where name = 'North Bergen'`);
  sql(`insert into time_entries (id, "employeeId", "locationId", "shiftId", method, status, "clockInAt", "clockOutAt", "clockInVerification", "isLate", "createdAt", "updatedAt", "handEntryNote") values (gen_random_uuid(), '${frankieId}', '${location}', '${frankieShift.id}', 'WEB', 'COMPLETED', now() - interval '5 minutes', now() - interval '1 minute', 'GEOFENCE', true, now(), now(), 'running-late-suite')`);
  await frankie.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  const note = frankie.getByTestId('running-late-note').first();
  try {
    await note.waitFor({ timeout: 8000 });
  } catch {
    await frankie.getByRole('button', { name: 'Last week' }).click();
    await note.waitFor({ timeout: 10000 });
  }
  if (!(await note.innerText()).includes('you said about 20 minutes')) throw new Error(await note.innerText());
});

await step('30 minutes into a shift with no clock-in, the office’s managers are told once', async () => {
  // Not kept inside today: the alert does not care which day it started.
  await shiftFor(maxId, -40, 60, { clamp: false });
  await runTimer();
  await runTimer();
  const told = (await bell(morgan, 'NO_SHOW')).filter((n) => n.title.startsWith('Max '));
  if (told.length !== 1) throw new Error(`told ${told.length} times: ${JSON.stringify(told)}`);
  if (!told[0].body.includes('nothing has been heard')) throw new Error(told[0].body);
});

await step('not while a "running late" (plus a quarter of an hour) still covers it', async () => {
  sql(`delete from shifts where "employeeId" = '${maxId}' and notes = 'running-late-suite'`);
  const max = await shiftFor(maxId, -40, 60, { clamp: false });
  sql(`insert into running_late (id, "shiftId", "employeeId", minutes) values (gen_random_uuid(), '${max.id}', '${maxId}', 30)`);
  const before = (await bell(morgan, 'NO_SHOW')).length;
  await runTimer();
  if ((await bell(morgan, 'NO_SHOW')).length !== before) throw new Error('told while they said they would be late');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL RUNNING-LATE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
