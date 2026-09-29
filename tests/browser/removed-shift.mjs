import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
// A published shift that is removed is kept as CANCELLED. The week always left
// it out; the month showed it, and the Clock screen could call it "Today's
// shift" (found by Dominguez, 29 September 2026).
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

const signInAs = async (page, email) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'Schedule' }).waitFor({ timeout: 20000 });
};

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

const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await signInAs(admin, 'admin@domihealthcare.com');
const frankie = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await signInAs(frankie, 'frontdesk@domihealthcare.com');

// The 15th of this month, so it is in the month the Schedule opens on.
const day = new Date();
day.setDate(15);
day.setHours(9, 0, 0, 0);
const end = new Date(day);
end.setHours(13);
const dayLabel = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

const staff = (await call(admin, '/employees')).body;
const me = staff.find((person) => person.email === 'frontdesk@domihealthcare.com');
const northBergen = (await call(admin, '/locations')).body.find((l) => l.name === 'North Bergen');
const shift = await call(admin, '/shifts', {
  method: 'POST',
  body: JSON.stringify({
    employeeId: me.id,
    locationId: northBergen.id,
    startsAt: day.toISOString(),
    endsAt: end.toISOString(),
    status: 'PUBLISHED',
    notes: 'removed-shift-suite',
  }),
});
if (shift.status !== 201) throw new Error(`the shift answered ${shift.status}`);

const monthCell = async () => {
  await frankie.getByRole('link', { name: 'Schedule' }).click();
  await frankie.getByRole('button', { name: 'Month', exact: true }).click();
  const cell = frankie.locator(`button[aria-label^="${dayLabel} —"]`);
  await cell.waitFor({ timeout: 10000 });
  return cell.getAttribute('aria-label');
};

await step('a published shift shows in the month', async () => {
  const label = await monthCell();
  if (!label.includes('1 shift')) throw new Error(`the 15th reads "${label}"`);
});

await step('once removed it is gone from the month too, not only the week', async () => {
  const removed = await call(admin, `/shifts/${shift.body.id}`, { method: 'DELETE' });
  if (removed.status >= 300) throw new Error(`removing answered ${removed.status}`);
  // Published, so it is kept as cancelled rather than deleted.
  const after = (await call(admin, `/shifts?from=${day.toISOString()}&to=${end.toISOString()}`)).body;
  if (!after.some((s) => s.id === shift.body.id && s.status === 'CANCELLED')) {
    throw new Error('expected the removed shift to be kept as cancelled');
  }
  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const label = await monthCell();
  if (!label.includes('no shifts')) throw new Error(`the 15th still reads "${label}"`);
});

await frankie.screenshot({ path: `${OUT}/removed-shift-month.png`, fullPage: true });

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL REMOVED-SHIFT CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
