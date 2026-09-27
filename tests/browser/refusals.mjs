import { chromium } from 'playwright';
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

// Real login replaced the dev employee picker.
const signInAs = async (page, email, password = 'shift-change-2026') => {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

async function signedInPage(contextOpts) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, ...contextOpts });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await signInAs(page, 'frontdesk@domihealthcare.com');
  await page.getByText('Not clocked in').waitFor({ timeout: 10000 });
  return page;
}

// 1. On the right continent, wrong place: at home, 2km away.
await step('clocking in from home is refused, and says how far away you are', async () => {
  const page = await signedInPage({
    permissions: ['geolocation'],
    geolocation: { latitude: 40.7878, longitude: -74.0143, accuracy: 20 },
  });
  await page.getByRole('button', { name: 'Clock in' }).click();
  const alert = page.getByRole('alert');
  await alert.waitFor({ timeout: 15000 });
  const text = await alert.innerText();
  if (!/outside the \d+ foot clock-in area/i.test(text)) throw new Error(`unhelpful: "${text}"`);
  if (!/front-desk kiosk/i.test(text)) throw new Error(`did not offer the kiosk: "${text}"`);
  await page.screenshot({ path: `${OUT}/08-refused-offsite.png`, fullPage: true });
  // And they must still be clocked out, not half-punched.
  await page.getByText('Not clocked in').waitFor({ timeout: 5000 });
});

// 2. Location permission blocked entirely.
await step('blocked location permission explains what to do', async () => {
  const page = await signedInPage({ permissions: [] });
  await page.getByRole('button', { name: 'Clock in' }).click();
  const alert = page.getByRole('alert');
  await alert.waitFor({ timeout: 20000 });
  const text = await alert.innerText();
  if (!/location/i.test(text)) throw new Error(`unhelpful: "${text}"`);
  if (!/kiosk/i.test(text)) throw new Error(`did not offer the kiosk: "${text}"`);
  await page.screenshot({ path: `${OUT}/09-refused-blocked.png`, fullPage: true });
});

// 3. Claiming to be the time clock. A kiosk punch skips the location check, so
// only the time clock itself may make one — never an ordinary signed-in call,
// from home, for yourself or a colleague.
await step('a punch that claims to come from the time clock is refused', async () => {
  const page = await signedInPage({});
  const answers = await page.evaluate(async () => {
    const places = await fetch('/api/locations').then((r) => r.json());
    const me = await fetch('/api/employees/me').then((r) => r.json());
    const colleague = (await fetch('/api/directory').then((r) => r.json())).find((p) => p.id !== me.id);
    const punch = (body) =>
      fetch('/api/time-entries/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.status);
    return [
      await punch({ locationId: places[0].id, method: 'KIOSK' }),
      await punch({ locationId: places[0].id, method: 'KIOSK', employeeId: colleague.id }),
    ];
  });
  if (answers.some((status) => status !== 403)) throw new Error(`answered ${answers.join(', ')}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Not clocked in').waitFor({ timeout: 5000 });
});

// Not a refusal, but the other side of one: somebody who works at both offices,
// standing at West New York with North Bergen picked, is clocked in where they
// are — not turned away as "outside North Bergen".
await step('standing at the other office clocks you in there, not a refusal', async () => {
  const probe = await signedInPage({});
  const places = await probe.evaluate(() => fetch('/api/locations').then((r) => r.json()));
  await probe.context().close();
  const wny = places.find((p) => p.name === 'West New York');
  const nb = places.find((p) => p.name === 'North Bergen');
  const ctx = await browser.newContext({
    viewport: { width: 420, height: 900 },
    permissions: ['geolocation'],
    geolocation: { latitude: Number(wny.latitude), longitude: Number(wny.longitude), accuracy: 15 },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await signInAs(page, 'manager@domihealthcare.com');
  await page.getByText('Not clocked in').waitFor({ timeout: 10000 });
  await page.getByLabel('Location').selectOption(nb.id);
  await page.getByRole('button', { name: 'Clock in' }).click();
  await page.getByRole('button', { name: /Clock out/ }).waitFor({ timeout: 15000 });
  const entry = await page.evaluate(() => fetch('/api/time-entries/current').then((r) => r.json()));
  if (entry.locationId !== wny.id) throw new Error(`clocked in at ${entry.location?.name ?? entry.locationId}`);
  await page.evaluate(() => fetch('/api/time-entries/clock-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  await ctx.close();
});

// 4. A session that ends while the app is open — eight hours idle on a phone —
// goes back to the sign-in screen, rather than leaving errors on a screen that
// can do nothing about them.
await step('an ended session goes back to sign-in on the next tap', async () => {
  const stale = await signedInPage({});
  const other = await signedInPage({});
  const ended = await other.evaluate(async () =>
    fetch('/api/auth/sessions', { method: 'DELETE' }).then((r) => r.json()),
  );
  if (!ended.signedOut) throw new Error('nothing was signed out');
  await stale.getByRole('link', { name: 'Timesheet' }).first().click();
  await stale.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL REFUSAL CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
