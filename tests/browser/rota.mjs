import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// The rota: a row per person, open shifts per office flagged until somebody
// is put in them, and three ways of grouping the same week.
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

const mgrCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const mgr = await mgrCtx.newPage();
mgr.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

const openRow = (place) => mgr.getByTestId(`open-row-${place}`);
const openChips = () => mgr.getByTestId('week-grid').getByTestId('open-shift');

// Next week, so everything is in the future and inside the round-up's window.
await mgr.getByRole('link', { name: 'Schedule' }).click();
await mgr.getByTestId('week-grid').waitFor({ timeout: 15000 });
await mgr.getByRole('button', { name: 'Next →' }).click();
await mgr.getByText('Coverage this week').waitFor({ timeout: 15000 });

await step('an office with nothing open has an open-shift row, and no flag', async () => {
  await openRow('North Bergen').waitFor({ timeout: 10000 });
  await openRow('West New York').waitFor({ timeout: 5000 });
  if ((await mgr.getByTestId('open-shift-flag').count()) > 0) throw new Error('flagged with nothing open');
});

await step('repeating open shifts: two Front Desk slots every Saturday, nobody named', async () => {
  await mgr.getByRole('button', { name: 'Repeating shifts' }).click();
  await mgr.getByLabel('Employee').selectOption({ label: 'Nobody yet — open shifts to fill' });
  await mgr.getByLabel('Location', { exact: true }).selectOption({ label: 'North Bergen' });
  await mgr.getByLabel(/^Job role/).selectOption({ label: 'Front Desk' });
  await mgr.getByLabel('How many each day').fill('2');
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    await mgr.getByRole('button', { name: day, exact: true }).click();
  }
  await mgr.getByRole('button', { name: 'Sat', exact: true }).click();
  await mgr.getByLabel('Starts').fill('09:00');
  await mgr.getByLabel('Ends').fill('13:00');
  const saved = mgr.waitForResponse((r) => r.url().includes('/api/shifts/repeat'));
  await mgr.getByRole('button', { name: 'Create the shifts' }).click();
  if (!(await saved).ok()) throw new Error('the open shifts were refused');
  await mgr.getByText(/shifts? created/).waitFor({ timeout: 15000 });
});

await step('they sit in North Bergen’s open row, flagged, and the day heading counts them', async () => {
  await openRow('North Bergen').getByTestId('open-shift').nth(1).waitFor({ timeout: 10000 });
  if ((await openRow('North Bergen').getByTestId('open-shift').count()) !== 2)
    throw new Error('expected two open shifts this week');
  await mgr.getByTestId('open-shift-flag').getByText(/2 open shifts/).waitFor({ timeout: 5000 });
  await mgr.getByText('2 open', { exact: true }).first().waitFor({ timeout: 5000 });
  await openRow('North Bergen').getByText('Front Desk').first().waitFor({ timeout: 5000 });
});
await mgr.screenshot({ path: `${OUT}/102-rota-open.png`, fullPage: true });

await step('the round-up flags open shifts in the next fortnight', async () => {
  // The banner is read when the screen opens, like every other banner.
  await mgr.reload({ waitUntil: 'networkidle' });
  await mgr.getByText('Open shifts nobody is on yet', { exact: true }).waitFor({ timeout: 10000 });
  await mgr.getByText(/North Bergen — 2 open shifts nobody is on yet/).waitFor({ timeout: 5000 });
  await mgr.getByRole('button', { name: 'Next →' }).click();
  await openRow('North Bergen').getByTestId('open-shift').nth(1).waitFor({ timeout: 10000 });
});

await step('putting somebody in an open shift moves it to their row', async () => {
  await openChips().first().click();
  const dialog = mgr.getByRole('dialog');
  await dialog.getByLabel('Put somebody in it').selectOption({ label: 'Frankie Front-Desk' });
  const saved = mgr.waitForResponse((r) => r.url().includes('/api/shifts/') && r.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Assign' }).click();
  if (!(await saved).ok()) throw new Error('the assignment was refused');
  await mgr.getByTestId('rota-row-Frankie Front-Desk').getByTestId('shift-chip').waitFor({ timeout: 10000 });
  if ((await openRow('North Bergen').getByTestId('open-shift').count()) !== 1)
    throw new Error('the open row still shows both');
  await mgr.getByTestId('open-shift-flag').getByText(/1 open shift\b/).waitFor({ timeout: 5000 });
});

await step('the same person cannot be put in two shifts at once', async () => {
  await openChips().first().click();
  const option = mgr.getByRole('dialog').getByLabel('Put somebody in it').locator('option', { hasText: 'Frankie Front-Desk' });
  if (!(await option.isDisabled())) throw new Error('Frankie was offered a shift she is already on at that time');
  await mgr.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
});

await step('taking somebody off makes it open again', async () => {
  await mgr.getByTestId('rota-row-Frankie Front-Desk').getByTestId('shift-chip').click();
  const saved = mgr.waitForResponse((r) => r.url().includes('/api/shifts/') && r.request().method() === 'PATCH');
  await mgr.getByRole('dialog').getByRole('button', { name: 'Make it an open shift' }).click();
  if (!(await saved).ok()) throw new Error('unassigning was refused');
  await mgr.getByTestId('open-shift-flag').getByText(/2 open shifts/).waitFor({ timeout: 10000 });
});

await step('an open shift can be added straight into a day, for another office', async () => {
  const add = openRow('West New York').getByRole('button', { name: /^Add an open shift at West New York on / }).first();
  await add.click();
  const dialog = mgr.getByRole('dialog', { name: 'Open shift' });
  await dialog.getByLabel(/^Job role/).selectOption({ label: 'Medical Assistant' });
  const saved = mgr.waitForResponse((r) => r.url().endsWith('/api/shifts') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Add shift' }).click();
  if (!(await saved).ok()) throw new Error('the open shift was refused');
  await openRow('West New York').getByTestId('open-shift').waitFor({ timeout: 10000 });
});

await step('by location, each office is its own section with its open row first', async () => {
  await mgr.getByRole('button', { name: 'By location' }).click();
  for (const place of ['North Bergen', 'West New York']) {
    const section = mgr.getByTestId(`rota-section-${place}`);
    await section.waitFor({ timeout: 5000 });
    const first = await section.locator('tr').nth(1).getAttribute('data-testid');
    if (first !== `open-row-${place}`) throw new Error(`${place} does not lead with its open shifts`);
  }
});

await step('by job role, the Front Desk section holds the Front Desk open shifts and its people', async () => {
  await mgr.getByRole('button', { name: 'By job role' }).click();
  const section = mgr.getByTestId('rota-section-Front Desk');
  await section.waitFor({ timeout: 5000 });
  if ((await section.getByTestId('open-shift').count()) !== 2) throw new Error('Front Desk open shifts missing');
  await section.getByText('Frankie Front-Desk').waitFor({ timeout: 5000 });
  const ma = mgr.getByTestId('rota-section-Medical Assistant');
  if ((await ma.getByTestId('open-shift').count()) !== 1) throw new Error('the MA open shift is not under Medical Assistant');
});
await mgr.screenshot({ path: `${OUT}/103-rota-by-role.png`, fullPage: true });

await step('filtering to one office leaves only its rows', async () => {
  await mgr.getByRole('button', { name: 'Everyone' }).click();
  await mgr.getByLabel('Show location').selectOption({ label: 'West New York' });
  await openRow('West New York').waitFor({ timeout: 5000 });
  if ((await openRow('North Bergen').count()) > 0) throw new Error('North Bergen still shown');
  await mgr.getByLabel('Show location').selectOption({ label: 'All locations' });
});

// Staff see their own row, never the open shifts or anybody else's.
const empCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const emp = await empCtx.newPage();
emp.on('pageerror', (e) => errors.push(`employee pageerror: ${e.message}`));
await signIn(emp, 'frontdesk@domihealthcare.com');

await step('staff see their own row, with no open shifts and no editing', async () => {
  await emp.getByRole('link', { name: 'Schedule' }).click();
  await emp.getByTestId('week-grid').waitFor({ timeout: 15000 });
  await emp.getByTestId('rota-row-Your shifts').waitFor({ timeout: 5000 });
  if ((await emp.getByTestId('open-shift').count()) > 0) throw new Error('staff were shown open shifts');
  if ((await emp.getByRole('button', { name: /^Add / }).count()) > 0) throw new Error('staff were offered add buttons');
  const theirs = await emp.evaluate(async () => (await fetch('/api/shifts').then((r) => r.json())).every((s) => s.employeeId !== null));
  if (!theirs) throw new Error('the API gave staff open shifts');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL ROTA CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
