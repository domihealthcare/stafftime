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
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

// Phone-sized, because that is how this screen gets used: standing at the desk.
const ctx = await browser.newContext({
  viewport: { width: 420, height: 900 },
  permissions: ['geolocation'],
  // A point ~80m from the seeded North Bergen pin — as if standing in the office.
  geolocation: { latitude: 40.80472, longitude: -74.012, accuracy: 12 },
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('admin@domihealthcare.com');
await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByText('Not clocked in').waitFor({ timeout: 15000 });

await step('an admin can open Locations and sees both offices', async () => {
  await page.getByRole('link', { name: 'Locations' }).click();
  await page.getByRole('heading', { name: 'North Bergen' }).waitFor({ timeout: 10000 });
  await page.getByRole('heading', { name: 'West New York' }).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/24-locations.png`, fullPage: true });

const latField = () => page.locator('input[id^="lat-"]').first();
const lngField = () => page.locator('input[id^="lng-"]').first();

let before;
await step('the seeded placeholder coordinates are shown', async () => {
  before = await latField().inputValue();
  if (!/^40\./.test(before)) throw new Error(`unexpected latitude: ${before}`);
});

await step('"Use my current location" fills in this device position', async () => {
  await page.getByRole('button', { name: 'Use my current location' }).first().click();
  await page.getByText(/Position captured/).waitFor({ timeout: 15000 });

  const after = await latField().inputValue();
  if (after === before) throw new Error('latitude did not change');
  if (after !== '40.804720') throw new Error(`expected the mocked position, got ${after}`);
  if (await lngField().inputValue() !== '-74.012000')
    throw new Error('longitude was not captured');
});

await step('it reports how far that is from the saved position', async () => {
  const text = await page.getByText(/from the position currently saved/).innerText();
  const metres = Number(/(\d+)m/.exec(text)?.[1]);
  // ~80m north of the seeded pin.
  if (!(metres > 60 && metres < 100)) throw new Error(`unexpected distance: "${text}"`);
});

await step('nothing is saved until Save is pressed', async () => {
  const response = await page.request.get(`${BASE}/api/locations`);
  const saved = (await response.json()).find((l) => l.slug === 'north-bergen');
  if (Number(saved.latitude).toFixed(5) === '40.80472')
    throw new Error('the capture was persisted without pressing Save');
});
await page.screenshot({ path: `${OUT}/25-locations-captured.png`, fullPage: true });

await step('saving persists the coordinates and the radius', async () => {
  await page.locator('input[id^="radius-"]').first().fill('120');
  await page.getByRole('button', { name: 'Save North Bergen' }).click();
  await page.getByText('Saved.').waitFor({ timeout: 15000 });

  const response = await page.request.get(`${BASE}/api/locations`);
  const saved = (await response.json()).find((l) => l.slug === 'north-bergen');
  if (Number(saved.latitude).toFixed(5) !== '40.80472')
    throw new Error(`latitude not saved: ${saved.latitude}`);
  if (saved.geofenceRadiusMeters !== 120)
    throw new Error(`radius not saved: ${saved.geofenceRadiusMeters}`);
});

await step('the new geofence actually governs clock-in', async () => {
  // Sign in as an employee from a point outside the tightened 120m radius.
  const farCtx = await browser.newContext({
    viewport: { width: 420, height: 900 },
    permissions: ['geolocation'],
    // ~300m from the new pin.
    geolocation: { latitude: 40.80742, longitude: -74.012, accuracy: 10 },
  });
  const far = await farCtx.newPage();
  await far.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await far.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await far.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await far.getByRole('button', { name: 'Sign in' }).click();
  await far.getByRole('button', { name: 'Clock in' }).click({ timeout: 15000 });

  const alert = far.getByRole('alert');
  await alert.waitFor({ timeout: 15000 });
  const text = await alert.innerText();
  if (!/outside the 120m clock-in area/.test(text))
    throw new Error(`expected the new 120m radius in the message, got: "${text}"`);
  await farCtx.close();
});

await step('an IP allow-list entry round-trips', async () => {
  await page.locator('input[id^="ips-"]').first().fill('203.0.113.0/24, 198.51.100.7');
  await page.getByRole('button', { name: 'Save North Bergen' }).click();
  await page.getByText('Saved.').waitFor({ timeout: 15000 });

  const response = await page.request.get(`${BASE}/api/locations`);
  const saved = (await response.json()).find((l) => l.slug === 'north-bergen');
  if (JSON.stringify(saved.allowedIps) !== JSON.stringify(['203.0.113.0/24', '198.51.100.7']))
    throw new Error(`allow-list not saved: ${JSON.stringify(saved.allowedIps)}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL LOCATION CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
