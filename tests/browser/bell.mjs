import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// The bell beside your name: notifications that are yours alone — a new post,
// a shift added to your schedule, your time off decided — with an unread count,
// read by choosing one. Plus News as its own tab, and the version on Help.
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

/// Calls the API as whoever the page is signed in as.
const call = (page, path, init = {}) =>
  page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(`/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { path, init },
  );

const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const admin = await adminCtx.newPage();
admin.on('pageerror', (e) => errors.push(`admin pageerror: ${e.message}`));
await signIn(admin, 'admin@domihealthcare.com');

const staffCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const frankie = await staffCtx.newPage();
frankie.on('pageerror', (e) => errors.push(`staff pageerror: ${e.message}`));
await signIn(frankie, 'frontdesk@domihealthcare.com');

const bell = (page) => page.getByRole('button', { name: /^Notifications/ });
const panel = (page) => page.getByRole('dialog', { name: 'Notifications' });

await step('News is a tab of its own, not tucked under Team', async () => {
  await frankie
    .getByRole('navigation')
    .getByRole('link', { name: 'News', exact: true })
    .click();
  await frankie.getByRole('heading', { name: 'News', exact: true }).waitFor({ timeout: 10000 });
});

await step('a quiet bell has no count, and says so when opened', async () => {
  if ((await frankie.getByTestId('notification-count').count()) > 0)
    throw new Error('the bell showed a count before anything happened');
  await bell(frankie).click();
  await panel(frankie).getByText(/Nothing yet/).waitFor({ timeout: 10000 });
  await frankie.keyboard.press('Escape');
});

await step('things that happen to you arrive under the bell', async () => {
  // A post from the admin, a published shift next week, and time off that
  // Frankie asks for and a manager approves.
  const post = await call(admin, '/announcements', {
    method: 'POST',
    body: JSON.stringify({ title: 'Bell suite post', body: 'Hello from the suite.' }),
  });
  if (post.status !== 201) throw new Error(`posting answered ${post.status}`);

  const staff = (await call(admin, '/employees')).body;
  const me = staff.find((p) => p.email === 'frontdesk@domihealthcare.com');
  const northBergen = (await call(admin, '/locations')).body.find((l) => l.name === 'North Bergen');
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7);
  const startsAt = new Date(monday);
  startsAt.setHours(9);
  const endsAt = new Date(monday);
  endsAt.setHours(13);
  const shift = await call(admin, '/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: me.id,
      locationId: northBergen.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: 'PUBLISHED',
      notes: 'bell-suite',
    }),
  });
  if (shift.status !== 201) throw new Error(`the shift answered ${shift.status}`);

  const request = await call(frankie, '/pto', {
    method: 'POST',
    body: JSON.stringify({ type: 'VACATION', startDate: '2027-04-12', endDate: '2027-04-13' }),
  });
  if (request.status !== 201) throw new Error(`asking for time off answered ${request.status}`);
  const review = await call(admin, `/pto/${request.body.id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ decision: 'APPROVED' }),
  });
  if (review.status !== 200) throw new Error(`approving answered ${review.status}`);

  // The badge catches up on the next screen change.
  await frankie.getByRole('navigation').getByRole('link', { name: /^Schedule/ }).click();
  await frankie.getByTestId('notification-count').getByText('3').waitFor({ timeout: 15000 });
});

await step('the bell lists them, newest first, in words that say what happened', async () => {
  await bell(frankie).click();
  const items = panel(frankie).getByTestId('notification');
  await items.first().waitFor({ timeout: 10000 });
  // It opens on a phone, so it has to fit one.
  const box = await panel(frankie).boundingBox();
  if (!box || box.x < 0 || box.x + box.width > 390)
    throw new Error(`the panel sits at ${Math.round(box?.x ?? -1)}–${Math.round((box?.x ?? 0) + (box?.width ?? 0))}px on a 390px screen`);
  const titles = await items.allInnerTexts();
  if (titles.length !== 3) throw new Error(`${titles.length} notifications: ${titles.join(' | ')}`);
  if (!/Your time off is approved/.test(titles[0])) throw new Error(`newest is "${titles[0]}"`);
  // Told on the office's clock ("Mon, Sep 28, 9:00 AM–1:00 PM"); the hour
  // depends on where this machine thinks 9 is, so only the shape is checked.
  if (!/New shift: \w{3}, \w{3} \d+, \d+:\d\d [AP]M–\d+:\d\d [AP]M/.test(titles[1]))
    throw new Error(`second is "${titles[1]}"`);
  if (!/New post: Bell suite post/.test(titles[2])) throw new Error(`third is "${titles[2]}"`);
});
await frankie.screenshot({ path: `${OUT}/120-bell-open.png`, fullPage: false });

await step('choosing one goes to its screen and marks it read', async () => {
  await panel(frankie).getByTestId('notification').filter({ hasText: 'New post' }).click();
  await frankie.getByRole('heading', { name: 'Bell suite post' }).waitFor({ timeout: 10000 });
  await frankie.getByTestId('notification-count').getByText('2').waitFor({ timeout: 10000 });
});

await step('nobody can read or mark somebody else’s', async () => {
  const unread = (await call(frankie, '/notifications')).body.items.find((n) => !n.readAt);
  // The admin tries to mark one of Frankie's as read, by its id…
  const attempt = await call(admin, `/notifications/${unread.id}/read`, { method: 'POST' });
  if (attempt.status !== 200) throw new Error(`marking answered ${attempt.status}`);
  // …and nothing happens to it, nor does it appear in the admin's own list.
  const after = (await call(frankie, '/notifications')).body.items.find((n) => n.id === unread.id);
  if (after.readAt) throw new Error("the admin marked Frankie's notification as read");
  const adminList = (await call(admin, '/notifications')).body.items;
  if (adminList.some((n) => n.id === unread.id))
    throw new Error("the admin's list contains Frankie's notification");
});

await step('mark all as read clears the count, and it stays cleared', async () => {
  await bell(frankie).click();
  await panel(frankie).getByRole('button', { name: 'Mark all as read' }).click();
  await frankie.keyboard.press('Escape');
  await frankie.reload({ waitUntil: 'networkidle' });
  await frankie.waitForTimeout(1000);
  if ((await frankie.getByTestId('notification-count').count()) > 0)
    throw new Error('the count came back after a reload');
});

await step('Help says which version this is, and whether it is the live one', async () => {
  await admin.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId('version-card');
  await card.getByText('About this version').waitFor({ timeout: 10000 });
  const version = await card.getByTestId('app-version').innerText();
  if (!/^\d{4}\.\d{2}\.\d{2}( \([0-9a-f]{7}\))?$/.test(version))
    throw new Error(`the version reads "${version}"`);
  await card.getByText(/^Test — /).waitFor({ timeout: 5000 });
});
await admin.screenshot({ path: `${OUT}/121-help-version.png`, fullPage: true });

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL BELL CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
for (const e of errors) console.log(` - ${e}`);
process.exit(errors.length === 0 ? 0 : 1);
