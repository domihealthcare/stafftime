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
 * Staff profiles (October 2026, Dominguez): a name on the Staff screen opens
 * everything the practice keeps about that person — address, emergency
 * contact, pay and position over time, time off — and time off already taken
 * can be written down there with an optional comment. Admins only: a manager
 * sees the Staff screen as before and the API refuses them the record.
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

const admin = await signIn('admin@domihealthcare.com');

// Somebody of this suite's own. run-all.sh removes imp-*@example.com between suites.
const person = await admin.evaluate(async () => {
  const places = await fetch('/api/locations').then((r) => r.json());
  const r = await fetch('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Robin',
      lastName: 'Profilesuite',
      email: 'imp-robin@example.com',
      hireDate: '2025-03-10',
      locationIds: [places[0].id],
      primaryLocationId: places[0].id,
    }),
  });
  if (!r.ok) throw new Error(`could not add Robin: ${r.status} ${await r.text()}`);
  return r.json();
});

await step('a name on the Staff screen opens their profile', async () => {
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId('staff-imp-robin@example.com');
  await card.getByRole('link', { name: 'Robin Profilesuite', exact: true }).click();
  await admin.waitForURL(`**/staff/${person.id}`);
  await admin.getByRole('heading', { level: 1, name: 'Robin Profilesuite' }).waitFor();
  await admin.getByText('Only administrators can see this page.').waitFor();
});

await step('address and emergency contact are kept and shown', async () => {
  await admin.getByRole('button', { name: 'Edit address and emergency contact' }).click();
  await admin.getByLabel('Street address').fill('12 Main Street');
  await admin.getByLabel('City').fill('North Bergen');
  await admin.getByLabel('State').fill('NJ');
  await admin.getByLabel('ZIP code').fill('07047');
  await admin.getByLabel('Name', { exact: true }).fill('Jamie Profilesuite');
  await admin.getByLabel('Relationship').fill('Sister');
  await admin.getByLabel('Phone', { exact: true }).fill('201-555-0100');
  const saved = admin.waitForResponse((r) => r.url().includes('/personal') && r.request().method() === 'PUT');
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  if (!(await saved).ok()) throw new Error('save refused');
  const address = await admin.getByTestId('home-address').innerText();
  if (!address.includes('12 Main Street') || !address.includes('North Bergen, NJ 07047')) {
    throw new Error(`address reads "${address}"`);
  }
  const contact = await admin.getByTestId('emergency-contact').innerText();
  if (!contact.includes('Jamie Profilesuite (Sister)') || !contact.includes('201-555-0100')) {
    throw new Error(`emergency contact reads "${contact}"`);
  }
  // And it is still there after a reload — it was stored, not just shown.
  await admin.reload({ waitUntil: 'networkidle' });
  await admin.getByTestId('home-address').getByText('12 Main Street').waitFor();
});

await step('where they started, then a promotion with a raise, make up pay and position now', async () => {
  const history = admin.getByTestId('employment-history');
  await history.getByRole('button', { name: '+ Add a change' }).click();
  // The first entry offers "Started" on their hire date.
  const form = history.getByRole('form', { name: 'Pay or position change' });
  if ((await form.getByLabel('What changed').inputValue()) !== 'HIRED') throw new Error('first entry is not "Started"');
  if ((await form.getByLabel('Took effect on').inputValue()) !== '2025-03-10') throw new Error('first entry is not on the hire date');
  await form.getByLabel('Position').fill('Medical Assistant');
  await form.getByLabel('Pay', { exact: true }).fill('19');
  let saved = admin.waitForResponse((r) => r.url().includes('/changes') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Add it' }).click();
  await saved;

  await history.getByRole('button', { name: '+ Add a change' }).click();
  await form.getByLabel('What changed').selectOption('PROMOTION');
  await form.getByLabel('Took effect on').fill('2026-06-01');
  await form.getByLabel('Position').fill('Lead Medical Assistant');
  await form.getByLabel('Pay', { exact: true }).fill('$22.50');
  await form.getByLabel('Comment (optional)').fill('Took over the MA rota');
  saved = admin.waitForResponse((r) => r.url().includes('/changes') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Add it' }).click();
  await saved;

  await history.getByTestId('current-position').getByText('Lead Medical Assistant').waitFor();
  const pay = await history.getByTestId('current-pay').innerText();
  if (!pay.includes('$22.50 an hour')) throw new Error(`pay now reads "${pay}"`);
  const rows = history.getByTestId('employment-change');
  if ((await rows.count()) !== 2) throw new Error(`${await rows.count()} history rows`);
  // Newest first.
  if (!(await rows.first().innerText()).includes('Promotion')) throw new Error('newest is not first');
  await history.getByText('Took over the MA rota').waitFor();
});

await step('a change can be edited and, after asking, removed', async () => {
  const history = admin.getByTestId('employment-history');
  const promotion = history.getByTestId('employment-change').first();
  await promotion.getByRole('button', { name: 'Edit' }).click();
  const form = history.getByRole('form', { name: 'Pay or position change' });
  await form.getByLabel('Pay', { exact: true }).fill('23');
  const saved = admin.waitForResponse((r) => r.url().includes('/changes/') && r.request().method() === 'PUT');
  await form.getByRole('button', { name: 'Save' }).click();
  await saved;
  await history.getByTestId('current-pay').getByText('$23.00 an hour').waitFor();

  await history.getByTestId('employment-change').first().getByRole('button', { name: /^Remove/ }).click();
  await admin.getByRole('button', { name: 'Keep it' }).click();
  if ((await history.getByTestId('employment-change').count()) !== 2) throw new Error('removed without asking');
});

await step('time off already taken is recorded with a comment and comes off the balance', async () => {
  const card = admin.getByTestId('staff-time-off');
  const before = await admin.evaluate(
    (id) => fetch(`/api/pto/balance?employeeId=${id}`).then((r) => r.json()),
    person.id,
  );
  // In a pop-up since October 2026 — the profile keeps only a summary.
  await card.getByRole('button', { name: '+ Record past time off' }).click();
  const form = admin
    .getByRole('dialog', { name: 'Record time off already taken' })
    .getByRole('form', { name: 'Record time off already taken' });
  // Two days in the past, whatever today is.
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toLocaleDateString('en-CA');
  };
  await form.getByLabel('First day').fill(day(3));
  await form.getByLabel('Last day').fill(day(2));
  await form.getByLabel('Comment (optional)').fill('Flu — doctor’s note on file');
  const saved = admin.waitForResponse((r) => r.url().endsWith('/pto/record'));
  await form.getByRole('button', { name: 'Record it' }).click();
  if (!(await saved).ok()) throw new Error('record refused');

  await form.waitFor({ state: 'detached', timeout: 10000 });
  await card.getByRole('button', { name: /^See all \d+ on file/ }).click();
  const all = admin.getByTestId('staff-time-off-all');
  const entry = all.getByTestId('staff-time-off-entry').first();
  await entry.getByText('recorded after the fact by').waitFor();
  await entry.getByText('Flu — doctor’s note on file').waitFor();
  await all.getByRole('button', { name: 'Close' }).click();
  const after = await admin.evaluate(
    (id) => fetch(`/api/pto/balance?employeeId=${id}`).then((r) => r.json()),
    person.id,
  );
  if (after.sick.used - before.sick.used !== 2) {
    throw new Error(`sick used went from ${before.sick.used} to ${after.sick.used}`);
  }
});

await step('the comment is optional, and days still to come are refused', async () => {
  const result = await admin.evaluate(async (id) => {
    const post = (body) =>
      fetch('/api/pto/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: id, type: 'VACATION', ...body }),
      });
    const past = await post({ startDate: '2026-01-05', endDate: '2026-01-05' });
    const future = await post({ startDate: '2099-01-05', endDate: '2099-01-05' });
    return { past: past.status, future: future.status };
  }, person.id);
  if (result.past !== 201) throw new Error(`no comment: ${result.past}`);
  if (result.future !== 400) throw new Error(`future day: ${result.future}`);
});

await step('the profile keeps time off short: the balance, then everything in a pop-up', async () => {
  await admin.reload({ waitUntil: 'networkidle' });
  const card = admin.getByTestId('staff-time-off');
  await card.getByTestId('staff-time-off-balance').getByText(/PTO|No PTO/).first().waitFor({ timeout: 10000 });
  if (await card.getByTestId('staff-time-off-entry').count()) throw new Error('the full list is on the profile itself');
});

await step('the balance can be adjusted from the profile, as from Time off', async () => {
  const card = admin.getByTestId('staff-time-off');
  const left = async () =>
    Number((await card.getByTestId('staff-time-off-balance').locator('strong').first().textContent()).trim());
  const before = await left();
  await card.getByRole('button', { name: 'Adjust balance' }).click();
  const form = admin.getByRole('dialog').getByRole('form', { name: /^Adjust / });
  await form.getByLabel('PTO already taken').fill('2');
  const saved = admin.waitForResponse((r) => r.url().includes('/pto/balances/') && r.request().method() === 'PUT');
  await form.getByRole('button', { name: 'Save' }).click();
  if (!(await saved).ok()) throw new Error('the adjustment was refused');
  await form.waitFor({ state: 'detached', timeout: 10000 });
  await admin.waitForFunction(
    (n) => Number(document.querySelector('[data-testid="staff-time-off-balance"] strong')?.textContent) === n - 2,
    before,
    { timeout: 10000 },
  );
});

await step('recorded time off can be taken back, after asking', async () => {
  const card = admin.getByTestId('staff-time-off');
  await card.getByRole('button', { name: /^See all \d+ on file/ }).click();
  const all = admin.getByTestId('staff-time-off-all');
  const count = await all.getByTestId('staff-time-off-entry').count();
  await all.getByTestId('staff-time-off-entry').first().getByRole('button', { name: /^Remove/ }).click();
  const removed = admin.waitForResponse((r) => r.url().includes('/recorded'));
  await admin.getByRole('button', { name: 'Yes, remove it' }).click();
  await removed;
  await admin.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="staff-time-off-entry"]').length === n - 1,
    count,
  );
});

await admin.screenshot({ path: `${OUT}/staff-profile.png`, fullPage: true });

await step('“For Robin” opens each screen narrowed to them, with a way back to everyone', async () => {
  for (const [label, path] of [
    ['Timesheet', '/timesheet'],
    ['Licenses', '/credentials'],
    ['Onboarding & offboarding', '/checklists'],
    ['Availability', '/availability'],
  ]) {
    await admin.goto(`${BASE}/staff/${person.id}`, { waitUntil: 'networkidle' });
    await admin.getByTestId('profile-shortcuts').getByRole('link', { name: label, exact: true }).click();
    await admin.waitForURL((url) => url.pathname === path && url.searchParams.get('person') === person.id);
    const note = admin.getByTestId('one-person');
    await note.waitFor({ timeout: 10000 });
    await note.getByRole('button', { name: 'Show everyone' }).click();
    await admin.waitForURL((url) => !url.searchParams.has('person'));
  }
});

await step('“Request time off for Robin” opens the form already for them', async () => {
  await admin.goto(`${BASE}/staff/${person.id}`, { waitUntil: 'networkidle' });
  await admin.getByTestId('profile-shortcuts').getByRole('link', { name: /^\+ Request time off for / }).click();
  const forWho = admin.getByLabel('For');
  await forWho.waitFor({ timeout: 10000 });
  if ((await forWho.inputValue()) !== person.id) throw new Error('the form is not for them');
});

await step('a manager sees no profile link, and the API refuses them the record', async () => {
  const manager = await signIn('manager@domihealthcare.com');
  await manager.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  const card = manager.getByTestId('staff-imp-robin@example.com');
  await card.getByRole('button', { name: /^Edit / }).waitFor();
  // The card's email and phone are links (as in the Directory); none goes to a profile.
  if (await card.locator('a[href^="/staff/"]').count()) throw new Error('a manager has a profile link');
  if (!(await card.locator('a[href^="mailto:"]').count())) throw new Error('the email is not a link');
  const statuses = await manager.evaluate(async (id) => {
    const record = await fetch(`/api/staff-records/${id}`);
    const backlog = await fetch('/api/pto/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: id, type: 'SICK', startDate: '2026-01-06', endDate: '2026-01-06' }),
    });
    return [record.status, backlog.status];
  }, person.id);
  if (statuses[0] !== 403 || statuses[1] !== 403) throw new Error(`manager got ${statuses}`);
  await manager.goto(`${BASE}/staff/${person.id}`, { waitUntil: 'networkidle' });
  await manager.getByText('Staff profiles are for administrators.').waitFor();
  if (await manager.getByText('12 Main Street').count()) throw new Error('a manager saw the address');
});

await step('nothing private rides along with the ordinary staff record', async () => {
  const body = await admin.evaluate(
    (id) => fetch(`/api/employees/${id}`).then((r) => r.text()),
    person.id,
  );
  for (const leak of ['12 Main Street', 'Jamie', 'payRate']) {
    if (body.includes(leak)) throw new Error(`/employees/:id carries "${leak}"`);
  }
  // The pay rate as a value, not "22.5" inside a timestamp such as
  // "…:22.512Z", which failed this whenever a row was saved at that second.
  if (/[":,[]22\.5[",}\]]/.test(body)) throw new Error('/employees/:id carries the pay rate 22.5');
});

await step('a profile on a phone fits the screen', async () => {
  const phone = await signIn('admin@domihealthcare.com', { width: 390, height: 844 });
  await phone.goto(`${BASE}/staff/${person.id}`, { waitUntil: 'networkidle' });
  await phone.getByRole('heading', { level: 1, name: 'Robin Profilesuite' }).waitFor();
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`page scrolls sideways by ${overflow}px`);
  await phone.screenshot({ path: `${OUT}/staff-profile-phone.png`, fullPage: true });
});

await browser.close();
if (errors.length) {
  console.log('PROBLEMS');
  for (const e of errors) console.log(' - ' + e);
  process.exit(1);
}
console.log('ALL PASSED');
