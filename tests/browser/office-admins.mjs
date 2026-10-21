import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { goToManage } from './nav.mjs';

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
 * The admin in the office (October 2026, Dominguez: "we need to have an admin
 * in WNY location daily except Friday - right now the schedule is that Kayla
 * is Wednesday, Tatiyanna is Monday and Celeste is Tuesday and Angelica
 * Notario Thursday"):
 *
 * - a usual pattern of who, per office and weekday, on Schedule → Reviews for
 *   everybody, with one day changed by a manager, and on the person's Home;
 * - a staffing minimum on chosen weekdays only: Administrative at West New
 *   York, Monday to Thursday, flagged when the rota leaves it short.
 *
 * Draft shifts are tagged `office-admins-suite`; run-all.sh removes them, the
 * pattern and the minimums.
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
const TAG = 'office-admins-suite';

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const unlocked = page.getByText('Not clocked in');
  const mustChange = page.getByText('Choose a new password');
  await unlocked.or(mustChange).first().waitFor({ timeout: 20000 });
  if (await mustChange.isVisible()) {
    await page.getByLabel('Temporary password').fill('shift-change-2026');
    await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
    await page.getByLabel('Confirm new password').fill('harbour lantern 7');
    await page.getByRole('button', { name: 'Change password' }).click();
    await unlocked.waitFor({ timeout: 15000 });
  }
  return page;
}

const call = (page, path, init) =>
  page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
      const text = await r.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: r.status, body };
    },
    { path, init },
  );

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Next week, as the Schedule's weeks run: Sunday first, in New Jersey.
const sunday = addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
const NEXT_SUNDAY = addDays(sunday, 7);
const MONDAY = addDays(sunday, 8);
const TUESDAY = addDays(sunday, 9);
const FRIDAY = addDays(sunday, 12);
const label = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
const shift = (email, date) =>
  sql(`insert into shifts (id, "employeeId", "locationId", "jobRoleId", "startsAt", "endsAt", status, notes, "updatedAt")
       select gen_random_uuid(), e.id, l.id, r.id,
         (timestamp '${date} 09:00' at time zone 'America/New_York'),
         (timestamp '${date} 17:00' at time zone 'America/New_York'), 'DRAFT', '${TAG}', now()
       from employees e, locations l, job_roles r
       where e.email = '${email}' and l.slug = 'west-new-york' and r.name = 'Medical Assistant'
       returning id`);

const manager = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
const wny = (await call(manager, '/locations')).body.find((l) => l.slug === 'west-new-york');

await step('nobody is set yet: staff see nothing, a manager can set the usual admins', async () => {
  await frankie.goto(`${BASE}/schedule-reviews`, { waitUntil: 'networkidle' });
  await frankie.getByRole('heading', { name: 'Schedule reviews' }).waitFor();
  if (await frankie.getByTestId('office-admins').count()) throw new Error('staff see an empty card');
  const set = await call(frankie, '/office-admins/pattern', {
    method: 'PUT',
    body: JSON.stringify({ entries: [] }),
  });
  if (set.status !== 403) throw new Error(`staff setting answered ${set.status}`);
});

await step('a manager sets West New York: Frankie Monday to Wednesday, Max Thursday, nobody Friday', async () => {
  await manager.goto(`${BASE}/schedule-reviews`, { waitUntil: 'networkidle' });
  const card = manager.getByTestId('office-admins');
  await card.getByRole('button', { name: 'Set the usual admins' }).click();
  const form = card.getByRole('form', { name: 'The usual admins' });
  for (const day of ['Monday', 'Tuesday', 'Wednesday']) {
    await form.getByLabel(`West New York, ${day}`).selectOption({ label: 'Frankie Front-Desk' });
  }
  await form.getByLabel('West New York, Thursday').selectOption({ label: 'Max Assistant' });
  await form.getByRole('button', { name: 'Save the usual admins' }).click();
  await card.getByText('Saved. The usual admins apply to every week from now on.').waitFor();
  const days = (await call(manager, `/office-admins?from=${NEXT_SUNDAY}&to=${addDays(NEXT_SUNDAY, 6)}`)).body;
  const on = (date) => days.days.find((d) => d.date === date).admins.find((a) => a.locationId === wny.id);
  if (on(MONDAY).person?.name !== 'Frankie Front-Desk') throw new Error('Monday is not Frankie');
  if (on(FRIDAY).person !== null || on(FRIDAY).usualDay) throw new Error('Friday has somebody');
});

await step('managers see that Frankie is not on the rota there, until a shift is added', async () => {
  await manager.getByRole('button', { name: 'Next week →' }).click();
  const monday = manager.getByTestId(`office-admin-${wny.id}-${MONDAY}`);
  await monday.getByText('Not on the rota here').waitFor();
  await manager.screenshot({ path: `${OUT}/office-admins.png`, fullPage: true });
  shift('frontdesk@domihealthcare.com', MONDAY);
  await manager.reload({ waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: 'Next week →' }).click();
  await manager.getByTestId(`office-admin-${wny.id}-${MONDAY}`).getByText('Frankie Front-Desk').waitFor();
  if (await manager.getByTestId(`office-admin-${wny.id}-${MONDAY}`).getByText('Not on the rota here').count()) {
    throw new Error('still flagged with a shift there');
  }
  const staff = (await call(frankie, `/office-admins?from=${MONDAY}&to=${MONDAY}`)).body;
  if (staff.days[0].admins[0].concerns !== undefined) throw new Error('staff are shown the concerns');
});

await step('a manager changes one day, with a note everybody reads', async () => {
  await manager.getByTestId(`office-admin-${wny.id}-${TUESDAY}`).getByRole('button').click();
  const dialog = manager.getByTestId('office-admin-day');
  await dialog.getByLabel('The admin that day').selectOption({ label: 'Max Assistant' });
  await dialog.getByLabel('Note').fill('Frankie is at North Bergen');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await manager.getByRole('status').getByText(/^Changed for /).waitFor();
  await frankie.goto(`${BASE}/schedule-reviews`, { waitUntil: 'networkidle' });
  await frankie.getByRole('button', { name: 'Next week →' }).click();
  const tuesday = frankie.getByTestId(`office-admin-${wny.id}-${TUESDAY}`);
  await tuesday.getByText('Max Assistant').waitFor();
  await tuesday.getByText('Frankie is at North Bergen').waitFor();
});

await step('Frankie’s Home says when they are the office admin', async () => {
  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const card = frankie.getByTestId('home-office-admin');
  await card.getByText('You are the office admin').waitFor({ timeout: 15000 });
  await card.getByText('West New York').first().waitFor();
});

await step('a minimum on chosen weekdays: Administrative at West New York, Monday to Thursday', async () => {
  await goToManage(manager, 'Job roles');
  const card = manager.getByTestId('staffing-minimums');
  await card.waitFor({ timeout: 15000 });
  await card.getByLabel('Minimum Administrative at West New York').fill('1');
  await card.getByRole('button', { name: /Days for Administrative at West New York: Every day/ }).click();
  for (const day of ['Fri', 'Sat', 'Sun']) {
    await card.getByRole('button', { name: day, exact: true }).click();
  }
  await card.getByRole('button', { name: /Days for Administrative at West New York: Mon, Tue, Wed, Thu/ }).waitFor();
  await card.screenshot({ path: `${OUT}/minimum-weekdays.png` });
  await card.getByRole('button', { name: 'Save minimums' }).click();
  await card.getByRole('status').getByText('Saved.').waitFor();
  const saved = (await call(manager, '/staffing/minimums')).body;
  if (JSON.stringify(saved.map((m) => m.weekdays)) !== '[[1,2,3,4]]') throw new Error(JSON.stringify(saved));
});

await step('a Monday with nobody in Administrative is short; a Friday is not', async () => {
  // West New York is open both days: something is on its rota.
  shift('ma@domihealthcare.com', FRIDAY);
  const attention = (await call(manager, '/attention')).body;
  const short = attention.belowMinimum.filter((line) => line.includes('Administrative'));
  if (!short.includes(`West New York, ${label(MONDAY)}: nobody in Administrative on the rota, minimum 1`)) {
    throw new Error(JSON.stringify(short));
  }
  if (short.some((line) => line.includes(label(FRIDAY)))) throw new Error(`Friday flagged: ${short}`);
});

sql(`delete from shifts where notes = '${TAG}'`);
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL OFFICE ADMIN CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
