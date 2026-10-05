import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

// Reminders to the person themselves (October 2026, Dominguez): "You haven't
// clocked in yet" 15 minutes into a published shift with no punch, and
// "You're still clocked in" 15 minutes after it ends — under the bell and by
// email, once each. Run by an outside timer calling the API with its own
// secret, which is what this suite does too.
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
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
}

/// Calls the API as whoever the page is signed in as.
const call = (page, path, init = {}) =>
  page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(`/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { path, init },
  );

/// What the outside timer does every few minutes. `null`: no secret at all.
const runReminders = (secret = SECRET) =>
  fetch(`${API}/maintenance/punch-reminders`, {
    headers: secret === null ? {} : { Authorization: `Bearer ${secret}` },
  });

const reminders = async (page, title) => {
  const inbox = await call(page, '/notifications');
  return inbox.body.items.filter((item) => item.kind === 'PUNCH_REMINDER' && item.title === title);
};

// Morgan (a manager who also works shifts) on a laptop.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const morgan = await ctx.newPage();
morgan.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(morgan, 'manager@domihealthcare.com');

// The admin, to correct Morgan's punch — nobody can change their own.
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const admin = await adminCtx.newPage();
await signIn(admin, 'admin@domihealthcare.com');

const minutesFromNow = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();

// A published work-from-home shift that started 20 minutes ago, so Morgan can
// clock in from here without a location. Tagged for run-all.sh to clear.
const northBergen = (await call(morgan, '/locations')).body.find((l) => l.name === 'North Bergen');
const shift = await call(morgan, '/profile').then(async (me) => {
  const made = await call(morgan, '/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: me.body.id,
      locationId: northBergen.id,
      startsAt: minutesFromNow(-20),
      endsAt: minutesFromNow(180),
      isRemote: true,
      status: 'PUBLISHED',
      notes: 'punch-reminder-suite',
    }),
  });
  if (made.status >= 400) throw new Error(`could not make the shift: ${JSON.stringify(made.body)}`);
  return made.body;
});

await step('the reminders route refuses without its secret', async () => {
  if (!SECRET) throw new Error('PUNCH_REMINDER_SECRET is not set for this run');
  // Nor does the nightly job's secret open it.
  const cron = process.env.CRON_SECRET ? [process.env.CRON_SECRET] : [];
  for (const offered of [null, 'not-the-secret-at-all', ...cron]) {
    const response = await runReminders(offered);
    if (response.status !== 403) throw new Error(`answered ${response.status} to ${offered ?? 'no secret'}`);
  }
});

await step('15 minutes into a shift with no punch, the person is told once', async () => {
  const first = await runReminders();
  if (!first.ok) throw new Error(`the route answered ${first.status}`);
  const report = await first.json();
  if (report.clockIn < 1) throw new Error(`nobody was reminded: ${JSON.stringify(report)}`);

  const second = await runReminders().then((r) => r.json());
  const told = await reminders(morgan, "You haven't clocked in yet");
  if (told.length !== 1) throw new Error(`told ${told.length} times (second run: ${JSON.stringify(second)})`);
  if (!/Your work-from-home shift started at \d{1,2}:\d{2}\s?[AP]M/.test(told[0].body))
    throw new Error(`the reminder says "${told[0].body}"`);
});

await step('the reminder is on the bell, and leads Home', async () => {
  await morgan.reload({ waitUntil: 'networkidle' });
  await morgan.getByRole('button', { name: /^Notifications/ }).click();
  const panel = morgan.getByRole('dialog', { name: 'Notifications' });
  await panel.getByText("You haven't clocked in yet").waitFor({ timeout: 10000 });
  await morgan.screenshot({ path: `${OUT}/punch-reminder-bell.png` });
  await morgan.keyboard.press('Escape');
});

await step('it went by email too', async () => {
  if (!process.env.API_LOG) return; // only where the server log is to hand
  const log = readFileSync(process.env.API_LOG, 'utf8');
  if (!/Subject: (\[Test\] )?You haven't clocked in yet/.test(log))
    throw new Error('no email in the server log');
});

let punchId;
await step('once clocked in, nothing more is said while the shift is on', async () => {
  const punched = await call(morgan, '/time-entries/clock-in', {
    method: 'POST',
    body: JSON.stringify({ locationId: northBergen.id, method: 'WEB', workFromHome: true }),
  });
  if (punched.status >= 400) throw new Error(`clock-in refused: ${JSON.stringify(punched.body)}`);
  punchId = punched.body.id;
  const report = await runReminders().then((r) => r.json());
  if ((await reminders(morgan, "You're still clocked in")).length > 0)
    throw new Error(`told to clock out during the shift: ${JSON.stringify(report)}`);
});

await step('15 minutes after the shift ends, still clocked in, the person is told once', async () => {
  // Clocked in at the start of a shift that ended 16 minutes ago.
  const corrected = await call(admin, `/time-entries/${punchId}`, {
    method: 'PATCH',
    body: JSON.stringify({ clockInAt: minutesFromNow(-58), editReason: 'punch reminder suite' }),
  });
  if (corrected.status >= 400) throw new Error(`could not correct the punch: ${JSON.stringify(corrected.body)}`);
  const moved = await call(morgan, `/shifts/${shift.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ startsAt: minutesFromNow(-60), endsAt: minutesFromNow(-16) }),
  });
  if (moved.status >= 400) throw new Error(`could not move the shift: ${JSON.stringify(moved.body)}`);
  await runReminders();
  await runReminders();
  const told = await reminders(morgan, "You're still clocked in");
  if (told.length !== 1) throw new Error(`told ${told.length} times`);
  if (!/Your work-from-home shift ended at/.test(told[0].body))
    throw new Error(`the reminder says "${told[0].body}"`);
});

// Leave Morgan off the clock and the shift gone.
await call(morgan, '/time-entries/clock-out', { method: 'POST', body: JSON.stringify({}) });
await call(morgan, `/shifts/${shift.id}`, { method: 'DELETE' });

await browser.close();
if (errors.length) {
  console.log(`\n${errors.length} failure(s)`);
  process.exit(1);
}
console.log('\nAll punch reminder checks passed.');
