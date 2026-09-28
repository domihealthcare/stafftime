import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

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
 * The Staff screen (asked for by Dominguez, September 2026): each card is a
 * summary with one Edit button, and everything else — their details, email and
 * phone included, the welcome email, a temporary password, a tablet PIN, and
 * marking them as having left — is inside it. "No longer employed" used to sit
 * on every card, one tap from "Edit details", and was too easy to press.
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

const admin = await signIn('admin@domihealthcare.com');

// Somebody of this suite's own, so changing their email cannot upset the seed.
// run-all.sh removes imp-*@example.com between suites.
const NEW_EMAIL = 'imp-sasha.new@example.com';
await admin.evaluate(async () => {
  const places = await fetch('/api/locations').then((r) => r.json());
  const r = await fetch('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Sasha',
      lastName: 'Staffsuite',
      email: 'imp-sasha@example.com',
      locationIds: [places[0].id],
      primaryLocationId: places[0].id,
    }),
  });
  if (!r.ok) throw new Error(`could not add Sasha: ${r.status} ${await r.text()}`);
});

async function sasha() {
  return admin.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    return staff.find((p) => p.firstName === 'Sasha' && p.lastName === 'Staffsuite');
  });
}

await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
const editor = admin.getByTestId('staff-editor');

await step('the list has one Edit button per person, and nothing that removes anybody', async () => {
  const card = admin.getByTestId('staff-imp-sasha@example.com');
  await card.getByRole('button', { name: /^Edit / }).waitFor({ timeout: 15000 });
  // The page keeps its "Send welcome emails" bar for everybody at once; it is
  // the person cards that no longer carry anything but Edit.
  const cards = admin.locator('[data-testid^="staff-"]');
  for (const name of [/no longer employed/i, /has left/i, /temporary password/i, /welcome email/i, /PIN/]) {
    if (await cards.getByRole('button', { name }).count()) {
      throw new Error(`a card still has a "${name}" button`);
    }
  }
});

await step('an admin fills in somebody’s email, phone and the name they go by', async () => {
  await admin.getByRole('button', { name: 'Edit Sasha Staffsuite' }).click();
  await editor.getByRole('heading', { name: 'Sasha Staffsuite' }).waitFor({ timeout: 10000 });
  await editor.getByLabel('Name they go by').fill('Sash');
  await editor.getByLabel('Phone number').fill('(201) 555-0199');
  await editor.getByLabel('Email').fill('Imp-Sasha.New@Example.com');
  await editor.getByLabel('Pay type').selectOption('SALARY');
  const saved = admin.waitForResponse((r) => r.url().includes('/api/employees/') && r.request().method() === 'PATCH');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  if (!(await saved).ok()) throw new Error('the change was refused');
  await editor.waitFor({ state: 'detached', timeout: 10000 });

  const card = admin.getByTestId(`staff-${NEW_EMAIL}`);
  await card.getByText('(201) 555-0199').waitFor({ timeout: 10000 });
  await card.getByText('“Sash”').waitFor();
  const record = await sasha();
  if (record.email !== NEW_EMAIL) throw new Error(`email stored as ${record.email}`);
  if (record.phone !== '(201) 555-0199') throw new Error(`phone stored as ${record.phone}`);
  if (record.preferredName !== 'Sash') throw new Error(`goes by ${record.preferredName}`);
  if (record.payType !== 'SALARY') throw new Error(`pay type ${record.payType}`);
});

await step('a phone number can be taken off again', async () => {
  await admin.getByRole('button', { name: 'Edit Sasha Staffsuite' }).click();
  await editor.getByLabel('Phone number').fill('');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await editor.waitFor({ state: 'detached', timeout: 10000 });
  const record = await sasha();
  if (record.phone !== null) throw new Error(`phone is ${record.phone}`);
});

await step('closing with unsaved changes asks first', async () => {
  await admin.getByRole('button', { name: 'Edit Sasha Staffsuite' }).click();
  await editor.getByLabel('Last name').fill('Changed');
  await admin.keyboard.press('Escape');
  const ask = admin.getByRole('alertdialog', { name: 'Close without saving?' });
  await ask.getByRole('button', { name: 'Keep editing' }).click();
  if ((await editor.getByLabel('Last name').inputValue()) !== 'Changed') throw new Error('the edit was lost');
  await editor.getByRole('button', { name: 'Close' }).click();
  await ask.getByRole('button', { name: 'Close without saving' }).click();
  await editor.waitFor({ state: 'detached', timeout: 10000 });
  if ((await sasha()).lastName !== 'Staffsuite') throw new Error('it was saved anyway');
});

await step('the manager tools are in the editor: welcome email, temporary password, tablet PIN', async () => {
  await admin.getByRole('button', { name: 'Edit Sasha Staffsuite' }).click();
  await editor.getByTestId('welcome-status').getByText(/not sent a welcome email/).waitFor({ timeout: 10000 });
  await editor.getByRole('button', { name: 'Send welcome email' }).waitFor();
  await editor.getByRole('button', { name: 'Set a temporary password' }).waitFor();
  await editor.getByRole('button', { name: 'Set a tablet PIN' }).click();
  await editor.getByLabel('New tablet PIN').fill('482915');
  const saved = admin.waitForResponse((r) => r.url().includes('/pin') && r.request().method() === 'PUT');
  await editor.getByRole('button', { name: 'Set PIN' }).click();
  if (!(await saved).ok()) throw new Error('the PIN was refused');
  await editor.getByText('Has a tablet PIN').waitFor({ timeout: 10000 });
  await admin.screenshot({ path: `${OUT}/staff-editor.png`, fullPage: false });
});

await step('marking somebody as having left takes two steps and a confirmation, and can be backed out of', async () => {
  await editor.getByRole('button', { name: 'Mark as no longer employed' }).waitFor({ state: 'detached', timeout: 1000 });
  await editor.getByRole('button', { name: 'Sasha has left…' }).click();
  await editor.getByLabel('Last day worked').fill('2026-09-25');
  await editor.getByRole('button', { name: 'Mark as no longer employed' }).click();
  const ask = admin.getByRole('alertdialog', { name: /Mark Sasha Staffsuite as no longer employed\?/ });
  await ask.getByText(/Friday, September 25, 2026/).waitFor({ timeout: 5000 });
  await ask.getByRole('button', { name: 'Keep them' }).click();
  if ((await sasha()).employmentStatus === 'TERMINATED') throw new Error('marked anyway');

  await editor.getByRole('button', { name: 'Mark as no longer employed' }).click();
  await ask.getByRole('button', { name: 'Yes, no longer employed' }).click();
  await editor.waitFor({ state: 'detached', timeout: 10000 });
  await admin.getByText(/Sasha Staffsuite is marked as no longer employed/).waitFor({ timeout: 10000 });
  await admin.getByTestId(`staff-${NEW_EMAIL}`).waitFor({ state: 'detached', timeout: 10000 });
  const record = await sasha();
  if (record.employmentStatus !== 'TERMINATED') throw new Error(`status ${record.employmentStatus}`);
  if (!record.terminationDate?.startsWith('2026-09-25')) throw new Error(`last day ${record.terminationDate}`);
});

await step('a former member of staff can be brought back', async () => {
  await admin.getByLabel('Show former staff').check();
  await admin.getByRole('button', { name: 'Edit Sasha Staffsuite' }).click();
  await editor.getByText(/last day September 25, 2026/).waitFor({ timeout: 10000 });
  if (await editor.getByRole('button', { name: 'Set a temporary password' }).count()) {
    throw new Error('offered sign-in tools for somebody who has left');
  }
  await editor.getByRole('button', { name: 'Bring them back' }).click();
  await admin
    .getByRole('alertdialog', { name: /Bring Sasha Staffsuite back\?/ })
    .getByRole('button', { name: 'Yes, bring them back' })
    .click();
  await editor.getByRole('button', { name: 'Sasha has left…' }).waitFor({ timeout: 10000 });
  const record = await sasha();
  if (record.employmentStatus !== 'ACTIVE') throw new Error(`status ${record.employmentStatus}`);
  if (record.terminationDate !== null) throw new Error(`still has a last day, ${record.terminationDate}`);
  await editor.getByRole('button', { name: 'Close' }).click();
});

await step('an admin cannot mark themselves as having left', async () => {
  await admin.getByRole('button', { name: /^Edit .+/ }).first().waitFor();
  const me = admin.getByTestId('staff-admin@domihealthcare.com');
  await me.getByRole('button', { name: /^Edit / }).click();
  await editor.getByText(/You cannot mark yourself as having left/).waitFor({ timeout: 10000 });
  if (await editor.getByRole('button', { name: /has left/ }).count()) throw new Error('offered anyway');
  await editor.getByRole('button', { name: 'Close' }).click();
});

await step('on a phone the editor fits the screen', async () => {
  const phone = await signIn('admin@domihealthcare.com', { width: 390, height: 844 });
  await phone.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: 'Edit Sasha Staffsuite' }).click();
  const sheet = phone.getByTestId('staff-editor');
  await sheet.getByLabel('Email').waitFor({ timeout: 10000 });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) throw new Error(`the page scrolls sideways by ${overflow}px`);
  const box = await sheet.boundingBox();
  if (box.x < 0 || box.x + box.width > 390) throw new Error(`the editor is ${box.width}px wide at x=${box.x}`);
  await phone.screenshot({ path: `${OUT}/staff-editor-phone.png`, fullPage: false });
  await phone.context().close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL STAFF CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
