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
 * Who looks after a part of the practice (October 2026, Dominguez: "I don't
 * want to always be notified of PTO requests, that should be a setting to who
 * it notifies"): a manager chooses who is told of new time-off requests on
 * the Time off requests screen; a request then rings those people only.
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
      const r = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );
const bellTitles = async (page) => (await call(page, '/notifications')).body.items.map((n) => n.title);

const manager = await signIn('manager@domihealthcare.com');
const admin = await signIn('admin@domihealthcare.com');
const desk = await signIn('frontdesk@domihealthcare.com');

await step('nobody chosen: a new request rings every manager, as before', async () => {
  const chosen = (await call(manager, '/digest-settings/assignees')).body;
  if (chosen.TIME_OFF.length !== 0) throw new Error(`already chosen: ${JSON.stringify(chosen.TIME_OFF)}`);
  const made = await call(desk, '/pto', {
    method: 'POST',
    body: JSON.stringify({ type: 'VACATION', startDate: '2027-05-03', endDate: '2027-05-03' }),
  });
  if (made.status !== 201) throw new Error(`asking answered ${made.status}`);
  for (const [who, page] of [['manager', manager], ['admin', admin]])
    if (!(await bellTitles(page)).some((t) => /Frankie Front-Desk has asked for time off/.test(t))) throw new Error(`the ${who} was not told`);
});

await step('the manager chooses the admin alone under Who is told of new requests', async () => {
  await manager.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  await manager.getByRole('heading', { name: 'Time off requests', level: 1 }).waitFor({ timeout: 10000 });
  await manager.getByText('Who is told of new requests').click();
  const card = manager.getByTestId('topic-assignees-TIME_OFF');
  await card.waitFor({ timeout: 10000 });
  await card.getByLabel(/Ada Admin/).check();
  await card.getByRole('button', { name: 'Save' }).click();
  await card.getByText('Saved.', { exact: true }).waitFor({ timeout: 10000 });
  await manager.screenshot({ path: `${OUT}/who-looks-after-time-off.png`, fullPage: true });
  const chosen = (await call(manager, '/digest-settings/assignees')).body;
  const ada = (await call(admin, '/employees/me')).body;
  if (chosen.TIME_OFF.join() !== ada.id) throw new Error(`TIME_OFF: ${JSON.stringify(chosen.TIME_OFF)}`);
});

await step('the next request rings the admin and not the manager', async () => {
  await call(manager, '/notifications/read-all', { method: 'POST' });
  const before = (await bellTitles(manager)).filter((t) => /asked for time off/.test(t)).length;
  const made = await call(desk, '/pto', {
    method: 'POST',
    body: JSON.stringify({ type: 'VACATION', startDate: '2027-05-10', endDate: '2027-05-10' }),
  });
  if (made.status !== 201) throw new Error(`asking answered ${made.status}`);
  const adminNotes = (await bellTitles(admin)).filter((t) => /Frankie Front-Desk has asked for time off/.test(t));
  if (adminNotes.length < 2) throw new Error(`the admin heard ${adminNotes.length} times`);
  const after = (await bellTitles(manager)).filter((t) => /asked for time off/.test(t)).length;
  if (after !== before) throw new Error('the manager was told although not chosen');
});

await step('Time off is a tab under Schedule, for everybody', async () => {
  await manager.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await manager.getByRole('navigation', { name: /Schedule or calendar/ }).getByRole('link', { name: 'Time off', exact: true }).click();
  await manager.getByRole('heading', { name: 'Time off requests', level: 1 }).waitFor({ timeout: 10000 });
  // It stays in the Schedule: its tabs are still there, Time off lit among them,
  // and Schedule stays lit in the header (October 2026, Dominguez: "it takes me
  // away from the page, it shouldnt").
  const tabs = manager.getByRole('navigation', { name: /Schedule or calendar/ });
  if ((await tabs.getByRole('link', { name: 'Time off', exact: true }).getAttribute('aria-current')) !== 'page')
    throw new Error('Time off is not the lit tab on its own page');
  await tabs.getByRole('link', { name: 'Shifts', exact: true }).waitFor();
  const lit = await manager.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Schedule/ }).getAttribute('class');
  if (!/bg-brand-50/.test(lit ?? '')) throw new Error(`Schedule is not lit in the header: ${lit}`);
  await desk.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await desk.getByRole('navigation', { name: /Schedule or calendar/ }).getByRole('link', { name: 'Time off', exact: true }).click();
  await desk.getByRole('heading', { name: 'Time off', level: 1 }).waitFor({ timeout: 10000 });
});

await step('Email settings lists who is chosen for what; a part with nobody chosen goes by the ticks', async () => {
  await admin.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId('chosen-for');
  await card.waitFor({ timeout: 10000 });
  if (!/Time off[^\n]*Ada Admin/.test(await card.innerText())) throw new Error(`chosen-for reads: ${await card.innerText()}`);
  // Staff cannot read or set it.
  for (const [path, init] of [['/digest-settings/assignees', undefined], ['/digest-settings/assignees/TIME_OFF', { method: 'PUT', body: '{"employeeIds":[]}' }]]) {
    const { status } = await call(desk, path, init);
    if (status !== 403) throw new Error(`${path} answered ${status} for staff`);
  }
  const bad = await call(manager, '/digest-settings/assignees/NOT_A_PART', { method: 'PUT', body: JSON.stringify({ employeeIds: [] }) });
  if (bad.status !== 400) throw new Error(`an unknown part answered ${bad.status}`);
});

await step('somebody in the Administrative job role can be chosen, is told, and still cannot decide', async () => {
  // October 2026, Dominguez: "administrative roles should be an option to chose
  // so they can possibly be notified".
  const staff = (await call(manager, '/employees')).body;
  const max = staff.find((p) => p.email === 'ma@domihealthcare.com');
  const role = (await call(manager, '/job-roles')).body.find((r) => r.name === 'Administrative');
  const added = await call(manager, `/job-roles/${role.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ employeeId: max.id }),
  });
  if (added.status >= 300) throw new Error(`adding Max to Administrative answered ${added.status}`);
  await manager.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  await manager.getByText('Who is told of new requests').click();
  const card = manager.getByTestId('topic-assignees-TIME_OFF');
  const box = card.getByLabel(/Max Assistant.*Administrative, told only/);
  await box.waitFor({ timeout: 10000 });
  // Somebody with Employee access and no admin job role is not offered.
  if (await card.getByLabel(/Frankie Front-Desk/).count()) throw new Error('Front Desk staff are offered');
  await box.check();
  await card.getByRole('button', { name: 'Save' }).click();
  await card.getByText('Saved.', { exact: true }).waitFor({ timeout: 10000 });
  const chosen = (await call(manager, '/digest-settings/assignees')).body;
  if (!chosen.TIME_OFF.includes(max.id)) throw new Error(`TIME_OFF: ${JSON.stringify(chosen.TIME_OFF)}`);

  const made = await call(desk, '/pto', {
    method: 'POST',
    body: JSON.stringify({ type: 'VACATION', startDate: '2027-05-17', endDate: '2027-05-17' }),
  });
  if (made.status !== 201) throw new Error(`asking answered ${made.status}`);

  // Max signs in (a temporary password on the seed) and has heard of it.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('ma@domihealthcare.com');
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const home = page.getByText('Not clocked in');
  const mustChange = page.getByText('Choose a new password');
  await home.or(mustChange).first().waitFor({ timeout: 20000 });
  if (await mustChange.isVisible()) {
    await page.getByLabel('Temporary password').fill('shift-change-2026');
    await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
    await page.getByLabel('Confirm new password').fill('harbour lantern 7');
    await page.getByRole('button', { name: 'Change password' }).click();
    await home.waitFor({ timeout: 15000 });
  }
  if (!(await bellTitles(page)).some((t) => /Frankie Front-Desk has asked for time off/.test(t)))
    throw new Error('Max was not told');
  const decided = await call(page, `/pto/${made.body.id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'APPROVED' }),
  });
  if (decided.status !== 403) throw new Error(`Max deciding answered ${decided.status}`);
  await ctx.close();
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL WHO-LOOKS-AFTER CHECKS PASSED');
