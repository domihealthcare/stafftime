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
 * Smarter starting hours on a new shift (Dominguez, October 2026 — making the
 * app smarter): the ＋ on the rota and + Add start on the person's usual for
 * that day — their regular shift, or what they have worked most often on that
 * weekday lately — instead of 9 to 5, with a line saying so. Only until the
 * manager changes the hours or place by hand.
 *
 * Frankie has worked 7 to 3 at North Bergen the last two Wednesdays; the
 * suite opens next week's Wednesday. Written straight into the database,
 * tagged `usual-hours-suite`; run-all.sh removes them.
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
const TAG = 'usual-hours-suite';
const cleanUp = () => {
  sql(`delete from shifts where notes = '${TAG}'`);
  sql(`delete from shift_series where notes = '${TAG}'`);
};

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Next week's Wednesday, the rota's weeks starting on Sunday.
const sunday = addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
const WEDNESDAY = addDays(sunday, 10);
const FRIDAY = addDays(sunday, 12);
const at = (date, time) => `(timestamp '${date} ${time}' at time zone 'America/New_York')`;
const shiftOn = (date) =>
  sql(`insert into shifts (id, "employeeId", "locationId", "startsAt", "endsAt", status, notes, "updatedAt")
       select gen_random_uuid(), e.id, l.id, ${at(date, '07:00')}, ${at(date, '15:00')}, 'PUBLISHED', '${TAG}', now()
       from employees e, locations l where e.email = 'frontdesk@domihealthcare.com' and l.slug = 'north-bergen'`);

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
const usual = (page, date) =>
  page.evaluate(
    async ({ date }) => {
      const me = await (await fetch('/api/employees')).json();
      const frankie = me.find((person) => person.email === 'frontdesk@domihealthcare.com');
      const r = await fetch(`/api/shifts/usual?employeeId=${frankie.id}&date=${date}`);
      return { status: r.status, body: r.ok ? await r.json() : null };
    },
    { date },
  );

await step('set-up: Frankie worked 7 to 3 at North Bergen the last two Wednesdays', async () => {
  cleanUp();
  shiftOn(addDays(WEDNESDAY, -7));
  shiftOn(addDays(WEDNESDAY, -14));
});

const mgr = await signIn('manager@domihealthcare.com');

await step('the server knows Frankie’s usual Wednesday, and nothing for a Friday', async () => {
  const wednesday = await usual(mgr, WEDNESDAY);
  if (wednesday.status !== 200) throw new Error(`answered ${wednesday.status}`);
  const u = wednesday.body.usual;
  if (!u || u.startTime !== '07:00' || u.endTime !== '15:00' || u.from !== 'weekday')
    throw new Error(`Wednesday: ${JSON.stringify(u)}`);
  const friday = await usual(mgr, FRIDAY);
  if (friday.body.usual !== null) throw new Error(`Friday: ${JSON.stringify(friday.body.usual)}`);
});

await mgr.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
await mgr.getByRole('button', { name: 'Week', exact: true }).click();
await mgr.getByRole('button', { name: 'Next →' }).click();
await mgr.getByText('Coverage this week').waitFor({ timeout: 15000 });
const frankie = () => mgr.getByTestId('rota-row-Frankie Front-Desk');
const addOn = async (weekday) => {
  await frankie().getByRole('button', { name: new RegExp(`^Add a shift for Frankie Front-Desk on ${weekday}`) }).click();
  const dialog = mgr.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
  await dialog.waitFor({ timeout: 10000 });
  return dialog;
};

await step('the ＋ on Wednesday starts on 7 to 3, and says why', async () => {
  const dialog = await addOn('Wednesday');
  const hint = dialog.getByTestId('usual-shift-hint');
  await hint.waitFor({ timeout: 10000 });
  const text = (await hint.innerText()).trim();
  if (text !== 'Started on 7:00 AM–3:00 PM at North Bergen — what they have worked most on this weekday lately.')
    throw new Error(`hint: ${text}`);
  const start = await dialog.getByLabel('Starts').inputValue();
  const end = await dialog.getByLabel('Ends').inputValue();
  if (start !== '07:00' || end !== '15:00') throw new Error(`times: ${start}–${end}`);
  await dialog.screenshot({ path: `${OUT}/usual-hours.png` });
});

await step('changing the hours by hand makes them the manager’s own', async () => {
  const dialog = mgr.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
  await dialog.getByLabel('Starts').fill('08:00');
  await dialog.getByTestId('usual-shift-hint').waitFor({ state: 'detached', timeout: 5000 });
  if ((await dialog.getByLabel('Ends').inputValue()) !== '15:00') throw new Error('the end moved');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

await step('a day with nothing usual stays on 9 to 5', async () => {
  const dialog = await addOn('Friday');
  await mgr.waitForTimeout(1000);
  const start = await dialog.getByLabel('Starts').inputValue();
  if (start !== '09:00') throw new Error(`started on ${start}`);
  if (await dialog.getByTestId('usual-shift-hint').count()) throw new Error('a hint with nothing usual');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

await step('a regular shift comes first', async () => {
  sql(`insert into shift_series (id, "employeeId", "locationId", "daysOfWeek", "startTime", "endTime", status,
         notes, "startsOn", "filledThrough", "updatedAt")
       select gen_random_uuid(), e.id, l.id, '{5}', '10:00', '18:00', 'PUBLISHED', '${TAG}',
         '${today}', '${today}', now()
       from employees e, locations l where e.email = 'frontdesk@domihealthcare.com' and l.slug = 'north-bergen'`);
  const friday = await usual(mgr, FRIDAY);
  const u = friday.body.usual;
  if (!u || u.startTime !== '10:00' || u.from !== 'regular') throw new Error(`Friday: ${JSON.stringify(u)}`);
});

await step('staff cannot ask', async () => {
  const staff = await signIn('frontdesk@domihealthcare.com');
  const status = await staff.evaluate(
    async (date) => (await fetch(`/api/shifts/usual?employeeId=00000000-0000-4000-8000-000000000000&date=${date}`)).status,
    WEDNESDAY,
  );
  if (status !== 403) throw new Error(`staff were answered ${status}`);
});

cleanUp();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL USUAL-HOURS CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
