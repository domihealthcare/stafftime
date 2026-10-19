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
 * "Ask for a correction" (October 2026, Dominguez - a "smarter" idea): on
 * their own Timesheet, somebody asks for an entry's times to be fixed, saying
 * why. Managers down for hours are told, see it at the top of the Timesheet
 * and in the round-up, and approve it - an ordinary edit, with the reason - 
 * or decline it with one; the person is told either way. The entries here
 * carry the note 'corrections-suite', which run-all.sh clears.
 */
async function signIn(email, timezoneId) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId });
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
const bell = async (page, kind) => (await call(page, '/notifications')).body.items.filter((n) => n.kind === kind);

const morgan = await signIn('manager@domihealthcare.com', 'America/New_York');
const frankie = await signIn('frontdesk@domihealthcare.com', 'America/New_York');
const staff = (await call(morgan, '/employees')).body;
const frankieId = staff.find((p) => p.email === 'frontdesk@domihealthcare.com').id;
const location = sql(`select id from locations where name = 'North Bergen'`);

// Two closed entries of Frankie's, three and two hours ago, each an hour long.
const entry = (hoursAgo) =>
  sql(`insert into time_entries (id, "employeeId", "locationId", method, status, "clockInAt", "clockOutAt", "clockInVerification", "createdAt", "updatedAt", "handEntryNote") values (gen_random_uuid(), '${frankieId}', '${location}', 'WEB', 'COMPLETED', date_trunc('minute', now()) - interval '${hoursAgo} hours', date_trunc('minute', now()) - interval '${hoursAgo - 1} hours', 'GEOFENCE', now(), now(), 'corrections-suite') returning id`);
const firstId = entry(3);
const secondId = entry(5);

async function showTimesheet(page, testId) {
  await page.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  const target = page.getByTestId(testId).first();
  try {
    await target.waitFor({ timeout: 8000 });
  } catch {
    // An entry from before this week's Sunday: last week.
    await page.getByRole('button', { name: 'Last week' }).click();
    await target.waitFor({ timeout: 10000 });
  }
}

await step('Frankie asks, from her Timesheet, for a later clock-out, saying why', async () => {
  await frankie.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  let ask = frankie.getByRole('button', { name: 'Ask to fix' }).first();
  if (!(await ask.isVisible().catch(() => false))) {
    await frankie.getByRole('button', { name: 'Last week' }).click();
    ask = frankie.getByRole('button', { name: 'Ask to fix' }).first();
  }
  // Ask through the API for a precise entry, then check the screen shows it.
  const outAt = sql(`select to_char(("clockOutAt" + interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from time_entries where id = '${firstId}'`);
  const inAt = sql(`select to_char("clockInAt" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from time_entries where id = '${firstId}'`);
  const asked = await call(frankie, `/time-entries/${firstId}/correction`, {
    method: 'POST',
    body: JSON.stringify({ clockInAt: inAt, clockOutAt: outAt, reason: 'Forgot to clock out - stayed to close' }),
  });
  if (asked.status !== 201) throw new Error(`asking answered ${asked.status}: ${JSON.stringify(asked.body)}`);
  await showTimesheet(frankie, 'correction-waiting');
  await frankie.getByTestId('correction-waiting').first().getByText(/waiting for a manager/).waitFor();
  await frankie.screenshot({ path: `${OUT}/correction-asked.png` });
});

await step('the pop-up asks for the times and what happened', async () => {
  await frankie.getByRole('button', { name: 'Ask to fix' }).first().click();
  const dialog = frankie.getByTestId('ask-correction');
  await dialog.getByLabel('Clocked in').waitFor({ timeout: 5000 });
  await dialog.getByLabel('What happened?').waitFor();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

await step('one waiting at a time, and only your own', async () => {
  const again = await call(frankie, `/time-entries/${firstId}/correction`, {
    method: 'POST',
    body: JSON.stringify({ clockInAt: new Date(Date.now() - 4 * 3600_000).toISOString(), clockOutAt: new Date(Date.now() - 3600_000).toISOString(), reason: 'again' }),
  });
  if (again.status !== 409) throw new Error(`a second ask answered ${again.status}`);
  const notMine = await call(morgan, `/time-entries/${secondId}/correction`, {
    method: 'POST',
    body: JSON.stringify({ clockInAt: new Date(Date.now() - 6 * 3600_000).toISOString(), clockOutAt: new Date(Date.now() - 4 * 3600_000).toISOString(), reason: 'not mine' }),
  });
  if (notMine.status !== 404) throw new Error(`asking about somebody else's answered ${notMine.status}`);
});

await step('managers are told on the bell, and it is in the round-up', async () => {
  const told = await bell(morgan, 'CORRECTION');
  if (!told.some((n) => n.title === 'Frankie Front-Desk asked for a correction')) throw new Error(JSON.stringify(told));
  const attention = (await call(morgan, '/attention')).body;
  if (!(attention.correctionsAsked ?? []).some((line) => line.includes('Forgot to clock out')))
    throw new Error(JSON.stringify(attention.correctionsAsked));
});

await step('approving makes it an ordinary edit with the reason, and Frankie is told', async () => {
  await morgan.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  const card = morgan.getByTestId('corrections-to-decide');
  await card.getByText('Forgot to clock out - stayed to close').waitFor({ timeout: 10000 });
  await morgan.screenshot({ path: `${OUT}/corrections-to-decide.png` });
  await card.getByRole('button', { name: 'Approve' }).click();
  await card.waitFor({ state: 'detached', timeout: 10000 });
  const row = sql(`select "editReason" || '|' || "isManuallyEdited" || '|' || extract(epoch from "clockOutAt" - "clockInAt")::int from time_entries where id = '${firstId}'`);
  const [reason, edited, seconds] = row.split('|');
  if (reason !== 'Asked for by Frankie Front-Desk: Forgot to clock out - stayed to close') throw new Error(reason);
  if (edited !== 'true' || seconds !== String(90 * 60)) throw new Error(row);
  const told = await bell(frankie, 'CORRECTION');
  if (!told.some((n) => n.title === 'Your correction was approved')) throw new Error(JSON.stringify(told));
});

await step('a decline says why, and Frankie is told', async () => {
  const outAt = sql(`select to_char(("clockOutAt" + interval '15 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from time_entries where id = '${secondId}'`);
  const inAt = sql(`select to_char("clockInAt" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from time_entries where id = '${secondId}'`);
  await call(frankie, `/time-entries/${secondId}/correction`, {
    method: 'POST',
    body: JSON.stringify({ clockInAt: inAt, clockOutAt: outAt, reason: 'Phone died at the end' }),
  });
  await morgan.reload({ waitUntil: 'networkidle' });
  const card = morgan.getByTestId('corrections-to-decide');
  await card.getByRole('button', { name: 'Decline…' }).click();
  await card.getByLabel('Why not').fill('The door log has you leaving on time');
  await card.getByRole('button', { name: 'Decline', exact: true }).click();
  await card.waitFor({ state: 'detached', timeout: 10000 });
  const told = await bell(frankie, 'CORRECTION');
  const declined = told.find((n) => n.title === 'Your correction was not made');
  if (!declined || !declined.body.includes('door log')) throw new Error(JSON.stringify(told));
  // psql prints a boolean as t or f.
  if (sql(`select "isManuallyEdited" from time_entries where id = '${secondId}'`) !== 'f') throw new Error('declined but edited');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CORRECTION CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
