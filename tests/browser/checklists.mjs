import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  // Fall back to whatever Playwright downloaded when CHROMIUM_PATH is unset.
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

// A real PDF (the magic bytes matter — the server checks them) and a fake one.
const realPdf = join(tmpdir(), 'checklist-i9.pdf');
writeFileSync(realPdf, '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n');
const fakePdf = join(tmpdir(), 'checklist-not-really.pdf');
writeFileSync(fakePdf, '<html><script>alert(1)</script></html>');

async function signIn(page, email) {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 15000 });
}

const admin = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
admin.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(admin, 'admin@domihealthcare.com');
await admin.getByRole('link', { name: 'Checklists' }).click();

await step('an admin starts with nothing on the go', async () => {
  await admin.getByText('Onboarding & offboarding').waitFor({ timeout: 15000 });
  await admin.getByText(/Nothing on the go/).waitFor({ timeout: 10000 });
});

await step('the seeded templates are there to look at', async () => {
  await admin.getByText('Templates').first().waitFor({ timeout: 10000 });
  await admin.getByText('New hire — Domi Healthcare').first().waitFor({ timeout: 5000 });
  await admin.getByText('Departure — Domi Healthcare').first().waitFor({ timeout: 5000 });
});

await step('a template opens to show what it will create', async () => {
  await admin.getByRole('button', { name: /New hire — Domi Healthcare/ }).click();
  await admin.getByText('Form I-9 completed and verified').first().waitFor({ timeout: 5000 });
  // The I-9 is due three days after the start date.
  await admin.getByText('3 days after').first().waitFor({ timeout: 5000 });
  await admin.getByRole('button', { name: /New hire — Domi Healthcare/ }).click();
});
await admin.screenshot({ path: `${OUT}/40-templates.png`, fullPage: true });

await step('an onboarding checklist can be started for somebody', async () => {
  await admin.getByRole('button', { name: 'Start a checklist' }).click();
  await admin.getByLabel('Who').selectOption({ label: 'Frankie Front-Desk' });
  await admin.getByLabel('Start date').fill('2027-03-01');
  await admin.getByRole('button', { name: 'Start it' }).click();

  await admin.getByText('0 of 18').waitFor({ timeout: 15000 });
});
await admin.screenshot({ path: `${OUT}/41-checklist-started.png`, fullPage: true });

await step('a second one for the same person is refused, with a reason', async () => {
  await admin.getByRole('button', { name: 'Start a checklist' }).click();
  await admin.getByLabel('Who').selectOption({ label: 'Frankie Front-Desk' });
  await admin.getByRole('button', { name: 'Start it' }).click();

  await admin.getByText(/already has an unfinished onboarding checklist/).waitFor({ timeout: 10000 });
  await admin.getByRole('button', { name: 'Cancel' }).click();
});

await step('due dates are worked out from the start date given', async () => {
  const text = await admin.locator('main').innerText();
  // Start date 2027-03-01: the offer letter is due a week before, the I-9 three
  // days after.
  if (!/Feb 22, 2027/.test(text)) throw new Error('the -7 day task was not dated from the anchor');
  if (!/Mar 4, 2027/.test(text)) throw new Error('the +3 day task was not dated from the anchor');
});

await step('a task needing a document will not tick off without one', async () => {
  const row = admin.locator('li', { hasText: 'Form I-9 completed and verified' }).last();
  await row.getByRole('button', { name: 'Mark done' }).click();
  await admin.getByText(/needs a document attached/).waitFor({ timeout: 10000 });
});

await step('a file that is not really a PDF is refused', async () => {
  const row = admin.locator('li', { hasText: 'Form I-9 completed and verified' }).last();
  await row.getByLabel(/Attach a document/).setInputFiles(fakePdf);
  await admin.getByText(/not really a PDF/).waitFor({ timeout: 15000 });
});

await step('a real PDF attaches, and then the task ticks off', async () => {
  const row = admin.locator('li', { hasText: 'Form I-9 completed and verified' }).last();
  await row.getByLabel(/Attach a document/).setInputFiles(realPdf);
  await admin.getByText('checklist-i9.pdf').first().waitFor({ timeout: 15000 });

  await admin
    .locator('li', { hasText: 'Form I-9 completed and verified' })
    .last()
    .getByRole('button', { name: 'Mark done' })
    .click();
  await admin.getByText('1 of 18').waitFor({ timeout: 15000 });
});
await admin.screenshot({ path: `${OUT}/42-document-attached.png`, fullPage: true });

await step('skipping a task needs a reason', async () => {
  const row = admin.locator('li', { hasText: 'CPR / BLS card on file' }).last();
  await row.getByRole('button', { name: 'Not applicable' }).click();

  const save = admin.getByRole('button', { name: 'Save', exact: true });
  if (!(await save.isDisabled())) throw new Error('Save was offered with no reason given');

  await admin.getByLabel('Why does it not apply?').fill('Non-clinical role');
  await save.click();
  await admin.getByText('2 of 18').waitFor({ timeout: 15000 });
  await admin.getByText('“Non-clinical role”').waitFor({ timeout: 5000 });
});

await step('a downloaded document comes back byte for byte', async () => {
  const [download] = await Promise.all([
    admin.waitForEvent('download', { timeout: 15000 }),
    admin.getByRole('button', { name: 'checklist-i9.pdf' }).first().click(),
  ]);
  if (download.suggestedFilename() !== 'checklist-i9.pdf')
    throw new Error(`downloaded as ${download.suggestedFilename()}`);
});

const emp = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const employee = await emp.newPage();
employee.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(employee, 'frontdesk@domihealthcare.com');
await employee.getByRole('link', { name: 'Checklists' }).click();

await step('the employee sees their own checklist', async () => {
  await employee.getByText('Your checklist').waitFor({ timeout: 15000 });
  await employee.getByText(/Frankie/).first().waitFor({ timeout: 10000 });
});

await step('the employee is not offered the manager tools', async () => {
  if (await employee.getByRole('button', { name: 'Start a checklist' }).count() > 0)
    throw new Error('an employee was offered the start form');
  if (await employee.getByText('Templates').count() > 0)
    throw new Error('an employee was shown the templates');
});

await step('the employee can only act on the tasks that are theirs', async () => {
  await employee.getByRole('button', { name: /Frankie/ }).first().click();

  const ownTask = employee.locator('li', { hasText: 'Emergency contact recorded' }).last();
  await ownTask.getByRole('button', { name: 'Mark done' }).waitFor({ timeout: 10000 });

  const practiceTask = employee.locator('li', { hasText: 'Form W-4 and NJ-W4 completed' }).last();
  if (await practiceTask.getByRole('button', { name: 'Mark done' }).count() > 0)
    throw new Error('an employee was offered a task the practice owns');
});
await employee.screenshot({ path: `${OUT}/43-employee-checklist.png`, fullPage: true });

await step('the employee ticks off their own task', async () => {
  await employee
    .locator('li', { hasText: 'Emergency contact recorded' })
    .last()
    .getByRole('button', { name: 'Mark done' })
    .click();
  await employee.getByText('3 of 18').waitFor({ timeout: 15000 });
});

await step('the employee can open a document the practice filed about them', async () => {
  const [download] = await Promise.all([
    employee.waitForEvent('download', { timeout: 15000 }),
    employee.getByRole('button', { name: 'checklist-i9.pdf' }).first().click(),
  ]);
  if (!download.suggestedFilename().endsWith('.pdf'))
    throw new Error(`downloaded as ${download.suggestedFilename()}`);
});

const mgrCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const manager = await mgrCtx.newPage();
manager.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(manager, 'manager@domihealthcare.com');
await manager.getByRole('link', { name: 'Checklists' }).click();

await step('a manager runs the checklist but cannot open the documents', async () => {
  await manager.getByRole('button', { name: /Frankie/ }).first().click();
  // They can act on tasks…
  await manager
    .locator('li', { hasText: 'Building keys' })
    .last()
    .getByRole('button', { name: 'Mark done' })
    .waitFor({ timeout: 10000 });

  // …but the bytes are refused, and the screen says why rather than failing silently.
  await manager.getByRole('button', { name: 'checklist-i9.pdf' }).first().click();
  await manager
    .getByText(/only visible to an admin, or to the person they are about/)
    .waitFor({ timeout: 15000 });
});
await manager.screenshot({ path: `${OUT}/44-manager-refused.png`, fullPage: true });

await step('a manager is not offered the delete', async () => {
  if (await manager.getByRole('button', { name: 'Delete this checklist' }).count() > 0)
    throw new Error('a manager was offered the delete');
});

await step('an admin can delete the checklist, documents and all', async () => {
  await admin.reload({ waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: /Frankie/ }).first().click();
  await admin.getByRole('button', { name: 'Delete this checklist' }).click();
  await admin.getByText(/every document attached to it/).waitFor({ timeout: 5000 });
  await admin.getByRole('button', { name: 'Yes, delete it' }).click();
  await admin.getByText(/Nothing on the go/).waitFor({ timeout: 15000 });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CHECKLIST CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
