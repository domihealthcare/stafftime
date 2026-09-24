// Captured clock-in location: what leaves the server, and to whom.
//
// These are API-level rules with no screen behind them, so the suite signs in
// through the real UI to get a real session cookie and then asks the API
// directly — through the browser's own request context, so the session, the
// cookie flags and the CSP all apply exactly as they do in the app.
import { chromium } from 'playwright';
import { clockOut } from './clock-out.mjs';
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

// Anything that says where a person physically was.
const CAPTURED = /latitude|longitude|accuracymeters|clockinip|clockoutip/i;

async function signIn(email, geolocation) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    ...(geolocation ? { permissions: ['geolocation'], geolocation } : {}),
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

// A real browser punch, from inside the North Bergen geofence, so there is
// something captured to be careful with.
const employee = await signIn('frontdesk@domihealthcare.com', {
  latitude: 40.8045,
  longitude: -74.012,
  accuracy: 25,
});

let entryId;

await step('a browser punch is verified by geofence', async () => {
  await employee.getByRole('button', { name: /Clock in/ }).click();
  await employee.getByText(/On the clock/).waitFor({ timeout: 25000 });

  const response = await employee.request.get(`${BASE}/api/time-entries/current`);
  const entry = await response.json();
  entryId = entry.id;
  if (entry.clockInVerification !== 'GEOFENCE')
    throw new Error(`verified as ${entry.clockInVerification}, so nothing was captured to test`);
});

await step('the punch the employee gets back carries no coordinates', async () => {
  const body = await (await employee.request.get(`${BASE}/api/time-entries/current`)).text();
  const leak = JSON.stringify(Object.keys(JSON.parse(body))).match(CAPTURED);
  if (leak) throw new Error(`the open punch carried ${leak[0]}`);
});

const admin = await signIn('admin@domihealthcare.com');

await step('a whole timesheet carries no coordinates for anybody', async () => {
  // The bulk read is the one that matters: this used to hand out the position
  // of every punch in the practice, to every screen, and nothing read one.
  const rows = await (await admin.request.get(`${BASE}/api/time-entries`)).json();
  if (rows.length === 0) throw new Error('no entries came back, so nothing was checked');

  const leak = JSON.stringify(rows).match(CAPTURED);
  if (leak) throw new Error(`a list of ${rows.length} entries carried ${leak[0]}`);
});

await step('an admin can look up one punch deliberately', async () => {
  const detail = await (await admin.request.get(`${BASE}/api/time-entries/${entryId}/location`)).json();

  if (Number(detail.clockInLatitude).toFixed(3) !== '40.804')
    throw new Error(`got latitude ${detail.clockInLatitude}`);
  // Recent, and it has its coordinates: nothing has been cleared.
  if (detail.cleared !== false) throw new Error('a fresh punch was reported as cleared');
});

await step('a manager cannot, however current the punch', async () => {
  const manager = await signIn('manager@domihealthcare.com');
  const response = await manager.request.get(`${BASE}/api/time-entries/${entryId}/location`);
  if (response.status() !== 403) throw new Error(`manager got ${response.status()}, not 403`);

  const body = await response.text();
  const leak = body.match(CAPTURED);
  if (leak) throw new Error(`the refusal itself carried ${leak[0]}`);
});

await step('the employee cannot look up their own, either', async () => {
  // Not because it is secret from them, but because this route exists for
  // settling a dispute and both sides of one should go through the same person.
  const response = await employee.request.get(`${BASE}/api/time-entries/${entryId}/location`);
  if (response.status() !== 403) throw new Error(`employee got ${response.status()}, not 403`);
});

await step('clocking out leaves the punch just as quiet', async () => {
  await clockOut(employee);
  await employee.getByText(/Not clocked in/).waitFor({ timeout: 25000 });

  const rows = await (await admin.request.get(`${BASE}/api/time-entries`)).json();
  const leak = JSON.stringify(rows).match(CAPTURED);
  if (leak) throw new Error(`a completed punch carried ${leak[0]}`);
});
await admin.screenshot({ path: `${OUT}/70-privacy.png`, fullPage: true });

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL PRIVACY CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
