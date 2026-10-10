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
 * "Payroll is due, hours aren't approved" (Dominguez, October 2026 — a
 * "smarter" idea). From two working days before a pay period ends until the
 * day before it is paid, what still stands between its hours and payroll
 * leads the Timesheet banner and the round-up.
 *
 * The pay period is set around today so the window is open (it ends
 * tomorrow), then so it is shut. Two of Max's punches from yesterday are
 * written straight into the database, tagged `payroll-due-suite`: one done,
 * not approved, and one the app clocked out at midnight. run-all.sh removes
 * them and the settings.
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

/// A date in New Jersey, `days` from today.
const njDay = (days) => {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);
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

const settings = (page, payPeriodStart) =>
  page.evaluate(
    (body) =>
      fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.status),
    { payPeriodStart },
  );

const ada = await signIn('admin@domihealthcare.com');
const mgr = await signIn('manager@domihealthcare.com');

await step('set-up: a period ending tomorrow, and two of Max’s punches from yesterday', async () => {
  // Starting 12 days ago, it ends tomorrow — inside two working days of it.
  const status = await settings(ada, njDay(-12));
  if (status !== 200) throw new Error(`settings answered ${status}`);
  const yesterday = njDay(-1);
  sql(`delete from time_entries where "handEntryNote" = 'payroll-due-suite'`);
  for (const midnight of [false, true]) {
    sql(`insert into time_entries
      (id, "employeeId", "locationId", method, status, "clockInAt", "clockInVerification",
       "clockOutAt", "isMissingPunch", "autoClockedOutAt", "handEntryNote", "updatedAt")
      select gen_random_uuid(), e.id, l.id, 'WEB', '${midnight ? 'NEEDS_REVIEW' : 'COMPLETED'}',
        '${yesterday} 14:00:00', 'GEOFENCE', '${yesterday} ${midnight ? '23:00:00' : '20:00:00'}',
        ${midnight}, ${midnight ? `'${yesterday} 23:00:00'` : 'null'}, 'payroll-due-suite', now()
      from employees e, locations l
      where e.email = 'ma@domihealthcare.com' and l.slug = 'north-bergen'`);
  }
});

await step('the Timesheet banner leads with Payroll is due, and what is left', async () => {
  await mgr.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  const banner = mgr.getByText('Payroll is due', { exact: true });
  await banner.waitFor({ timeout: 15000 });
  const attention = await mgr.evaluate(() => fetch('/api/attention').then((r) => r.json()));
  const lines = attention.payrollDue ?? [];
  if (!/^Pay period .* ends .*, paid /.test(lines[0] ?? '')) throw new Error(`lines: ${lines.join(' | ')}`);
  if (!lines.some((l) => /^\d+ (entry|entries) not approved yet/.test(l))) throw new Error(`no unapproved line: ${lines.join(' | ')}`);
  if (!lines.some((l) => /^\d+ clock-outs? made at midnight to correct/.test(l))) throw new Error(`no midnight line: ${lines.join(' | ')}`);
  await mgr.screenshot({ path: `${OUT}/payroll-due.png` });
});

await step('outside the window it says nothing', async () => {
  // Started a week ago: the last period is paid, and this one is not close.
  await settings(ada, njDay(-7));
  const attention = await mgr.evaluate(() => fetch('/api/attention').then((r) => r.json()));
  if ((attention.payrollDue ?? []).length !== 0) throw new Error(`still says: ${attention.payrollDue.join(' | ')}`);
});

await step('with no pay period set it says nothing either', async () => {
  sql(`update practice_settings set "payPeriodStart" = null`);
  const attention = await mgr.evaluate(() => fetch('/api/attention').then((r) => r.json()));
  if ((attention.payrollDue ?? []).length !== 0) throw new Error('it guessed a pay period');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL PAYROLL-DUE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
