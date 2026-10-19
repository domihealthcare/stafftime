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
 * "Approve the clean time off" (October 2026, Dominguez - a "smarter" idea):
 * one button approves every waiting request that is PTO or sick with enough
 * days left, leaves nobody too thin and lands on no shifts; the rest stay for
 * a look. Cleo and Cy (`*.clean@example.com`) join Frankie in her job roles at
 * North Bergen, so one of them off is not "too many"; run-all.sh removes them.
 */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const morgan = await ctx.newPage();
morgan.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await morgan.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await morgan.getByLabel('Email').fill('manager@domihealthcare.com');
await morgan.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await morgan.getByRole('button', { name: 'Sign in' }).click();
await morgan.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
const call = (path, init) =>
  morgan.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );

const ada = await browser.newContext().then((c) => c.newPage());
await ada.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await ada.getByLabel('Email').fill('admin@domihealthcare.com');
await ada.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await ada.getByRole('button', { name: 'Sign in' }).click();
await ada.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
const nb = (await call('/locations')).body.find((l) => l.name === 'North Bergen').id;
const roles = (await call('/job-roles')).body;
const roleIds = ['Front Desk', 'Medical Assistant'].map((name) => roles.find((r) => r.name === name).id);
const imported = await ada.evaluate(
  async (body) => {
    const r = await fetch('/api/employees/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  },
  {
    people: ['Cleo', 'Cy'].map((first) => ({
      firstName: first,
      lastName: 'Cover',
      email: `${first.toLowerCase()}.clean@example.com`,
      role: 'EMPLOYEE',
      payType: 'HOURLY',
      // Hired before 16 October 2026, so they have the year's sick days rather
      // than earning them by the hour (Practice settings' sick accrual start).
      hireDate: '2025-01-06',
      locationIds: [nb],
      primaryLocationId: nb,
      jobRoleIds: roleIds,
    })),
  },
);
if (imported.status !== 201) throw new Error(`could not add Cleo and Cy: ${JSON.stringify(imported.body)}`);
const [cleoId] = imported.body.ids;
const staff = (await call('/employees')).body;
const frankieId = staff.find((p) => p.email === 'frontdesk@domihealthcare.com').id;

const ask = async (employeeId, date, type = 'SICK') => {
  const made = await call('/pto', { method: 'POST', body: JSON.stringify({ employeeId, type, startDate: date, endDate: date }) });
  if (made.status !== 201) throw new Error(`asking answered ${made.status}: ${JSON.stringify(made.body)}`);
  return made.body.id;
};

let cleanId;
let shiftyId;
await step('a request with a shift in it is not clean; one with nothing to check is', async () => {
  cleanId = await ask(cleoId, '2027-03-03');
  // Frankie has a shift that day: "lands on shifts".
  await call('/shifts', {
    method: 'POST',
    body: JSON.stringify({ employeeId: frankieId, locationId: nb, startsAt: '2027-03-04T14:00:00.000Z', endsAt: '2027-03-04T22:00:00.000Z', status: 'PUBLISHED' }),
  });
  shiftyId = await ask(frankieId, '2027-03-04');
  const checked = (await call('/pto/clean')).body;
  const clean = checked.find((row) => row.id === cleanId);
  const shifty = checked.find((row) => row.id === shiftyId);
  if (!clean?.clean) throw new Error(`Cleo's: ${JSON.stringify(clean)}`);
  if (shifty?.clean || shifty?.why !== 'lands on shifts') throw new Error(`Frankie's: ${JSON.stringify(shifty)}`);
});

await step('Time off offers "Approve all 1 with nothing to check", asks, and approves only that', async () => {
  await morgan.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  const box = morgan.getByTestId('approve-clean-time-off');
  await box.getByRole('button', { name: 'Approve all 1 with nothing to check' }).click();
  await morgan.getByRole('alertdialog').getByRole('button', { name: 'Approve 1' }).click();
  await box.getByText('1 approved.').waitFor({ timeout: 10000 });
  const requests = (await call('/pto')).body;
  const status = (id) => requests.find((r) => r.id === id)?.status;
  if (status(cleanId) !== 'APPROVED') throw new Error(`Cleo's is ${status(cleanId)}`);
  if (status(shiftyId) !== 'PENDING') throw new Error(`Frankie's is ${status(shiftyId)}`);
  await morgan.screenshot({ path: `${OUT}/clean-time-off.png` });
});

await step('the server checks again: a request no longer clean is left', async () => {
  const done = await call('/pto/approve-clean', { method: 'POST', body: JSON.stringify({ ids: [shiftyId] }) });
  if (done.body.approved !== 0 || done.body.left[0] !== shiftyId) throw new Error(JSON.stringify(done.body));
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CLEAN TIME-OFF CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
