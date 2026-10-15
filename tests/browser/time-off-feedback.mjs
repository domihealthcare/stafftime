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
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};
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

/**
 * Time off, from staff feedback (October 2026, Dominguez):
 * - weekends don't count, nor a weekday the office is closed all day
 *   ("Ivanna … Wednesday 10/21 to 10/28 … should only be 6 PTO working days");
 * - asking for more than is left is allowed once the person ticks that they
 *   understand it may be unpaid, and whoever decides sees that;
 * - sick days are never cut down for starting part-way through the year, and
 *   hourly staff starting from the practice's date earn them as they work;
 * - a pop-up at the start of each month with what is left.
 *
 * Seeded people: Frankie (Front Desk and MA, North Bergen), Max (MA, West
 * New York, temporary password). Requests here are cleared by run-all.sh.
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
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

const iso = (d) => d.toISOString().slice(0, 10);
const plusDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
// A Wednesday at least three weeks ahead, and the Wednesday after: 6 weekdays.
const WED = (() => {
  const d = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 21);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d;
})();
const NEXT_WED = plusDays(WED, 7);
const FRIDAY = plusDays(WED, 2);

async function api(page, path, options = {}) {
  return page.evaluate(
    async ({ path, options }) => {
      const r = await fetch(`/api${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, options },
  );
}

const frankie = await signIn('frontdesk@domihealthcare.com');

await step('Wednesday to Wednesday is 6 days: the weekend does not count', async () => {
  await frankie.goto(`${BASE}/time-off?request=1`, { waitUntil: 'networkidle' });
  await frankie.getByLabel('Type').selectOption('VACATION');
  await frankie.getByLabel('First day').fill(iso(WED));
  await frankie.getByLabel('Last day').fill(iso(NEXT_WED));
  const days = frankie.getByTestId('time-off-days');
  await days.getByText(/^6 days \(weekends don’t count\)/).waitFor({ timeout: 10000 });
});

await step('a weekday the office is closed all day does not count either', async () => {
  const admin = await signIn('admin@domihealthcare.com');
  const made = await api(admin, '/events', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'CLOSURE',
      title: 'Time-off suite closure',
      allDay: true,
      startDate: iso(FRIDAY),
      endDate: iso(FRIDAY),
      audience: 'EVERYONE',
    }),
  });
  if (made.status !== 201) throw new Error(`closure: ${made.status} ${JSON.stringify(made.body)}`);
  await admin.context().close();
  // Ask again: the form reads it on every change.
  await frankie.getByLabel('Last day').fill(iso(plusDays(NEXT_WED, -1)));
  await frankie.getByLabel('Last day').fill(iso(NEXT_WED));
  await frankie
    .getByTestId('time-off-days')
    .getByText(/^5 days \(weekends don’t count; .+: office closed\)/)
    .waitFor({ timeout: 10000 });
  await frankie.screenshot({ path: `${OUT}/time-off-weekdays.png`, fullPage: true });
});

await step('it is sent and counted as 5 days', async () => {
  const sent = frankie.waitForResponse((r) => r.url().endsWith('/api/pto') && r.request().method() === 'POST');
  await frankie.getByRole('button', { name: 'Send request' }).click();
  const response = await sent;
  if (response.status() !== 201) throw new Error(`answered ${response.status()}: ${await response.text()}`);
  const body = await response.json();
  if (body.days !== 5) throw new Error(`counted ${body.days} days`);
  if (body.pastBalance) throw new Error('marked past the balance');
});

await step('more than is left needs a tick that it may be unpaid, and the manager sees it', async () => {
  await frankie.goto(`${BASE}/time-off?request=1`, { waitUntil: 'networkidle' });
  await frankie.getByLabel('Type').selectOption('SICK');
  // Two weeks of sick days, more than the 5 a year.
  await frankie.getByLabel('First day').fill(iso(plusDays(NEXT_WED, 5)));
  await frankie.getByLabel('Last day').fill(iso(plusDays(NEXT_WED, 18)));
  const warning = frankie.getByTestId('past-balance');
  await warning.getByText(/sick days left — this asks for 10 days/).waitFor({ timeout: 10000 });
  const send = frankie.getByRole('button', { name: 'Send request' });
  if (await send.isEnabled()) throw new Error('it could be sent without the tick');

  // The server refuses it without the tick too.
  const refused = await api(frankie, '/pto', {
    method: 'POST',
    body: JSON.stringify({
      type: 'SICK',
      startDate: iso(plusDays(NEXT_WED, 5)),
      endDate: iso(plusDays(NEXT_WED, 18)),
    }),
  });
  if (refused.status !== 400 || !/may be unpaid/.test(JSON.stringify(refused.body))) {
    throw new Error(`without the tick: ${refused.status} ${JSON.stringify(refused.body)}`);
  }

  await warning.getByRole('checkbox').check();
  const sent = frankie.waitForResponse((r) => r.url().endsWith('/api/pto') && r.request().method() === 'POST');
  await send.click();
  const response = await sent;
  if (response.status() !== 201) throw new Error(`answered ${response.status()}`);
  if (!(await response.json()).pastBalance) throw new Error('not marked past the balance');

  const manager = await signIn('manager@domihealthcare.com');
  await manager.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  await manager.getByTestId('past-balance-flag').first().waitFor({ timeout: 10000 });
  await manager.screenshot({ path: `${OUT}/time-off-past-balance.png`, fullPage: true });
  await manager.context().close();
});

const max = await signIn('ma@domihealthcare.com');
const maxId = sql("select id from employees where email = 'ma@domihealthcare.com'");

await step('sick days are not cut down for starting part-way through the year', async () => {
  const year = new Date().getFullYear();
  sql(`update employees set "hireDate" = '${year}-08-01', "payType" = 'SALARY' where id = '${maxId}'`);
  const { body } = await api(max, '/pto/balance');
  if (body.sick.entitled !== 5) throw new Error(`sick: ${JSON.stringify(body.sick)}`);
  if (!(body.vacation.entitled < 15)) throw new Error(`PTO not prorated: ${body.vacation.entitled}`);
});

await step('a new hourly hire earns sick time as they work: 95 hours is 3 hours, 0.4 of a day', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const admin = await signIn('admin@domihealthcare.com');
  const policy = await api(admin, '/pto/policy', {
    method: 'PATCH',
    body: JSON.stringify({ sickAccrualFrom: today }),
  });
  if (policy.status !== 200) throw new Error(`policy: ${policy.status} ${JSON.stringify(policy.body)}`);
  await admin.context().close();
  sql(`update employees set "hireDate" = '${today}', "payType" = 'HOURLY' where id = '${maxId}'`);
  const location = sql("select id from locations where slug = 'west-new-york'");
  // 95 hours over today's first hours, as finished punches.
  sql(
    `insert into time_entries (id, "employeeId", "locationId", method, status, "clockInAt", "clockOutAt", "clockInVerification", "editReason", "updatedAt")
     select gen_random_uuid(), '${maxId}', '${location}', 'WEB', 'COMPLETED',
       now() - interval '5 days' + (n || ' hours')::interval * 20,
       now() - interval '5 days' + (n || ' hours')::interval * 20 + interval '19 hours',
       'GEOFENCE', 'time-off-feedback-suite', now()
     from generate_series(0, 4) as n`,
  );
  const { body } = await api(max, '/pto/balance');
  if (body.sick.entitled !== 0.4 || body.sick.accrual?.hoursEarned !== 3) {
    throw new Error(`sick: ${JSON.stringify(body.sick)}`);
  }
  await max.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  await max.getByTestId('sick-accrual').getByText(/95 hours worked so far/).waitFor({ timeout: 10000 });
});

await step('the start of a month brings a pop-up with what is left, once', async () => {
  // Added to the app before this month, and not seen it yet.
  sql(
    `update employees set "createdAt" = now() - interval '60 days', "balanceReminderMonth" = null
     where email = 'frontdesk@domihealthcare.com'`,
  );
  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const popup = frankie.getByTestId('month-balance');
  await popup.getByText('Your time off this month').waitFor({ timeout: 10000 });
  await popup.getByTestId('month-balance-PTO').getByText('days left').waitFor();
  await frankie.screenshot({ path: `${OUT}/time-off-month-popup.png`, fullPage: true });
  const seen = frankie.waitForResponse((r) => r.url().endsWith('/month-reminder/seen'));
  await popup.getByRole('button', { name: 'Got it' }).click();
  await seen;
  await frankie.reload({ waitUntil: 'networkidle' });
  await frankie.waitForTimeout(1500);
  if (await frankie.getByTestId('month-balance').count()) throw new Error('it came back the same month');
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL TIME-OFF FEEDBACK CHECKS PASSED');
