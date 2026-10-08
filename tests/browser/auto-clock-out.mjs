import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo } from './nav.mjs';

// Clocked out automatically at midnight (October 2026, Dominguez): a punch left
// open from an earlier day is closed at the midnight that ended it — with or
// without a shift — so nobody is stuck the next morning. It is a warning both
// ways: the person is told, and managers must correct the time before the
// hours can be approved.
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
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

/// The hour and minute of an instant in New Jersey, "00:00" for midnight.
const njClock = (iso) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

const ago = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();

// Frankie (Front Desk) on a phone; the admin on a laptop.
const staffCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const frankie = await staffCtx.newPage();
frankie.on('pageerror', (e) => errors.push(`staff pageerror: ${e.message}`));
await signIn(frankie, 'frontdesk@domihealthcare.com');

const adminCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const admin = await adminCtx.newPage();
admin.on('pageerror', (e) => errors.push(`admin pageerror: ${e.message}`));
await signIn(admin, 'admin@domihealthcare.com');

const locations = (await call(frankie, '/locations')).body;
const northBergen = locations.find((l) => l.name === 'North Bergen');

/// Frankie clocks in (from home, which needs no location), and the admin moves
/// the clock-in back to yesterday — the punch Frankie forgot to close.
async function forgottenPunch(hoursAgo) {
  const punched = await call(frankie, '/time-entries/clock-in', {
    method: 'POST',
    body: JSON.stringify({
      locationId: northBergen.id,
      method: 'WEB',
      workFromHome: true,
      otherPlaceReason: 'auto clock-out suite',
    }),
  });
  if (punched.status >= 400) throw new Error(`clock-in refused: ${JSON.stringify(punched.body)}`);
  const moved = await call(admin, `/time-entries/${punched.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ clockInAt: ago(hoursAgo), editReason: 'auto clock-out suite' }),
  });
  if (moved.status >= 400) throw new Error(`could not move the punch: ${JSON.stringify(moved.body)}`);
  return punched.body.id;
}

let entryId;
await step('a punch left open from yesterday is clocked out at that midnight by the timer', async () => {
  if (!SECRET) throw new Error('PUNCH_REMINDER_SECRET is not set for this run');
  entryId = await forgottenPunch(30);

  const run = await fetch(`${API}/maintenance/punch-reminders`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  }).then((r) => r.json());
  if (run.autoClockedOut < 1) throw new Error(`nothing was clocked out: ${JSON.stringify(run)}`);

  const entry = (await call(admin, `/time-entries/${entryId}`)).body;
  if (!entry.clockOutAt) throw new Error('still open');
  if (njClock(entry.clockOutAt) !== '00:00')
    throw new Error(`clocked out at ${njClock(entry.clockOutAt)} New Jersey time, not midnight`);
  const hours = (new Date(entry.clockOutAt) - new Date(entry.clockInAt)) / 3_600_000;
  if (hours <= 0 || hours > 24) throw new Error(`${hours} hours between clock-in and clock-out`);
  if (!entry.autoClockedOutAt || !entry.isMissingPunch)
    throw new Error(`not flagged: ${JSON.stringify({ a: entry.autoClockedOutAt, m: entry.isMissingPunch })}`);
});

await step('the person is told, and Home lets them clock in as usual', async () => {
  const inbox = (await call(frankie, '/notifications')).body;
  const told = inbox.items.filter((item) => item.title === 'You were clocked out automatically');
  if (told.length !== 1) throw new Error(`told ${told.length} times`);
  if (!/Tell your manager what time you finished/.test(told[0].body))
    throw new Error(`the notice says "${told[0].body}"`);
  await frankie.reload({ waitUntil: 'networkidle' });
  await frankie.getByText('Not clocked in').waitFor({ timeout: 15000 });
});

await step('managers are warned until it is corrected, and cannot approve it before', async () => {
  const attention = (await call(admin, '/attention')).body;
  const line = (attention.missingPunches ?? []).find((l) => /clocked out automatically at midnight/.test(l));
  if (!line) throw new Error(`not in the banner: ${JSON.stringify(attention.missingPunches)}`);

  const refused = await call(admin, `/time-entries/${entryId}/approve`, { method: 'PATCH' });
  if (refused.status !== 400) throw new Error(`approve answered ${refused.status}`);
  if (!/Correct the clock-out time/.test(JSON.stringify(refused.body)))
    throw new Error(`approve said ${JSON.stringify(refused.body)}`);

  await goTo(admin, 'Timesheet');
  await admin.getByText('Clocked out at midnight', { exact: true }).first().waitFor({ timeout: 15000 });
  await admin.getByText('Edit the time first').first().waitFor({ timeout: 5000 });
  await admin.getByText('Clock-outs to correct').first().waitFor({ timeout: 5000 });
  await admin.screenshot({ path: `${OUT}/auto-clock-out-timesheet.png`, fullPage: true });
});

await step('once a manager puts in the real time, the warning goes and it can be approved', async () => {
  const entry = (await call(admin, `/time-entries/${entryId}`)).body;
  const realFinish = new Date(new Date(entry.clockInAt).getTime() + 8 * 3_600_000).toISOString();
  const corrected = await call(admin, `/time-entries/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify({ clockOutAt: realFinish, editReason: 'Frankie left at 5' }),
  });
  if (corrected.status >= 400) throw new Error(`correction refused: ${JSON.stringify(corrected.body)}`);
  if (corrected.body.isMissingPunch) throw new Error('still a missing punch after the correction');

  const approved = await call(admin, `/time-entries/${entryId}/approve`, { method: 'PATCH' });
  if (approved.status >= 400) throw new Error(`approve refused: ${JSON.stringify(approved.body)}`);
  const attention = (await call(admin, '/attention')).body;
  if ((attention.missingPunches ?? []).some((l) => /clocked out automatically/.test(l)))
    throw new Error('still listed after the correction');
});

await step('with no timer at all, clocking in closes yesterday’s punch first', async () => {
  const stale = await forgottenPunch(28);
  const punched = await call(frankie, '/time-entries/clock-in', {
    method: 'POST',
    body: JSON.stringify({
      locationId: northBergen.id,
      method: 'WEB',
      workFromHome: true,
      otherPlaceReason: 'auto clock-out suite',
    }),
  });
  if (punched.status >= 400) throw new Error(`today's clock-in refused: ${JSON.stringify(punched.body)}`);
  const old = (await call(admin, `/time-entries/${stale}`)).body;
  if (njClock(old.clockOutAt) !== '00:00' || !old.autoClockedOutAt)
    throw new Error(`yesterday's punch was not closed at midnight: ${old.clockOutAt}`);
  // Leave Frankie off the clock.
  await call(frankie, '/time-entries/clock-out', { method: 'POST', body: JSON.stringify({}) });
});

await browser.close();
if (errors.length) {
  console.log(`\n${errors.length} failure(s)`);
  process.exit(1);
}
console.log('\nAll automatic clock-out checks passed.');
