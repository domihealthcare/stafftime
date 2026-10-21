import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo, goToManage, navLink, openMenu } from './nav.mjs';

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
 * Manage in five headings (October 2026, Dominguez: "lets cut down the manage
 * options - job roles can be with staff, locations and kiosks together, etc."):
 * Dashboard, People (Staff, Job roles, Licenses, Onboarding & Offboarding,
 * Provider productivity), Offices (Locations, Kiosks, Closing checklists,
 * Reps), Surveys & reading, and Money (Export, Reimbursements, Vendor
 * payments). Each heading opens a screen with a strip of tabs to the rest.
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

const menuLinks = async (page) => {
  await openMenu(page, 'Manage');
  const names = (await page.getByRole('navigation').getByRole('link').allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  return names;
};
const tabs = async (page, section) =>
  (await page.getByRole('navigation', { name: `${section} screens` }).getByRole('link').allInnerTexts()).map((t) => t.trim());

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');

await step('Manage is five entries, not fifteen', async () => {
  const links = await menuLinks(admin);
  for (const name of ['Dashboard', 'People', 'Offices', 'Surveys & reading', 'Money'])
    if (!links.includes(name)) throw new Error(`Manage lacks ${name}: ${links.join(', ')}`);
  for (const old of ['Staff', 'Job roles', 'Kiosks', 'Locations', 'Reps', 'Export', 'Vendor payments', 'Reimbursements', 'Licenses'])
    if (links.includes(old)) throw new Error(`${old} is still a menu entry of its own`);
});

await step('Staff and Job roles share People, with Licenses and Onboarding', async () => {
  await goToManage(admin, 'Job roles');
  await admin.getByRole('heading', { name: 'Job roles', level: 1 }).waitFor({ timeout: 10000 });
  const people = await tabs(admin, 'People');
  if (people.join('|') !== 'Staff|Job roles|Licenses|CME|Onboarding & Offboarding|Provider productivity')
    throw new Error(people.join('|'));
  await admin.getByRole('navigation', { name: 'People screens' }).getByRole('link', { name: 'Staff' }).click();
  await admin.getByRole('heading', { name: 'Staff', level: 1 }).waitFor({ timeout: 10000 });
  await admin.screenshot({ path: `${OUT}/manage-people.png` });
});

await step('Locations and Kiosks share Offices, with Closing checklists and Reps', async () => {
  await goToManage(admin, 'Kiosks');
  await admin.getByRole('heading', { name: /Kiosks|Time clock/ }).first().waitFor({ timeout: 10000 });
  const offices = await tabs(admin, 'Offices');
  if (offices.join('|') !== 'Locations|Kiosks|Closing checklists|Reps') throw new Error(offices.join('|'));
});

await step('Surveys and Required reading share a heading; Export, Reimbursements, Invoices and Vendor payments are Money', async () => {
  await goToManage(admin, 'Required reading');
  if ((await tabs(admin, 'Surveys & reading')).join('|') !== 'Surveys|Required reading') throw new Error('surveys');
  await goToManage(admin, 'Vendor payments');
  if ((await tabs(admin, 'Money')).join('|') !== 'Export|Reimbursements|Invoices|Vendor payments') throw new Error('money');
});

await step('the heading stays lit on every one of its screens', async () => {
  await goToManage(admin, 'Licenses');
  await openMenu(admin, 'Manage');
  const lit = await admin.getByRole('navigation').getByRole('link', { name: 'People', exact: true }).evaluate((a) => a.className);
  if (!/brand-50/.test(lit)) throw new Error('People is not lit on Licenses');
  await admin.keyboard.press('Escape');
  const header = await admin.getByRole('button', { name: 'Manage', exact: true }).evaluate((b) => b.className);
  if (!/brand-50/.test(header)) throw new Error('Manage is not lit');
});

await step('a manager sees the same headings with only the tabs they may open', async () => {
  const links = await menuLinks(manager);
  for (const name of ['Dashboard', 'People', 'Offices', 'Surveys & reading', 'Money'])
    if (!links.includes(name)) throw new Error(`manager lacks ${name}: ${links.join(', ')}`);
  await goToManage(manager, 'Job roles');
  if ((await tabs(manager, 'People')).join('|') !== 'Job roles|Licenses|CME|Onboarding & Offboarding')
    throw new Error(`people: ${(await tabs(manager, 'People')).join('|')}`);
  await goToManage(manager, 'Closing checklists');
  if ((await tabs(manager, 'Offices')).join('|') !== 'Closing checklists|Reps') throw new Error('offices');
  await goToManage(manager, 'Export');
  if ((await tabs(manager, 'Money')).join('|') !== 'Export|Reimbursements|Invoices') throw new Error('money');
  // What they may not open is refused as before.
  const status = await manager.evaluate(async () => (await fetch('/api/vendors')).status);
  if (status !== 403) throw new Error(`a manager read vendor payments: ${status}`);
});

await step('a heading with one screen has no strip, and staff see no Manage at all', async () => {
  await goToManage(manager, 'Dashboard');
  await manager.getByRole('heading', { name: /Dashboard/ }).first().waitFor({ timeout: 10000 });
  if (await manager.getByRole('navigation', { name: /screens$/ }).count()) throw new Error('a tab strip on the Dashboard');
  const staff = await signIn('frontdesk@domihealthcare.com');
  if (await staff.getByRole('button', { name: 'Manage', exact: true }).count()) throw new Error('staff are offered Manage');
  // Staff still answer surveys, without a strip of tabs they cannot use.
  await staff.goto(`${BASE}/surveys`, { waitUntil: 'networkidle' });
  await staff.getByRole('heading', { name: 'Surveys', level: 1 }).waitFor({ timeout: 10000 });
  if (await staff.getByRole('navigation', { name: /screens$/ }).count()) throw new Error('staff see a tab strip');
  await staff.context().close();
});

await step('the old addresses still open', async () => {
  for (const path of ['/staff', '/job-roles', '/locations', '/kiosks', '/reps', '/export', '/reimbursements', '/vendors', '/required', '/closing', '/credentials', '/checklists']) {
    await admin.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await admin.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 10000 });
    if (!(await admin.getByRole('navigation').filter({ hasText: /Staff|Locations|Surveys|Export|Dashboard/ }).count())) throw new Error(`${path} lost the nav`);
  }
});

await step('on a phone it is five entries under More → Manage, and the tabs fit', async () => {
  const phone = await signIn('admin@domihealthcare.com', { width: 390, height: 844 });
  await openMenu(phone, 'Manage');
  const links = (await phone.getByRole('navigation').getByRole('link').allInnerTexts()).map((t) => t.trim());
  for (const name of ['People', 'Offices', 'Money']) if (!links.includes(name)) throw new Error(`phone lacks ${name}`);
  await phone.keyboard.press('Escape');
  await goToManage(phone, 'Reps');
  const strip = phone.getByRole('navigation', { name: 'Offices screens' });
  await strip.waitFor({ timeout: 10000 });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (wide) throw new Error('the page scrolls sideways');
  await phone.context().close();
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL MANAGE SECTION CHECKS PASSED');
