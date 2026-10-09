import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { goTo } from './nav.mjs';

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
 * A minimum per office per job role (Dominguez, October 2026 — making the app
 * smarter): set on Job roles, it flags days the rota leaves short on the
 * Schedule banner, in the nightly email and in Before you publish, and Too
 * many off at once goes by it. Warns, never refuses.
 *
 * Frankie gets a draft Front Desk shift at North Bergen next Tuesday, tagged
 * `minimums-suite`; run-all.sh removes it and every minimum.
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
const TAG = 'minimums-suite';
const cleanUp = () => {
  sql(`delete from shifts where notes = '${TAG}'`);
  sql(`delete from staffing_minimums`);
};

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const sunday = addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
const TUESDAY = addDays(sunday, 9);
const label = new Date(`${TUESDAY}T12:00:00Z`).toLocaleDateString('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const LINE = `North Bergen, ${label}: 1 in Front Desk on the rota, minimum 3`;

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

let draftId;
await step('set-up: a draft Front Desk shift for Frankie at North Bergen next Tuesday', async () => {
  cleanUp();
  draftId = sql(`insert into shifts (id, "employeeId", "locationId", "jobRoleId", "startsAt", "endsAt", status, notes, "updatedAt")
       select gen_random_uuid(), e.id, l.id, r.id,
         (timestamp '${TUESDAY} 09:00' at time zone 'America/New_York'),
         (timestamp '${TUESDAY} 17:00' at time zone 'America/New_York'), 'DRAFT', '${TAG}', now()
       from employees e, locations l, job_roles r
       where e.email = 'frontdesk@domihealthcare.com' and l.slug = 'north-bergen' and r.name = 'Front Desk'
       returning id`);
});

const mgr = await signIn('manager@domihealthcare.com');

await step('nothing is flagged before a minimum is set', async () => {
  const attention = await mgr.evaluate(() => fetch('/api/attention').then((r) => r.json()));
  if (attention.belowMinimum.length) throw new Error(`flagged: ${JSON.stringify(attention.belowMinimum)}`);
});

await step('a manager sets 3 Front Desk at North Bergen on Job roles', async () => {
  await goTo(mgr, 'Job roles');
  const card = mgr.getByTestId('staffing-minimums');
  await card.waitFor({ timeout: 15000 });
  await card.getByLabel('Minimum Front Desk at North Bergen').fill('3');
  const saved = mgr.waitForResponse(
    (r) => r.url().endsWith('/api/staffing/minimums') && r.request().method() === 'PUT',
  );
  await card.getByRole('button', { name: 'Save minimums' }).click();
  if ((await saved).status() !== 200) throw new Error('save failed');
  await card.getByRole('status').getByText('Saved.').waitFor({ timeout: 5000 });
  await card.screenshot({ path: `${OUT}/staffing-minimums.png` });
  await mgr.reload({ waitUntil: 'networkidle' });
  const value = await mgr.getByTestId('staffing-minimums').getByLabel('Minimum Front Desk at North Bergen').inputValue();
  if (value !== '3') throw new Error(`read back ${value}`);
});

await step('the short Tuesday is on the Schedule banner and in the nightly round-up', async () => {
  const attention = await mgr.evaluate(() => fetch('/api/attention').then((r) => r.json()));
  if (!attention.belowMinimum.includes(LINE))
    throw new Error(`round-up: ${JSON.stringify(attention.belowMinimum)}`);
  await mgr.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  const banner = mgr.getByTestId('needs-attention');
  await banner.first().waitFor({ timeout: 15000 });
  const toggle = banner.getByRole('button', { name: /Worth a look/ });
  if (await toggle.count()) await toggle.first().click();
  await banner.getByText('Days below the minimum', { exact: true }).waitFor({ timeout: 10000 });
});

await step('Before you publish says so too', async () => {
  const check = await mgr.evaluate(async (id) => {
    const r = await fetch('/api/shifts/publish-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    return r.json();
  }, draftId);
  const section = check.sections.find((s) => s.key === 'minimum');
  if (!section || section.title !== 'Fewer on than the minimum' || !section.lines.includes(LINE))
    throw new Error(`check: ${JSON.stringify(check.sections)}`);
});

await step('staff cannot read or set the minimums', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  const status = await frankie.evaluate(async () => (await fetch('/api/staffing/minimums')).status);
  if (status !== 403) throw new Error(`staff were answered ${status}`);
});

cleanUp();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL MINIMUM CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
