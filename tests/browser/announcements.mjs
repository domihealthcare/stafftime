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

async function writePost(page, title, body, { primary = false } = {}) {
  await page.getByRole('button', { name: '+ New post' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Message').fill(body);
  if (primary) await page.getByLabel(/Primary announcement/).check();
  await page.getByRole('button', { name: 'Post it' }).click();
  await page.getByRole('heading', { name: title }).waitFor({ timeout: 15000 });
}

/// The card on the News page holding this title, and nothing else's buttons.
const card = (page, title) =>
  page.locator('[data-testid^="post-"]').filter({ has: page.getByRole('heading', { name: title }) });

const primaryCard = (page) => page.getByTestId('primary-announcement');

await step('nothing is shown on the public sign-in page', async () => {
  const anon = await browser.newPage();
  await anon.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await anon.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 15000 });
  if ((await primaryCard(anon).count()) > 0) throw new Error('an announcement showed before sign-in');

  // And the API will not hand one out without a session either.
  const status = await anon.evaluate(() =>
    fetch('/api/announcements/primary').then((response) => response.status),
  );
  if (status !== 401) throw new Error(`the primary announcement answered ${status} without a session`);
  await anon.close();
});

const admin = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
admin.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(admin, 'admin@domihealthcare.com');

await step('the home screen has no gap before anything is posted', async () => {
  await admin.waitForTimeout(1000);
  if ((await primaryCard(admin).count()) > 0) throw new Error('an empty announcement showed');
});

await admin.getByRole('button', { name: 'Team', exact: true }).click();

await admin.getByRole('link', { name: 'News', exact: true }).click();

await step('the first post is primary whether ticked or not', async () => {
  await admin.getByText('Nothing has been posted yet.').waitFor({ timeout: 15000 });
  await admin.getByRole('button', { name: '+ New post' }).click();

  const tick = admin.getByLabel(/Primary announcement/);
  if (!(await tick.isChecked())) throw new Error('the first post was not ticked as primary');
  if (!(await tick.isDisabled())) throw new Error('the first post could be unticked');
  await admin.getByRole('button', { name: 'Cancel' }).click();

  await writePost(admin, 'Welcome to the staff app', 'Clock in here, check the rota,\nand read the news.');
  await card(admin, 'Welcome to the staff app').getByText('Primary', { exact: true }).waitFor({ timeout: 5000 });
});

await step('line breaks in a post survive', async () => {
  const text = await card(admin, 'Welcome to the staff app').locator('article').innerText();
  if (!/check the rota,\nand read the news/.test(text)) throw new Error(`line break lost: ${text}`);
});

await step('an unticked post joins the list without taking over', async () => {
  await writePost(admin, 'Parking', 'Use the back lot from Monday.');
  if ((await card(admin, 'Parking').getByText('Primary', { exact: true }).count()) > 0)
    throw new Error('an unticked post became primary');
  await card(admin, 'Welcome to the staff app').getByText('Primary', { exact: true }).waitFor({ timeout: 5000 });

  // Newest first, like a blog.
  const titles = await admin.locator('[data-testid^="post-"] h2').allInnerTexts();
  if (titles[0] !== 'Parking') throw new Error(`newest post was not first: ${titles.join(', ')}`);
});

await step('a ticked post takes the primary over', async () => {
  await writePost(admin, 'Snow closure', 'Both offices close at 2pm today.', { primary: true });
  await card(admin, 'Snow closure').getByText('Primary', { exact: true }).waitFor({ timeout: 5000 });
  if ((await admin.locator('[data-testid^="post-"]').getByText('Primary', { exact: true }).count()) !== 1)
    throw new Error('more than one post is primary');
});

await step('the primary cannot be unticked, only replaced', async () => {
  await card(admin, 'Snow closure').getByRole('button', { name: 'Edit' }).click();
  const tick = admin.getByLabel(/Primary announcement/);
  if (!(await tick.isDisabled())) throw new Error('the primary could be unticked');
  await admin.getByText('To change that, make another post primary.').waitFor({ timeout: 5000 });
  await admin.getByRole('button', { name: 'Cancel' }).click();

  // The API says no too, not just the form.
  const answer = await admin.evaluate(async () => {
    const posts = await fetch('/api/announcements').then((r) => r.json());
    const primary = posts.find((post) => post.isPrimary);
    const response = await fetch(`/api/announcements/${primary.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPrimary: false }),
    });
    return { status: response.status, body: await response.json() };
  });
  if (answer.status !== 400) throw new Error(`unticking the primary answered ${answer.status}`);
});

await step('"Make primary" moves it', async () => {
  await card(admin, 'Parking').getByRole('button', { name: 'Make primary' }).click();
  await card(admin, 'Parking').getByText('Primary', { exact: true }).waitFor({ timeout: 10000 });
  if ((await card(admin, 'Snow closure').getByText('Primary', { exact: true }).count()) > 0)
    throw new Error('the old primary kept its badge');
});

await step('an edit is saved and says it was edited', async () => {
  await card(admin, 'Parking').getByRole('button', { name: 'Edit' }).click();
  await admin.getByLabel('Message').fill('Use the back lot from Tuesday.');
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await card(admin, 'Parking').getByText('Use the back lot from Tuesday.').waitFor({ timeout: 10000 });
  await card(admin, 'Parking').getByText(/edited/).waitFor({ timeout: 5000 });
  await card(admin, 'Parking').getByText('Primary', { exact: true }).waitFor({ timeout: 5000 });
});
await admin.screenshot({ path: `${OUT}/70-news.png`, fullPage: true });

await step('the home screen leads with the primary post', async () => {
  await admin.getByRole('link', { name: 'Clock', exact: true }).click();
  await primaryCard(admin).getByText('Parking').waitFor({ timeout: 15000 });
  await primaryCard(admin).getByText('Use the back lot from Tuesday.').waitFor({ timeout: 5000 });
});
await admin.screenshot({ path: `${OUT}/71-home-announcement.png`, fullPage: true });

await step('deleting the primary hands it to the newest post left', async () => {
  await admin.getByRole('button', { name: 'Team', exact: true }).click();
  await admin.getByRole('link', { name: 'News', exact: true }).click();
  const parking = card(admin, 'Parking');
  await parking.getByRole('button', { name: 'Delete', exact: true }).click();
  await parking.getByText('The newest other post becomes primary.').waitFor({ timeout: 5000 });
  await parking.getByRole('button', { name: 'Delete it' }).click();
  await admin.getByRole('heading', { name: 'Parking' }).waitFor({ state: 'detached', timeout: 10000 });

  // Snow closure is the newest of the two left.
  await card(admin, 'Snow closure').getByText('Primary', { exact: true }).waitFor({ timeout: 10000 });
});

await step('an employee reads the news on a phone and cannot write it', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const emp = await ctx.newPage();
  emp.on('pageerror', (e) => errors.push(`employee pageerror: ${e.message}`));
  await signIn(emp, 'frontdesk@domihealthcare.com');

  await primaryCard(emp).getByText('Snow closure').waitFor({ timeout: 15000 });
  await emp.screenshot({ path: `${OUT}/72-home-announcement-phone.png`, fullPage: true });

  await primaryCard(emp).getByRole('link', { name: 'All news →' }).click();
  await emp.getByRole('heading', { name: 'Welcome to the staff app' }).waitFor({ timeout: 15000 });

  if ((await emp.getByRole('button', { name: '+ New post' }).count()) > 0)
    throw new Error('an employee was offered the post form');
  if ((await emp.getByRole('button', { name: 'Edit' }).count()) > 0)
    throw new Error('an employee was offered Edit');

  const status = await emp.evaluate(() =>
    fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Not mine', body: 'to post' }),
    }).then((response) => response.status),
  );
  if (status !== 403) throw new Error(`an employee posting got ${status}`);

  // There is nothing here to upload, same as everywhere else.
  if ((await emp.locator('input[type=file]').count()) > 0) throw new Error('a file input appeared');

  const overflow = await emp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('the News page scrolls sideways on a phone');
  await ctx.close();
});

await step('a manager can read but not write', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const mgr = await ctx.newPage();
  await signIn(mgr, 'manager@domihealthcare.com');
  await mgr.getByRole('button', { name: 'Team', exact: true }).click();
  await mgr.getByRole('link', { name: 'News', exact: true }).click();
  await mgr.getByRole('heading', { name: 'Snow closure' }).waitFor({ timeout: 15000 });
  if ((await mgr.getByRole('button', { name: '+ New post' }).count()) > 0)
    throw new Error('a manager was offered the post form');
  await ctx.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL ANNOUNCEMENT CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
