import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goToManage, unlockPay } from './nav.mjs';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`);
    errors.push(`${name}: ${e.message}`);
  }
};

/**
 * Confidential notes on staff (2 November 2026, Dominguez: "somewhere for
 * managers/admin to write confidential notes on employees ... should not be
 * seen by the actual employee", "viewable as a chart as well (not just in
 * each individual staff card)"; all managers and admins, everyone with access
 * sees every note, behind the PIN, the writer edits and it says so).
 *
 * Morgan (manager) writes about Frankie (staff); Ada (admin) writes about
 * Morgan, which Morgan never sees. run-all.sh clears staff_notes.
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

const call = (page, path, init) =>
  page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      const text = await r.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: r.status, body };
    },
    { path, init },
  );

const manager = await signIn('manager@domihealthcare.com');
const admin = await signIn('admin@domihealthcare.com');
const staff = await signIn('frontdesk@domihealthcare.com');

const me = async (page) => (await call(page, '/auth/me')).body;
const frankie = await me(staff);
const morgan = await me(manager);

await step('staff cannot read or write notes, even about somebody else', async () => {
  await unlockPay(staff);
  const read = await call(staff, '/staff-notes');
  if (read.status !== 403) throw new Error(`read gave ${read.status}`);
  const write = await call(staff, '/staff-notes', {
    method: 'POST',
    body: JSON.stringify({ employeeId: morgan.id, body: 'should be refused' }),
  });
  if (write.status !== 403) throw new Error(`write gave ${write.status}`);
});

await step('the notes ask for the PIN first, like pay', async () => {
  const locked = await call(manager, '/staff-notes');
  if (locked.status !== 403 || !JSON.stringify(locked.body).includes('PIN_REQUIRED'))
    throw new Error(`without the PIN: ${locked.status} ${JSON.stringify(locked.body)}`);
  await manager.goto(`${BASE}/staff-notes`, { waitUntil: 'networkidle' });
  await manager.getByText(/PIN/).first().waitFor({ timeout: 10000 });
});

await step('a manager adds a note from Manage, Staff, Notes', async () => {
  await manager.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await goToManage(manager, 'Notes');
  await manager.getByRole('heading', { name: 'Staff notes' }).waitFor({ timeout: 15000 });
  await manager.getByRole('button', { name: '+ Add a note' }).click();
  const form = manager.getByTestId('staff-note-form');
  await form.waitFor();
  await form.getByLabel('About').fill('Frankie');
  await manager.getByRole('option', { name: new RegExp(frankie.lastName) }).first().click();
  await form.getByLabel('Kind (optional)').selectOption('ATTENDANCE');
  await form.getByLabel('Note').fill('Late twice this week; spoke about it on Monday.');
  await form.getByRole('button', { name: 'Save note' }).click();
  await manager.getByRole('status').filter({ hasText: 'Note saved' }).waitFor({ timeout: 10000 });
  const row = manager.getByTestId('staff-note').filter({ hasText: 'Late twice this week' });
  await row.waitFor();
  if (!(await row.textContent()).includes('Attendance')) throw new Error('no kind on the row');
  await manager.screenshot({ path: `${OUT}/staff-notes-table.png`, fullPage: true });
});

await step("the Staff card's Notes opens the table on that person", async () => {
  await goToManage(manager, 'Staff');
  const card = manager.getByTestId('staff-frontdesk@domihealthcare.com');
  await card.getByRole('link', { name: /^Notes on / }).click();
  await manager.waitForURL(/\/staff-notes\?person=/);
  await manager.getByTestId('notes-count').filter({ hasText: /^1 note about / }).waitFor({ timeout: 10000 });
  // Nobody has a Notes button on their own card.
  await goToManage(manager, 'Staff');
  const own = manager.getByTestId('staff-manager@domihealthcare.com');
  await own.waitFor();
  if (await own.getByRole('link', { name: /^Notes on / }).count()) throw new Error('Notes on your own card');
});

await step('an admin writes about the manager; the manager never sees it', async () => {
  await unlockPay(admin);
  const made = await call(admin, '/staff-notes', {
    method: 'POST',
    body: JSON.stringify({ employeeId: morgan.id, kind: 'PRAISE', body: 'Covered both offices well.' }),
  });
  if (made.status >= 400) throw new Error(`admin note: ${JSON.stringify(made.body)}`);
  const mine = await call(manager, '/staff-notes');
  if (mine.body.notes.some((note) => note.person.id === morgan.id))
    throw new Error('the manager read a note about themselves');
  if (mine.body.people.some((p) => p.id === morgan.id)) throw new Error('offered as a subject');
  const byId = await call(manager, `/staff-notes/${made.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: 'changed' }),
  });
  if (byId.status !== 404) throw new Error(`by id: ${byId.status}`);
  const own = await call(manager, '/staff-notes', {
    method: 'POST',
    body: JSON.stringify({ employeeId: morgan.id, body: 'about me' }),
  });
  if (own.status !== 403) throw new Error(`about themselves: ${own.status}`);
});

await step('everyone with access reads every note; only the writer edits, an admin removes', async () => {
  await goToManage(admin, 'Notes');
  const row = admin.getByTestId('staff-note').filter({ hasText: 'Late twice this week' });
  await row.waitFor({ timeout: 15000 });
  if (!(await row.textContent()).includes(morgan.firstName)) throw new Error('writer not shown');
  if (await row.getByRole('button', { name: /^Edit/ }).count()) throw new Error('admin can edit it');
  await row.getByRole('button', { name: /^Remove/ }).waitFor();
});

await step('the writer edits their note, and it says it was edited', async () => {
  await manager.goto(`${BASE}/staff-notes`, { waitUntil: 'networkidle' });
  const row = manager.getByTestId('staff-note').filter({ hasText: 'Late twice this week' });
  await row.getByRole('button', { name: /^Edit/ }).click();
  const form = manager.getByTestId('staff-note-form');
  await form.getByLabel('Note').fill('Late twice this week; spoke about it on Monday. Improved since.');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await manager.getByRole('status').filter({ hasText: 'changed' }).waitFor({ timeout: 10000 });
  const changed = manager.getByTestId('staff-note').filter({ hasText: 'Improved since.' });
  await changed.getByText(/^Edited /).waitFor();
});

await step('narrowing by kind and words', async () => {
  await manager.getByLabel('Kind', { exact: true }).selectOption('PRAISE');
  await manager.getByTestId('notes-count').filter({ hasText: /^0 notes/ }).waitFor();
  await manager.getByLabel('Kind', { exact: true }).selectOption('');
  await manager.getByLabel('Search the notes').fill('improved');
  await manager.getByTestId('notes-count').filter({ hasText: /^1 note/ }).waitFor();
});

await step('on a phone the notes are cards, with no sideways scroll', async () => {
  await manager.setViewportSize({ width: 390, height: 844 });
  await manager.goto(`${BASE}/staff-notes`, { waitUntil: 'networkidle' });
  await manager.getByTestId('staff-note-card').first().waitFor({ timeout: 10000 });
  const wide = await manager.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (wide) throw new Error('scrolls sideways');
  await manager.screenshot({ path: `${OUT}/staff-notes-phone.png`, fullPage: true });
  await manager.setViewportSize({ width: 1280, height: 1000 });
});

await step('the admin removes the note', async () => {
  await admin.reload({ waitUntil: 'networkidle' });
  const row = admin.getByTestId('staff-note').filter({ hasText: 'Improved since.' });
  await row.getByRole('button', { name: /^Remove/ }).click();
  await admin.getByRole('button', { name: 'Yes, remove it' }).click();
  await admin.getByRole('status').filter({ hasText: 'removed' }).waitFor({ timeout: 10000 });
  if (await admin.getByTestId('staff-note').filter({ hasText: 'Improved since.' }).count())
    throw new Error('still listed');
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL STAFF NOTES CHECKS PASSED');
