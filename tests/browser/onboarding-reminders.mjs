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
 * Reminders to a new hire about their own onboarding tasks (Dominguez,
 * October 2026 — making the app smarter): due soon (today to two days ahead)
 * and overdue (up to two weeks), on the bell and by email, each said once for
 * a given due date, one message per person. Run by the nightly job and by the
 * five-minute timer; this suite uses the timer, as cron-job.org does.
 *
 * The checklists are written straight into the database, named
 * "Reminder-suite …", and run-all.sh removes them (tasks and reminders go
 * with them).
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
const cleanUp = () => sql(`delete from employee_checklists where name like 'Reminder-suite%'`);

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const inDays = (n) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/// A checklist started `startedDaysAgo` days ago, with the tasks given.
function checklist(email, name, startedDaysAgo, tasks) {
  const id = sql(`insert into employee_checklists (id, "employeeId", kind, name, "anchorDate", "createdAt", "updatedAt")
       select gen_random_uuid(), id, 'ONBOARDING', '${name}', '${inDays(-startedDaysAgo)}',
              now() - interval '${startedDaysAgo} days', now()
       from employees where email = '${email}' returning id`);
  tasks.forEach(([title, owner, dueInDays, status], position) =>
    sql(`insert into employee_checklist_tasks (id, "checklistId", position, title, owner, "dueAt", status, "updatedAt")
         values (gen_random_uuid(), '${id}', ${position}, '${title}', '${owner}', '${inDays(dueInDays)}', '${status}', now())`),
  );
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
      .filter((item) => item.kind === 'ONBOARDING_REMINDER')
      .map((item) => ({ title: item.title, body: item.body }));
  });

await step('set-up: Frankie three days into onboarding, Morgan starting today', async () => {
  cleanUp();
  checklist('frontdesk@domihealthcare.com', 'Reminder-suite onboarding', 3, [
    ['Reminder-suite handbook', 'EMPLOYEE', 1, 'PENDING'],
    ['Reminder-suite emergency contact', 'EMPLOYEE', -3, 'PENDING'],
    // Done, a manager's, or not due for a while: nothing said.
    ['Reminder-suite done already', 'EMPLOYEE', 0, 'DONE'],
    ['Reminder-suite W-4', 'ADMIN', 1, 'PENDING'],
    ['Reminder-suite HIPAA training', 'EMPLOYEE', 10, 'PENDING'],
  ]);
  // Started today: "your checklist has started" has just said it.
  checklist('manager@domihealthcare.com', 'Reminder-suite onboarding', 0, [
    ['Reminder-suite handbook', 'EMPLOYEE', 1, 'PENDING'],
  ]);
});

await step('the timer sends one message, and a second run sends nothing more', async () => {
  const first = await runTimer();
  if (first.status !== 200) throw new Error(`timer answered ${first.status}`);
  if (first.body.onboardingReminders !== 1)
    throw new Error(`first run told ${first.body.onboardingReminders} people`);
  const second = await runTimer();
  if (second.body.onboardingReminders !== 0)
    throw new Error(`second run told ${second.body.onboardingReminders}`);
});

const frankie = await signIn('frontdesk@domihealthcare.com');

await step('Frankie hears about both of theirs in one, overdue first — and nothing else', async () => {
  const got = await reminders(frankie);
  if (got.length !== 1) throw new Error(`Frankie was told: ${JSON.stringify(got)}`);
  const [{ title, body }] = got;
  if (title !== '2 of your onboarding tasks need doing') throw new Error(`title: ${title}`);
  if (!/^“Reminder-suite emergency contact” — was due .+; “Reminder-suite handbook” — due tomorrow\./.test(body))
    throw new Error(`body: ${body}`);
  if (/done already|W-4|HIPAA/.test(body)) throw new Error(`said too much: ${body}`);
});

await step('it is under the bell, and opens their onboarding checklist', async () => {
  await frankie.getByRole('button', { name: /^Notifications/ }).click();
  const panel = frankie.getByRole('dialog', { name: 'Notifications' });
  await panel.getByText('2 of your onboarding tasks need doing').waitFor({ timeout: 10000 });
  await frankie.screenshot({ path: `${OUT}/onboarding-reminder-bell.png` });
  await panel.getByText('2 of your onboarding tasks need doing').click();
  await frankie.waitForURL(/\/checklists/, { timeout: 10000 });
  await frankie.getByText('Reminder-suite handbook').first().waitFor({ timeout: 10000 });
});

await step('Morgan, whose checklist started today, hears nothing yet', async () => {
  const morgan = await signIn('manager@domihealthcare.com');
  const got = await reminders(morgan);
  if (got.length) throw new Error(`Morgan was told: ${JSON.stringify(got)}`);
});

await step('a new due date starts the reminders again', async () => {
  sql(`update employee_checklist_tasks set "dueAt" = '${inDays(2)}' where title = 'Reminder-suite emergency contact'`);
  const run = await runTimer();
  if (run.body.onboardingReminders !== 1) throw new Error(`told ${run.body.onboardingReminders}`);
  const titles = (await reminders(frankie)).map((r) => r.title);
  if (!titles.includes('Onboarding: “Reminder-suite emergency contact” is due in 2 days'))
    throw new Error(`Frankie was told: ${JSON.stringify(titles)}`);
});

cleanUp();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL ONBOARDING-REMINDER CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
