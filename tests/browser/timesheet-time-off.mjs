import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/**
 * Days off on the Timesheet (2 November 2026, Dominguez, from Selena's
 * timesheet: "Please ... note PTO/SICK when searching through timesheets ...
 * 10/27 is missing but she took a pto day this day. I still need to alter it
 * bc this is unpaid as she has no days left"):
 * - a day of time off is a line among the punches, with its kind;
 * - it adds no hours;
 * - a manager edits it from there (PTO to Unpaid, with a note);
 * - staff see their own, and cannot edit it.
 *
 * Seeded: Frankie (front desk), Morgan (manager), Ada (admin). run-all.sh
 * clears time off.
 */
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

async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
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

/// Today on New Jersey's calendar, and a day some days from it.
function njDay(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date(),
  );
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

// Last week runs Sunday to Saturday; its Tuesday is a weekday, in the past.
const weekday = new Date(`${njDay()}T12:00:00Z`).getUTCDay();
const lastTuesday = njDay(-weekday - 5);

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const frankiePage = await signIn('frontdesk@domihealthcare.com', { width: 390, height: 844 });
const frankie = (await call(frankiePage, '/auth/me')).body;

let requestId;
await step('set-up: a PTO day Frankie already took, last Tuesday', async () => {
  const made = await call(admin, '/pto/record', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: frankie.id,
      type: 'VACATION',
      startDate: lastTuesday,
      endDate: lastTuesday,
      comment: 'timesheet-time-off suite',
    }),
  });
  if (made.status >= 400) throw new Error(`record: ${JSON.stringify(made.body)}`);
  requestId = made.body.id;
});

await step('on the Timesheet it is a line among the punches, as PTO, with no hours', async () => {
  await manager.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: 'Last week', exact: true }).click();
  await manager.getByLabel('Search employees').fill('Frankie');
  const row = manager.locator('tr[data-testid="timesheet-time-off"]');
  await row.waitFor({ timeout: 15000 });
  const text = await row.textContent();
  for (const want of ['Frankie', 'Day off', 'PTO']) {
    if (!text.includes(want)) throw new Error(`the line says "${text}", not ${want}`);
  }
  await manager.getByText(/1 day off/).waitFor({ timeout: 5000 });
  await manager.screenshot({ path: `${OUT}/timesheet-time-off.png`, fullPage: true });
});

await step('the Day filter offers that day, and narrows to it', async () => {
  const value = await manager
    .getByLabel('Day', { exact: true })
    .locator('option')
    .evaluateAll((options, day) => options.find((o) => o.value === day)?.value, lastTuesday);
  if (value !== lastTuesday) throw new Error(`no ${lastTuesday} in the Day filter`);
  await manager.getByLabel('Day', { exact: true }).selectOption(lastTuesday);
  await manager.locator('tr[data-testid="timesheet-time-off"]').waitFor({ timeout: 5000 });
  await manager.getByLabel('Day', { exact: true }).selectOption('');
});

await step('a manager changes it to Unpaid from there, with a note', async () => {
  const row = manager.locator('tr[data-testid="timesheet-time-off"]');
  await row.getByRole('button', { name: /^Edit this time off/ }).click();
  const dialog = manager.getByTestId('edit-time-off');
  await dialog.waitFor({ timeout: 10000 });
  await dialog.getByLabel('Kind').selectOption('UNPAID');
  await dialog.getByLabel(/Note/).fill('No PTO left, so unpaid.');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
  await row.getByText('Unpaid', { exact: true }).waitFor({ timeout: 10000 });
  const saved = (await call(manager, `/pto/${requestId}`)).body;
  if (saved.type !== 'UNPAID') throw new Error(`saved as ${saved.type}`);
  await manager.getByTestId('time-off-changes').first().waitFor({ timeout: 5000 });
});

await step('Frankie sees it on her own Timesheet, on a phone, and cannot edit it', async () => {
  await frankiePage.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  await frankiePage.getByRole('button', { name: 'Last week', exact: true }).click();
  const card = frankiePage.locator('li[data-testid="timesheet-time-off"]');
  await card.waitFor({ timeout: 15000 });
  if (!(await card.textContent()).includes('Unpaid')) throw new Error('not shown as Unpaid');
  if (await card.getByRole('button', { name: /^Edit/ }).count()) throw new Error('staff can edit');
  const wide = await frankiePage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (wide) throw new Error('scrolls sideways');
});

await step("staff are kept to their own days off, whoever they ask about", async () => {
  const morgan = (await call(manager, '/auth/me')).body;
  const asked = await call(
    frankiePage,
    `/pto/days?from=${njDay(-30)}&to=${njDay()}&employeeId=${morgan.id}`,
  );
  if (asked.status !== 200) throw new Error(`answered ${asked.status}`);
  if (asked.body.requests.some((r) => r.employeeId !== frankie.id))
    throw new Error("another person's time off came back");
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL TIMESHEET TIME OFF CHECKS PASSED');
