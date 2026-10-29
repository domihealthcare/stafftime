import { chromium } from 'playwright';
import { goTo } from './nav.mjs';
import { mkdirSync } from 'node:fs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
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

const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

await step('the test-environment banner shows before anyone signs in', async () => {
  await page.getByText(/Test environment - nothing here is real/).waitFor({ timeout: 15000 });
});
await page.screenshot({ path: `${OUT}/35-test-banner.png`, fullPage: true });

await page.getByLabel('Email').fill('frontdesk@domihealthcare.com');
await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByText('Not clocked in').waitFor({ timeout: 15000 });

await step('the banner stays once signed in', async () => {
  await page.getByText(/Test environment/).waitFor({ timeout: 5000 });
});

await step('the banner is on the kiosk screen too', async () => {
  const kioskCtx = await browser.newContext();
  const kiosk = await kioskCtx.newPage();
  await kiosk.goto(`${BASE}/kiosk`, { waitUntil: 'networkidle' });
  await kiosk.getByText(/Test environment/).waitFor({ timeout: 15000 });
  await kioskCtx.close();
});

await step('the schedule offers calendar syncing', async () => {
  await goTo(page, 'Schedule');
  await page.getByText('Your calendar').waitFor({ timeout: 15000 });
});

let url;
await step('turning it on shows the link once, to copy then', async () => {
  // run-all.sh clears every link between suites; run alone after an earlier
  // run, the link is already on and can only be replaced, never shown again.
  const turnOn = page.getByRole('button', { name: 'Turn on syncing' });
  if (await turnOn.count()) {
    await turnOn.click();
  } else {
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('button', { name: 'Make a new link', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Make a new link?' }).getByRole('button', { name: 'Yes, make a new link' }).click();
  }
  await page.getByTestId('calendar-link-once').getByText(/only time your calendar addresses are shown/).waitFor({ timeout: 15000 });
  const input = page.getByLabel('Your private calendar address');
  await input.waitFor({ timeout: 15000 });
  url = await input.inputValue();
  const expected = new RegExp(
    `^${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/calendar/[A-Za-z0-9_-]{32}/domi\\.ics$`,
  );
  if (!expected.test(url))
    throw new Error(`unexpected calendar url: ${url}`);

  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('button', { name: 'Copied', exact: true }).waitFor({ timeout: 5000 });
});

await step('the Providers calendar is offered beside the all-in-one, as it is not in it', async () => {
  const beside = await page.getByTestId('alongside-providers').getByRole('textbox').inputValue();
  if (beside !== url.replace(/domi\.ics$/, 'providers.ics')) throw new Error(`providers address: ${beside}`);
});
await page.screenshot({ path: `${OUT}/36-calendar-link.png`, fullPage: true });

await step('it warns that the address is a credential', async () => {
  await page.getByText(/Anyone who has one can see your schedule/).waitFor({ timeout: 5000 });
});

await step('subscription instructions cover Google, Apple and Outlook', async () => {
  for (const name of ['Google Calendar', 'iPhone or iPad', 'Outlook']) {
    await page.getByText(name, { exact: true }).waitFor({ timeout: 5000 });
  }
});

await step('the link actually serves a calendar to an unauthenticated fetch', async () => {
  const anon = await browser.newContext();
  const response = await anon.request.get(url);
  if (!response.ok()) throw new Error(`feed returned ${response.status()}`);
  const type = response.headers()['content-type'] ?? '';
  if (!type.includes('text/calendar')) throw new Error(`content-type was ${type}`);
  const body = await response.text();
  if (!body.startsWith('BEGIN:VCALENDAR')) throw new Error('not a calendar body');
  if (!body.includes('BEGIN:VEVENT')) throw new Error('no events in the feed');
  await anon.close();
});

await step('the link is never shown or sent again, but syncing stays on', async () => {
  const read = await page.evaluate(() => fetch('/api/calendar/link').then((r) => r.json()));
  if (!read.hasLink || 'token' in read || JSON.stringify(read).includes(new URL(url).pathname.split('/')[3])) {
    throw new Error(`reading the link answered ${JSON.stringify(read)}`);
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Your calendar').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const setUp = page.getByTestId('calendar-link-set-up');
  await setUp.getByText(/^Set up on /).waitFor({ timeout: 10000 });
  await setUp.getByText('Phones and calendars already subscribed keep updating.').waitFor();
  if (await page.getByLabel('Your private calendar address').count()) throw new Error('the address is shown again after a reload');
  if ((await page.content()).includes(url)) throw new Error('the address is somewhere on the page after a reload');
  // The phone's copy still works.
  const anon = await browser.newContext();
  const response = await anon.request.get(url);
  if (!response.ok()) throw new Error(`the subscribed address stopped working: ${response.status()}`);
  await anon.close();
});

await step('a new link asks first, then breaks the old address', async () => {
  const old = url;
  await page.getByRole('button', { name: 'Make a new link', exact: true }).click();
  const ask = page.getByRole('alertdialog', { name: 'Make a new link?' });
  await ask.getByRole('button', { name: 'Keep the old link' }).click();
  await ask.waitFor({ state: 'detached', timeout: 5000 });
  if (await page.getByLabel('Your private calendar address').count()) throw new Error('a new link was made without saying yes');
  await page.getByRole('button', { name: 'Make a new link', exact: true }).click();
  await ask.getByRole('button', { name: 'Yes, make a new link' }).click();
  await page.getByLabel('Your private calendar address').waitFor({ timeout: 15000 });
  await page.waitForFunction(
    (previous) => {
      const field = document.getElementById('calendar-url');
      return field instanceof HTMLInputElement && field.value !== previous;
    },
    old,
    { timeout: 15000 },
  );

  const anon = await browser.newContext();
  const response = await anon.request.get(old);
  if (response.ok()) throw new Error('the old calendar address still works');
  await anon.close();
});

await step('turning syncing off stops the feed entirely', async () => {
  const current = await page.getByLabel('Your private calendar address').inputValue();
  await page.getByRole('button', { name: 'Turn off syncing' }).click();
  await page.getByRole('alertdialog', { name: 'Turn off calendar syncing?' }).getByRole('button', { name: 'Yes, turn it off' }).click();
  await page.getByRole('button', { name: 'Turn on syncing' }).waitFor({ timeout: 15000 });

  const anon = await browser.newContext();
  const response = await anon.request.get(current);
  if (response.ok()) throw new Error('the feed still works after being turned off');
  await anon.close();
});

await step('calendar invites are off until Google is set up, and only admins see how they are going', async () => {
  // Dominguez, September 2026: shifts and events as invites from office@.
  // Off here, so the feed above still carried the shifts.
  const answers = await page.evaluate(async () => ({
    config: await fetch('/api/config').then((r) => r.json()),
    status: (await fetch('/api/calendar-invites/status')).status,
    send: (await fetch('/api/calendar-invites/sync', { method: 'POST' })).status,
  }));
  if (answers.config.calendarInvites !== false) throw new Error(`config says ${answers.config.calendarInvites}`);
  if (answers.status !== 403 || answers.send !== 403)
    throw new Error(`staff got ${answers.status} and ${answers.send}`);

  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const admin = await adminCtx.newPage();
  admin.on('pageerror', (e) => errors.push(`admin pageerror: ${e.message}`));
  await admin.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await admin.getByLabel('Email').fill('admin@domihealthcare.com');
  await admin.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await admin.getByText('Not clocked in').waitFor({ timeout: 20000 });
  await admin.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId('calendar-invites-card');
  await card.getByText(/^Off\./).waitFor({ timeout: 10000 });
  if ((await card.getByRole('button', { name: 'Send now' }).count()) > 0)
    throw new Error('offered to send invites while they are off');
  await adminCtx.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CALENDAR CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
