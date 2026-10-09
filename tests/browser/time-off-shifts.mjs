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
 * Time off that lands on shifts (Dominguez, October 2026 — making the app
 * smarter): the request form tells the person which of their shifts the dates
 * cover, and approving asks what to do with them — leave them as open shifts,
 * take them off the rota, or leave them — in one go, telling the person once.
 *
 * Frankie gets a published shift on a Tuesday and a draft on the Wednesday
 * three weeks on (a draft is never shown to staff); written straight into the
 * database, tagged `time-off-shifts-suite`; run-all.sh's reset removes time
 * off and these shifts.
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
const TAG = 'time-off-shifts-suite';
const cleanUp = () => {
  sql(`delete from shifts where notes = '${TAG}'`);
  sql(`delete from pto_requests where notes = '${TAG}'`);
};

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const sunday = addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
const TUESDAY = addDays(sunday, 23);
const WEDNESDAY = addDays(sunday, 24);
const THURSDAY = addDays(sunday, 25);
const at = (date, time) => `(timestamp '${date} ${time}' at time zone 'America/New_York')`;
const shift = (date, status) =>
  sql(`insert into shifts (id, "employeeId", "locationId", "startsAt", "endsAt", status, notes, "updatedAt")
       select gen_random_uuid(), e.id, l.id, ${at(date, '09:00')}, ${at(date, '17:00')}, '${status}', '${TAG}', now()
       from employees e, locations l where e.email = 'frontdesk@domihealthcare.com' and l.slug = 'north-bergen'
       returning id`);

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

let published, draft;
await step('set-up: Frankie on a Tuesday (published) and the Wednesday (draft)', async () => {
  cleanUp();
  published = shift(TUESDAY, 'PUBLISHED');
  draft = shift(WEDNESDAY, 'DRAFT');
});

const frankie = await signIn('frontdesk@domihealthcare.com');

await step('asking for those days, Frankie is told the shift it covers — not the draft', async () => {
  await frankie.goto(`${BASE}/time-off?request=1`, { waitUntil: 'networkidle' });
  await frankie.getByLabel('First day').fill(TUESDAY);
  await frankie.getByLabel('Last day').fill(WEDNESDAY);
  const note = frankie.getByTestId('time-off-on-rota');
  await note.waitFor({ timeout: 10000 });
  const text = await note.innerText();
  if (!/You’re on the rota then:/.test(text) || !/9:00\s?AM–5:00\s?PM · North Bergen/.test(text))
    throw new Error(`note: ${text}`);
  if ((await note.getByRole('listitem').count()) !== 1) throw new Error(`listed: ${text}`);
  await note.screenshot({ path: `${OUT}/time-off-on-rota.png` });
  await frankie.getByLabel('Notes').fill(TAG);
  await frankie.getByRole('button', { name: 'Send request' }).click();
  await frankie.getByText(TAG).first().waitFor({ timeout: 10000 });
});

const mgr = await signIn('manager@domihealthcare.com');

await step('approving asks what happens to both shifts, and leaving them open does that', async () => {
  await mgr.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  const card = mgr.locator('div', { hasText: TAG }).filter({ has: mgr.getByRole('button', { name: 'Approve', exact: true }) }).last();
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  const dialog = mgr.getByTestId('approve-time-off');
  await dialog.waitFor({ timeout: 10000 });
  if ((await dialog.getByRole('listitem').count()) !== 2) throw new Error('both shifts should be listed');
  await dialog.screenshot({ path: `${OUT}/approve-time-off.png` });
  await dialog.getByRole('button', { name: 'Approve, and leave them as open shifts' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
  const rows = sql(`select coalesce("employeeId"::text, 'open') || ':' || status from shifts where id in ('${published}', '${draft}') order by "startsAt"`);
  if (rows !== 'open:PUBLISHED\nopen:DRAFT') throw new Error(`shifts now: ${rows.replace('\n', ', ')}`);
});

await step('Frankie is told once, with the approval', async () => {
  const inbox = await frankie.evaluate(() => fetch('/api/notifications').then((r) => r.json()));
  const notice = inbox.items.find((item) => item.kind === 'TIME_OFF_DECIDED');
  if (!notice || !/Your 2 shifts on those days are off your schedule\./.test(notice.body))
    throw new Error(`bell: ${JSON.stringify(notice)}`);
  if (inbox.items.some((item) => item.kind === 'SCHEDULE_CHANGED')) throw new Error('told twice');
});

await step('taking a shift off the rota cancels a published one', async () => {
  const thursday = shift(THURSDAY, 'PUBLISHED');
  const made = await frankie.evaluate(async (args) => {
    const r = await fetch('/api/pto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'SICK', startDate: args.day, endDate: args.day, notes: args.tag }),
    });
    return r.json();
  }, { day: THURSDAY, tag: TAG });
  const status = await mgr.evaluate(
    async (id) =>
      (
        await fetch(`/api/pto/${id}/review`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'APPROVED', shifts: 'REMOVE' }),
        })
      ).status,
    made.id,
  );
  if (status !== 200) throw new Error(`review answered ${status}`);
  const now = sql(`select status from shifts where id = '${thursday}'`);
  if (now !== 'CANCELLED') throw new Error(`Thursday's shift is ${now}`);
});

cleanUp();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL TIME-OFF-SHIFT CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
