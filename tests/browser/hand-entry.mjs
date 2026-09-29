import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
// Hours entered by hand (September 2026): a manager adds a day with no punch,
// with a reason, and it stays on "Worth a look" until somebody else has looked
// into why it was needed.
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];

const signInAs = async (page, email, password = 'shift-change-2026') => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'Timesheet' }).waitFor({ timeout: 10000 });
};

const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

// The Sunday that starts last week, so the Timesheet's "Last week" shows it
// whatever day the suite runs on.
const pad = (n) => String(n).padStart(2, '0');
const lastSunday = new Date();
lastSunday.setDate(lastSunday.getDate() - lastSunday.getDay() - 7);
const DAY = `${lastSunday.getFullYear()}-${pad(lastSunday.getMonth() + 1)}-${pad(lastSunday.getDate())}`;

// ---------------------------------------------------------------- the manager
const manager = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await signInAs(manager, 'manager@domihealthcare.com');
await manager.getByRole('link', { name: 'Timesheet' }).click();

await step('Add hours needs who, when, why and what happened before it saves', async () => {
  await manager.getByRole('button', { name: '+ Add hours' }).click();
  const dialog = manager.getByRole('dialog');
  await dialog.waitFor({ timeout: 10000 });
  const save = dialog.getByRole('button', { name: 'Add hours' });
  if (await save.isEnabled()) throw new Error('Add hours was enabled with nothing filled in');
  await dialog.getByLabel('Who').selectOption({ label: 'Frankie Front-Desk' });
  await dialog.getByLabel('Day').fill(DAY);
  await dialog.getByLabel('Started').fill('09:00');
  await dialog.getByLabel('Finished').fill('17:30');
  await dialog.getByText('8.50 hours').waitFor({ timeout: 5000 });
  if (await save.isEnabled()) throw new Error('Add hours was enabled with no reason');
  await dialog.getByLabel('The app would not let them clock in').check();
  await dialog.getByText('may be a problem with the app').waitFor({ timeout: 5000 });
  if (await save.isEnabled()) throw new Error('Add hours was enabled with nothing about what happened');
});

await step('the manager cannot add their own hours', async () => {
  const options = await manager.getByLabel('Who').locator('option').allTextContents();
  if (options.some((o) => o.includes('Morgan Manager'))) throw new Error('own name offered');
});

await manager.screenshot({ path: `${OUT}/hand-entry-1-form.png`, fullPage: true });

await step('the hours save, marked as entered by hand, and go on "Worth a look"', async () => {
  await manager.getByLabel('What happened').fill('Said it could not find her location');
  const saved = manager.waitForResponse(
    (r) => r.url().endsWith('/api/time-entries') && r.request().method() === 'POST',
  );
  await manager.getByRole('dialog').getByRole('button', { name: 'Add hours' }).click();
  const response = await saved;
  if (response.status() !== 201) throw new Error(`POST answered ${response.status()}`);
  await manager.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
  const banner = manager.getByTestId('needs-attention');
  await banner.getByText('Hours entered by hand — find out why').waitFor({ timeout: 10000 });
  await banner.getByText(/Frankie Front-Desk — 8\.50 hours .* entered by Morgan Manager: the app would not let them clock in/).waitFor({ timeout: 5000 });
});

await step('on the timesheet it says who entered it and why, and waits for somebody else', async () => {
  await manager.getByRole('button', { name: 'Last week' }).click();
  await manager.getByText('Entered by hand by Morgan Manager:').first().waitFor({ timeout: 10000 });
  await manager.getByText('Waiting for another manager to look into why.').first().waitFor({ timeout: 5000 });
  if (await manager.getByRole('button', { name: 'Looked into why…' }).count()) {
    throw new Error('the manager who entered it was offered Looked into');
  }
});

await step('the same day cannot be added twice', async () => {
  await manager.getByRole('button', { name: '+ Add hours' }).click();
  const dialog = manager.getByRole('dialog');
  await dialog.getByLabel('Who').selectOption({ label: 'Frankie Front-Desk' });
  await dialog.getByLabel('Day').fill(DAY);
  await dialog.getByLabel('Started').fill('12:00');
  await dialog.getByLabel('Finished').fill('13:00');
  await dialog.getByLabel('Forgot to clock in or out').check();
  await dialog.getByLabel('What happened').fill('Second go');
  await dialog.getByRole('button', { name: 'Add hours' }).click();
  await dialog.getByText(/already has hours from .* that overlap these/).waitFor({ timeout: 10000 });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

await manager.screenshot({ path: `${OUT}/hand-entry-2-timesheet.png`, fullPage: true });

// ------------------------------------------------------------ the employee
const staff = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await signInAs(staff, 'frontdesk@domihealthcare.com');
await staff.getByRole('link', { name: 'Timesheet' }).click();

await step('staff see their hand-entered day and why, but cannot add hours', async () => {
  await staff.getByRole('button', { name: 'Last week' }).click();
  // A phone gets the stacked cards; the table is there too, hidden.
  await staff.getByText('Entered by hand by Morgan Manager:').locator('visible=true').first().waitFor({ timeout: 10000 });
  if (await staff.getByRole('button', { name: '+ Add hours' }).count()) throw new Error('staff offered Add hours');
  if (await staff.getByRole('button', { name: 'Looked into why…' }).count()) throw new Error('staff offered Looked into');
});

// ----------------------------------------------------------- somebody else
const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await signInAs(admin, 'admin@domihealthcare.com');
await admin.getByRole('link', { name: 'Timesheet' }).click();

await step('another manager marks it looked into, with what they found, and it leaves the list', async () => {
  await admin.getByRole('button', { name: 'Last week' }).click();
  await admin.getByRole('button', { name: 'Looked into why…' }).first().click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByText('Said it could not find her location').waitFor({ timeout: 10000 });
  await dialog.getByLabel('What you found').fill('Location was off for Safari');
  const saved = admin.waitForResponse((r) => r.url().includes('/checked'));
  await dialog.getByRole('button', { name: 'Mark as looked into' }).click();
  if ((await saved).status() !== 200) throw new Error('marking it looked into failed');
  await admin.getByText('Looked into by Ada Admin:').first().waitFor({ timeout: 10000 });
  await admin.getByText('Location was off for Safari').first().waitFor({ timeout: 5000 });
  await admin.waitForTimeout(500);
  if (await admin.getByText('Hours entered by hand — find out why').count()) {
    throw new Error('still on "Worth a look" after being looked into');
  }
});

await admin.screenshot({ path: `${OUT}/hand-entry-3-looked-into.png`, fullPage: true });

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL HAND-ENTRY CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
