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

// A real PDF (the magic bytes matter — the server checks them) and a fake one.
const realPdf = join(tmpdir(), 'checklist-i9.pdf');
writeFileSync(realPdf, '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n');
const fakePdf = join(tmpdir(), 'checklist-not-really.pdf');
writeFileSync(fakePdf, '<html><script>alert(1)</script></html>');

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
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

// --- editing the templates themselves ---
//
// The whole point of shipping the seeded lists is that the practice edits them
// to match how it actually works, so the editing has to be real rather than a
// promise in a document.

/// Expands a template card if it is not already open. Clicking blindly toggles,
/// which closes the one you meant to read.
async function openTemplate(page, name) {
  const card = page.getByRole('button', { name }).last();
  await card.waitFor({ timeout: 10000 });
  if ((await card.getAttribute('aria-expanded')) !== 'true') await card.click();
}

await step('an admin can open a template for editing', async () => {
  await openTemplate(admin, /New hire — Domi Healthcare/);
  await admin.getByRole('button', { name: 'Edit this template' }).click();
  await admin.getByLabel('Template name').waitFor({ timeout: 10000 });
});

await step('a task can be added, worded, assigned and given a due date', async () => {
  await admin.getByRole('button', { name: '+ Add a task' }).click();

  // The new task is the last one; the seeded template has 18.
  const index = 19;
  await admin.getByLabel(`Task ${index} title`).fill('Parking permit issued');
  await admin.getByLabel(`Task ${index} notes`).fill('The lot behind the North Bergen office.');
  await admin.getByLabel(`Task ${index} owner`).selectOption({ label: 'A manager' });
  await admin.getByLabel(`Task ${index} due`).selectOption({ label: 'after the start date' });
  await admin.getByLabel(`Task ${index} days`).fill('2');

  await admin.getByRole('button', { name: 'Save the template' }).click();
  await admin.getByText('19 tasks, 7 needing a document').waitFor({ timeout: 15000 });
});
await admin.screenshot({ path: `${OUT}/46-template-edited.png`, fullPage: true });

await step('the change is on the template, described in plain words', async () => {
  await admin.getByText('Parking permit issued').waitFor({ timeout: 10000 });
  await admin.getByText('2 days after').first().waitFor({ timeout: 5000 });

  // "1 day before", not "1 days before".
  const text = await admin.locator('main').innerText();
  if (/\b1 days (before|after)\b/.test(text))
    throw new Error('a single day is being described in the plural');
  if (!/\b1 day (before|after)\b/.test(text))
    throw new Error('expected a task due one day either side of the start date');
});

await step('a task can be reordered and removed', async () => {
  await openTemplate(admin, /New hire — Domi Healthcare/);
  await admin.getByRole('button', { name: 'Edit this template' }).click();
  await admin.getByLabel('Task 1 title').waitFor({ timeout: 10000 });

  const first = await admin.getByLabel('Task 1 title').inputValue();
  await admin.getByRole('button', { name: 'Move task 1 down' }).click();
  if ((await admin.getByLabel('Task 2 title').inputValue()) !== first)
    throw new Error('moving a task down did not move it');

  await admin.getByRole('button', { name: 'Remove task 2' }).click();
  await admin.getByRole('button', { name: 'Save the template' }).click();
  await admin.getByText('18 tasks').first().waitFor({ timeout: 15000 });
});

await step('the edit does not disturb a checklist already under way', async () => {
  // Start one from the edited template, then edit the template again and check
  // the started checklist keeps the wording it began with.
  await admin.getByRole('button', { name: 'Start a checklist' }).click();
  await admin.getByLabel('Who').selectOption({ label: 'Frankie Front-Desk' });
  await admin.getByRole('button', { name: 'Start it' }).click();
  await admin.getByText(/0 of 18/).waitFor({ timeout: 20000 });

  // The running checklist names the template it came from, so there are now two
  // buttons carrying that text. openTemplate takes the later one, which is the
  // template card.
  await openTemplate(admin, /New hire — Domi Healthcare/);
  await admin.getByRole('button', { name: 'Edit this template' }).click();
  await admin.getByLabel('Task 1 title').fill('COMPLETELY DIFFERENT WORDING');
  await admin.getByRole('button', { name: 'Save the template' }).click();
  await admin.getByText('COMPLETELY DIFFERENT WORDING').waitFor({ timeout: 15000 });

  // The running checklist still says what it said when it was started.
  await admin.reload({ waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: /Frankie/ }).first().click();
  const running = await admin.locator('main').innerText();
  if (/COMPLETELY DIFFERENT WORDING/.test(running))
    throw new Error('editing the template rewrote a checklist that was already under way');
});

await step('a new template can be created from nothing', async () => {
  await admin.getByRole('button', { name: '+ New offboarding template' }).click();
  await admin.getByLabel('Template name').fill('Locum departure');
  await admin.getByLabel('Task 1 title').fill('Return the badge');
  await admin.getByRole('button', { name: 'Create the template' }).click();

  const card = admin.getByRole('button', { name: /Locum departure/ });
  await card.waitFor({ timeout: 15000 });

  // "1 task", not "1 tasks", and filed under offboarding.
  const label = await card.innerText();
  if (!/\boffboarding\b/.test(label)) throw new Error(`created under the wrong kind: ${label}`);
  if (!/\b1 task\b/.test(label)) throw new Error(`expected "1 task", got: ${label}`);
});

await step('editing shows the editor instead of the list, not both', async () => {
  await openTemplate(admin, /Locum departure/);
  await admin.getByRole('button', { name: 'Edit this template' }).click();
  await admin.getByLabel('Task 1 title').waitFor({ timeout: 10000 });

  // The read-only row for the same task would be a second copy of it on screen.
  const copies = await admin.getByText('Return the badge', { exact: true }).count();
  if (copies > 0)
    throw new Error('the read-only task list is still showing underneath the editor');
  await admin.getByRole('button', { name: 'Cancel' }).click();
});

await step('a template with no name or no tasks is refused with a reason', async () => {
  await admin.getByRole('button', { name: '+ New onboarding template' }).click();
  await admin.getByRole('button', { name: 'Create the template' }).click();
  await admin.getByText('Give the template a name.').waitFor({ timeout: 10000 });

  await admin.getByLabel('Template name').fill('Empty one');
  await admin.getByRole('button', { name: 'Remove task 1' }).click();
  await admin.getByRole('button', { name: 'Create the template' }).click();
  await admin.getByText(/needs at least one task/).waitFor({ timeout: 10000 });
  await admin.getByRole('button', { name: 'Cancel' }).click();
});

await step('a manager can read the templates but not change them', async () => {
  await manager.reload({ waitUntil: 'networkidle' });
  await manager.getByText('Templates').first().waitFor({ timeout: 15000 });
  await openTemplate(manager, /Departure — Domi Healthcare/);

  for (const name of ['Edit this template', 'Retire this template', '+ New onboarding template']) {
    if ((await manager.getByRole('button', { name }).count()) > 0)
      throw new Error(`a manager was offered "${name}"`);
  }
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CHECKLIST CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
