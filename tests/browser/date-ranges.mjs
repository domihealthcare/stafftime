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

// Worked out here, independently of the app: the fortnight containing a day,
// counting from a Monday a pay period began.
const ANCHOR = '2026-09-14';
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const localToday = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const periodContaining = (date) => {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${ANCHOR}T00:00:00Z`)) / 86_400_000);
  const from = addDays(ANCHOR, Math.floor(days / 14) * 14);
  return { from, to: addDays(from, 13) };
};
const current = periodContaining(localToday());
const previous = periodContaining(addDays(current.from, -1));

/// The label the picker shows for a range, formatted in the page's own locale.
const labelFor = (page, range) =>
  page.evaluate(({ from, to }) => {
    const f = new Date(`${from}T00:00:00`);
    const t = new Date(`${to}T00:00:00`);
    const same = f.getFullYear() === t.getFullYear();
    const start = f.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(same ? {} : { year: 'numeric' }) });
    const end = t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} – ${end}`;
  }, range);

const chip = (page, name) => page.getByRole('button', { name, exact: true });
const pressed = async (locator) => (await locator.getAttribute('aria-pressed')) === 'true';

const empCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const emp = await empCtx.newPage();
emp.on('pageerror', (e) => errors.push(`employee pageerror: ${e.message}`));
await signIn(emp, 'frontdesk@domihealthcare.com');

await step('before a pay period is set, the pay-period shortcuts wait and say why', async () => {
  await emp.getByRole('link', { name: 'Timesheet', exact: true }).click();
  await chip(emp, 'This week').waitFor({ timeout: 15000 });
  if (!(await pressed(chip(emp, 'This week')))) throw new Error('the timesheet did not open on this week');
  if (await chip(emp, 'This pay period').isEnabled()) throw new Error('"This pay period" was usable with no start set');
  await emp.getByText(/Pay-period shortcuts appear once an admin sets the pay period start/).waitFor({ timeout: 5000 });
});

const admin = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
admin.on('pageerror', (e) => errors.push(`admin pageerror: ${e.message}`));
await signIn(admin, 'admin@domihealthcare.com');

await step('an admin sets the pay period start in Practice settings', async () => {
  await admin.getByRole('button', { name: /Your account/ }).click();
  await admin.getByRole('menuitem', { name: 'Practice settings' }).click();
  await admin.getByLabel('Pay period start').fill(ANCHOR);
  const saving = admin.waitForResponse((r) => r.url().includes('/api/settings') && r.request().method() === 'PATCH');
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  if (!(await saving).ok()) throw new Error('the save failed');
  await admin.getByText('Saved.', { exact: true }).waitFor({ timeout: 10000 });

  const info = await admin.evaluate(() => fetch('/api/settings/pay-period').then((r) => r.json()));
  if (JSON.stringify(info.current) !== JSON.stringify(current) || JSON.stringify(info.previous) !== JSON.stringify(previous))
    throw new Error(`server periods ${JSON.stringify(info)} differ from ${JSON.stringify({ current, previous })}`);
});

await step('staff get the pay-period shortcuts too, and they ask for exactly those days', async () => {
  await emp.reload({ waitUntil: 'networkidle' });
  await chip(emp, 'This pay period').waitFor({ timeout: 15000 });
  const request = emp.waitForRequest((r) => r.url().includes('/api/time-entries') && r.method() === 'GET');
  await chip(emp, 'This pay period').click();
  const url = new URL((await request).url());
  const expectFrom = await emp.evaluate((d) => new Date(`${d}T00:00:00`).toISOString(), current.from);
  // The last day is included: the request runs to the midnight after it.
  const expectTo = await emp.evaluate((d) => new Date(`${d}T00:00:00`).toISOString(), addDays(current.to, 1));
  if (url.searchParams.get('from') !== expectFrom || url.searchParams.get('to') !== expectTo)
    throw new Error(`asked for ${url.searchParams.get('from')}..${url.searchParams.get('to')}, wanted ${expectFrom}..${expectTo}`);
  if ((await emp.getByTestId('date-range-label').innerText()) !== (await labelFor(emp, current)))
    throw new Error('the label does not show this pay period');
});
await emp.screenshot({ path: `${OUT}/101-timesheet-pay-period-phone.png`, fullPage: true });

await step('the previous arrow steps back a whole pay period', async () => {
  await emp.getByRole('button', { name: 'Previous period' }).click();
  await emp.waitForFunction(() => document.querySelector('[aria-pressed="true"]')?.textContent === 'Last pay period', null, { timeout: 5000 });
  if ((await emp.getByTestId('date-range-label').innerText()) !== (await labelFor(emp, previous)))
    throw new Error('the label does not show the last pay period');
});

await step('months step by months, and Custom takes any two dates', async () => {
  await chip(emp, 'Last month').click();
  if (!(await pressed(chip(emp, 'Last month')))) throw new Error('Last month did not select');
  await emp.getByRole('button', { name: 'Next period' }).click();
  if (!(await pressed(chip(emp, 'This month')))) throw new Error('next from last month was not this month');

  await chip(emp, 'Custom').click();
  await emp.getByLabel('From', { exact: true }).fill('2026-09-01');
  await emp.getByLabel('To (included)').fill('2026-09-03');
  if ((await emp.getByTestId('date-range-label').innerText()) !== (await labelFor(emp, { from: '2026-09-01', to: '2026-09-03' })))
    throw new Error('the custom range did not apply');
});

await step('the Export screen opens on the last pay period', async () => {
  await admin.getByRole('button', { name: 'Manage', exact: true }).click();
  await admin.getByRole('navigation').getByRole('link', { name: 'Export', exact: true }).click();
  await chip(admin, 'Last pay period').waitFor({ timeout: 15000 });
  await admin.waitForFunction(() =>
    [...document.querySelectorAll('[aria-pressed="true"]')].some((el) => el.textContent === 'Last pay period'),
    null, { timeout: 10000 });
  if ((await admin.getByTestId('date-range-label').innerText()) !== (await labelFor(admin, previous)))
    throw new Error('the export period is not the last pay period');
});
await admin.screenshot({ path: `${OUT}/102-export-pay-period.png`, fullPage: true });

await step('it fits a phone', async () => {
  const overflow = await emp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('the timesheet scrolls sideways');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL DATE RANGE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
