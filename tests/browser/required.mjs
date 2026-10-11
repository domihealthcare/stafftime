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
 * Required reading and tasks (Dominguez, October 2026: "something the
 * admin/managers can require for need to know information or required
 * tasks" — a nag, never a gate). A manager asks people to read and confirm
 * a News post, or to do something; they see it on Home and confirm; the
 * manager sees who has; reminders go out until they do.
 *
 * run-all.sh clears `requirements` (their targets, confirmations and
 * reminders go with them).
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

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // The MA is seeded with a temporary password, to be changed on first sign-in.
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
      const r = await fetch(`/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const inDays = (n) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const desk = await signIn('frontdesk@domihealthcare.com');
const ma = await signIn('ma@domihealthcare.com');

let post;
let frontDesk;

await step('set-up: a News post, and the Front Desk job role', async () => {
  const made = await call(admin, '/announcements', {
    method: 'POST',
    body: JSON.stringify({ title: 'Updated fire safety plan', body: 'Exits, extinguishers, the meeting point.' }),
  });
  if (made.status !== 201) throw new Error(`posting answered ${made.status}`);
  post = made.body;
  const roles = await call(manager, '/job-roles');
  frontDesk = roles.body.find((role) => role.name === 'Front Desk');
  if (!frontDesk) throw new Error('no Front Desk job role');
});

await step('“Require reading” on the post opens the form with it, and asks the Front Desk', async () => {
  await admin.goto(`${BASE}/news`, { waitUntil: 'networkidle' });
  await admin.getByTestId(`post-${post.id}`).getByRole('link', { name: 'Require reading' }).click();
  const form = admin.getByRole('form', { name: 'Ask people to read or do something' });
  await form.waitFor();
  if ((await form.getByLabel('Title').inputValue()) !== 'Updated fire safety plan') {
    throw new Error('the title did not start as the post’s');
  }
  if ((await form.getByLabel('A News post').inputValue()) !== post.id) {
    throw new Error('the post was not chosen');
  }
  // From Everyone to the Front Desk only.
  const who = form.getByLabel('Who is it for?');
  await who.press('Backspace');
  await who.fill('Front');
  await admin.getByRole('option', { name: /Front Desk/ }).first().click();
  await form.getByLabel('Due').fill(inDays(5));
  const saved = admin.waitForResponse((r) => r.url().endsWith('/api/requirements') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Ask them' }).click();
  const response = await saved;
  if (response.status() !== 201) throw new Error(`saving answered ${response.status()}`);
  await admin.getByText(/been told on the bell and by email/).waitFor();
  const card = admin.getByTestId('asked-Updated fire safety plan');
  await card.getByText('0 of 1').waitFor();
  await admin.screenshot({ path: `${OUT}/required-manager.png`, fullPage: true });
});

await step('the front desk is told, and it waits on Home; the MA has nothing', async () => {
  const bell = await call(desk, '/notifications');
  if (!bell.body.items.some((n) => n.kind === 'REQUIRED' && n.title.includes('Updated fire safety plan'))) {
    throw new Error('no bell notice for the front desk');
  }
  await desk.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await desk.getByTestId('home-required').getByText('Updated fire safety plan', { exact: true }).waitFor();
  await desk.getByTestId('home-required').getByRole('link', { name: 'Read the post →' }).waitFor();
  await desk.screenshot({ path: `${OUT}/required-home.png`, fullPage: true });
  await ma.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await ma.getByTestId('home-news').waitFor();
  if (await ma.getByTestId('home-required').count()) throw new Error('the MA was asked too');
});

await step('the front desk confirms on the post itself', async () => {
  await desk.goto(`${BASE}/news`, { waitUntil: 'networkidle' });
  const confirmBox = desk.getByTestId(`post-${post.id}`).getByTestId('post-confirm');
  await confirmBox.getByText('Please confirm you have read this').waitFor();
  await confirmBox.getByRole('button', { name: 'I’ve read it' }).click();
  await desk.getByTestId(`post-${post.id}`).getByText('You confirmed you read this').waitFor();
  await desk.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await desk.getByTestId('home-news').waitFor();
  if (await desk.getByTestId('home-required').count()) throw new Error('still on Home after confirming');
});

await step('the manager sees who has confirmed', async () => {
  await manager.goto(`${BASE}/required`, { waitUntil: 'networkidle' });
  const card = manager.getByTestId('asked-Updated fire safety plan');
  await card.getByText('1 of 1').waitFor();
  await card.getByRole('button', { name: 'Who has confirmed' }).click();
  await card.getByTestId('confirmed').getByText(/Front|Desk|Fran/).first().waitFor();
});

await step('a task for everyone, set from the form; the MA marks it done on Home', async () => {
  await manager.getByRole('button', { name: '+ Ask people to read or do something' }).click();
  const form = manager.getByRole('form', { name: 'Ask people to read or do something' });
  await form.getByLabel('Something to do').check();
  await form.getByLabel('Title').fill('Watch the HIPAA refresher');
  await form.getByLabel('A web link').fill('https://example.com/hipaa-video');
  await form.getByRole('button', { name: 'Ask them' }).click();
  await manager.getByText(/been told on the bell and by email/).waitFor();

  await ma.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const item = ma.getByTestId('home-required').getByTestId('required-Watch the HIPAA refresher');
  await item.getByRole('link', { name: 'Open the link ↗' }).waitFor();
  await item.getByRole('button', { name: 'Done' }).click();
  await ma.getByTestId('home-news').waitFor();
  await ma.waitForFunction(() => !document.querySelector('[data-testid="home-required"]'));
  const mine = await call(ma, '/requirements/mine');
  if (!mine.body.find((r) => r.title === 'Watch the HIPAA refresher')?.doneAt) {
    throw new Error('not recorded as done');
  }
});

await step('“Remind them now” reaches only those still to do it', async () => {
  await manager.goto(`${BASE}/required`, { waitUntil: 'networkidle' });
  const card = manager.getByTestId('asked-Watch the HIPAA refresher');
  await card.getByRole('button', { name: 'Remind them now' }).click();
  await manager.getByText(/Reminded \d+ (person|people), on the bell and by email/).waitFor();
  const bell = await call(ma, '/notifications');
  const reminders = bell.body.items.filter((n) => n.kind === 'REQUIRED' && n.title.startsWith('Still waiting'));
  if (reminders.length) throw new Error('the MA, who had done it, was reminded');
  const deskBell = await call(desk, '/notifications');
  if (!deskBell.body.items.some((n) => n.title.startsWith('Still waiting: “Watch the HIPAA refresher”'))) {
    throw new Error('the front desk, still to do it, was not reminded');
  }
});

await step('the five-minute timer reminds a week on, once', async () => {
  if (!SECRET) throw new Error('PUNCH_REMINDER_SECRET is not set for this suite');
  // Set eight days ago, and nobody reminded yet: a weekly reminder is due.
  sql(`update requirements set "createdAt" = now() - interval '8 days' where title = 'Watch the HIPAA refresher'`);
  sql(`delete from requirement_nudges`);
  sql(`delete from notifications`);
  const run = () =>
    fetch(`${API}/maintenance/punch-reminders`, { headers: { Authorization: `Bearer ${SECRET}` } }).then((r) => r.json());
  const first = await run();
  if (!(first.requiredReminders >= 1)) throw new Error(`first run reminded ${first.requiredReminders}`);
  const second = await run();
  if (second.requiredReminders !== 0) throw new Error(`second run reminded ${second.requiredReminders} again`);
  const deskBell = await call(desk, '/notifications');
  if (!deskBell.body.items.some((n) => n.kind === 'REQUIRED')) throw new Error('nothing on the front desk’s bell');
});

await step('a resource for another job role opens for somebody asked to read it', async () => {
  const roles = await call(manager, '/job-roles');
  const provider = roles.body.find((role) => role.name === 'Provider');
  const made = await call(manager, '/resources', {
    method: 'POST',
    body: JSON.stringify({ jobRoleId: provider.id, kind: 'PAGE', title: 'Exposure plan', body: 'What to do after a needlestick.' }),
  });
  if (made.status !== 201) throw new Error(`the resource answered ${made.status}`);
  const before = await call(ma, `/resources/${made.body.id}`);
  if (before.status !== 403) throw new Error(`before being asked the MA got ${before.status}`);
  const asked = await call(manager, '/requirements', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'READ',
      title: 'Read the exposure plan',
      resourceId: made.body.id,
      everyone: false,
      targets: { employeeIds: [(await call(ma, '/auth/me')).body.id] },
    }),
  });
  if (asked.status !== 201) throw new Error(`asking answered ${asked.status}: ${JSON.stringify(asked.body)}`);
  const after = await call(ma, `/resources/${made.body.id}`);
  if (after.status !== 200) throw new Error(`once asked the MA got ${after.status}`);
});

await step('staff cannot see or set what is asked of others', async () => {
  const list = await call(desk, '/requirements');
  if (list.status !== 403) throw new Error(`the list answered ${list.status}`);
  const set = await call(desk, '/requirements', {
    method: 'POST',
    body: JSON.stringify({ kind: 'TASK', title: 'Nope', everyone: true }),
  });
  if (set.status !== 403) throw new Error(`setting answered ${set.status}`);
});

await step('“Stop asking” takes it off Home', async () => {
  await manager.goto(`${BASE}/required`, { waitUntil: 'networkidle' });
  await manager.getByTestId('asked-Watch the HIPAA refresher').getByRole('button', { name: 'Stop asking' }).click();
  await manager.getByTestId('asked-Watch the HIPAA refresher').getByText(/Stopped/).waitFor();
  const mine = await call(desk, '/requirements/mine');
  if (mine.body.some((r) => r.title === 'Watch the HIPAA refresher')) throw new Error('still asked of the front desk');
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL REQUIRED-READING CHECKS PASSED');
