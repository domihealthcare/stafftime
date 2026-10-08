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
 * Patterns in clocking in and out (Dominguez, October 2026 — making the app
 * smarter): late 3 times in 4 weeks, forgetting to clock out or leaving early
 * twice. On the Dashboard and in the nightly email, managers only; never a
 * banner, and the person is not told.
 *
 * A late punch needs a shift and a clock-in at the right moment, weeks ago —
 * which no screen can make — so this suite writes past punches straight into
 * the database, tagged `patterns-suite`, which run-all.sh removes. Frankie is
 * late on the same weekday three weeks running; Max forgot to clock out twice.
 */
function sql(statement) {
  execFileSync(
    'psql',
    [
      '-h', process.env.PGHOST_LOCAL || '127.0.0.1',
      '-p', process.env.PGPORT_LOCAL || '5433',
      '-U', process.env.PGUSER_LOCAL || 'postgres',
      '-d', process.env.PGDATABASE_LOCAL || 'stafftime',
      '-q', '-v', 'ON_ERROR_STOP=1', '-c', statement,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

/// A day `daysAgo` before today (UTC), at 13:15 UTC — morning in New Jersey,
/// so the same date there.
const dayAgo = (daysAgo) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
};

function punch(email, date, flags) {
  const clockIn = `${date} 13:15:00`;
  const clockOut = flags.forgot ? `${addDay(date)} 04:00:00` : `${date} 21:00:00`;
  sql(`insert into time_entries
    (id, "employeeId", "locationId", method, status, "clockInAt", "clockInVerification",
     "clockOutAt", "isLate", "autoClockedOutAt", "editReason", "updatedAt")
    select gen_random_uuid(), e.id, l.id, 'WEB', 'COMPLETED', '${clockIn}', 'GEOFENCE',
      '${clockOut}', ${flags.late ? 'true' : 'false'},
      ${flags.forgot ? `'${clockOut}'` : 'null'}, 'patterns-suite', now()
    from employees e, locations l
    where e.email = '${email}' and l.slug = 'north-bergen'`);
}

function addDay(date) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

const lateDays = [3, 10, 17].map(dayAgo);
const weekday = new Date(`${lateDays[0]}T12:00:00Z`).toLocaleDateString('en-US', {
  weekday: 'long',
  timeZone: 'UTC',
});

await step('set-up: Frankie late three weeks running, Max forgot to clock out twice', async () => {
  for (const date of lateDays) punch('frontdesk@domihealthcare.com', date, { late: true });
  // One late day is nothing on its own, for Max.
  punch('ma@domihealthcare.com', dayAgo(4), { late: true });
  for (const days of [2, 6]) punch('ma@domihealthcare.com', dayAgo(days), { forgot: true });
});

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

const mgr = await signIn('manager@domihealthcare.com');
const card = mgr.getByTestId('overview-patterns');

await step('the Dashboard lists each pattern, with the weekday when it repeats', async () => {
  await mgr.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await card.getByTestId('punch-pattern').first().waitFor({ timeout: 15000 });
  const lines = (await card.getByTestId('punch-pattern').allTextContents()).map((line) =>
    line.replace(/Which days\?$/, '').trim(),
  );
  const expected = [
    `Frankie Front-Desk — Late 3 times in the last 4 weeks, 3 ${weekday}s running`,
    'Max Assistant — Forgot to clock out twice in the last 4 weeks',
  ];
  if (JSON.stringify(lines) !== JSON.stringify(expected)) throw new Error(`listed: ${lines.join(' | ')}`);
});

await step('“Which days?” shows the days it happened', async () => {
  const frankie = card.getByTestId('punch-pattern').first();
  await frankie.getByRole('button', { name: 'Which days?' }).click();
  const text = await frankie.textContent();
  if ((text.match(/·/g) ?? []).length !== 2) throw new Error(`days read "${text}"`);
  await frankie.getByRole('button', { name: 'Hide days' }).waitFor({ timeout: 5000 });
});
await mgr.screenshot({ path: `${OUT}/patterns-dashboard.png`, fullPage: true });

await step('the nightly round-up carries the same lines, but no screen’s banner does', async () => {
  const attention = await mgr.evaluate(() => fetch('/api/attention').then((r) => r.json()));
  if (attention.punchPatterns.length !== 2) throw new Error(`round-up: ${JSON.stringify(attention.punchPatterns)}`);
  await mgr.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  await mgr.getByRole('heading', { name: 'Timesheet' }).waitFor({ timeout: 15000 });
  if (await mgr.getByText(/Patterns in clocking/).count()) throw new Error('a pattern is on the Timesheet banner');
});

await step('staff cannot read anybody’s patterns', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  const statuses = await frankie.evaluate(async () => [
    (await fetch('/api/dashboard/practice')).status,
    (await fetch('/api/attention')).status,
  ]);
  if (statuses.join() !== '403,403') throw new Error(`staff were answered ${statuses.join(', ')}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL PATTERN CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
