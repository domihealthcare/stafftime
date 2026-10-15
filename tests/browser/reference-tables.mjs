import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo } from './nav.mjs';

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

/**
 * Reference tables (October 2026, Dominguez — the practice's spreadsheets
 * on the portal): the diagnostics guide for everyone, the fee schedule for
 * managers and admins only. Pasted in from the spreadsheet — copied cells,
 * never a file — searchable, the answers coloured, and kept by managers.
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

// As Excel copies it: tabs between cells, a cell with a line break in quotes.
const DIAGNOSTICS = [
  'ECW insurance / Payer ID\tPlan\t"Abdomen\n(Cannot be scheduled same day with another KUB/abd area)"\tECHO\tCAROTID',
  '\tTime / Prep\t20 min / Fast 6 hrs\t20 min / N/A\t20 min / N/A',
  'Aetna Medicare / 60054 / 456\tAetna-MCARE\tYES\tYES\tNO',
  'Cigna Healthcare / 62308 / 84\tCigna - COMM\tNO\tYES\tNO',
  '\tAllied-COMM\tPA\tPA\tPA',
  '',
].join('\n');

const FEES = ['CPT\tDescription\tMedicare\tBCBS NJ', '99202\tNew Pt, Prob 2\t78.32\t70.72', '99213\tEst Pt, Prob 3\t88.57\t'].join('\n');

const manager = await signIn('manager@domihealthcare.com');
let diagnosticsId = null;
let feesId = null;

async function addTable(title, pasted, { audience, headerRows, keyColumns }) {
  await goTo(manager, 'Resources');
  const section = manager.getByTestId('reference-section');
  await section.getByRole('button', { name: '+ Add a table' }).click();
  const form = manager.getByRole('form', { name: 'New table' });
  await form.getByLabel('Name', { exact: true }).fill(title);
  await form.getByLabel('Who reads it').selectOption(audience);
  await form.getByLabel('Heading rows').fill(String(headerRows));
  await form.getByLabel('Name columns').fill(String(keyColumns));
  await form.getByLabel('Paste the table').fill(pasted);
  const saved = manager.waitForResponse((r) => r.url().endsWith('/api/reference-tables') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Add the table' }).click();
  const response = await saved;
  if (response.status() !== 201) throw new Error(`answered ${response.status()}: ${await response.text()}`);
  const body = await response.json();
  await manager.getByRole('heading', { name: title }).waitFor({ timeout: 10000 });
  return body;
}

await step('a manager pastes in the diagnostics guide from the spreadsheet', async () => {
  const table = await addTable('Diagnostics — Ultrasounds', DIAGNOSTICS, {
    audience: 'EVERYONE',
    headerRows: 2,
    keyColumns: 2,
  });
  diagnosticsId = table.id;
  // The quoted heading is one cell, line break and all.
  if (table.rows[0][2] !== 'Abdomen\n(Cannot be scheduled same day with another KUB/abd area)')
    throw new Error(`heading read as ${JSON.stringify(table.rows[0])}`);
  if (table.rows.length !== 5) throw new Error(`${table.rows.length} rows`);
});

await step('and the fee schedule, for managers and admins only', async () => {
  const table = await addTable('Fee schedule', FEES, {
    audience: 'MANAGERS',
    headerRows: 1,
    keyColumns: 2,
  });
  feesId = table.id;
});

await step('a manager changes a cell and saves it', async () => {
  await manager.goto(`${BASE}/reference/${feesId}`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: 'Edit cells' }).click();
  const table = manager.getByTestId('reference-table');
  // The empty BCBS cell for 99213.
  await table.getByRole('row', { name: /99213/ }).getByRole('button', { name: '—' }).click();
  await manager.getByRole('textbox', { name: 'Cell' }).fill('92.10');
  await manager.getByRole('textbox', { name: 'Cell' }).press('Enter');
  const saved = manager.waitForResponse((r) => r.url().includes(`/api/reference-tables/${feesId}`) && r.request().method() === 'PUT');
  await manager.getByRole('button', { name: 'Save changes' }).click();
  const body = await (await saved).json();
  if (body.rows[2][3] !== '92.10') throw new Error(`saved ${JSON.stringify(body.rows[2])}`);
  await table.getByText('92.10').waitFor();
});

const staff = await signIn('frontdesk@domihealthcare.com');

await step('staff find the diagnostics guide on Resources, and not the fee schedule', async () => {
  await goTo(staff, 'Resources');
  const section = staff.getByTestId('reference-section');
  await section.getByRole('link', { name: /Diagnostics — Ultrasounds/ }).waitFor({ timeout: 10000 });
  if (await section.getByText('Fee schedule').count()) throw new Error('staff see the fee schedule');
  if (await section.getByRole('button', { name: '+ Add a table' }).count())
    throw new Error('staff were offered + Add a table');
  const status = await staff.evaluate(
    async (id) => (await fetch(`/api/reference-tables/${id}`)).status,
    feesId,
  );
  if (status !== 404) throw new Error(`opening the fee schedule answered ${status}`);
});

await step('searching narrows the rows and the columns, and the answers are coloured', async () => {
  await staff.getByTestId('reference-section').getByRole('link', { name: /Diagnostics/ }).click();
  const table = staff.getByTestId('reference-table');
  await table.getByText('Aetna-MCARE').waitFor({ timeout: 10000 });
  await staff.getByLabel('Find a row').fill('cigna');
  await table.getByText('Cigna - COMM').waitFor();
  if (await table.getByText('Aetna-MCARE').count()) throw new Error('Aetna still shown');
  await staff.getByLabel('Only columns with').fill('echo');
  if (await table.getByText(/^Abdomen/).count()) throw new Error('the Abdomen column is still shown');
  // The headings and the plan stay; ECHO for Cigna is covered.
  await table.getByRole('columnheader', { name: 'ECHO' }).waitFor();
  const yes = table.getByRole('row', { name: /Cigna - COMM/ }).getByRole('cell', { name: 'YES' });
  if (!/bg-emerald-50/.test((await yes.getAttribute('class')) ?? '')) throw new Error('YES is not green');
  if (await staff.getByRole('button', { name: 'Edit cells' }).count()) throw new Error('staff can edit');
  await staff.screenshot({ path: `${OUT}/reference-diagnostics.png`, fullPage: true });
});

await step('on a phone the table scrolls inside its card, not the page', async () => {
  const phone = await signIn('frontdesk@domihealthcare.com', { width: 390, height: 844 });
  await phone.goto(`${BASE}/reference/${diagnosticsId}`, { waitUntil: 'networkidle' });
  await phone.getByTestId('reference-table').getByText('Aetna-MCARE').waitFor({ timeout: 10000 });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (wide) throw new Error('the page scrolls sideways');
  await phone.context().close();
});

await step('there is nowhere to upload a file', async () => {
  await manager.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  await manager.getByTestId('reference-section').getByRole('button', { name: '+ Add a table' }).click();
  if (await manager.locator('input[type=file]').count()) throw new Error('a file input');
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL REFERENCE TABLE CHECKS PASSED');
