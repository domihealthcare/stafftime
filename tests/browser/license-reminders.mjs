import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
// Straight to the API, as the outside timer calls it.
const API = process.env.API_URL || 'http://127.0.0.1:3000/api';
const SECRET = process.env.PUNCH_REMINDER_SECRET;
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
 * Reminders to the person whose license runs out (Dominguez, October 2026 —
 * making the app smarter): at 60 days, at 30 days and once lapsed, on the bell
 * and by email, each said once for a given expiry date. Run by the nightly job
 * and by the five-minute timer; this suite uses the timer, as cron-job.org does.
 *
 * The credentials are written straight into the database, named
 * "Reminder-suite …", and run-all.sh removes them (their reminders go with
 * them).
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
const cleanUp = () => sql(`delete from employee_credentials where name like 'Reminder-suite%'`);

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const inDays = (n) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function credential(email, name, expiresInDays) {
  sql(`insert into employee_credentials (id, "employeeId", kind, name, "expiresOn", "updatedAt")
       select gen_random_uuid(), id, 'LIFE_SUPPORT', '${name}', '${inDays(expiresInDays)}', now()
       from employees where email = '${email}'`);
}

const runTimer = () =>
  fetch(`${API}/maintenance/punch-reminders`, { headers: { Authorization: `Bearer ${SECRET}` } }).then(
    async (r) => ({ status: r.status, body: await r.json() }),
  );

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}
const reminders = (page) =>
  page.evaluate(async () => {
    const inbox = await (await fetch('/api/notifications')).json();
    return inbox.items
      .filter((item) => item.kind === 'LICENSE_REMINDER')
      .map((item) => item.title)
      .sort();
  });

await step('set-up: one due in 10 days, one lapsed, one renewed, one far off', async () => {
  cleanUp();
  credential('frontdesk@domihealthcare.com', 'Reminder-suite BLS', 10);
  // Renewed: the old card beside the new one says nothing.
  credential('frontdesk@domihealthcare.com', 'Reminder-suite CPR', 20);
  credential('frontdesk@domihealthcare.com', 'Reminder-suite CPR', 1000);
  credential('frontdesk@domihealthcare.com', 'Reminder-suite PALS', 200);
  credential('manager@domihealthcare.com', 'Reminder-suite ACLS', -5);
});

await step('the timer sends them, and a second run sends nothing more', async () => {
  const first = await runTimer();
  if (first.status !== 200) throw new Error(`timer answered ${first.status}`);
  if (first.body.licenseReminders !== 2) throw new Error(`first run sent ${first.body.licenseReminders}`);
  const second = await runTimer();
  if (second.body.licenseReminders !== 0) throw new Error(`second run sent ${second.body.licenseReminders}`);
});

const frankie = await signIn('frontdesk@domihealthcare.com');

await step('Frankie hears about the one due in 10 days, and only that one', async () => {
  const titles = await reminders(frankie);
  if (JSON.stringify(titles) !== JSON.stringify(['Your Reminder-suite BLS expires in 10 days']))
    throw new Error(`Frankie was told: ${JSON.stringify(titles)}`);
});

await step('it is under the bell, and opens the Licenses screen', async () => {
  await frankie.getByRole('button', { name: /^Notifications/ }).click();
  const panel = frankie.getByRole('dialog', { name: 'Notifications' });
  await panel.getByText('Your Reminder-suite BLS expires in 10 days').waitFor({ timeout: 10000 });
  await frankie.screenshot({ path: `${OUT}/license-reminder-bell.png` });
  await panel.getByText('Your Reminder-suite BLS expires in 10 days').click();
  await frankie.waitForURL(/\/credentials/, { timeout: 10000 });
  await frankie.getByText('Reminder-suite BLS').first().waitFor({ timeout: 10000 });
});

await step('Morgan hears that theirs has expired', async () => {
  const morgan = await signIn('manager@domihealthcare.com');
  const titles = await reminders(morgan);
  if (!titles.includes('Your Reminder-suite ACLS has expired'))
    throw new Error(`Morgan was told: ${JSON.stringify(titles)}`);
});

await step('a new expiry date starts the reminders again', async () => {
  sql(`update employee_credentials set "expiresOn" = '${inDays(55)}' where name = 'Reminder-suite BLS'`);
  const run = await runTimer();
  if (run.body.licenseReminders !== 1) throw new Error(`sent ${run.body.licenseReminders}`);
  const titles = await reminders(frankie);
  if (!titles.includes('Your Reminder-suite BLS expires in 55 days'))
    throw new Error(`Frankie was told: ${JSON.stringify(titles)}`);
});

cleanUp();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL LICENSE-REMINDER CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
