import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Defaults to the dev server; point at `vite preview` to test the built bundle
// with the deployed security headers applied.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  // Fall back to whatever Playwright downloaded when CHROMIUM_PATH is unset.
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

const json = (page, path, init = {}) =>
  page.evaluate(
    async ([path, init]) => {
      const response = await fetch(`/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    [path, init],
  );

/// Plain-date arithmetic, the way the API does it.
const addDays = (date, n) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + n);
  return value.toISOString().slice(0, 10);
};

// The seed publishes a shift today at North Bergen, so this week is fixed for
// Frankie and the first open day is next Monday.
const frankieCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const frankie = await frankieCtx.newPage();
frankie.on('pageerror', (e) => errors.push(`frankie pageerror: ${e.message}`));
await signIn(frankie, 'frontdesk@domihealthcare.com');

let firstOpen = '';
await step('staff reach it from the Schedule page and are told which weeks are fixed', async () => {
  await frankie.getByRole('link', { name: 'Schedule', exact: true }).click();
  await frankie.getByRole('link', { name: 'When you can’t work' }).click();
  await frankie.getByRole('heading', { name: 'When you can’t work' }).waitFor({ timeout: 15000 });
  await frankie.getByText(/The schedule is published up to/).waitFor({ timeout: 10000 });

  firstOpen = (await json(frankie, '/availability')).body.firstOpenDate;
  if (new Date(`${firstOpen}T00:00:00Z`).getUTCDay() !== 1) throw new Error(`first open day ${firstOpen} is not a Monday`);
});

await step('a weekly rule is added, and counts from the first open week', async () => {
  await frankie.getByRole('button', { name: '+ Add a time you can’t work' }).click();
  await frankie.getByLabel('Day', { exact: true }).selectOption({ label: 'Saturday' });
  await frankie.getByLabel('Why').fill('Weekend classes');
  await frankie.getByRole('button', { name: 'Save' }).click();

  const card = frankie.getByTestId('rule-Not available Saturdays (all day)');
  await card.waitFor({ timeout: 10000 });
  await card.getByText(/Weekend classes/).waitFor({ timeout: 5000 });
  const rules = (await json(frankie, '/availability')).body.rules;
  if (rules[0].effectiveFrom !== firstOpen) throw new Error(`it starts ${rules[0].effectiveFrom}, not ${firstOpen}`);
});

await step('set hours on one particular date', async () => {
  await frankie.getByRole('button', { name: '+ Add a time you can’t work' }).click();
  await frankie.getByRole('button', { name: 'One date' }).click();
  await frankie.getByLabel('Date', { exact: true }).fill(addDays(firstOpen, 2));
  await frankie.getByLabel('All day').uncheck();
  await frankie.getByLabel('From', { exact: true }).fill('13:00');
  await frankie.getByLabel('Until').fill('17:00');
  await frankie.getByRole('button', { name: 'Save' }).click();
  await frankie.getByText(/1:00 PM–5:00 PM/).waitFor({ timeout: 10000 });
});

await step('a date inside a published week is refused, and says why', async () => {
  const today = (await json(frankie, '/availability')).body.firstOpenDate;
  const answer = await json(frankie, '/availability', {
    method: 'POST',
    body: JSON.stringify({ kind: 'ONE_OFF', date: addDays(today, -2) }),
  });
  if (answer.status !== 400 || !/already published/.test(answer.body.message))
    throw new Error(`answered ${answer.status}: ${JSON.stringify(answer.body)}`);
});

await step('it fits a phone', async () => {
  const overflow = await frankie.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('the availability screen scrolls sideways');
});
await frankie.screenshot({ path: `${OUT}/95-availability-phone.png`, fullPage: true });

await step('staff cannot read or change anybody else’s', async () => {
  const people = await json(frankie, '/directory');
  const max = people.body.find((person) => person.firstName === 'Max');
  const answer = await json(frankie, `/availability?employeeId=${max.id}`);
  if (answer.status !== 403) throw new Error(`reading Max's answered ${answer.status}`);
  const team = await json(frankie, '/availability/team');
  if (team.status !== 403) throw new Error(`the team list answered ${team.status}`);
});

// The manager puts Frankie on next Saturday anyway.
const mgr = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
mgr.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

await step('the scheduler warns about a shift on a time somebody can’t work, but still makes it', async () => {
  const people = (await json(mgr, '/directory')).body;
  const frankieId = people.find((person) => person.firstName === 'Frankie').id;
  const locations = (await json(mgr, '/locations')).body;
  const northBergen = locations.find((place) => place.name === 'North Bergen').id;
  const saturday = addDays(firstOpen, 5);

  const created = await json(mgr, '/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: frankieId,
      locationId: northBergen,
      startsAt: `${saturday}T13:00:00.000Z`,
      endsAt: `${saturday}T17:00:00.000Z`,
      status: 'DRAFT',
      notes: 'availability-suite',
    }),
  });
  if (created.status !== 201) throw new Error(`the shift was refused: ${created.status} ${JSON.stringify(created.body)}`);

  await mgr.getByRole('link', { name: 'Schedule', exact: true }).click();
  await mgr.getByRole('button', { name: 'Week', exact: true }).click();
  await mgr.getByRole('button', { name: 'Next →' }).click();
  const notice = mgr.getByTestId('availability-notice');
  await notice.waitFor({ timeout: 15000 });
  await notice.getByText('1 shift is at a time someone said they can’t work').waitFor({ timeout: 5000 });
  await notice.getByText(/Frankie Front-Desk/).waitFor({ timeout: 5000 });
  await notice.getByText(/not available Saturdays \(all day\)/).waitFor({ timeout: 5000 });
});
await mgr.screenshot({ path: `${OUT}/96-scheduler-availability.png`, fullPage: true });

await step('a manager sees everyone’s, and cannot change Frankie’s', async () => {
  await mgr.getByRole('link', { name: 'Availability — yours and the team’s' }).click();
  const card = mgr.getByTestId('team-Frankie Front-Desk');
  await card.waitFor({ timeout: 15000 });
  await card.getByText(/Saturdays \(all day\)/).waitFor({ timeout: 5000 });
  await card.getByText(/Weekend classes/).waitFor({ timeout: 5000 });
  if ((await card.getByRole('button').count()) > 0) throw new Error('the team list offered a button');

  const frankieRules = (await json(frankie, '/availability')).body.rules;
  const answer = await json(mgr, `/availability/${frankieRules[0].id}`, { method: 'DELETE' });
  if (answer.status !== 403) throw new Error(`a manager deleting Frankie's answered ${answer.status}`);
});

await step('removing a weekly rule that has not started just deletes it', async () => {
  await frankie.reload({ waitUntil: 'networkidle' });
  const card = frankie.getByTestId('rule-Not available Saturdays (all day)');
  await card.getByRole('button', { name: 'Remove' }).click();
  await frankie.getByText('Removed.', { exact: true }).waitFor({ timeout: 10000 });
  if ((await card.count()) > 0) throw new Error('the rule is still listed');
});

await frankieCtx.close();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL AVAILABILITY CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
