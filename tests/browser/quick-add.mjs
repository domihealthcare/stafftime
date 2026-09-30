import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
// The + in a rota cell (Dominguez, September 2026): Work from home is a place
// in the Location list rather than a tick box beside an office, and a shift
// added there can repeat.
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

// New Jersey time, as at the practice: repeating shifts are office time, and
// the rota shows the browser's own.
const mgr = await (
  await browser.newContext({ viewport: { width: 1400, height: 1000 }, timezoneId: 'America/New_York' })
).newPage();
mgr.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await mgr.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await mgr.getByLabel('Email').fill('manager@domihealthcare.com');
await mgr.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await mgr.getByRole('button', { name: 'Sign in' }).click();
await mgr.getByRole('link', { name: 'Schedule' }).click();
await mgr.getByRole('button', { name: 'Week', exact: true }).click();
// Next week, so every day in it is still ahead.
await mgr.getByRole('button', { name: 'Next →' }).click();
await mgr.getByText('Coverage this week').waitFor({ timeout: 15000 });

const made = [];
const frankie = () => mgr.getByTestId('rota-row-Frankie Front-Desk');
const addOn = async (weekday) => {
  await frankie().getByRole('button', { name: new RegExp(`^Add a shift for Frankie Front-Desk on ${weekday}`) }).click();
  const dialog = mgr.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
  await dialog.waitFor({ timeout: 10000 });
  // Drafts, so the suite can take them away again completely.
  await dialog.getByLabel('Publish it now').uncheck();
  return dialog;
};

await step('Work from home is in the Location list, with no separate tick box', async () => {
  const dialog = await addOn('Tuesday');
  const options = await dialog.getByLabel('Location').locator('option').allTextContents();
  if (!options.includes('Work from home')) throw new Error(`options were ${options.join(', ')}`);
  if (await dialog.getByRole('checkbox', { name: /^Work from home/ }).count()) throw new Error('the old tick box is still there');
  await dialog.getByLabel('Location').selectOption({ label: 'Work from home' });
  await dialog.getByText('They can clock in from anywhere during it').waitFor({ timeout: 5000 });
  const saved = mgr.waitForResponse((r) => r.url().endsWith('/api/shifts') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Add shift' }).click();
  const response = await saved;
  if (response.status() !== 201) throw new Error(`answered ${response.status()}`);
  const shift = await response.json();
  made.push(shift.id);
  if (!shift.isRemote) throw new Error('saved as an office shift');
  await frankie().locator('[data-remote="true"]').first().waitFor({ timeout: 10000 });
});

await step('an open shift is an office slot, so it cannot be worked from home', async () => {
  const t = mgr.getByTestId('open-rows-toggle');
  if ((await t.getAttribute('aria-pressed')) === 'false') await t.click();
  await mgr.getByRole('button', { name: /^Add an open shift at North Bergen on Tuesday/ }).click();
  const dialog = mgr.getByRole('dialog', { name: 'Open shift' });
  const options = await dialog.getByLabel('Location').locator('option').allTextContents();
  if (options.includes('Work from home')) throw new Error('offered Work from home for an open shift');
  if (await dialog.getByLabel('Repeat this shift').count() !== 1) throw new Error('no Repeat for an open shift');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

await step('the + can repeat: starts on the day clicked, pick more days and an end', async () => {
  const dialog = await addOn('Wednesday');
  await dialog.getByLabel('Repeat this shift').check();
  // The day clicked is already picked.
  if ((await dialog.getByRole('button', { name: 'Wed', exact: true }).getAttribute('aria-pressed')) !== 'true') {
    throw new Error('Wednesday was not picked to start with');
  }
  await dialog.getByRole('button', { name: 'Fri', exact: true }).click();
  const wednesday = await dialog.getByLabel('Until').getAttribute('min');
  const until = new Date(`${wednesday}T12:00:00`);
  until.setDate(until.getDate() + 13);
  const pad = (n) => String(n).padStart(2, '0');
  await dialog.getByLabel('Until').fill(`${until.getFullYear()}-${pad(until.getMonth() + 1)}-${pad(until.getDate())}`);
  await dialog.getByLabel('Starts').fill('10:00');
  await dialog.getByLabel('Ends').fill('14:00');
  await mgr.screenshot({ path: `${OUT}/quick-add-repeat.png`, fullPage: true });
  const saved = mgr.waitForResponse((r) => r.url().includes('/api/shifts/repeat'));
  await dialog.getByRole('button', { name: 'Add the shifts' }).click();
  const response = await saved;
  if (!response.ok()) throw new Error(`refused: ${await response.text()}`);
  const result = await response.json();
  // Wed and Fri for two weeks, from this Wednesday.
  if (result.created !== 4) throw new Error(`made ${result.created} shifts`);
  await mgr.getByText(/4 shifts created/).waitFor({ timeout: 10000 });
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  // Wednesday and Friday of this week, once the rota has reloaded.
  await frankie().getByText('10am–2pm').nth(1).waitFor({ timeout: 15000 });
});

// Take away what the suite made: drafts are deleted outright.
await mgr.evaluate(async () => {
  const me = (await (await fetch('/api/employees')).json()).find((p) => p.email === 'frontdesk@domihealthcare.com');
  const from = new Date(); const to = new Date(Date.now() + 40 * 86_400_000);
  const shifts = await (await fetch(`/api/shifts?employeeId=${me.id}&from=${from.toISOString()}&to=${to.toISOString()}`)).json();
  for (const s of shifts.filter((s) => s.status === 'DRAFT')) await fetch(`/api/shifts/${s.id}`, { method: 'DELETE' });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL QUICK-ADD CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
