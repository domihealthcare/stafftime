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
 * Before you publish (Dominguez, October 2026 — making the app smarter):
 * pressing Publish shows, in one pop-up, what is worth a look about the drafts
 * — a lapsed required license, time off, a closure, availability, overtime,
 * open shifts — and publishes anyway when asked. Drafts with nothing to say
 * get the plain question as before.
 *
 * The week of Sunday 6 June 2027, which no other suite uses. Time off,
 * availability, the closure and the license are written straight into the
 * database, tagged `publish-check-suite`, and run-all.sh removes them.
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

const TAG = 'publish-check-suite';
function cleanUp() {
  sql(`delete from shifts where "startsAt" >= '2027-06-05' and "startsAt" < '2027-06-15'`);
  sql(`delete from pto_requests where notes = '${TAG}'`);
  sql(`delete from unavailability where note = '${TAG}'`);
  sql(`delete from practice_events where title = 'Publish-check closure'`);
  sql(`delete from employee_credentials where name = 'Publish-check license'`);
  sql(`delete from credential_types where name = 'Publish-check license'`);
}

const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isoWeekday = (date) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};
const shortDate = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  });

const ctx = await browser.newContext({
  viewport: { width: 1400, height: 1000 },
  timezoneId: 'America/New_York',
});
const mgr = await ctx.newPage();
mgr.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await mgr.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await mgr.getByLabel('Email').fill('manager@domihealthcare.com');
await mgr.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await mgr.getByRole('button', { name: 'Sign in' }).click();
await mgr.getByText('Not clocked in').waitFor({ timeout: 20000 });

const api = (path, body) =>
  mgr.evaluate(
    async ([p, b]) => {
      const res = await fetch(`/api${p}`, b === undefined ? {} : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    [path, body],
  );

// Three days that are one overtime week and one week on screen (Sunday to
// Saturday), whatever weekday the practice's pay period starts on.
let start = '';
let frankie, max, admin, northBergen, westNewYork;
const draftIds = [];
await step('set-up: drafts that hit every warning', async () => {
  cleanUp();
  const settings = (await api('/settings')).body;
  const startsOn = settings.payPeriodStart ? isoWeekday(settings.payPeriodStart.slice(0, 10)) : 1;
  start = startsOn === 7 || startsOn >= 4 ? '2027-06-06' : addDays('2027-06-06', startsOn);
  const staff = (await api('/employees')).body;
  const byEmail = (email) => staff.find((person) => person.email === email);
  frankie = byEmail('frontdesk@domihealthcare.com');
  max = byEmail('ma@domihealthcare.com');
  admin = byEmail('admin@domihealthcare.com');
  const locations = (await api('/locations')).body;
  northBergen = locations.find((l) => l.name === 'North Bergen');
  westNewYork = locations.find((l) => l.name === 'West New York');

  // Max works at West New York; everybody else here at North Bergen.
  const add = async (person, date, from, to, extra = {}) => {
    const r = await api('/shifts', {
      employeeId: person ? person.id : null,
      locationId: person === max ? westNewYork.id : northBergen.id,
      startsAt: `${date}T${from}:00-04:00`,
      endsAt: `${to === '24:00' ? addDays(date, 1) : date}T${to === '24:00' ? '00:00' : to}:00-04:00`,
      status: 'DRAFT',
      ...extra,
    });
    if (r.status !== 201) throw new Error(`shift answered ${r.status}: ${JSON.stringify(r.body)}`);
    draftIds.push(r.body.id);
  };
  // Frankie: 3 × 14 hours, one of them on approved PTO.
  for (const n of [0, 1, 2]) await add(frankie, addDays(start, n), '07:00', '21:00');
  sql(`insert into pto_requests (id, "employeeId", type, status, "startDate", "endDate", notes, "updatedAt")
       values (gen_random_uuid(), '${frankie.id}', 'VACATION', 'APPROVED', '${addDays(start, 1)}', '${addDays(start, 1)}', '${TAG}', now())`);
  // Max: two shifts after a required license ran out; the second on a weekday
  // Max cannot work, in a closure at West New York.
  await add(max, addDays(start, 1), '09:00', '17:00');
  await add(max, addDays(start, 3), '09:00', '17:00');
  sql(`insert into unavailability (id, "employeeId", kind, weekday, "effectiveFrom", note, "updatedAt")
       values (gen_random_uuid(), '${max.id}', 'WEEKLY', ${isoWeekday(addDays(start, 3))}, '2027-01-01', '${TAG}', now())`);
  sql(`insert into practice_events (id, kind, title, "startsAt", "endsAt", "allDay", audience, "locationId", "updatedAt")
       values (gen_random_uuid(), 'CLOSURE', 'Publish-check closure', '${addDays(start, 3)}T04:00:00Z', '${addDays(start, 4)}T04:00:00Z', true, 'LOCATION', '${westNewYork.id}', now())`);
  sql(`with t as (insert into credential_types (id, name, kind, "updatedAt") values (gen_random_uuid(), 'Publish-check license', 'LICENSE', now()) returning id)
       insert into credential_requirements ("credentialTypeId", "jobRoleId", required)
       select t.id, j.id, true from t, job_roles j where j.name = 'Medical Assistant'`);
  sql(`insert into employee_credentials (id, "credentialTypeId", "employeeId", kind, name, "expiresOn", "updatedAt")
       select gen_random_uuid(), id, '${max.id}', 'LICENSE', 'Publish-check license', '${addDays(start, -10)}', now()
       from credential_types where name = 'Publish-check license'`);
  // And an open shift nobody is on.
  await add(null, addDays(start, 2), '09:00', '13:00');
});

const dialog = mgr.getByTestId('publish-check');
const banner = mgr.getByTestId('drafts-banner');

await step('Publish all shows what is worth a look, most serious first', async () => {
  await mgr.goto(`${BASE}/schedule?week=${start}`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: 'Week', exact: true }).click();
  await banner.getByText('6 draft shifts').waitFor({ timeout: 15000 });
  await banner.getByRole('button', { name: 'Publish all 6' }).click();
  await dialog.waitFor({ timeout: 10000 });
  const keys = await dialog.locator('[data-testid^="publish-check-"]').evaluateAll((els) =>
    els.map((el) => el.dataset.testid.replace('publish-check-', '')),
  );
  const want = ['licenses', 'leave', 'closures', 'availability', 'overtime', 'open'];
  if (JSON.stringify(keys) !== JSON.stringify(want)) throw new Error(`sections: ${keys.join(', ')}`);
  const text = (key) => dialog.getByTestId(`publish-check-${key}`).innerText();
  const expect = async (key, needle) => {
    const got = await text(key);
    if (!got.includes(needle)) throw new Error(`${key} read "${got}", wanted "${needle}"`);
  };
  await expect('licenses', `Max Assistant — Publish-check license expired ${shortDate(addDays(start, -10))}, before 2 shifts from ${shortDate(addDays(start, 1))}`);
  await expect('leave', `Frankie Front-Desk — ${shortDate(addDays(start, 1))}: on approved PTO`);
  await expect('closures', `Max Assistant at West New York, ${shortDate(addDays(start, 3))} — Publish-check closure`);
  await expect('availability', `Max Assistant — ${shortDate(addDays(start, 3))}, 9:00 AM–5:00 PM: Not available`);
  await expect('overtime', 'Frankie Front-Desk — 42 hrs the week of');
  await expect('open', `${shortDate(addDays(start, 2))} · North Bergen`);
  // Frankie is a Medical Assistant too, with no license on file: that is the
  // Licenses screen's to chase, not a line on every publish.
  if ((await text('licenses')).includes('Frankie')) throw new Error('a missing license was listed');
});
await mgr.screenshot({ path: `${OUT}/publish-check.png` });

await step('“Not yet” publishes nothing', async () => {
  await dialog.getByRole('button', { name: 'Not yet' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  const drafts = sql(`select count(*) from shifts where id in (${draftIds.map((id) => `'${id}'`).join(',')}) and status = 'DRAFT'`);
  if (drafts !== '6') throw new Error(`${drafts} of 6 still drafts`);
});

await step('“Publish anyway” publishes them all', async () => {
  await banner.getByRole('button', { name: 'Publish all 6' }).click();
  await dialog.getByRole('button', { name: 'Publish anyway' }).click();
  await mgr.getByTestId('published-note').getByText('Published 6 shifts.').waitFor({ timeout: 10000 });
  const published = sql(`select count(*) from shifts where id in (${draftIds.map((id) => `'${id}'`).join(',')}) and status = 'PUBLISHED'`);
  if (published !== '6') throw new Error(`${published} of 6 published`);
});

await step('a draft with nothing to say gets the plain question', async () => {
  const r = await api('/shifts', {
    employeeId: admin.id,
    locationId: northBergen.id,
    startsAt: `${addDays(start, 1)}T09:00:00-04:00`,
    endsAt: `${addDays(start, 1)}T13:00:00-04:00`,
    status: 'DRAFT',
  });
  if (r.status !== 201) throw new Error(`shift answered ${r.status}`);
  await mgr.reload({ waitUntil: 'networkidle' });
  await banner.getByRole('button', { name: 'Publish it' }).click();
  const ask = mgr.getByRole('alertdialog');
  await ask.getByText('Publish 1 draft shift?').waitFor({ timeout: 10000 });
  if (await dialog.count()) throw new Error('the check showed with nothing in it');
  await ask.getByRole('button', { name: 'Not yet' }).click();
});

await step('staff cannot run the check', async () => {
  const staff = await browser.newPage();
  await staff.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await staff.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await staff.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await staff.getByRole('button', { name: 'Sign in' }).click();
  await staff.getByText('Not clocked in').waitFor({ timeout: 20000 });
  const status = await staff.evaluate(async (ids) => {
    const res = await fetch('/api/shifts/publish-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return res.status;
  }, draftIds);
  if (status !== 403) throw new Error(`staff were answered ${status}`);
});

cleanUp();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL PUBLISH-CHECK CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
