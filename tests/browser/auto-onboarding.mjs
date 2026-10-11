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
 * Onboarding starts by itself (October 2026, Dominguez — a "smarter" idea):
 * somebody new added with a hire date has the default onboarding checklist
 * started for them, counting from that date. Not somebody hired long ago,
 * and never a second one. The people here are `*.onboard@example.com`, which
 * run-all.sh removes between suites.
 */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const ada = await ctx.newPage();
ada.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await ada.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await ada.getByLabel('Email').fill('admin@domihealthcare.com');
await ada.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await ada.getByRole('button', { name: 'Sign in' }).click();
await ada.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });

const call = (path, init) =>
  ada.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );
const onboardingOf = async (email) => {
  const staff = (await call('/employees')).body;
  const person = staff.find((p) => p.email === email);
  if (!person) throw new Error(`${email} was not added`);
  const lists = (await call(`/checklists?employeeId=${person.id}&kind=ONBOARDING&state=all`)).body;
  return { person, lists };
};
const places = (await call('/locations')).body;
const nb = places.find((l) => l.name === 'North Bergen').id;

await step('adding somebody new from the Staff screen starts their onboarding, and says so', async () => {
  await ada.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await ada.getByRole('button', { name: '+ Add someone' }).click();
  await ada.getByLabel('First name').fill('Nina');
  await ada.getByLabel('Last name').fill('Newhire');
  await ada.getByLabel('Email').fill('nina.onboard@example.com');
  await ada.getByRole('checkbox', { name: 'North Bergen' }).check();
  await ada.getByRole('button', { name: 'Add to staff' }).click();
  await ada.getByTestId('staff-added').getByText('Their onboarding checklist has started.').waitFor({ timeout: 10000 });
  const { lists } = await onboardingOf('nina.onboard@example.com');
  if (lists.length !== 1) throw new Error(`${lists.length} onboarding checklists`);
  if (lists[0].tasks.length === 0) throw new Error('the checklist has no tasks');
  await ada.screenshot({ path: `${OUT}/auto-onboarding.png` });
});

await step('somebody hired long ago starts nothing; a new hire in the same list does', async () => {
  const made = await call('/employees/import', {
    method: 'POST',
    body: JSON.stringify({
      people: [
        { firstName: 'Olga', lastName: 'Oldtimer', email: 'olga.onboard@example.com', role: 'EMPLOYEE', payType: 'HOURLY', hireDate: '2019-03-01', locationIds: [nb], primaryLocationId: nb },
        { firstName: 'Ned', lastName: 'Newer', email: 'ned.onboard@example.com', role: 'EMPLOYEE', payType: 'HOURLY', hireDate: new Date().toISOString().slice(0, 10), locationIds: [nb], primaryLocationId: nb },
      ],
    }),
  });
  if (made.status !== 201) throw new Error(`import answered ${made.status}: ${JSON.stringify(made.body)}`);
  if (made.body.onboardingStarted !== 1) throw new Error(`onboarding started for ${made.body.onboardingStarted}`);
  if ((await onboardingOf('olga.onboard@example.com')).lists.length !== 0) throw new Error('Olga got one');
  if ((await onboardingOf('ned.onboard@example.com')).lists.length !== 1) throw new Error('Ned got none');
});

await step('a hire date given later starts it then, and saving again never starts a second', async () => {
  const added = await call('/employees', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'Pia', lastName: 'Pending', email: 'pia.onboard@example.com', role: 'EMPLOYEE', payType: 'HOURLY', locationIds: [nb], primaryLocationId: nb }),
  });
  if (added.body.onboardingStarted !== false) throw new Error('started with no hire date');
  const today = new Date().toISOString().slice(0, 10);
  const first = await call(`/employees/${added.body.id}`, { method: 'PATCH', body: JSON.stringify({ hireDate: today }) });
  if (first.body.onboardingStarted !== true) throw new Error('not started when the hire date was given');
  const second = await call(`/employees/${added.body.id}`, { method: 'PATCH', body: JSON.stringify({ hireDate: today }) });
  if (second.body.onboardingStarted !== false) throw new Error('started a second one');
  if ((await onboardingOf('pia.onboard@example.com')).lists.length !== 1) throw new Error('not exactly one');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL AUTO-ONBOARDING CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
