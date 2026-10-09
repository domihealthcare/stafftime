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
 * Approve the clean hours (Dominguez, October 2026 — making the app smarter):
 * one button on the Timesheet approves every entry on screen with nothing
 * flagged, after asking; the flagged ones stay for a look one by one.
 *
 * Late punches and midnight clock-outs need a shift and the right moment, so
 * this suite writes a week in March 2025 for Max straight into the database,
 * tagged `approve-clean-suite` (in `handEntryNote`, which no screen shows for
 * a punch), and run-all.sh removes them: three clean days, one late, one
 * clocked out by the app at midnight, and one already approved.
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

function punch(date, { status = 'COMPLETED', late = false, midnight = false } = {}) {
  // Midnight in New Jersey, in March 2025 (before the clocks went forward), is
  // 05:00 UTC the next day.
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const clockOut = midnight ? `${next.toISOString().slice(0, 10)} 05:00:00` : `${date} 21:00:00`;
  return sql(`insert into time_entries
    (id, "employeeId", "locationId", method, status, "clockInAt", "clockInVerification",
     "clockOutAt", "isLate", "isMissingPunch", "autoClockedOutAt", "handEntryNote", "updatedAt")
    select gen_random_uuid(), e.id, l.id, 'WEB', '${status}', '${date} 13:00:00', 'GEOFENCE',
      '${clockOut}', ${late}, ${midnight}, ${midnight ? `'${clockOut}'` : 'null'},
      'approve-clean-suite', now()
    from employees e, locations l
    where e.email = 'ma@domihealthcare.com' and l.slug = 'north-bergen'
    returning id`);
}

let lateId = '';
await step('set-up: a week of Max’s — three clean days, one late, one midnight, one approved', async () => {
  sql(`delete from time_entries where "handEntryNote" = 'approve-clean-suite'`);
  for (const date of ['2025-03-03', '2025-03-04', '2025-03-05']) punch(date);
  lateId = punch('2025-03-06', { late: true });
  punch('2025-03-07', { midnight: true, status: 'NEEDS_REVIEW' });
  punch('2025-03-02', { status: 'APPROVED' });
});

async function signIn(email, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

async function openMaxsWeek(page) {
  await page.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Timesheet' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByLabel('From', { exact: true }).fill('2025-03-01');
  await page.getByLabel('To (included)').fill('2025-03-08');
  await page.getByLabel('Search employees').fill('Max');
  await page.getByText('6 entries').waitFor({ timeout: 15000 });
}

const mgr = await signIn('manager@domihealthcare.com');
const button = mgr.getByTestId('approve-clean');

await step('the Timesheet offers to approve the three with nothing flagged', async () => {
  await openMaxsWeek(mgr);
  const text = (await button.innerText()).trim();
  if (text !== 'Approve all 3 with nothing flagged') throw new Error(`button reads "${text}"`);
});

await step('it asks first, saying the flagged ones stay', async () => {
  await button.click();
  const dialog = mgr.getByRole('alertdialog');
  await dialog.getByText('Approve 3 entries with nothing flagged?').waitFor({ timeout: 5000 });
  await dialog.getByText('24.00 hours').waitFor({ timeout: 5000 });
  await dialog.getByText('The 2 flagged ones stay for you to look at one by one.').waitFor({ timeout: 5000 });
  await mgr.screenshot({ path: `${OUT}/approve-clean-confirm.png` });
  await dialog.getByRole('button', { name: 'Not yet' }).click();
  const approved = sql(`select count(*) from time_entries where "handEntryNote" = 'approve-clean-suite' and status = 'APPROVED'`);
  if (approved !== '1') throw new Error(`"Not yet" approved something: ${approved}`);
});

await step('approving takes the three, and leaves the late one and the midnight one', async () => {
  await button.click();
  await mgr.getByRole('alertdialog').getByRole('button', { name: 'Yes, approve them' }).click();
  await mgr.getByText('Approved 3 entries.').waitFor({ timeout: 10000 });
  await button.waitFor({ state: 'detached', timeout: 10000 });
  const table = mgr.locator('table');
  const approvedRows = await table.getByText('Approved', { exact: true }).count();
  if (approvedRows !== 4) throw new Error(`${approvedRows} rows read Approved`);
  if ((await table.getByRole('button', { name: 'Approve', exact: true }).count()) !== 1)
    throw new Error('the late entry lost its own Approve');
  await table.getByText('Edit the time first').waitFor({ timeout: 5000 });
  const rows = sql(`select "isLate", status from time_entries where "handEntryNote" = 'approve-clean-suite' and status <> 'APPROVED' order by "clockInAt"`);
  if (rows !== 't|COMPLETED\nf|NEEDS_REVIEW') throw new Error(`left: ${JSON.stringify(rows)}`);
});
await mgr.screenshot({ path: `${OUT}/approve-clean-done.png`, fullPage: true });

await step('the server approves nothing flagged, whatever it is sent', async () => {
  const result = await mgr.evaluate(async (id) => {
    const res = await fetch('/api/time-entries/approve-clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    return res.json();
  }, lateId);
  if (result.approved !== 0 || result.left !== 1) throw new Error(JSON.stringify(result));
});

await step('on a phone it fits, without scrolling sideways', async () => {
  sql(`update time_entries set status = 'COMPLETED', "approvedAt" = null, "approvedById" = null
       where "handEntryNote" = 'approve-clean-suite' and "clockInAt" between '2025-03-03' and '2025-03-06'`);
  const phone = await signIn('manager@domihealthcare.com', 390);
  await openMaxsWeek(phone);
  await phone.getByTestId('approve-clean').waitFor({ timeout: 10000 });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (wide > 0) throw new Error(`the page is ${wide}px wider than the phone`);
  await phone.screenshot({ path: `${OUT}/approve-clean-phone.png`, fullPage: true });
});

await step('staff cannot approve anything', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  const status = await frankie.evaluate(async (id) => {
    const res = await fetch('/api/time-entries/approve-clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    return res.status;
  }, lateId);
  if (status !== 403) throw new Error(`staff were answered ${status}`);
  await frankie.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  await frankie.getByRole('heading', { name: 'Timesheet' }).waitFor({ timeout: 15000 });
  if (await frankie.getByTestId('approve-clean').count()) throw new Error('staff see the button');
});

sql(`delete from time_entries where "handEntryNote" = 'approve-clean-suite'`);

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL APPROVE-CLEAN CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
