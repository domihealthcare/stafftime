import { chromium } from 'playwright';
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
 * The rota's cost (Dominguez, October 2026: "only for certain individuals",
 * hourly and salaried). An admin chooses who sees it in Practice settings;
 * they see it above the rota — totals by office and day, overtime at time
 * and a half, salaries a year ÷ 52 a week. Nobody else can read it.
 *
 * The shifts are in March 2027, which run-all.sh clears; pay goes in
 * `employment_changes`, which it clears too, and the list is reset.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
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

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const desk = await signIn('frontdesk@domihealthcare.com');
const WEEK = { from: '2027-03-07', to: '2027-03-13' };
let staff;

await step('nobody sees it until an admin chooses them', async () => {
  for (const page of [admin, manager, desk]) {
    const answer = await call(page, `/rota-cost?from=${WEEK.from}&to=${WEEK.to}`);
    if (answer.status !== 403) throw new Error(`answered ${answer.status}`);
  }
});

await step('set-up: pay on file — the front desk $20 an hour, the MA $52,000 a year', async () => {
  staff = (await call(admin, '/employees')).body;
  const byEmail = (email) => staff.find((person) => person.email === email);
  for (const [email, payRate, payUnit] of [
    ['frontdesk@domihealthcare.com', 20, 'HOURLY'],
    ['ma@domihealthcare.com', 52000, 'YEARLY'],
  ]) {
    const saved = await call(admin, `/staff-records/${byEmail(email).id}/changes`, {
      method: 'POST',
      body: JSON.stringify({ effectiveOn: '2026-01-01', kind: 'HIRED', payRate, payUnit }),
    });
    if (saved.status !== 201) throw new Error(`pay for ${email} answered ${saved.status}`);
  }
  // The front desk: Monday to Friday, nine hours a day — 45, so 5 over.
  const locations = (await call(manager, '/locations')).body;
  const northBergen = locations.find((l) => l.name === 'North Bergen');
  for (const day of ['08', '09', '10', '11', '12']) {
    const made = await call(manager, '/shifts', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: byEmail('frontdesk@domihealthcare.com').id,
        locationId: northBergen.id,
        startsAt: `2027-03-${day}T14:00:00.000Z`,
        endsAt: `2027-03-${day}T23:00:00.000Z`,
        status: 'DRAFT',
      }),
    });
    if (made.status !== 201) throw new Error(`a shift answered ${made.status}: ${JSON.stringify(made.body)}`);
  }
});

await step('an admin chooses the manager in Practice settings', async () => {
  await admin.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId('rota-cost-access');
  await card.getByText('Nobody yet.').waitFor();
  const mgr = staff.find((person) => person.email === 'manager@domihealthcare.com');
  const name = `${mgr.preferredName ?? mgr.firstName} ${mgr.lastName}`;
  await card.getByLabel('Show it to').selectOption({ label: name });
  await card.getByRole('button', { name: 'Add' }).click();
  await card.getByText(name).waitFor();
});

await step('the manager sees the week’s cost above the rota', async () => {
  await manager.goto(`${BASE}/schedule?week=${WEEK.from}`, { waitUntil: 'networkidle' });
  const card = manager.getByTestId('rota-cost');
  // 40 × $20 + 5 × $30 = $950, and a week of $52,000 a year = $1,000.
  await card.getByTestId('rota-cost-total').getByText('$1,950').waitFor({ timeout: 15000 });
  await card.locator('summary').click();
  await card.getByText('overtime extra (5 hours at time and a half)').waitFor();
  await card.getByText('$50').first().waitFor();
  await manager.screenshot({ path: `${OUT}/rota-cost.png`, fullPage: false });
});

await step('it follows the rota: a shift taken off changes the total', async () => {
  const shifts = (await call(manager, `/shifts?from=2027-03-12T00:00:00.000Z&to=2027-03-13T00:00:00.000Z`)).body;
  const friday = shifts.find((shift) => shift.startsAt.startsWith('2027-03-12'));
  const removed = await call(manager, `/shifts/${friday.id}`, { method: 'DELETE' });
  if (removed.status >= 300) throw new Error(`removing answered ${removed.status}`);
  const cost = await call(manager, `/rota-cost?from=${WEEK.from}&to=${WEEK.to}`);
  // 36 hours at $20 = $720, no overtime, and the salary.
  if (cost.body.total !== 1720 || cost.body.overtimeHours !== 0) {
    throw new Error(`total ${cost.body.total}, overtime ${cost.body.overtimeHours}`);
  }
});

await step('never by person: nothing in it names anybody’s pay', async () => {
  const cost = await call(manager, `/rota-cost?from=${WEEK.from}&to=${WEEK.to}`);
  const text = JSON.stringify(cost.body);
  if (/Frankie|Front-Desk|employeeId/.test(text)) throw new Error('a person is named in the cost');
});

await step('staff never see it', async () => {
  await desk.goto(`${BASE}/schedule?week=${WEEK.from}`, { waitUntil: 'networkidle' });
  if (await desk.getByTestId('rota-cost').count()) throw new Error('the card is on a staff Schedule');
  const list = await call(desk, '/rota-cost/access');
  if (list.status !== 403) throw new Error(`the list answered ${list.status}`);
});

await step('taken off the list, the manager no longer sees it', async () => {
  await admin.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId('rota-cost-access');
  await card.getByRole('button', { name: /Stop showing/ }).click();
  await admin.getByRole('button', { name: 'Yes, stop' }).click();
  await card.getByText('Nobody yet.').waitFor();
  const answer = await call(manager, `/rota-cost?from=${WEEK.from}&to=${WEEK.to}`);
  if (answer.status !== 403) throw new Error(`answered ${answer.status}`);
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL ROTA-COST CHECKS PASSED');
