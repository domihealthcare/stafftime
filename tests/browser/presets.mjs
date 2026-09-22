import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
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

const signIn = async (page, email) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 15000 });
};

const box = (page, label) => page.getByRole('checkbox', { name: new RegExp(`^${label}`) }).first();

const mgrCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
const mgr = await mgrCtx.newPage();
mgr.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');
await mgr.getByRole('button', { name: 'Manage', exact: true }).click();
await mgr.getByRole('link', { name: 'Export' }).click();
await mgr.getByText('Export timesheets').waitFor({ timeout: 10000 });

await step('with nothing saved, the screen says so', async () => {
  await mgr.getByText(/None yet/).waitFor({ timeout: 10000 });
});

await step('a report can be saved with a name', async () => {
  // Make it distinctive: add two columns and turn on overtime.
  await box(mgr, 'Email').check();
  await box(mgr, 'Pay type').check();
  await box(mgr, 'Split overtime').check();

  await mgr.getByRole('button', { name: 'Save these settings' }).click();
  await mgr.getByLabel('Name this report').fill('Biweekly payroll');
  await mgr.getByRole('button', { name: 'Save report' }).click();
  await mgr.getByRole('button', { name: 'Biweekly payroll', exact: true }).waitFor({ timeout: 15000 });
});
await mgr.screenshot({ path: `${OUT}/29-export-presets.png`, fullPage: true });

await step('a duplicate name is refused rather than silently overwriting', async () => {
  await mgr.getByRole('button', { name: 'Save these settings' }).click();
  await mgr.getByLabel('Name this report').fill('Biweekly payroll');
  await mgr.getByRole('button', { name: 'Save report' }).click();
  // The message must survive: a background preview refresh used to clear it.
  await mgr.getByText(/already have a saved report/).waitFor({ timeout: 10000 });
  await mgr.waitForTimeout(2000);
  await mgr.getByText(/already have a saved report/).waitFor({ timeout: 5000 });
  // The toggle reads "Cancel" while the form is open.
  await mgr.getByRole('button', { name: 'Cancel', exact: true }).click();
});

await step('changing the settings then applying the report restores them', async () => {
  // Undo everything the saved report captured.
  await box(mgr, 'Email').uncheck();
  await box(mgr, 'Pay type').uncheck();
  await box(mgr, 'Split overtime').uncheck();

  await mgr.getByRole('button', { name: 'Biweekly payroll', exact: true }).click();
  await mgr.waitForTimeout(1500);

  if (!(await box(mgr, 'Email').isChecked())) throw new Error('Email column not restored');
  if (!(await box(mgr, 'Pay type').isChecked())) throw new Error('Pay type column not restored');
  if (!(await box(mgr, 'Split overtime').isChecked()))
    throw new Error('overtime setting not restored');
});

await step('the saved report still produces a working file', async () => {
  await mgr.getByLabel('From').fill('2026-09-01');
  await mgr.getByLabel('To (included)').fill('2026-09-30');
  await mgr.getByText(/entries ·/).waitFor({ timeout: 15000 });

  const [download] = await Promise.all([
    mgr.waitForEvent('download', { timeout: 30000 }),
    mgr.getByRole('button', { name: /Download Excel file/ }).click(),
  ]);
  const path = `/tmp/pw-downloads/${download.suggestedFilename()}`;
  await download.saveAs(path);
  if (readFileSync(path).subarray(0, 2).toString() !== 'PK')
    throw new Error('not a valid xlsx');
});

// --- sharing ---
const admCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const adm = await admCtx.newPage();
await signIn(adm, 'admin@domihealthcare.com');
await adm.getByRole('button', { name: 'Manage', exact: true }).click();
await adm.getByRole('link', { name: 'Export' }).click();

await step('a shared report is visible to another manager, attributed to its owner', async () => {
  const chip = adm.getByRole('button', { name: /Biweekly payroll/ });
  await chip.waitFor({ timeout: 15000 });
  if (!/Morgan Manager/.test(await chip.innerText()))
    throw new Error(`expected the owner's name on a shared report: "${await chip.innerText()}"`);
});

await step('someone else cannot delete a report they do not own', async () => {
  if (await adm.getByRole('button', { name: 'Delete Biweekly payroll' }).count() > 0)
    throw new Error('a non-owner was offered the delete control');
});

await step('the owner can delete their own report', async () => {
  mgr.once('dialog', (d) => d.accept());
  await mgr.getByRole('button', { name: 'Delete Biweekly payroll' }).click();
  await mgr.getByText(/None yet/).waitFor({ timeout: 15000 });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL PRESET CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
