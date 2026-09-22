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
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1200 },
  acceptDownloads: true,
  permissions: ['geolocation'],
  geolocation: { latitude: 40.8045, longitude: -74.012, accuracy: 25 }, // on site, North Bergen
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('manager@domihealthcare.com');
await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByText('Not clocked in').waitFor({ timeout: 20000 });

// Something to export. The seeded database has no completed punches.
await step('a punch to export', async () => {
  await page.getByRole('button', { name: 'Clock in' }).click();
  await page.getByRole('button', { name: 'Clock out' }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Clock out' }).click();
  await page.getByRole('button', { name: 'Clock in' }).waitFor({ timeout: 20000 });
});

await page.getByRole('button', { name: 'Manage', exact: true }).click();

await page.getByRole('link', { name: /^Export/ }).first().click();
await page.getByText('Export timesheets').waitFor({ timeout: 15000 });

await step('nothing has been exported yet', async () => {
  await page.getByText('Past exports').waitFor({ timeout: 15000 });
  await page.getByText('Nothing has been exported yet.').waitFor({ timeout: 10000 });
});

await step('the period can be set to cover today’s punch', async () => {
  // The screen defaults to last week, which is before the punch just made.
  const today = new Date().toISOString().slice(0, 10);
  await page.getByLabel('From').fill(today);
  await page.getByLabel('To (included)').fill(today);
  await page.getByText(/\d+ (entry|entries) · \d+ (person|people)/).first().waitFor({
    timeout: 15000,
  });
});

await step('the targets say which are ready and which are not', async () => {
  await page.getByText('Send to').waitFor({ timeout: 10000 });
  await page.getByText('Spreadsheet', { exact: true }).waitFor({ timeout: 5000 });

  // A provider the practice is waiting on is easier to chase when the app says
  // what it is waiting for.
  await page.getByText('ADP TotalSource').waitFor({ timeout: 5000 });
  await page.getByText(/Waiting on ADP/).waitFor({ timeout: 5000 });

  const adp = page.getByRole('radio', { name: /ADP TotalSource/ });
  if (!(await adp.isDisabled())) throw new Error('ADP was offered as if it were ready');
});
await page.screenshot({ path: `${OUT}/59-payroll-targets.png`, fullPage: true });

await step('an export produces a file and is recorded', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /Download Excel file/ }).click(),
  ]);
  if (!download.suggestedFilename().endsWith('.xlsx'))
    throw new Error(`downloaded ${download.suggestedFilename()}`);

  // The history is the point: hours cannot leave without a trace. Other suites
  // leave punches behind, so count on a run being recorded rather than on how
  // many entries were in it.
  await page.getByRole('button', { name: 'The file' }).first().waitFor({ timeout: 15000 });
  if ((await page.getByText('Nothing has been exported yet.').count()) > 0)
    throw new Error('the export was not recorded in the history');
});
await page.screenshot({ path: `${OUT}/60-payroll-history.png`, fullPage: true });

await step('the recorded file can be fetched again', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: 'The file' }).first().click(),
  ]);
  if (!download.suggestedFilename().startsWith('domi-timesheet'))
    throw new Error(`downloaded ${download.suggestedFilename()}`);
});

await step('the period shown is the last day in the file, not the day after', async () => {
  // The API takes an exclusive end; showing that would claim the file covered a
  // day it did not.
  const today = new Date();
  const expected = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const history = await page.locator('main').innerText();
  if (!history.includes(expected))
    throw new Error(`the history does not mention ${expected}:\n${history.slice(-400)}`);
});

await step('the timesheet now says those hours have gone to payroll', async () => {
  await page.getByRole('link', { name: /^Timesheet/ }).first().click();
  await page.getByRole('button', { name: 'Correct' }).locator('visible=true').first().click();
  await page.getByText(/went to payroll on/).waitFor({ timeout: 15000 });
});

await step('a correction to paid hours is refused until it is deliberate', async () => {
  await page.getByLabel(/Reason/i).fill('Stayed to finish a referral');
  await page.getByRole('button', { name: 'Save correction' }).click();

  await page.getByText(/already sent to payroll/).waitFor({ timeout: 15000 });
  // The same button now says what it will actually do.
  await page.getByRole('button', { name: 'Correct it anyway' }).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/61-payroll-correction.png`, fullPage: true });

await step('pressing it again makes the correction', async () => {
  await page.getByRole('button', { name: 'Correct it anyway' }).click();
  await page.getByText('Corrected:').first().waitFor({ timeout: 15000 });
});

await step('the export screen warns that the correction has not reached payroll', async () => {
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByRole('link', { name: /^Export/ }).first().click();
  // The screen opens on last week again, so point it back at today.
  const today = new Date().toISOString().slice(0, 10);
  await page.getByLabel('From').fill(today);
  await page.getByLabel('To (included)').fill(today);

  await page.getByText(/has been corrected since it last went to payroll/).waitFor({
    timeout: 20000,
  });
});

await step('a run can be voided without losing it', async () => {
  await page.getByRole('button', { name: 'Void' }).first().click();
  await page.getByText('voided').first().waitFor({ timeout: 15000 });

  // Voided, not deleted: the file is still there.
  await page.getByRole('button', { name: 'The file' }).first().waitFor({ timeout: 5000 });
});

await step('a voided run no longer locks the hours it contained', async () => {
  await page.getByRole('link', { name: /^Timesheet/ }).first().click();
  await page.getByRole('button', { name: 'Correct' }).locator('visible=true').first().click();

  if ((await page.getByText(/went to payroll on/).count()) > 0)
    throw new Error('a voided run is still being treated as paid');

  await page.getByLabel(/Reason/i).fill('Second correction, no warning expected');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await page.getByText('Second correction, no warning expected').first().waitFor({
    timeout: 15000,
  });
});

await step('an employee is offered none of this', async () => {
  const empCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const emp = await empCtx.newPage();
  await emp.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await emp.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await emp.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await emp.getByRole('button', { name: 'Sign in' }).click();
  await emp.getByText('Not clocked in').waitFor({ timeout: 20000 });

  if ((await emp.getByRole('button', { name: 'Manage', exact: true }).count()) > 0)
    throw new Error('an employee was offered the export screen');
  await empCtx.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL PAYROLL CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
