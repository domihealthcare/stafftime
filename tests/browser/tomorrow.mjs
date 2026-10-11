import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

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
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`);
    errors.push(`${name}: ${e.message}`);
  }
};

/**
 * "You're on tomorrow" (October 2026, Dominguez — "should be able to turn
 * off as a user"): from 6pm, everybody with a published shift tomorrow is
 * told on the bell and by email, once, unless they turned it off on Email
 * settings. The five-minute timer sends it, so this suite calls the timer.
 *
 * It only goes out in the evening: run then (6pm to midnight in New Jersey),
 * the suite checks it arrives, once; at other hours, that nothing goes early.
 * The switch is checked at any hour. The shift is noted 'tomorrow-suite',
 * which run-all.sh clears.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
  return page;
}
const call = (page, path, init) =>
  page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );
const runTimer = () =>
  fetch(`${API}/maintenance/punch-reminders`, { headers: { Authorization: `Bearer ${SECRET}` } }).then(
    (r) => r.json(),
  );
const told = async (page) =>
  (await call(page, '/notifications')).body.items.filter((n) => n.kind === 'SHIFT_TOMORROW');

const njParts = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date())
    .map((part) => [part.type, part.value]),
);
const evening = Number(njParts.hour) >= 18;
const today = `${njParts.year}-${njParts.month}-${njParts.day}`;
const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/// New Jersey's offset tomorrow, "-04:00" or "-05:00".
const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })
  .formatToParts(new Date(`${tomorrow}T16:00:00Z`))
  .find((part) => part.type === 'timeZoneName')
  .value.replace('GMT', '');

const morgan = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
const staff = (await call(morgan, '/employees')).body;
const frankieId = staff.find((p) => p.email === 'frontdesk@domihealthcare.com').id;
const nb = (await call(morgan, '/locations')).body.find((l) => l.name === 'North Bergen').id;

await step('Email settings has "You’re on tomorrow", on to start with, and Frankie turns it off', async () => {
  await frankie.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
  const card = frankie.getByTestId('shift-reminders');
  const toggle = card.getByRole('switch', { name: "You're on tomorrow" });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') throw new Error('not on to start with');
  await toggle.click();
  await card.getByText('Off. Your shifts are still on your Schedule').waitFor({ timeout: 10000 });
  await frankie.reload({ waitUntil: 'networkidle' });
  if ((await toggle.getAttribute('aria-checked')) !== 'false') throw new Error('did not stay off');
});

await step('turned off, a shift tomorrow brings nothing', async () => {
  // Tomorrow 9 to 5 in New Jersey.
  const made = await call(morgan, '/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: frankieId,
      locationId: nb,
      startsAt: new Date(`${tomorrow}T09:00:00${offset}`).toISOString(),
      endsAt: new Date(`${tomorrow}T17:00:00${offset}`).toISOString(),
      status: 'PUBLISHED',
      notes: 'tomorrow-suite',
    }),
  });
  if (made.status !== 201) throw new Error(`making the shift answered ${made.status}: ${JSON.stringify(made.body)}`);
  await runTimer();
  if ((await told(frankie)).length !== 0) throw new Error('told while turned off');
});

await step(
  evening
    ? 'turned back on, in the evening: told once, with the hours, the office and the note'
    : 'turned back on, before 6pm: nothing goes out early',
  async () => {
    await frankie.getByTestId('shift-reminders').getByRole('switch').click();
    await frankie.getByText('Off. Your shifts are still on your Schedule').waitFor({ state: 'detached', timeout: 10000 });
    const first = await runTimer();
    await runTimer();
    const notes = await told(frankie);
    if (!evening) {
      if (notes.length !== 0 || first.tomorrowReminders !== 0) throw new Error('sent before 6pm');
      return;
    }
    if (notes.length !== 1) throw new Error(`told ${notes.length} times`);
    if (notes[0].title !== "You're on tomorrow, 9:00 AM–5:00 PM at North Bergen") throw new Error(`title: ${notes[0].title}`);
    if (!notes[0].body.includes('Note: tomorrow-suite')) throw new Error(`body: ${notes[0].body}`);
    if (notes[0].link !== `/schedule?week=${tomorrow}`) throw new Error(`link: ${notes[0].link}`);
  },
);

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL TOMORROW CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
