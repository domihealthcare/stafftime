import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { openAccountMenu } from './account-menu.mjs';

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
 * View as (October 2026, Dominguez: "me (as the super admin) should have a way
 * to see the views that other staff have ... view as another role, i can
 * click one (or multiple) roles"): an admin picks an access level and job
 * roles, and this tab shows and is answered as such a person; a banner takes
 * them back. Only downwards, only for an admin.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}
const status = (page, path, headers = {}) =>
  page.evaluate(async ({ path, headers }) => (await fetch(`/api${path}`, { headers })).status, { path, headers });
/// The headers the app itself sends while viewing as somebody (`lib/view-as.ts`).
const appHeaders = (page) =>
  page.evaluate(() => {
    const value = JSON.parse(sessionStorage.getItem('domi-staff.view-as') ?? 'null');
    if (!value) return {};
    return { 'x-view-as': value.role, ...(value.jobRoleIds.length ? { 'x-view-as-job-roles': value.jobRoleIds.join(',') } : {}) };
  });
const me = (page, headers = {}) =>
  page.evaluate(async (headers) => fetch('/api/auth/me', { headers }).then((r) => r.json()), headers);

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');

await step('an admin picks Employee and Front Desk under View as…', async () => {
  await openAccountMenu(admin);
  await admin.getByRole('menuitem', { name: 'View as…' }).click();
  const dialog = admin.getByTestId('view-as-dialog');
  await dialog.waitFor({ timeout: 10000 });
  await dialog.getByLabel(/Employee/).check();
  await dialog.getByLabel('Front Desk').check();
  await dialog.getByRole('button', { name: 'View as this' }).click();
  // The role's name follows the banner by a moment.
  await admin.getByTestId('view-as-banner').filter({ hasText: /Viewing as an employee in Front Desk/ }).waitFor({ timeout: 10000 });
  await admin.screenshot({ path: `${OUT}/view-as-employee.png` });
});

await step('the app now shows and answers as that person: no Manage, staff list refused, Front Desk resources', async () => {
  if (await admin.getByRole('button', { name: 'Manage', exact: true }).count()) throw new Error('Manage is still offered');
  const headers = await appHeaders(admin);
  if (headers['x-view-as'] !== 'EMPLOYEE') throw new Error(`the app is not sending the view: ${JSON.stringify(headers)}`);
  if ((await status(admin, '/employees', headers)) !== 403) throw new Error('the staff list still opens');
  const profile = await me(admin, headers);
  if (profile.role !== 'EMPLOYEE' || profile.viewingAs?.actualRole !== 'ADMIN') throw new Error(JSON.stringify(profile.viewingAs));
  await admin.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  await admin.getByTestId('section-Front Desk').waitFor({ timeout: 10000 });
  if (await admin.getByTestId('section-Medical Assistant').count()) throw new Error('a section of a job role not chosen');
  // The way back is still there, and View as… is not offered twice.
  await openAccountMenu(admin);
  if (await admin.getByRole('menuitem', { name: 'View as…' }).count()) throw new Error('View as… offered while viewing');
  await admin.keyboard.press('Escape');
});

await step('Back to yourself restores the admin', async () => {
  await admin.getByTestId('view-as-banner').getByRole('button', { name: 'Back to yourself' }).click();
  await admin.getByTestId('view-as-banner').waitFor({ state: 'detached', timeout: 10000 });
  await admin.getByRole('button', { name: 'Manage', exact: true }).waitFor({ timeout: 10000 });
  if (Object.keys(await appHeaders(admin)).length) throw new Error('the view is still being sent');
  if ((await status(admin, '/employees')) !== 200) throw new Error('the staff list is still refused');
});

await step('viewing as a manager opens the manager screens but not invoices, which go by the admin\'s own place on the invoices list', async () => {
  if ((await status(admin, '/employees', { 'x-view-as': 'MANAGER' })) !== 200) throw new Error('a manager view cannot read staff');
  if ((await status(admin, '/invoices', { 'x-view-as': 'MANAGER' })) !== 403) throw new Error('an admin viewing as a manager opened invoices');
  if ((await status(admin, '/vendors', { 'x-view-as': 'MANAGER' })) !== 403) throw new Error('a manager view still has the admin screens');
});

await step('only an admin is heard, and only downwards', async () => {
  const asEmployee = await me(manager, { 'x-view-as': 'EMPLOYEE' });
  if (asEmployee.role !== 'MANAGER' || asEmployee.viewingAs) throw new Error('a manager could view as somebody');
  const asAdmin = await me(manager, { 'x-view-as': 'ADMIN' });
  if (asAdmin.role !== 'MANAGER') throw new Error('a manager was raised to admin');
  if ((await status(manager, '/vendors', { 'x-view-as': 'ADMIN' })) !== 403) throw new Error('a manager reached an admin screen');
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL VIEW-AS CHECKS PASSED');
