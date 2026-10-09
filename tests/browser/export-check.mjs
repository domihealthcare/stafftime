import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { openMenu } from './nav.mjs';

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
 * Before you export (Dominguez, October 2026 — making the app smarter):
 * pressing Download first shows what is worth a look about the period —
 * waiting on a correction, still clocked in, not approved, entered by hand,
 * overtime — and exports anyway when asked. A clean period downloads at once.
 *
 * A week in April 2025, which no other suite uses, written straight into the
 * database and tagged `export-check-suite` (in `editReason`, with no edit
 * time, so nothing reads it as a correction); run-all.sh removes them.
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
const TAG = 'export-check-suite';
const cleanUp = () => sql(`delete from time_entries where "editReason" = '${TAG}'`);

const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isoWeekday = (date) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

/// A punch at North Bergen, 9:00 for `hours` (New Jersey, EDT in April).
function punch(email, date, { hours = 9, status = 'APPROVED', open = false, midnight = false, hand = false } = {}) {
  const clockIn = `${date}T13:00:00Z`;
  const out = midnight ? `${addDays(date, 1)}T04:00:00Z` : open ? null : new Date(Date.parse(clockIn) + hours * 3_600_000).toISOString();
  sql(`insert into time_entries
    (id, "employeeId", "locationId", method, status, "clockInAt", "clockInVerification",
     "clockOutAt", "isMissingPunch", "autoClockedOutAt", "enteredByHandAt", "handEntryReason", "editReason", "updatedAt")
    select gen_random_uuid(), e.id, l.id, 'WEB', '${status}', '${clockIn}', 'GEOFENCE',
      ${out ? `'${out}'` : 'null'}, ${midnight}, ${midnight ? `'${out}'` : 'null'},
      ${hand ? "now(), 'FORGOT'" : 'null, null'}, '${TAG}', now()
    from employees e, locations l
    where e.email = '${email}' and l.slug = 'north-bergen'`);
}

const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  acceptDownloads: true,
  timezoneId: 'America/New_York',
});
const mgr = await ctx.newPage();
mgr.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await mgr.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await mgr.getByLabel('Email').fill('manager@domihealthcare.com');
await mgr.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await mgr.getByRole('button', { name: 'Sign in' }).click();
await mgr.getByText('Not clocked in').waitFor({ timeout: 20000 });

let start = '';
await step('set-up: a week with something in every section', async () => {
  cleanUp();
  const settings = await mgr.evaluate(() => fetch('/api/settings').then((r) => r.json()));
  // Five days of one overtime week, whatever weekday the pay period starts on.
  const startsOn = settings.payPeriodStart ? isoWeekday(settings.payPeriodStart.slice(0, 10)) : 1;
  start = addDays('2025-04-06', (startsOn % 7));
  // Frankie: 5 × 9 hours = 45 — two not yet approved, one entered by hand.
  punch('frontdesk@domihealthcare.com', addDays(start, 0), { status: 'COMPLETED' });
  punch('frontdesk@domihealthcare.com', addDays(start, 1), { status: 'COMPLETED' });
  punch('frontdesk@domihealthcare.com', addDays(start, 2), { hand: true });
  punch('frontdesk@domihealthcare.com', addDays(start, 3));
  punch('frontdesk@domihealthcare.com', addDays(start, 4));
  // Max: clocked out by the app at midnight, and still clocked in.
  punch('ma@domihealthcare.com', addDays(start, 1), { status: 'NEEDS_REVIEW', midnight: true });
  punch('ma@domihealthcare.com', addDays(start, 2), { status: 'OPEN', open: true });
  // A day on its own with nothing to say, for the clean case.
  punch('frontdesk@domihealthcare.com', '2025-04-28', { hours: 4 });
});

async function openPeriod(from, to) {
  await mgr.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await openMenu(mgr, 'Manage');
  await mgr.getByRole('link', { name: 'Export' }).click();
  await mgr.getByText('Export timesheets').waitFor({ timeout: 10000 });
  await mgr.getByRole('button', { name: 'Custom', exact: true }).click();
  await mgr.getByLabel('From').fill(from);
  await mgr.getByLabel('To (included)').fill(to);
  await mgr.getByText(/entr(y|ies) ·/).first().waitFor({ timeout: 15000 });
}
const exportsSoFar = () => Number(sql(`select count(*) from payroll_exports`));

const dialog = mgr.getByTestId('export-check');

await step('Download first shows what is worth a look, most serious first', async () => {
  await openPeriod(addDays(start, 0), addDays(start, 4));
  await mgr.getByRole('button', { name: /Download Excel file/ }).click();
  await dialog.waitFor({ timeout: 15000 });
  const keys = await dialog.locator('[data-testid^="export-check-"]').evaluateAll((els) =>
    els.map((el) => el.dataset.testid.replace('export-check-', '')),
  );
  const want = ['review', 'open', 'unapproved', 'handEntries', 'overtime'];
  if (JSON.stringify(keys) !== JSON.stringify(want)) throw new Error(`sections: ${keys.join(', ')}`);
  const has = async (key, needle) => {
    const text = await dialog.getByTestId(`export-check-${key}`).innerText();
    if (!text.includes(needle)) throw new Error(`${key} read "${text}", wanted "${needle}"`);
  };
  await has('review', 'Waiting on a correction — left out of this file');
  await has('review', 'Max Assistant — clocked in');
  await has('review', 'clocked out by the app at midnight');
  await has('open', 'Max Assistant — clocked in');
  await has('unapproved', 'Not approved yet — going out anyway');
  await has('unapproved', 'Frankie Front-Desk — 2 entries, 18.00 hours');
  await has('handEntries', 'Frankie Front-Desk —');
  await has('overtime', 'Frankie Front-Desk — 5.00 hours of overtime');
});
await mgr.screenshot({ path: `${OUT}/export-check.png` });

await step('“Not yet” exports nothing', async () => {
  const before = exportsSoFar();
  await dialog.getByRole('button', { name: 'Not yet' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  if (exportsSoFar() !== before) throw new Error('an export was recorded');
});

await step('“Export anyway” downloads the file and records the run', async () => {
  const before = exportsSoFar();
  await mgr.getByRole('button', { name: /Download Excel file/ }).click();
  const [download] = await Promise.all([
    mgr.waitForEvent('download', { timeout: 30000 }),
    dialog.getByRole('button', { name: 'Export anyway' }).click(),
  ]);
  if (!download.suggestedFilename().endsWith('.xlsx')) throw new Error(download.suggestedFilename());
  if (exportsSoFar() !== before + 1) throw new Error('the run was not recorded');
});

await step('a clean period downloads at once, with no pop-up', async () => {
  await openPeriod('2025-04-28', '2025-04-28');
  const [download] = await Promise.all([
    mgr.waitForEvent('download', { timeout: 30000 }),
    mgr.getByRole('button', { name: /Download Excel file/ }).click(),
  ]);
  if (!download.suggestedFilename().endsWith('.xlsx')) throw new Error(download.suggestedFilename());
  if (await dialog.count()) throw new Error('the pop-up showed with nothing in it');
});

await step('staff cannot run the check', async () => {
  const staff = await browser.newPage();
  await staff.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await staff.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await staff.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await staff.getByRole('button', { name: 'Sign in' }).click();
  await staff.getByText('Not clocked in').waitFor({ timeout: 20000 });
  const status = await staff.evaluate(async () => {
    const res = await fetch('/api/exports/timesheet/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: '2025-04-01T00:00:00Z', to: '2025-05-01T00:00:00Z' }),
    });
    return res.status;
  });
  if (status !== 403) throw new Error(`staff were answered ${status}`);
});

cleanUp();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL EXPORT-CHECK CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
