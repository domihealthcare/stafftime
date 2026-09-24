import { chromium } from 'playwright';
import { clockOut } from './clock-out.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { pickFromAccountMenu } from './account-menu.mjs';

// The ADP TotalSource payroll import file, set up and produced the way an
// admin and a manager actually would: paste the worksheet exported from ADP,
// give somebody their File #, and download the import for a period.
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Defaults to the dev server; point at `vite preview` to test the built bundle
// with the deployed security headers applied.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const DOWNLOADS = '/tmp/pw-downloads';
mkdirSync(DOWNLOADS, { recursive: true });
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

// Shaped as ADP describes an exported worksheet: three header rows marked "!",
// one row per employee, and footer rows from the next "!". Invented, as a real
// one would come from Domi's own TotalSource account.
const WORKSHEET = [
  '!PAYDATA,Worksheet,Test run',
  'Co Code,Batch ID,File #,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount',
  '!',
  'DMH,,001234,,,,',
  'DMH,,009999,,,,',
  '!END',
].join('\r\n');

const pad = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// 45 days ago, 9:00 to 17:30 local: 8.5 hours, on a day no other suite puts
// hours on — anybody else with hours that day would have no File # either.
const workDay = new Date();
workDay.setDate(workDay.getDate() - 45);
workDay.setHours(9, 0, 0, 0);
const DAY = localDay(workDay);
const clockIn = new Date(workDay);
const clockOut = new Date(workDay.getTime() + 8.5 * 3_600_000);

// --- Frankie clocks in and out, so there is an entry to correct into a day's work ---
const frankieCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  permissions: ['geolocation'],
  geolocation: { latitude: 40.8045, longitude: -74.012, accuracy: 25 }, // on site, North Bergen
});
const frankie = await frankieCtx.newPage();
frankie.on('pageerror', (e) => errors.push(`frankie pageerror: ${e.message}`));
await signIn(frankie, 'frontdesk@domihealthcare.com');
await frankie.getByRole('button', { name: 'Clock in' }).click();
await frankie.getByText('On the clock').waitFor({ timeout: 20000 });
await clockOut(frankie);
await frankie.getByText('Not clocked in').waitFor({ timeout: 20000 });
await frankieCtx.close();

// --- a manager makes it a real day's work ---
const mgrCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
const mgr = await mgrCtx.newPage();
mgr.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

await step('setup: the punch becomes 8.5 hours on an earlier day', async () => {
  const result = await mgr.evaluate(async ({ from, to }) => {
    const entries = await fetch(`/api/time-entries?from=${from}&to=${to}`).then((r) => r.json());
    const mine = entries
      .filter((entry) => entry.employee?.firstName === 'Frankie')
      .sort((a, b) => b.clockInAt.localeCompare(a.clockInAt))[0];
    return mine ? { id: mine.id } : null;
  }, { from: new Date(Date.now() - 3_600_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString() });
  if (!result) throw new Error('Frankie’s punch was not found');
  const status = await mgr.evaluate(async ({ id, clockInAt, clockOutAt }) => {
    const response = await fetch(`/api/time-entries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clockInAt, clockOutAt, editReason: 'ADP suite: a full day' }),
    });
    return response.status;
  }, { id: result.id, clockInAt: clockIn.toISOString(), clockOutAt: clockOut.toISOString() });
  if (status !== 200) throw new Error(`the correction answered ${status}`);
});

await step('a manager cannot change the ADP settings', async () => {
  const status = await mgr.evaluate(async () => {
    const response = await fetch('/api/exports/adp', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyCode: 'XYZ' }),
    });
    return response.status;
  });
  if (status !== 403) throw new Error(`expected 403, got ${status}`);
});

// --- an admin sets ADP up ---
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const admin = await adminCtx.newPage();
admin.on('pageerror', (e) => errors.push(`admin pageerror: ${e.message}`));
await signIn(admin, 'admin@domihealthcare.com');
const card = admin.getByTestId('adp-settings');

await step('Practice settings says ADP is not set up, and what it needs', async () => {
  await pickFromAccountMenu(admin, 'Practice settings');
  await card.getByText('Not set up', { exact: true }).waitFor({ timeout: 15000 });
  await card.getByText('Enter the ADP company code.').waitFor({ timeout: 5000 });
  if ((await admin.locator('input[type=file]').count()) > 0)
    throw new Error('there is a file input — the worksheet is pasted, never uploaded');
});

await step('something that is not an ADP worksheet is refused, saying why', async () => {
  await card.getByLabel('Paste the exported worksheet').fill('Name,Hours\nFrankie,8');
  const saved = admin.waitForResponse((r) => r.url().includes('/api/exports/adp') && r.request().method() === 'PATCH');
  await card.getByRole('button', { name: 'Save ADP settings' }).click();
  if ((await saved).status() !== 400) throw new Error('a plain CSV was accepted');
  await card.getByText(/Co Code, Batch ID, File #/).waitFor({ timeout: 5000 });
});

await step('the company code and a pasted worksheet set it up', async () => {
  await card.getByLabel('Company code').fill('dmh');
  await card.getByLabel('Paste the exported worksheet').fill(WORKSHEET);
  const saved = admin.waitForResponse((r) => r.url().includes('/api/exports/adp') && r.request().method() === 'PATCH');
  await card.getByRole('button', { name: 'Save ADP settings' }).click();
  if (!(await saved).ok()) throw new Error('the save was refused');
  await card.getByText(/the 2 employee rows were left out/).waitFor({ timeout: 10000 });
  await card.getByText('Ready', { exact: true }).waitFor({ timeout: 5000 });
  if ((await card.getByLabel('Regular hours go in').inputValue()) !== 'Reg Hours')
    throw new Error('the regular hours column was not suggested');
  if ((await card.getByLabel('Overtime hours go in').inputValue()) !== 'O/T Hours')
    throw new Error('the overtime column was not suggested');
});
await admin.screenshot({ path: `${OUT}/98-adp-settings.png`, fullPage: true });

await step('the employee rows of the paste are not kept', async () => {
  const body = await admin.evaluate(() => fetch('/api/exports/adp').then((r) => r.text()));
  if (body.includes('009999')) throw new Error('an employee row from the worksheet was stored');
});

// --- the manager exports before anybody has a File #, then after ---
async function openExportForTheDay() {
  await mgr.goto(`${BASE}/export`, { waitUntil: 'networkidle' });
  await mgr.getByText('Export timesheets').waitFor({ timeout: 10000 });
  await mgr.getByRole('button', { name: 'Custom', exact: true }).click();
  await mgr.getByLabel('From').fill(DAY);
  await mgr.getByLabel('To (included)').fill(DAY);
  await mgr.getByText(/entr(y|ies) ·/).waitFor({ timeout: 15000 });
  await mgr.getByRole('radio', { name: /ADP TotalSource/ }).check();
  await mgr.getByTestId('adp-options').waitFor({ timeout: 5000 });
}

await step('without a File # the export names who is missing one', async () => {
  await openExportForTheDay();
  await mgr.getByRole('button', { name: 'Download ADP import file' }).click();
  await mgr.getByText(/No ADP File # for Frankie Front-Desk/).waitFor({ timeout: 15000 });
});

await step('an admin gives Frankie a File # on the Staff screen', async () => {
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  const staffCard = admin.getByTestId('staff-frontdesk@domihealthcare.com');
  await staffCard.getByText('No ADP File # yet').waitFor({ timeout: 15000 });
  await staffCard.getByRole('button', { name: 'Role, locations and ADP' }).click();
  await staffCard.getByLabel('ADP File #').fill('001234');
  const saved = admin.waitForResponse((r) => r.url().includes('/api/employees/') && r.request().method() === 'PATCH');
  await staffCard.getByRole('button', { name: 'Save', exact: true }).click();
  if (!(await saved).ok()) throw new Error('the File # was refused');
  await staffCard.getByText('ADP File # 001234').waitFor({ timeout: 10000 });
});

await step('the download is ADP’s import file, laid out as ADP asks', async () => {
  await openExportForTheDay();
  await mgr.getByLabel('Batch ID').fill('wk38');
  const [download] = await Promise.all([
    mgr.waitForEvent('download', { timeout: 30000 }),
    mgr.getByRole('button', { name: 'Download ADP import file' }).click(),
  ]);
  if (download.suggestedFilename() !== 'PRDMHEPI.csv')
    throw new Error(`named ${download.suggestedFilename()}, not PRDMHEPI.csv`);
  const path = `${DOWNLOADS}/adp-${Date.now()}.csv`;
  await download.saveAs(path);
  const lines = readFileSync(path, 'utf8').split('\r\n');
  const expected = [
    '!PAYDATA,Worksheet,Test run',
    'Co Code,Batch ID,File #,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount',
    '!',
    'DMH,WK38,001234,8.50,,,',
    '!END',
    '',
  ];
  if (JSON.stringify(lines) !== JSON.stringify(expected))
    throw new Error(`unexpected file:\n${lines.join('\n')}`);
});

await step('the run is in the history as an ADP export', async () => {
  await mgr.getByText(/adp-totalsource ·/).first().waitFor({ timeout: 10000 });
});
await mgr.screenshot({ path: `${OUT}/99-adp-export.png`, fullPage: true });

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL ADP CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
