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
 * Availability that clashes with a regular shift (Dominguez, October 2026 —
 * making the app smarter): somebody with a regular Wednesday shift says they
 * are not available Wednesdays. Saved, as availability always is — and the
 * managers hear at once on the bell, and it is listed on the Schedule banner
 * and in the nightly email until the regular shift or the availability changes.
 *
 * Frankie's regular shift is written straight into the database, tagged
 * `availability-clash-suite`; run-all.sh's reset removes regular shifts and
 * availability anyway.
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
const TAG = 'availability-clash-suite';
const cleanUp = () => {
  sql(`delete from shift_series where notes = '${TAG}'`);
  sql(`delete from unavailability where note = '${TAG}'`);
  sql(`delete from notifications where kind = 'AVAILABILITY_CLASH'`);
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
const post = (page, path, body) =>
  page.evaluate(
    async ({ path, body }) => {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, body },
  );

await step('set-up: Frankie works every Wednesday, 9 to 5, at North Bergen', async () => {
  cleanUp();
  sql(`insert into shift_series (id, "employeeId", "locationId", "daysOfWeek", "startTime", "endTime", status,
         notes, "startsOn", "filledThrough", "updatedAt")
       select gen_random_uuid(), e.id, l.id, '{3}', '09:00', '17:00', 'PUBLISHED', '${TAG}',
         current_date, current_date, now()
       from employees e, locations l where e.email = 'frontdesk@domihealthcare.com' and l.slug = 'north-bergen'`);
});

const frankie = await signIn('frontdesk@domihealthcare.com');
let ruleId;

await step('a rule that does not clash says nothing', async () => {
  const saved = await post(frankie, '/api/availability', { kind: 'WEEKLY', weekday: 4, note: TAG });
  if (saved.status !== 201) throw new Error(`saved ${saved.status}: ${JSON.stringify(saved.body)}`);
  if (sql(`select count(*) from notifications where kind = 'AVAILABILITY_CLASH'`) !== '0')
    throw new Error('managers were told about a Thursday');
});

await step('not available Wednesday afternoons: saved, as availability always is', async () => {
  const saved = await post(frankie, '/api/availability', {
    kind: 'WEEKLY',
    weekday: 3,
    startTime: '13:00',
    endTime: '21:00',
    note: TAG,
  });
  if (saved.status !== 201) throw new Error(`saved ${saved.status}: ${JSON.stringify(saved.body)}`);
  ruleId = saved.body.id;
});

const mgr = await signIn('manager@domihealthcare.com');
const LINE = /^Frankie Front-Desk — regular Wednesdays 9:00 AM–5:00 PM at North Bergen, but not available Wednesdays, 1:00 PM–9:00 PM \(from .+\)$/;

await step('the managers hear at once, on the bell', async () => {
  const inbox = await mgr.evaluate(() => fetch('/api/notifications').then((r) => r.json()));
  const notice = inbox.items.find((item) => item.kind === 'AVAILABILITY_CLASH');
  if (!notice) throw new Error(`bell: ${JSON.stringify(inbox.items.map((i) => i.title))}`);
  if (notice.title !== "Frankie Front-Desk's new availability clashes with a regular shift")
    throw new Error(`title: ${notice.title}`);
  if (!LINE.test(notice.body)) throw new Error(`body: ${notice.body}`);
});

await step('it is on the Schedule banner and in the nightly round-up', async () => {
  const attention = await mgr.evaluate(() => fetch('/api/attention').then((r) => r.json()));
  if (!attention.regularShiftClashes.some((line) => LINE.test(line)))
    throw new Error(`round-up: ${JSON.stringify(attention.regularShiftClashes)}`);
  await mgr.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  const banner = mgr.getByTestId('needs-attention');
  await banner.first().waitFor({ timeout: 15000 });
  // The Schedule's banner starts folded to one line.
  const toggle = banner.getByRole('button', { name: /Worth a look/ });
  if (await toggle.count()) await toggle.first().click();
  await banner.getByText('Regular shifts that clash with availability', { exact: true }).waitFor({ timeout: 10000 });
  await banner.getByText(new RegExp(LINE.source.slice(1, -1))).waitFor({ timeout: 5000 });
  await banner.screenshot({ path: `${OUT}/availability-clash-banner.png` });
});

await step('taking the rule away clears it', async () => {
  const status = await frankie.evaluate(
    async (id) => (await fetch(`/api/availability/${id}`, { method: 'DELETE' })).status,
    ruleId,
  );
  if (status !== 200) throw new Error(`delete answered ${status}`);
  const attention = await mgr.evaluate(() => fetch('/api/attention').then((r) => r.json()));
  if (attention.regularShiftClashes.some((line) => LINE.test(line)))
    throw new Error('still listed after the rule went');
});

cleanUp();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL AVAILABILITY-CLASH CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
