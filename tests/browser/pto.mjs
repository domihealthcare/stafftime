import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
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

// The request cards only. Scoping matters here: the filter tabs are named
// "Approved"/"Denied", and the on-behalf-of <select> contains every staff name,
// so an unscoped getByText/getByRole happily matches the wrong thing.
const cards = (page) => page.locator('main div.space-y-3');
const formClosed = (page) =>
  page.getByRole('button', { name: '+ Request time off' }).waitFor({ timeout: 15000 });

const signIn = async (page, email) => {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 15000 });
};

// Dates far enough out that no seeded shift collides.
const YEAR = new Date().getFullYear() + 1;
const START = `${YEAR}-03-09`;
const END = `${YEAR}-03-13`;

const empCtx = await browser.newContext({ viewport: { width: 420, height: 950 } });
const emp = await empCtx.newPage();
emp.on('pageerror', (e) => errors.push(`employee pageerror: ${e.message}`));
await signIn(emp, 'frontdesk@domihealthcare.com');

await step('an employee can reach Time off', async () => {
  await emp.getByRole('link', { name: /Time off/ }).click();
  await emp.getByText('Your time off requests').waitFor({ timeout: 10000 });
});

await step('an employee is not offered the "for someone else" picker', async () => {
  await emp.getByRole('button', { name: '+ Request time off' }).click();
  await emp.getByLabel('Type').waitFor({ timeout: 5000 });
  if (await emp.getByLabel('For').count() > 0)
    throw new Error('employee was offered the on-behalf-of picker');
});

await step('an employee submits a request', async () => {
  await emp.getByLabel('Type').selectOption('VACATION');
  await emp.getByLabel('First day').fill(START);
  await emp.getByLabel('Last day').fill(END);
  await emp.getByLabel(/Notes/).fill('Family trip');
  await emp.getByRole('button', { name: 'Send request' }).click();
  await formClosed(emp);
  await cards(emp).getByText('Family trip').waitFor({ timeout: 15000 });
  await cards(emp).getByText('5 days').waitFor({ timeout: 5000 });
});
await emp.screenshot({ path: `${OUT}/26-pto-employee.png`, fullPage: true });

await step('an overlapping request is refused with a readable reason', async () => {
  await emp.getByRole('button', { name: '+ Request time off' }).click();
  await emp.getByLabel('First day').fill(`${YEAR}-03-11`);
  await emp.getByLabel('Last day').fill(`${YEAR}-03-12`);
  await emp.getByRole('button', { name: 'Send request' }).click();
  const alert = emp.getByRole('alert');
  await alert.waitFor({ timeout: 10000 });
  const text = await alert.innerText();
  if (!/overlaps a pending request/.test(text)) throw new Error(`unhelpful: "${text}"`);
  await emp.getByRole('button', { name: 'Cancel' }).first().click();
});

await step('an employee sees no Approve or Deny on their own request', async () => {
  // exact, or "Approve" also matches the "Approved" filter tab.
  for (const name of ['Approve', 'Deny']) {
    if (await emp.getByRole('button', { name, exact: true }).count() > 0)
      throw new Error(`employee was offered ${name}`);
  }
});

// --- the manager ---
const mgrCtx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const mgr = await mgrCtx.newPage();
mgr.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

await step('the Time off tab carries a badge of pending requests', async () => {
  const link = mgr.getByRole('link', { name: /Time off/ });
  const text = await link.innerText();
  if (!/\d/.test(text)) throw new Error(`expected a count in the tab, got "${text}"`);
});

await step('a manager sees the request and who it is from', async () => {
  await mgr.getByRole('link', { name: /Time off/ }).click();
  await cards(mgr).getByText('Family trip').waitFor({ timeout: 10000 });
  await cards(mgr).getByText(/Frankie Front-Desk/).first().waitFor({ timeout: 5000 });
});
await mgr.screenshot({ path: `${OUT}/27-pto-manager.png`, fullPage: true });

await step('denying demands a reason before it can be sent', async () => {
  await mgr.getByRole('button', { name: 'Deny', exact: true }).first().click();
  await mgr.getByText('Reason for denying').waitFor({ timeout: 5000 });
  if (await mgr.getByRole('button', { name: 'Deny request' }).isEnabled())
    throw new Error('deny was enabled with no reason given');
  await mgr.getByRole('button', { name: 'Cancel' }).last().click();
});

await step('approving clears the request out of the pending queue', async () => {
  await mgr.getByRole('button', { name: 'Approve', exact: true }).first().click();
  // The default filter is Pending, so a decided request should leave the list.
  await cards(mgr)
    .getByText('Family trip')
    .waitFor({ state: 'hidden', timeout: 15000 });
});

await step('the approved request is filed under Approved, with who decided it', async () => {
  await mgr.getByRole('button', { name: 'Approved', exact: true }).click();
  const card = cards(mgr).locator('> div').filter({ hasText: 'Family trip' }).first();
  await card.waitFor({ timeout: 15000 });
  const text = await card.innerText();
  if (!/Approved/.test(text)) throw new Error(`card does not read as approved: "${text}"`);
  await mgr.getByRole('button', { name: 'Pending', exact: true }).click();
});

await step('the employee sees the decision', async () => {
  await emp.reload({ waitUntil: 'networkidle' });
  await emp.getByRole('link', { name: /Time off/ }).click();
  await emp.getByRole('button', { name: 'All', exact: true }).click();
  await cards(emp).getByText('Approved').first().waitFor({ timeout: 15000 });
});

await step('a manager files a request on behalf of someone who phoned in', async () => {
  await mgr.getByRole('button', { name: '+ Request time off' }).click();
  await mgr.getByLabel('For').selectOption({ label: 'Max Assistant' });
  await mgr.getByLabel('Type').selectOption('SICK');
  await mgr.getByLabel('First day').fill(`${YEAR}-03-16`);
  await mgr.getByRole('button', { name: 'Send request' }).click();
  await formClosed(mgr);
  await cards(mgr).getByText(/Max Assistant/).first().waitFor({ timeout: 15000 });
});

await step('a single day with no end date counts as one day', async () => {
  await cards(mgr).getByText(/· 1 day/).first().waitFor({ timeout: 10000 });
});

await step('a manager cannot decide their own request', async () => {
  await mgr.getByRole('button', { name: '+ Request time off' }).click();
  await mgr.getByLabel('For').selectOption({ label: 'Myself' });
  await mgr.getByLabel('Type').selectOption('PERSONAL');
  await mgr.getByLabel('First day').fill(`${YEAR}-04-06`);
  await mgr.getByRole('button', { name: 'Send request' }).click();
  await formClosed(mgr);
  await cards(mgr).getByText(/Apr 6/).first().waitFor({ timeout: 15000 });

  // Their own card offers Withdraw, never Approve.
  const ownCard = cards(mgr).locator('> div').filter({ hasText: /Apr 6/ }).first();
  if (await ownCard.getByRole('button', { name: 'Approve', exact: true }).count() > 0)
    throw new Error('a manager was offered Approve on their own request');
  await ownCard.getByRole('button', { name: 'Withdraw' }).waitFor({ timeout: 5000 });
});
await mgr.screenshot({ path: `${OUT}/28-pto-manager-own.png`, fullPage: true });

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL PTO CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
