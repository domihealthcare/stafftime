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
 * "Your week" (October 2026, Dominguez - a "smarter" idea, with an off switch
 * like "You're on tomorrow"): on Sunday from 6pm, last week's hours and this
 * week's shifts. Run on a Sunday evening in New Jersey, the suite checks it
 * arrives, once; at any other time, that the timer sends nothing. The switch
 * is checked at any hour.
 */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const frankie = await ctx.newPage();
frankie.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await frankie.getByLabel('Email').fill('frontdesk@domihealthcare.com');
await frankie.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await frankie.getByRole('button', { name: 'Sign in' }).click();
await frankie.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
const call = (path) =>
  frankie.evaluate(async (path) => (await fetch(`/api${path}`)).json(), path);
const runTimer = () =>
  fetch(`${API}/maintenance/punch-reminders`, { headers: { Authorization: `Bearer ${SECRET}` } }).then((r) => r.json());

const nj = Object.fromEntries(
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date())
    .map((part) => [part.type, part.value]),
);
const sundayEvening = nj.weekday === 'Sun' && Number(nj.hour) >= 18;

await step('Email settings has "Your week", on to start with; turned off it stays off', async () => {
  await frankie.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
  const card = frankie.getByTestId('weekly-summary');
  const toggle = card.getByRole('switch', { name: 'Your week' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') throw new Error('not on to start with');
  // The switch flips on screen before the save is done; reloading before it
  // is done brought the old value back (CI, October 2026). Wait for the save.
  const saved = frankie.waitForResponse(
    (r) => r.url().includes('/api/auth/preferences') && r.request().method() !== 'GET',
  );
  await toggle.click();
  if (!(await saved).ok()) throw new Error('the save failed');
  await card.getByText('Off. Your hours are on your Timesheet').waitFor({ timeout: 10000 });
  await frankie.reload({ waitUntil: 'networkidle' });
  if ((await toggle.getAttribute('aria-checked')) !== 'false') throw new Error('did not stay off');
  await toggle.click();
  await card.getByText('Off. Your hours are on your Timesheet').waitFor({ state: 'detached', timeout: 10000 });
});

await step(
  sundayEvening ? 'on a Sunday evening, it arrives once' : 'outside Sunday evening, the timer sends nothing',
  async () => {
    const first = await runTimer();
    await runTimer();
    const told = (await call('/notifications')).items.filter((n) => n.kind === 'WEEKLY_SUMMARY');
    if (!sundayEvening) {
      if (first.weeklySummaries !== 0 || told.length !== 0) throw new Error('sent outside Sunday evening');
      return;
    }
    if (told.length !== 1 || !told[0].title.startsWith('Your week:')) throw new Error(JSON.stringify(told));
  },
);

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL YOUR-WEEK CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
