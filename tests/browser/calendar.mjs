import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
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

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

await step('the test-environment banner shows before anyone signs in', async () => {
  await page.getByText(/Test environment — nothing here is real/).waitFor({ timeout: 15000 });
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
  await kiosk.goto('http://127.0.0.1:5173/kiosk', { waitUntil: 'networkidle' });
  await kiosk.getByText(/Test environment/).waitFor({ timeout: 15000 });
  await kioskCtx.close();
});

await step('the schedule offers calendar syncing', async () => {
  await page.getByRole('link', { name: 'Schedule' }).click();
  await page.getByText('Your calendar').waitFor({ timeout: 15000 });
});

let url;
await step('the link can be revealed and copied', async () => {
  // Already on from the API checks, so it shows "Show link".
  const toggle = page.getByRole('button', { name: /Show link|Turn on syncing/ });
  await toggle.click();
  const input = page.getByLabel('Your private calendar address');
  await input.waitFor({ timeout: 15000 });
  url = await input.inputValue();
  if (!/^http:\/\/127\.0\.0\.1:5173\/api\/calendar\/[A-Za-z0-9_-]{32}\/domi\.ics$/.test(url))
    throw new Error(`unexpected calendar url: ${url}`);

  await page.getByRole('button', { name: 'Copy' }).click();
  await page.getByRole('button', { name: 'Copied' }).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/36-calendar-link.png`, fullPage: true });

await step('it warns that the address is a credential', async () => {
  await page.getByText(/Anyone who has it can see your schedule/).waitFor({ timeout: 5000 });
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

await step('regenerating the link breaks the old address', async () => {
  const old = url;
  await page.getByRole('button', { name: 'Regenerate the link' }).click();
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
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Turn off syncing' }).click();
  await page.getByRole('button', { name: 'Turn on syncing' }).waitFor({ timeout: 15000 });

  const anon = await browser.newContext();
  const response = await anon.request.get(current);
  if (response.ok()) throw new Error('the feed still works after being turned off');
  await anon.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CALENDAR CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
