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
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

/**
 * A shift for somebody is for one of their own job roles (Dominguez,
 * September 2026: "I shouldn't have the option to be 'any job role', it
 * should be only the job roles that I have assigned to me"). Every shift form
 * offers only the person's roles; open shifts can still be for any; the
 * server refuses a role the person does not hold.
 */
const mgr = await (
  await browser.newContext({ viewport: { width: 1400, height: 1000 }, timezoneId: 'America/New_York' })
).newPage();
mgr.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await mgr.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await mgr.getByLabel('Email').fill('manager@domihealthcare.com');
await mgr.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await mgr.getByRole('button', { name: 'Sign in' }).click();
await mgr.getByText('Not clocked in').waitFor({ timeout: 20000 });

const api = (path, init) =>
  mgr.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );
const roles = (await api('/job-roles')).body;
const role = (name) => roles.find((r) => r.name === name);
const frankieId = role('Front Desk').members.find((m) => m.firstName === 'Frankie').id;
/// Shifts this suite makes, taken away again at the end so no other suite
/// finds Frankie already on.
const made = [];
const northBergen = (await api('/locations')).body.find((l) => l.name === 'North Bergen').id;

async function openWeek() {
  await mgr.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: 'Week', exact: true }).click();
  await mgr.getByRole('button', { name: 'Next →' }).click();
  await mgr.getByText('Coverage this week').waitFor({ timeout: 15000 });
}
const frankieRow = () => mgr.getByTestId('rota-row-Frankie Front-Desk');
const options = (select) => select.locator('option').allTextContents();

await step('the + on the rota offers only his one job role — no "Not specified"', async () => {
  await openWeek();
  const max = mgr.getByTestId('rota-row-Max Assistant');
  await max.getByRole('button', { name: /^Add a shift for Max Assistant on Tuesday/ }).click();
  const dialog = mgr.getByRole('dialog', { name: 'Shift for Max Assistant' });
  const listed = await options(dialog.getByLabel('Job role'));
  if (listed.join() !== 'Medical Assistant') throw new Error(`offered: ${listed.join(', ')}`);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

await step('in two roles, she is offered exactly those two', async () => {
  await frankieRow().getByRole('button', { name: /^Add a shift for Frankie Front-Desk on Tuesday/ }).click();
  const dialog = mgr.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
  const listed = await options(dialog.getByLabel('Job role'));
  if (listed.join() !== 'Front Desk,Medical Assistant') throw new Error(`offered: ${listed.join(', ')}`);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

await step('an open shift can still be for any role', async () => {
  await mgr.getByRole('button', { name: /^Add an open shift at North Bergen on Tuesday/ }).click();
  const dialog = mgr.getByRole('dialog', { name: 'Open shift' });
  const listed = await options(dialog.getByLabel('Job role'));
  if (listed[0] !== 'Any role' || !listed.includes('Provider'))
    throw new Error(`offered: ${listed.join(', ')}`);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

await step('the usual week offers each day only her roles', async () => {
  await mgr.getByTestId('usual-week').getByLabel(/usual week/).selectOption({ label: 'Frankie Front-Desk' });
  const week = mgr.getByTestId('weekly-schedule');
  await week.getByTestId('week-day-1').getByRole('checkbox').check();
  const listed = await options(week.getByLabel('Monday job role'));
  if (listed.join() !== 'Front Desk,Medical Assistant') throw new Error(`offered: ${listed.join(', ')}`);
});

await step('the server refuses a shift as a role she does not hold', async () => {
  const day = new Date();
  day.setDate(day.getDate() + 30);
  day.setHours(9, 0, 0, 0);
  const end = new Date(day);
  end.setHours(17);
  const refused = await api('/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: frankieId,
      locationId: northBergen,
      jobRoleId: role('Provider').id,
      startsAt: day.toISOString(),
      endsAt: end.toISOString(),
    }),
  });
  if (refused.status !== 400) throw new Error(`answered ${refused.status}`);
  if (!/not in Provider/.test(JSON.stringify(refused.body)))
    throw new Error(`said ${JSON.stringify(refused.body)}`);
  // …and, in two roles, one with none given.
  const vague = await api('/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: frankieId,
      locationId: northBergen,
      startsAt: day.toISOString(),
      endsAt: end.toISOString(),
    }),
  });
  if (vague.status !== 400) throw new Error(`with no role it answered ${vague.status}`);
});

await step('an open Front Desk shift can only be given to somebody in Front Desk', async () => {
  // Tuesday next week, the week the rota is opened on.
  const day = new Date();
  day.setDate(day.getDate() - day.getDay() + 9);
  day.setHours(9, 0, 0, 0);
  const end = new Date(day);
  end.setHours(17);
  const open = await api('/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: null,
      locationId: northBergen,
      jobRoleId: role('Provider').id,
      startsAt: day.toISOString(),
      endsAt: end.toISOString(),
    }),
  });
  if (open.status !== 201) throw new Error(`making the open shift answered ${open.status}`);
  await openWeek();
  await mgr.getByTestId('open-shift').first().click();
  const dialog = mgr.getByRole('dialog', { name: 'Open shift' });
  await dialog.waitFor({ timeout: 10000 });
  const listed = await options(dialog.getByLabel('Put somebody in it'));
  // Nobody at North Bergen is a Provider in the test data.
  if (listed.some((name) => /Frankie|Morgan|Ada/.test(name)))
    throw new Error(`offered people outside Provider: ${listed.join(', ')}`);
  await dialog.getByText(/Nobody in Provider works at this office yet/).waitFor({ timeout: 5000 });
  const refused = await api(`/shifts/${open.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ employeeId: frankieId }),
  });
  if (refused.status !== 400) throw new Error(`the server let her have it: ${refused.status}`);
  await api(`/shifts/${open.body.id}`, { method: 'DELETE' });
});

await step('the month by job role counts the shifts for that role, not all its people do', async () => {
  // Next month: the 10th as a Medical Assistant at North Bergen, the 11th as
  // Front Desk from home.
  const first = new Date();
  first.setDate(1);
  first.setMonth(first.getMonth() + 1);
  const at = (date, hour) => {
    const d = new Date(first);
    d.setDate(date);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  for (const [date, jobRole, isRemote] of [
    [10, 'Medical Assistant', false],
    [11, 'Front Desk', true],
  ]) {
    const shift = await api('/shifts', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: frankieId,
        locationId: northBergen,
        jobRoleId: role(jobRole).id,
        isRemote,
        startsAt: at(date, 9),
        endsAt: at(date, 17),
        status: 'PUBLISHED',
      }),
    });
    if (shift.status !== 201) throw new Error(`making the ${jobRole} shift answered ${shift.status}`);
    made.push(shift.body.id);
  }
  await mgr.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: 'Month', exact: true }).click();
  await mgr.getByRole('button', { name: 'Next →' }).click();
  await mgr.getByTestId('month-grid').waitFor({ timeout: 10000 });
  await mgr.getByLabel('Show job role').selectOption({ label: 'Medical Assistant' });
  await mgr.getByLabel('Show location').selectOption({ label: 'North Bergen' });
  const scope = mgr.getByTestId('month-person');
  await scope.getByText('Medical Assistant at North Bergen').waitFor({ timeout: 5000 });
  const text = await scope.innerText();
  if (!/— 1 shift this month/.test(text)) throw new Error(`it said "${text}"`);
});

await step('Work from home is a place to narrow the month to', async () => {
  await mgr.getByLabel('Show job role').selectOption({ label: 'All job roles' });
  await mgr.getByLabel('Show location').selectOption({ label: 'Work from home' });
  const text = await mgr.getByTestId('month-person').innerText();
  if (!/^Only Working from home — 1 shift this month/.test(text)) throw new Error(`it said "${text}"`);
  // …and North Bergen no longer counts the day she is at home.
  await mgr.getByLabel('Show location').selectOption({ label: 'North Bergen' });
  await mgr.getByRole('combobox', { name: 'Show person' }).click();
  await mgr.getByRole('listbox', { name: 'Show person' }).getByRole('option', { name: /Frankie Front-Desk/ }).click();
  const there = await mgr.getByTestId('month-person').innerText();
  if (!/— 1 shift this month/.test(there)) throw new Error(`at North Bergen it said "${there}"`);
});

await step('the week narrowed to Work from home shows a section of its own', async () => {
  await mgr.getByRole('button', { name: 'Week', exact: true }).click();
  await mgr.getByRole('button', { name: 'By location' }).click();
  await mgr.getByLabel('Show location').selectOption({ label: 'Work from home' });
  await mgr.getByTestId('rota-section-Work from home').waitFor({ timeout: 10000 });
  await mgr.getByLabel('Show location').selectOption({ label: 'All locations' });
});

for (const id of made) await api(`/shifts/${id}`, { method: 'DELETE' });

await browser.close();
if (errors.length) {
  console.log(`\n${errors.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
