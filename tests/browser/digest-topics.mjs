// Choosing which parts of the nightly round-up each manager gets (October
// 2026, Dominguez: "certain managers should be notified of certain things but
// not everyone needs to see all notifications each time").
//
// Who is sent what is unit tested in digest.spec.ts and email.spec.ts. What is
// tested here is the screen: that a manager's own choice sticks, that an admin
// can set somebody else's from "Who gets what", that a part nobody has is
// called out, and that only an admin can change anybody else's.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pickFromAccountMenu } from './account-menu.mjs';

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
const manager = await signIn('manager@domihealthcare.com');
const employee = await signIn('frontdesk@domihealthcare.com');

const people = await admin.evaluate(() => fetch('/api/digest-settings').then((r) => r.json()));
const named = (email) => {
  const prefix = email.split('@')[0];
  // The table lists names, not emails; the seed's are unique by role.
  return people.people.find((p) => p.role === (prefix === 'admin' ? 'ADMIN' : 'MANAGER'));
};
const adminRow = named('admin@domihealthcare.com');
const managerRow = named('manager@domihealthcare.com');
const nameOf = (row) => `${row.firstName} ${row.lastName}`;

await step('a manager leaves out a part of their own round-up, and it sticks', async () => {
  await pickFromAccountMenu(admin, 'Email settings');
  const licenses = admin.getByRole('checkbox', { name: /^Licenses/ });
  await licenses.waitFor({ timeout: 15000 });
  if (!(await licenses.isChecked())) throw new Error('Licenses was not on to begin with');

  await licenses.uncheck();
  await admin.waitForTimeout(1000);
  await admin.reload({ waitUntil: 'networkidle' });
  const after = admin.getByRole('checkbox', { name: /^Licenses/ });
  await after.waitFor({ timeout: 15000 });
  if (await after.isChecked()) throw new Error('the choice did not survive a reload');
});

await step('"Who gets what" shows it against their name', async () => {
  const cell = admin.getByRole('checkbox', { name: `${nameOf(adminRow)}: Licenses` });
  await cell.waitFor({ timeout: 15000 });
  if (await cell.isChecked()) throw new Error('the table still shows them getting licenses');
});

await step('an admin sets somebody else’s, and a part nobody has is called out', async () => {
  const table = admin.getByTestId('who-gets-what');
  if (/Nobody has chosen/.test(await table.innerText()))
    throw new Error('warned while somebody still had licenses');

  await admin.getByRole('checkbox', { name: `${nameOf(managerRow)}: Licenses` }).uncheck();
  await table.getByText(/Nobody has chosen licenses/).waitFor({ timeout: 15000 });
  if (!/goes to everybody who gets the round-up/.test(await table.innerText()))
    throw new Error('the warning did not say where it goes instead');
});
await admin.screenshot({ path: `${OUT}/digest-topics-admin.png`, fullPage: true });

await step('the manager sees what the admin chose, and cannot change anybody else’s', async () => {
  await pickFromAccountMenu(manager, 'Email settings');
  const own = manager.getByRole('checkbox', { name: /^Licenses/ });
  await own.waitFor({ timeout: 15000 });
  // Signed in before the admin's change: the page reads it again on opening.
  for (let i = 0; i < 20 && (await own.isChecked()); i++) await manager.waitForTimeout(500);
  if (await own.isChecked()) throw new Error('the admin’s change did not reach their own settings');

  const table = manager.getByTestId('who-gets-what');
  await table.waitFor({ timeout: 15000 });
  if ((await table.getByRole('checkbox').count()) > 0)
    throw new Error('a manager was offered tick boxes for other people');

  const status = await manager.evaluate(async (id) => {
    const response = await fetch(`/api/digest-settings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutedDigestTopics: ['SCHEDULE'] }),
    });
    return response.status;
  }, adminRow.id);
  if (status !== 403) throw new Error(`a manager changing an admin’s got ${status}, not 403`);
});

await step('an employee cannot read who gets what', async () => {
  const response = await employee.request.get(`${BASE}/api/digest-settings`);
  if (response.status() !== 403) throw new Error(`employee got ${response.status()}, not 403`);
});

await step('an admin cannot put an employee on the round-up', async () => {
  const me = await employee.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
  const status = await admin.evaluate(async (id) => {
    const response = await fetch(`/api/digest-settings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wantsDailyDigest: true }),
    });
    return response.status;
  }, me.id);
  if (status !== 404) throw new Error(`got ${status}, not 404`);
});

await step('a part that is not one is refused', async () => {
  const status = await admin.evaluate(async () => {
    const response = await fetch('/api/auth/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutedDigestTopics: ['EVERYTHING'] }),
    });
    return response.status;
  });
  if (status !== 400) throw new Error(`got ${status}, not 400`);
});

await step('on a phone the table scrolls inside its card, not the page', async () => {
  const phone = await signIn('admin@domihealthcare.com', { width: 390, height: 844 });
  await phone.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
  await phone.getByTestId('who-gets-what').waitFor({ timeout: 15000 });
  const wide = await phone.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (wide) throw new Error('the page scrolls sideways on a phone');
  await phone.screenshot({ path: `${OUT}/digest-topics-phone.png`, fullPage: true });
});

await step('ticking everything back', async () => {
  for (const row of [adminRow, managerRow]) {
    await admin.getByRole('checkbox', { name: `${nameOf(row)}: Licenses` }).check();
    await admin.waitForTimeout(500);
  }
  const table = admin.getByTestId('who-gets-what');
  await admin.waitForTimeout(1000);
  if (/Nobody has chosen/.test(await table.innerText()))
    throw new Error('the warning stayed after somebody took licenses back');
});

await browser.close();
if (errors.length) {
  console.log(`\n${errors.length} problem(s):\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('\nAll digest-topic checks passed.');
