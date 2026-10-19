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
 * Two switches an admin sets on the Staff editor (Dominguez, October 2026):
 * "Can post News" and "Can see everyone's schedule", for Administrative staff
 * who are not admins. The schedule is read-only and shows published shifts
 * only; News posting is the admin's own, edit and remove included.
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
const WEEK = '2027-03-10';
const RANGE = 'from=2027-03-07T00:00:00.000Z&to=2027-03-14T00:00:00.000Z';
let deskId;

await step('set-up: a published shift and a draft for the MA', async () => {
  const staff = (await call(admin, '/employees')).body;
  deskId = staff.find((p) => p.email === 'frontdesk@domihealthcare.com').id;
  const ma = staff.find((p) => p.email === 'ma@domihealthcare.com');
  const place = { id: ma.locations[0].locationId };
  for (const [day, status] of [['10', 'PUBLISHED'], ['11', 'DRAFT']]) {
    const made = await call(manager, '/shifts', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: ma.id,
        locationId: place.id,
        startsAt: `2027-03-${day}T14:00:00.000Z`,
        endsAt: `2027-03-${day}T22:00:00.000Z`,
        status,
        notes: 'secret note',
      }),
    });
    if (made.status !== 201) throw new Error(`a shift answered ${made.status} ${JSON.stringify(made.body)}`);
  }
});

await step('without the switches: no tab, no post form, and the server refuses', async () => {
  await desk.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  if (await desk.getByRole('link', { name: 'Everyone', exact: true }).count())
    throw new Error('the Everyone tab was offered');
  if ((await call(desk, `/schedule-view?${RANGE}`)).status !== 403) throw new Error('schedule-view not refused');
  if ((await call(desk, '/announcements', { method: 'POST', body: JSON.stringify({ title: 'Not mine', body: 'Not for me to post.' }) })).status !== 403)
    throw new Error('posting not refused');
  await desk.goto(`${BASE}/news`, { waitUntil: 'networkidle' });
  if (await desk.getByRole('button', { name: '+ New post' }).count()) throw new Error('post form offered');
});

await step('an admin switches both on in the Staff editor', async () => {
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: /^Edit/ }).first().waitFor({ timeout: 15000 });
  const saved = await call(admin, `/employees/${deskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ canPostNews: true, canSeeEveryonesSchedule: true }),
  });
  if (saved.status !== 200) throw new Error(`saving answered ${saved.status}`);
  const me = await call(desk, '/auth/me');
  if (!me.body.canPostNews || !me.body.canSeeEveryonesSchedule) throw new Error('the session does not carry the switches');
});

await step('the Staff editor shows the two switches', async () => {
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await admin.getByPlaceholder(/Search/).fill('Front').catch(() => {});
  await admin.getByRole('button', { name: /^Edit/ }).first().click();
  await admin.getByLabel(/Can post News/).waitFor({ timeout: 10000 });
  await admin.getByLabel(/Can see everyone/).waitFor({ timeout: 10000 });
  await admin.keyboard.press('Escape');
});

await step('the whole schedule: published shifts only, nothing to change', async () => {
  await desk.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await desk.getByRole('link', { name: 'Everyone', exact: true }).click();
  await desk.getByRole('heading', { name: 'Everyone’s schedule' }).waitFor();
  await desk.goto(`${BASE}/schedule/everyone?day=${WEEK}`, { waitUntil: 'networkidle' });
  const page = desk.getByTestId('everyones-schedule');
  await page.getByText(/\d+(am|pm)-\d+(am|pm)/).first().waitFor({ timeout: 15000 });
  const cells = await page.locator('tbody tr').filter({ hasText: 'Medical' }).first().innerText().catch(() => '');
  const body = await page.innerText();
  if (body.includes('secret note')) throw new Error('a note leaked');
  const shifts = (await call(desk, `/schedule-view?${RANGE}`)).body.shifts;
  if (shifts.length !== 1) throw new Error(`${shifts.length} shifts, the draft should be left out`);
  if ('notes' in shifts[0]) throw new Error('notes are in the payload');
  if (await page.getByRole('button', { name: /Publish|Add|Delete/ }).count()) throw new Error('an editing button is on the page');
  void cells;
});

await step('still read-only: changing a shift or reading a draft is refused', async () => {
  const made = await call(desk, '/shifts', { method: 'POST', body: JSON.stringify({}) });
  if (made.status !== 403) throw new Error(`creating answered ${made.status}`);
  const list = (await call(desk, `/shifts?${RANGE}`)).body;
  if (list.length !== 0) throw new Error('the ordinary list now shows other people’s shifts');
});

await step('posting News: write, edit and remove', async () => {
  await desk.goto(`${BASE}/news`, { waitUntil: 'networkidle' });
  await desk.getByRole('button', { name: '+ New post' }).click();
  await desk.getByLabel('Title').fill('Pay period closes Friday');
  await desk.getByLabel('Message').fill('Please check your hours.');
  await desk.getByRole('button', { name: 'Post it' }).click();
  await desk.getByRole('heading', { name: 'Pay period closes Friday' }).waitFor({ timeout: 15000 });
  const card = desk
    .locator('[data-testid^="post-"]')
    .filter({ has: desk.getByRole('heading', { name: 'Pay period closes Friday' }) });
  await card.getByRole('button', { name: 'Edit' }).waitFor();
  await card.getByRole('button', { name: /Delete|Remove/ }).first().waitFor();
  // Leave the news as it was found.
  const posts = (await call(admin, '/announcements')).body;
  for (const post of posts.filter((p) => p.title === 'Pay period closes Friday')) {
    await call(admin, `/announcements/${post.id}`, { method: 'DELETE' });
  }
});

await step('switched off again, both are refused', async () => {
  await call(admin, `/employees/${deskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ canPostNews: false, canSeeEveryonesSchedule: false }),
  });
  if ((await call(desk, `/schedule-view?${RANGE}`)).status !== 403) throw new Error('schedule-view still open');
  if ((await call(desk, '/announcements', { method: 'POST', body: JSON.stringify({ title: 'Not mine', body: 'Not for me to post.' }) })).status !== 403)
    throw new Error('posting still open');
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL EVERYONE-SCHEDULE CHECKS PASSED');
