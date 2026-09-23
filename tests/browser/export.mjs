import { chromium } from 'playwright';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Defaults to the dev server; point at `vite preview` to test the built bundle
// with the deployed security headers applied.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const DOWNLOADS = '/tmp/pw-downloads';
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

// --- employee must not see the export or admin screens ---
const empCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const emp = await empCtx.newPage();
await signIn(emp, 'frontdesk@domihealthcare.com');
await step('an employee sees no Export, Kiosks or Locations tab', async () => {
  for (const name of ['Export', 'Kiosks', 'Locations']) {
    if (await emp.getByRole('link', { name }).count() > 0)
      throw new Error(`employee saw the ${name} tab`);
  }
});

// --- manager: export ---
const mgrCtx = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  acceptDownloads: true,
});
const mgr = await mgrCtx.newPage();
mgr.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

await step('a manager can open the export screen', async () => {
  await mgr.getByRole('button', { name: 'Manage', exact: true }).click();
  await mgr.getByRole('link', { name: 'Export' }).click();
  await mgr.getByText('Export timesheets').waitFor({ timeout: 10000 });
});

await step('columns come from the server, grouped', async () => {
  for (const group of ['Entry', 'Employee', 'Verification', 'Review']) {
    await mgr.getByText(group, { exact: true }).first().waitFor({ timeout: 5000 });
  }
  await mgr.getByRole('checkbox', { name: /^Clock in/ }).first().waitFor({ timeout: 5000 });
});

await step('the preview reports what the file will contain', async () => {
  // Widen the period so the seeded entries are certainly inside it.
  await mgr.getByRole('button', { name: 'Custom', exact: true }).click();
  await mgr.getByLabel('From').fill('2026-09-01');
  await mgr.getByLabel('To (included)').fill('2026-09-30');
  await mgr.getByText(/entries ·/).waitFor({ timeout: 15000 });
  const text = await mgr.getByText(/entries ·/).innerText();
  if (!/\d+ entries · \d+ (person|people) · [\d.]+ hours/.test(text))
    throw new Error(`unexpected preview: "${text}"`);
});
await mgr.screenshot({ path: `${OUT}/23-export.png`, fullPage: true });

await step('downloading produces a real .xlsx', async () => {
  const [download] = await Promise.all([
    mgr.waitForEvent('download', { timeout: 30000 }),
    mgr.getByRole('button', { name: /Download Excel file/ }).click(),
  ]);
  const path = `${DOWNLOADS}/${download.suggestedFilename()}`;
  await download.saveAs(path);

  if (!/^domi-timesheet_2026-09-01_to_2026-10-01\.xlsx$/.test(download.suggestedFilename()))
    throw new Error(`unexpected filename: ${download.suggestedFilename()}`);
  if (!existsSync(path)) throw new Error('no file saved');
  if (statSync(path).size < 1000) throw new Error('file suspiciously small');
  if (readFileSync(path).subarray(0, 2).toString() !== 'PK')
    throw new Error('not a zip/xlsx container');
});

await step('switching to CSV downloads a CSV instead', async () => {
  await mgr.getByRole('button', { name: 'CSV' }).click();
  const [download] = await Promise.all([
    mgr.waitForEvent('download', { timeout: 30000 }),
    mgr.getByRole('button', { name: /Download CSV/ }).click(),
  ]);
  const path = `${DOWNLOADS}/${download.suggestedFilename()}`;
  await download.saveAs(path);
  if (!download.suggestedFilename().endsWith('.csv'))
    throw new Error(`expected .csv, got ${download.suggestedFilename()}`);
  const text = readFileSync(path, 'utf8');
  if (!text.includes('Date,Employee')) throw new Error(`unexpected CSV header: ${text.slice(0, 80)}`);
});

await step('deselecting every column blocks the download', async () => {
  await mgr.getByRole('button', { name: 'Excel (.xlsx)' }).click();
  for (const label of ['Date', 'Employee', 'Location', 'Clock in', 'Clock out', 'Hours', 'Flags']) {
    // Some labels carry a hint, which becomes part of the accessible name.
    const box = mgr.getByRole('checkbox', { name: new RegExp(`^${label}`) }).first();
    if (await box.isChecked()) await box.uncheck();
  }
  await mgr.getByText('Choose at least one column').waitFor({ timeout: 5000 });
  if (await mgr.getByRole('button', { name: /Download/ }).isEnabled())
    throw new Error('download was enabled with no columns selected');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL EXPORT CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
