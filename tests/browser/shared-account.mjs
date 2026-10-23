import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// A shared account, not a person (23 October 2026, Dominguez: a general
// office@ account with front desk access, kept out of the Directory, 360s,
// surveys and the rest). An admin ticks "Shared account, not a person" in the
// Staff editor. The account still signs in and sees what its access and job
// roles give it, but never clocks in, is never put on a shift, takes no time
// off, and is left out of the lists and counts of people. Max stands in for
// office@ here; the runner unticks it again between suites.
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

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror (${email}): ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Max is seeded with a temporary password, to be changed on first sign-in.
  const home = page.getByTestId('home-clock');
  const mustChange = page.getByText('Choose a new password');
  await home.or(mustChange).first().waitFor({ timeout: 20000 });
  if (await mustChange.isVisible()) {
    await page.getByLabel('Temporary password').fill('shift-change-2026');
    await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
    await page.getByLabel('Confirm new password').fill('harbour lantern 7');
    await page.getByRole('button', { name: 'Change password' }).click();
    await home.waitFor({ timeout: 15000 });
  }
  return page;
}

const call = (page, path, init = {}) =>
  page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      });
      const text = await r.text();
      let body = text;
      try { body = JSON.parse(text); } catch { /* not JSON */ }
      return { status: r.status, body };
    },
    { path, init },
  );

const SHARED = 'ma@domihealthcare.com';
const admin = await signIn('admin@domihealthcare.com');
let sharedId = null;

await step('an admin ticks "Shared account, not a person", which unticks and greys out Clocks in', async () => {
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId(`staff-${SHARED}`);
  await card.getByRole('button', { name: /^Edit / }).click();
  const shared = admin.getByRole('checkbox', { name: /Shared account, not a person/ });
  await shared.waitFor({ timeout: 10000 });
  await shared.check();
  const clocks = admin.getByRole('checkbox', { name: /Clocks in/ });
  if (await clocks.isChecked()) throw new Error('Clocks in is still ticked');
  if (!(await clocks.isDisabled())) throw new Error('Clocks in can still be ticked');
  const saved = admin.waitForResponse((r) => r.url().includes('/api/employees/') && r.request().method() === 'PATCH');
  await admin.getByRole('button', { name: 'Save changes' }).click();
  const response = await saved;
  if (!response.ok()) throw new Error(`the change was refused: ${response.status()}`);
  const body = await response.json();
  if (body.isSharedAccount !== true || body.clocksIn !== false) {
    throw new Error(`saved as shared ${body.isSharedAccount}, clocks in ${body.clocksIn}`);
  }
  sharedId = body.id;
  await admin.getByTestId(`staff-${SHARED}`).getByText('Shared account', { exact: true }).waitFor({ timeout: 10000 });
});

await step('Clocks in cannot be ticked back on behind the editor\'s back', async () => {
  const r = await call(admin, `/employees/${sharedId}`, { method: 'PATCH', body: JSON.stringify({ clocksIn: true }) });
  if (r.status !== 200 || r.body.clocksIn !== false) throw new Error(`answered ${r.status}, clocksIn ${r.body.clocksIn}`);
});

const office = await signIn(SHARED);

await step('Home says it is a shared account: no Clock in, no time off on Quick', async () => {
  const card = office.getByTestId('home-clock');
  await card.getByTestId('clock-status').getByText('Shared account').waitFor({ timeout: 15000 });
  await card.getByTestId('shared-account-note').waitFor();
  if (await card.getByRole('button', { name: /^Clock in/ }).count()) throw new Error('a Clock in button');
  if (await office.locator('#location').count()) throw new Error('a location to choose');
  const quick = office.getByTestId('quick-actions');
  await quick.getByRole('link', { name: 'Help' }).waitFor();
  if (await quick.getByRole('link', { name: 'Request time off' }).count()) throw new Error('Request time off on Quick');
  if (await office.getByTestId('tablet-pin-reminder').count()) throw new Error('asked to choose a tablet PIN');
  await office.screenshot({ path: `${OUT}/shared-account-home.png`, fullPage: true });
});

await step('the server refuses it a clock-in and time off', async () => {
  const locations = (await call(office, '/locations')).body;
  const punch = await call(office, '/time-entries/clock-in', {
    method: 'POST',
    body: JSON.stringify({ locationId: locations[0].id, method: 'WEB', workFromHome: true, otherPlaceReason: 'shared suite' }),
  });
  if (punch.status !== 403 || !JSON.stringify(punch.body).includes('shared account')) {
    throw new Error(`clock-in answered ${punch.status}: ${JSON.stringify(punch.body)}`);
  }
  const off = await call(office, '/pto', {
    method: 'POST',
    body: JSON.stringify({ type: 'SICK', startDate: '2031-03-03', endDate: '2031-03-03' }),
  });
  if (off.status !== 403) throw new Error(`time off answered ${off.status}: ${JSON.stringify(off.body)}`);
});

await step('the Schedule offers it no time off and no availability', async () => {
  await office.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await office.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15000 });
  if (await office.getByRole('link', { name: /Request time off/ }).count()) throw new Error('+ Request time off');
  if (await office.getByRole('link', { name: /When you can.t work/ }).count()) throw new Error('availability');
});

const manager = await signIn('manager@domihealthcare.com');

await step('a manager cannot put it on a shift, and the rota has no row for it', async () => {
  const locations = (await call(manager, '/locations')).body;
  const start = new Date(Date.UTC(2031, 2, 4, 14));
  const made = await call(manager, '/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: sharedId,
      locationId: locations.find((l) => l.name === 'West New York').id,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 4 * 3_600_000).toISOString(),
    }),
  });
  if (made.status !== 400 || !JSON.stringify(made.body).includes('shared account')) {
    throw new Error(`a shift answered ${made.status}: ${JSON.stringify(made.body)}`);
  }
  await manager.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  const rows = manager.locator('th[scope=row]');
  await rows.filter({ hasText: /Frankie/ }).first().waitFor({ timeout: 15000 });
  if (await rows.filter({ hasText: /Max/ }).count()) throw new Error('a rota row for the shared account');
});

await step('it is left out of the Directory, birthdays and the time off balances', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  const people = (await call(frankie, '/directory')).body;
  if (people.some((person) => person.email === SHARED)) throw new Error('in the Directory');
  const balances = (await call(manager, '/pto/balances')).body;
  if (balances.some((row) => row.email === SHARED || row.id === sharedId)) throw new Error('in the balances');
  await frankie.context().close();
});

await step('it is not asked about or asked to answer a pulse survey', async () => {
  const created = await call(manager, '/surveys', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Shared account suite survey',
      audience: 'EVERYONE',
      questions: [{ kind: 'RATING', prompt: 'How was the week?' }],
    }),
  });
  if (created.status >= 400) throw new Error(`could not make a survey: ${JSON.stringify(created.body)}`);
  const opened = await call(manager, `/surveys/${created.body.id}/open`, { method: 'POST' });
  if (opened.status >= 400) throw new Error(`could not open it: ${JSON.stringify(opened.body)}`);
  const titles = async (page) => {
    const found = (await call(page, '/surveys')).body;
    const list = Array.isArray(found) ? found : (found.surveys ?? found.items ?? []);
    return list.map((survey) => survey.title);
  };
  const frankie = await signIn('frontdesk@domihealthcare.com');
  if (!(await titles(frankie)).includes('Shared account suite survey')) throw new Error('a person does not see it either');
  await frankie.context().close();
  if ((await titles(office)).includes('Shared account suite survey')) throw new Error('the survey reached it');
});

await step('unticked, it is a person again', async () => {
  const r = await call(admin, `/employees/${sharedId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isSharedAccount: false, clocksIn: true }),
  });
  if (r.status !== 200 || r.body.isSharedAccount !== false || r.body.clocksIn !== true) {
    throw new Error(`answered ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  const people = (await call(admin, '/directory')).body;
  if (!people.some((person) => person.email === SHARED)) throw new Error('not back in the Directory');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL SHARED ACCOUNT CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
