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

async function signIn(page, email, password = 'shift-change-2026') {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
}

const json = (page, path, init = {}) =>
  page.evaluate(
    async ([path, init]) => {
      const response = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    [path, init],
  );

// Weeks of realistic punches, rota and leave, the way a manager reviewing
// the test site would see them.
const admin = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
await signIn(admin, 'admin@domihealthcare.com');
await step('the demo data loads', async () => {
  const result = await json(admin, '/demo/load', { method: 'POST' });
  if (result.status >= 300) throw new Error(`demo load answered ${result.status}: ${JSON.stringify(result.body)}`);
});

const mgr = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
mgr.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

await step('a manager finds the dashboard under Manage', async () => {
  await mgr.getByRole('button', { name: 'Manage', exact: true }).click();
  await mgr.getByRole('navigation').getByRole('link', { name: 'Dashboard', exact: true }).click();
  await mgr.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 15000 });
});

await step('this week’s tiles show hours, overtime, lateness and time off', async () => {
  for (const label of ['Hours worked', 'Overtime', 'Late clock-ins', 'Time off']) {
    await mgr.getByTestId(`tile-${label}`).waitFor({ timeout: 10000 });
  }
  await mgr.getByTestId('tile-Hours worked').getByText(/scheduled/).waitFor({ timeout: 5000 });
});

await step('the table has a row per week, and more weeks means more rows', async () => {
  const rows = mgr.getByTestId('week-table').locator('tbody tr');
  if ((await rows.count()) !== 8) throw new Error(`expected 8 weeks, got ${await rows.count()}`);
  await mgr.getByRole('button', { name: '4 weeks' }).click();
  await mgr.waitForFunction(
    () => document.querySelectorAll('[data-testid="week-table"] tbody tr').length === 4,
    null,
    { timeout: 10000 },
  );
  await mgr.getByRole('button', { name: '8 weeks' }).click();
  await mgr.waitForFunction(
    () => document.querySelectorAll('[data-testid="week-table"] tbody tr').length === 8,
    null,
    { timeout: 10000 },
  );
});

await step('the demo weeks have hours in them', async () => {
  const data = (await json(mgr, '/dashboard?weeks=8')).body;
  const worked = data.weeks.reduce((sum, week) => sum + week.total.workedHours, 0);
  if (worked <= 0) throw new Error('no hours worked in eight weeks of demo data');
});

await step('the chart draws a line per location, with a legend, and hovering names the week', async () => {
  const chart = mgr.getByTestId('hours-chart');
  if ((await chart.locator('polyline').count()) !== 2) throw new Error('expected two lines');
  await mgr.getByLabel('Legend').getByText('North Bergen').waitFor({ timeout: 5000 });
  await mgr.getByLabel('Legend').getByText('West New York').waitFor({ timeout: 5000 });

  const svg = chart.locator('svg');
  const box = await svg.boundingBox();
  await mgr.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2);
  await chart.getByRole('status').getByText(/Week of|This week/).waitFor({ timeout: 5000 });
  await chart.getByRole('status').getByText(/North Bergen: \d/).waitFor({ timeout: 5000 });
});
await mgr.screenshot({ path: `${OUT}/99-dashboard.png`, fullPage: true });

await step('filtering to one location keeps its line and its colour', async () => {
  const blueBefore = await mgr
    .getByTestId('hours-chart')
    .locator('polyline')
    .first()
    .getAttribute('stroke');
  await mgr.getByLabel('Location').selectOption({ label: 'West New York' });
  const lines = mgr.getByTestId('hours-chart').locator('polyline');
  await mgr.waitForFunction(
    () => document.querySelectorAll('[data-testid="hours-chart"] polyline').length === 1,
    null,
    { timeout: 5000 },
  );
  const stroke = await lines.first().getAttribute('stroke');
  if (stroke === blueBefore) throw new Error('West New York took North Bergen’s colour when filtered');
  await mgr.getByTestId('tile-Overtime').getByText('Both locations — overtime is per person').waitFor({ timeout: 5000 });
  await mgr.getByLabel('Location').selectOption({ label: 'Both locations' });
});

await step('staff cannot open it', async () => {
  const ctx = await browser.newContext();
  const emp = await ctx.newPage();
  await signIn(emp, 'frontdesk@domihealthcare.com');
  const answer = await json(emp, '/dashboard');
  if (answer.status !== 403) throw new Error(`staff got ${answer.status}`);
  await ctx.close();
});

await step('it fits a phone', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const phone = await ctx.newPage();
  await signIn(phone, 'manager@domihealthcare.com');
  await phone.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await phone.getByTestId('tile-Hours worked').waitFor({ timeout: 15000 });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('the dashboard scrolls sideways on a phone');
  await phone.screenshot({ path: `${OUT}/100-dashboard-phone.png`, fullPage: true });
  await ctx.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL DASHBOARD CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
