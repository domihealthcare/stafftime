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

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await signInAs(page, 'manager@domihealthcare.com');
await page.getByRole('link', { name: 'Timesheet' }).click();
await page.getByRole('table').waitFor({ timeout: 10000 });

await step('a correction requires a reason before it can be saved', async () => {
  await page.getByRole('button', { name: 'Correct' }).first().click();
  await page.getByRole('dialog').waitFor({ timeout: 10000 });
  const save = page.getByRole('button', { name: 'Save correction' });
  if (await save.isEnabled()) throw new Error('save was enabled with no reason given');
});

await page.screenshot({ path: `${OUT}/10-correct-dialog.png`, fullPage: true });

await step('a correction saves, flags the entry as edited and shows the reason', async () => {
  await page.getByLabel('Reason').fill('Forgot to clock out at end of shift');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
  await page.getByText('Forgot to clock out at end of shift').first().waitFor({ timeout: 10000 });
  await page.getByText('Edited').first().waitFor({ timeout: 5000 });
});

await page.screenshot({ path: `${OUT}/11-corrected.png`, fullPage: true });

await step('clearing the clock-out turns the entry back into a missing punch', async () => {
  await page.getByRole('button', { name: 'Correct' }).first().click();
  await page.getByRole('dialog').waitFor({ timeout: 10000 });
  await page.getByLabel('Clocked out').fill('');
  await page.getByLabel('Reason').fill('Punch recorded in error, awaiting confirmation');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
  await page.getByText('Missing punch').first().waitFor({ timeout: 10000 });
});
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CORRECTION CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
