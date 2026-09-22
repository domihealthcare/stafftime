import { chromium } from 'playwright';

import { mkdirSync } from 'node:fs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Defaults to the dev server; point at `vite preview` to test the built bundle
// with the deployed security headers applied.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const errors = [];

const browser = await chromium.launch(
  // Fall back to whatever Playwright downloaded when CHROMIUM_PATH is unset.
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const context = await browser.newContext({
  viewport: { width: 420, height: 900 },        // phone-sized: how staff will really use it
  permissions: ['geolocation'],
  geolocation: { latitude: 40.8045, longitude: -74.012, accuracy: 25 }, // on site, North Bergen
});
const page = await context.newPage();
page.on('console', (m) => {
  // The overlap check below deliberately triggers a 400; that is the assertion, not a bug.
  // Expected noise: the overlap check below deliberately triggers a 400, and the
  // first load probes /auth/me with no cookie, which is how 'not signed in' is answered.
  if (m.type() === 'error' && !/status of 400|status of 401/.test(m.text()))
    errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));


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

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

await step('sign-in screen is shown first', async () => {
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });
  await page.getByLabel('Email').waitFor({ timeout: 5000 });
});

await step('sign in as the front-desk employee', async () => {
  await signInAs(page, 'frontdesk@domihealthcare.com');
  await page.getByText('Not clocked in').waitFor({ timeout: 10000 });
});

await page.screenshot({ path: `${OUT}/01-clock-before.png`, fullPage: true });

await step('clock in from on-site coordinates', async () => {
  await page.getByRole('button', { name: 'Clock in' }).click();
  await page.getByText('On the clock').waitFor({ timeout: 15000 });
});

await page.screenshot({ path: `${OUT}/02-clock-in.png`, fullPage: true });

await step('elapsed timer is running', async () => {
  const shown = await page.locator('.tabular-nums').first().innerText();
  if (!/\d+m/.test(shown)) throw new Error(`expected a duration, got "${shown}"`);
});

await step('timesheet shows the open punch, stacked rather than as a table', async () => {
  await page.getByRole('link', { name: 'Timesheet' }).click();
  // The wide table is still in the DOM at this width, just hidden, so ask for
  // the badge that is actually on screen rather than the first in document
  // order.
  await page.getByText('On-site GPS').locator('visible=true').first().waitFor({ timeout: 10000 });

  // At this width the entries are cards, not a table: eight columns do not fit
  // on a phone, and sideways-scrolling to reach a button is miserable.
  if (await page.getByRole('table').isVisible().catch(() => false))
    throw new Error('the eight-column table is still being shown at phone width');
});

await step('employee does NOT see the manager tools, on a phone either', async () => {
  const text = await page.locator('main').innerText();
  if (/\bApprove\b/.test(text)) throw new Error('employee was offered Approve');
  if (/\bCorrect\b/.test(text)) throw new Error('employee was offered Correct');
});

await page.setViewportSize({ width: 1280, height: 900 });
await page.screenshot({ path: `${OUT}/03-timesheet.png`, fullPage: true });

await step('the same timesheet becomes a table once there is room for one', async () => {
  await page.getByRole('table').waitFor({ timeout: 10000 });
  const headers = await page.locator('thead th').allInnerTexts();
  if (headers.some((h) => /action/i.test(h))) throw new Error(`employee saw manager column: ${headers}`);
  if (headers.some((h) => /employee/i.test(h))) throw new Error(`employee saw other staff column: ${headers}`);
});

await step('schedule shows the week', async () => {
  await page.getByRole('link', { name: 'Schedule' }).click();
  await page.getByText('Your upcoming shifts').waitFor({ timeout: 10000 });
});
await page.screenshot({ path: `${OUT}/04-schedule-employee.png`, fullPage: true });

await step('employee cannot add shifts', async () => {
  if (await page.getByRole('button', { name: '+ Add shift' }).count() > 0)
    throw new Error('employee was offered the Add shift button');
});

await step('clock out', async () => {
  await page.getByRole('link', { name: 'Clock' }).click();
  await page.getByRole('button', { name: 'Clock out' }).click({ timeout: 10000 });
  await page.getByText('Not clocked in').waitFor({ timeout: 15000 });
});

// --- switch to the manager ---
await step('switch user to the manager', async () => {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });
  await signInAs(page, 'manager@domihealthcare.com');
  await page.getByText('Not clocked in').waitFor({ timeout: 10000 });
});

await step('manager sees everyone on the timesheet', async () => {
  await page.getByRole('link', { name: 'Timesheet' }).click();
  await page.getByRole('table').waitFor({ timeout: 10000 });
  const headers = await page.locator('thead th').allInnerTexts();
  if (!headers.some((h) => /employee/i.test(h))) throw new Error(`manager missing Employee column: ${headers}`);
  if (!headers.some((h) => /action/i.test(h))) throw new Error(`manager missing Action column: ${headers}`);
});
await page.screenshot({ path: `${OUT}/05-timesheet-manager.png`, fullPage: true });

await step('manager approves a completed entry', async () => {
  const approve = page.getByRole('button', { name: 'Approve' }).first();
  await approve.click({ timeout: 10000 });
  await page.getByText('Approved').first().waitFor({ timeout: 10000 });
});

await step('manager sees the shift scheduler', async () => {
  await page.getByRole('link', { name: 'Schedule' }).click();
  await page.getByRole('button', { name: '+ Add shift' }).waitFor({ timeout: 10000 });
});
await page.screenshot({ path: `${OUT}/06-schedule-manager.png`, fullPage: true });

let createdDay;
await step('manager creates a shift', async () => {
  await page.getByRole('button', { name: '+ Add shift' }).click();
  await page.getByLabel('Employee').selectOption({ label: 'Frankie Front-Desk' });
  // Far-future and randomised so repeat runs never collide with an existing shift.
  const d = new Date();
  d.setDate(d.getDate() + 60 + Math.floor(Math.random() * 300));
  const pad = (n) => String(n).padStart(2, '0');
  createdDay = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  await page.getByLabel('Starts').fill(`${createdDay}T09:00`);
  await page.getByLabel('Ends').fill(`${createdDay}T17:00`);
  await page.getByRole('button', { name: 'Create shift' }).click();
  // The form closes on success; navigate to that week to see the shift.
  await page.getByRole('button', { name: '+ Add shift' }).waitFor({ timeout: 10000 });
  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
});

await step('an overlapping shift is refused and the reason is shown', async () => {
  await page.getByRole('button', { name: '+ Add shift' }).click();
  await page.getByLabel('Employee').selectOption({ label: 'Frankie Front-Desk' });
  await page.getByLabel('Starts').fill(`${createdDay}T12:00`);
  await page.getByLabel('Ends').fill(`${createdDay}T20:00`);
  await page.getByRole('button', { name: 'Create shift' }).click();
  const alert = page.getByRole('alert');
  await alert.waitFor({ timeout: 10000 });
  const text = await alert.innerText();
  if (!/already has a shift/i.test(text)) throw new Error(`unhelpful error shown: "${text}"`);
});
await page.screenshot({ path: `${OUT}/07-overlap-refused.png`, fullPage: true });

await browser.close();

console.log(`\n${errors.length === 0 ? 'ALL BROWSER CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
