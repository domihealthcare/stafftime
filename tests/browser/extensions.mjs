import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo } from './nav.mjs';

// Office extensions in the Directory (October 2026, Dominguez — from the
// practice's "Office Extensions" sheet, then the new phone system's list on 7
// October): everybody reads the list, laid out by section; a person's 5xx
// number rings their mobile on their work-from-home days; managers keep the
// list, and a line matched to somebody shows on their
// Directory and Staff cards — the from-home number first on a day at home.
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

async function signIn(email, viewport) {
  const ctx = await browser.newContext(
    viewport ? { viewport, isMobile: true, hasTouch: true } : { viewport: { width: 1400, height: 1000 } },
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
  return page;
}

const frankie = await signIn('frontdesk@domihealthcare.com', { width: 390, height: 844 });
const mgr = await signIn('manager@domihealthcare.com');

await step('everybody sees the office extensions in the Directory, by section, as on the phone system', async () => {
  await goTo(frankie, 'Directory');
  const list = frankie.getByTestId('office-extensions');
  await list.waitFor({ timeout: 15000 });
  for (const section of ['Providers', 'Admin Team', 'Front Desk', 'MA & Lab', 'Shared lines', 'Provider softphones (rarely used)']) {
    await list.getByRole('heading', { name: section, exact: true }).waitFor({ timeout: 5000 });
  }
  const kayla = list.getByTestId('extension-line').filter({ hasText: 'Kayla Bermeo' });
  await kayla.getByText('121', { exact: true }).waitFor({ timeout: 5000 });
  await kayla.getByText(/From home: 521 · Thursday/).waitFor({ timeout: 5000 });
  await list.getByTestId('extension-line').filter({ hasText: 'FD N 1' }).getByText('101').waitFor();
  const count = await list.getByTestId('extension-line').count();
  if (count !== 31) throw new Error(`${count} lines, the phone system has 31`);
  // Staff read it; only managers change it.
  if (await list.getByRole('button', { name: /Edit/ }).count()) throw new Error('staff have an Edit button');
  const status = await frankie.evaluate(() =>
    fetch('/api/directory/extensions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: [] }),
    }).then((r) => r.status),
  );
  if (status !== 403) throw new Error(`staff saving the list answered ${status}`);
  await frankie.screenshot({ path: `${OUT}/extensions-phone.png`, fullPage: true });
});

await step('the search box narrows the extensions as well as the people', async () => {
  await frankie.getByLabel('Search').fill('522');
  const lines = frankie.getByTestId('office-extensions').getByTestId('extension-line');
  await lines.first().getByText('Tatiyana Rosales').waitFor({ timeout: 5000 });
  if ((await lines.count()) !== 1) throw new Error(`${await lines.count()} lines match 522`);
  await frankie.getByLabel('Search').fill('');
});

await step('a manager adds a line for somebody, and it shows on their cards', async () => {
  await goTo(mgr, 'Directory');
  await mgr.getByRole('button', { name: 'Edit office extensions' }).click();
  const editor = mgr.getByTestId('extensions-editor');
  await editor.waitFor({ timeout: 5000 });
  await editor.getByRole('button', { name: '+ Add a line' }).click();
  const row = editor.getByTestId('extension-row').last();
  await row.getByLabel('Section').fill('Admin Team');
  await row.getByLabel('Person').selectOption({ label: 'Morgan Manager' });
  if ((await row.getByLabel('Name or phone').inputValue()) !== 'Morgan Manager')
    throw new Error('picking a person did not fill in the name');
  await row.getByLabel('Ext.').fill('199');
  await row.getByLabel('From home').fill('599');
  await row.getByLabel('Home days').fill('Friday');
  await mgr.screenshot({ path: `${OUT}/extensions-editor.png` });
  const saved = mgr.waitForResponse((r) => r.url().endsWith('/api/directory/extensions') && r.request().method() === 'PUT');
  await editor.getByRole('button', { name: 'Save extensions' }).click();
  if (!(await saved).ok()) throw new Error('the save was refused');
  await editor.waitFor({ state: 'detached', timeout: 10000 });

  await mgr.getByTestId('office-extensions').getByTestId('extension-line').filter({ hasText: 'Morgan Manager' }).getByText('199').waitFor({ timeout: 5000 });
  const card = mgr.getByTestId('person-Morgan Manager').getByTestId('person-extension');
  await card.getByText(/Ext\. 199/).waitFor({ timeout: 5000 });
  await card.getByText(/599 from home \(Friday\)/).waitFor({ timeout: 5000 });

  await mgr.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await mgr.getByTestId('staff-manager@domihealthcare.com').getByTestId('person-extension').getByText(/Ext\. 199/).waitFor({ timeout: 10000 });
});

await step('on a day working from home, the from-home number comes first', async () => {
  await mgr.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const morgan = staff.find((p) => p.email === 'manager@domihealthcare.com');
    const locations = await fetch('/api/locations').then((r) => r.json());
    const now = Date.now();
    const dayEnd = new Date(); dayEnd.setHours(23, 59, 0, 0);
    const r = await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: morgan.id,
        locationId: locations.find((l) => l.name === 'North Bergen').id,
        startsAt: new Date(now - 10 * 60_000).toISOString(),
        endsAt: new Date(Math.min(now + 3 * 3_600_000, dayEnd.getTime())).toISOString(),
        isRemote: true,
        status: 'PUBLISHED',
        notes: 'extensions-suite',
      }),
    });
    if (!r.ok) throw new Error(`could not make the shift: ${await r.text()}`);
  });
  await goTo(mgr, 'Directory');
  const card = mgr.getByTestId('person-Morgan Manager').getByTestId('person-extension');
  await card.getByText(/Ext\. 599/).waitFor({ timeout: 15000 });
  await card.getByText(/working from home/).waitFor({ timeout: 5000 });
  await mgr.getByTestId('in-now-home').getByText(/ext\. 599/).waitFor({ timeout: 5000 });
  await mgr.screenshot({ path: `${OUT}/extensions-directory.png`, fullPage: true });
});

await step('removing a line asks first, and closing with changes asks too', async () => {
  await mgr.getByRole('button', { name: 'Edit office extensions' }).click();
  const editor = mgr.getByTestId('extensions-editor');
  await editor.getByRole('button', { name: 'Remove Morgan Manager' }).click();
  await mgr.getByRole('button', { name: 'Keep it' }).click();
  if ((await editor.getByTestId('extension-row').count()) !== 32) throw new Error('kept, but the line went');
  await editor.getByRole('button', { name: 'Remove Morgan Manager' }).click();
  await mgr.getByRole('button', { name: 'Remove it' }).click();
  await editor.getByRole('button', { name: 'Cancel' }).click();
  await mgr.getByRole('button', { name: 'Keep editing' }).click();
  await editor.getByRole('button', { name: 'Save extensions' }).click();
  await editor.waitFor({ state: 'detached', timeout: 10000 });
  const lines = await mgr.evaluate(() => fetch('/api/directory/extensions').then((r) => r.json()));
  if (lines.length !== 31) throw new Error(`${lines.length} lines after removing it`);
  if (lines.some((line) => line.extension === '199')) throw new Error('the line is still there');
  if (await mgr.getByTestId('person-Morgan Manager').getByTestId('person-extension').count())
    throw new Error('the card still shows an extension');
});

await step('nothing here takes a file', async () => {
  for (const page of [mgr, frankie]) {
    if ((await page.locator('input[type=file]').count()) > 0) throw new Error('a file input appeared');
  }
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL EXTENSION CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
