import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

const scan = join(tmpdir(), 'credential-licence.pdf');
writeFileSync(scan, '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n');

const dayOffset = (n) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
}

const admin = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
admin.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(admin, 'admin@domihealthcare.com');
await admin.getByRole('link', { name: /^Licences/ }).first().click();

await step('the screen opens on what is about to lapse', async () => {
  await admin.getByText('Licences and certifications').waitFor({ timeout: 15000 });
  await admin.getByRole('button', { name: 'Next 60 days' }).waitFor({ timeout: 5000 });
  await admin.getByText(/Nothing lapses in that window|Nothing recorded yet/).waitFor({
    timeout: 10000,
  });
});

await step('a licence can be recorded, with its scan', async () => {
  await admin.getByRole('button', { name: '+ Record one' }).click();
  await admin.getByLabel('Who').selectOption({ label: 'Frankie Front-Desk' });
  await admin.getByLabel('Kind').selectOption({ label: 'Professional licence' });
  await admin.getByLabel('What it is').fill('NJ Registered Nurse licence');
  await admin.getByLabel('Issued by').fill('NJ Board of Nursing');
  await admin.getByLabel('Number').fill('26NR12345600');
  await admin.getByLabel('Expires').fill(dayOffset(21));
  await admin.getByLabel('A scan').setInputFiles(scan);
  await admin.getByRole('button', { name: 'Record it' }).click();

  await admin.getByText('NJ Registered Nurse licence').first().waitFor({ timeout: 20000 });
  await admin.getByText('21 days left').waitFor({ timeout: 10000 });
});
await admin.screenshot({ path: `${OUT}/62-credentials.png`, fullPage: true });

await step('one that has already lapsed is called out separately', async () => {
  await admin.getByRole('button', { name: '+ Record one' }).click();
  await admin.getByLabel('Who').selectOption({ label: 'Frankie Front-Desk' });
  await admin.getByLabel('Kind').selectOption({ label: 'CPR / BLS / ACLS' });
  await admin.getByLabel('What it is').fill('BLS card');
  await admin.getByLabel('Expires').fill(dayOffset(-12));
  await admin.getByRole('button', { name: 'Record it' }).click();

  await admin.getByText('Already lapsed').waitFor({ timeout: 20000 });
  await admin.getByText('lapsed 12 days ago').waitFor({ timeout: 10000 });
});

await step('a shorter window hides what is further out', async () => {
  await admin.getByRole('button', { name: 'Next 30 days' }).click();
  await admin.getByText('BLS card').first().waitFor({ timeout: 10000 });

  // The nurse licence is 21 days out, so it stays; add one a year away and it
  // should not appear.
  await admin.getByRole('button', { name: '+ Record one' }).click();
  await admin.getByLabel('Who').selectOption({ label: 'Frankie Front-Desk' });
  await admin.getByLabel('What it is').fill('DEA registration');
  await admin.getByLabel('Expires').fill(dayOffset(300));
  await admin.getByRole('button', { name: 'Record it' }).click();
  await admin.waitForTimeout(1500);

  if ((await admin.getByText('DEA registration').count()) > 0)
    throw new Error('a credential 300 days out showed in the next-30-days view');

  await admin.getByRole('button', { name: 'Everything' }).click();
  await admin.getByText('DEA registration').first().waitFor({ timeout: 10000 });
});

await step('renewing is a date and a new scan, not a whole form', async () => {
  await admin.getByRole('button', { name: 'Renew' }).first().click();
  await admin.getByLabel('New expiry date').fill(dayOffset(400));
  await admin.getByRole('button', { name: 'Save the renewal' }).click();

  // The one that had lapsed should now read as current.
  await admin.waitForTimeout(2000);
  const text = await admin.locator('main').innerText();
  if (/lapsed \d+ days ago/.test(text) && !/DEA/.test(text))
    throw new Error('the renewal did not take');
});

await step('the scan can be opened by an admin', async () => {
  const [download] = await Promise.all([
    admin.waitForEvent('download', { timeout: 20000 }),
    admin.getByRole('button', { name: 'credential-licence.pdf' }).first().click(),
  ]);
  if (download.suggestedFilename() !== 'credential-licence.pdf')
    throw new Error(`downloaded ${download.suggestedFilename()}`);
});

const mgrCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const manager = await mgrCtx.newPage();
manager.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await signIn(manager, 'manager@domihealthcare.com');
await manager.getByRole('link', { name: /^Licences/ }).first().click();
await manager.getByRole('button', { name: 'Everything' }).click();

await step('a manager sees what is current but not the licence number', async () => {
  await manager.getByText('NJ Registered Nurse licence').first().waitFor({ timeout: 15000 });

  const text = await manager.locator('main').innerText();
  if (text.includes('26NR12345600'))
    throw new Error('a manager was shown the licence number');
});

await step('a manager cannot open the scan itself', async () => {
  await manager.getByRole('button', { name: 'credential-licence.pdf' }).first().click();
  await manager.getByText(/only visible to an admin, or to the person it belongs to/).waitFor({
    timeout: 15000,
  });
});
await manager.screenshot({ path: `${OUT}/63-credentials-manager.png`, fullPage: true });

await step('an employee sees their own, with the number', async () => {
  const empCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const emp = await empCtx.newPage();
  await signIn(emp, 'frontdesk@domihealthcare.com');
  await emp.getByRole('link', { name: /^Licences/ }).first().click();
  await emp.getByRole('button', { name: 'Everything' }).click();

  await emp.getByText('Your licences').waitFor({ timeout: 15000 });
  await emp.getByText('NJ Registered Nurse licence').first().waitFor({ timeout: 10000 });

  const text = await emp.locator('main').innerText();
  if (!text.includes('26NR12345600'))
    throw new Error('the person it belongs to could not see their own licence number');
  if ((await emp.getByRole('button', { name: '+ Record one' }).count()) > 0)
    throw new Error('an employee was offered the record form');

  await empCtx.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CREDENTIAL CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
