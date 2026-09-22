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
const signIn = async (page, email) => {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 15000 });
};
const YEAR = new Date().getFullYear();
/// The balance card. `filter({hasText})` on a bare div resolves to the
/// innermost match, which is only the heading's wrapper.
const balanceCard = (page) => page.locator('main > div').filter({ hasText: 'Your balance' }).first();

// --- admin sets the policy ---
const admCtx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const adm = await admCtx.newPage();
adm.on('pageerror', (e) => errors.push(`admin pageerror: ${e.message}`));
await signIn(adm, 'admin@domihealthcare.com');
await adm.getByRole('link', { name: /Time off/ }).click();

await step('the policy defaults to 15 PTO, 5 sick, 5 carried over', async () => {
  await adm.getByText(/15 days PTO · 5 sick days · 5 days carried over/).waitFor({ timeout: 15000 });
});

await step('a balance is shown, built from that policy', async () => {
  await adm.getByText('Your balance').waitFor({ timeout: 10000 });
  await adm.getByText(/of \d+ days left/).first().waitFor({ timeout: 5000 });
});
await adm.screenshot({ path: `${OUT}/30-pto-policy.png`, fullPage: true });

await step('an admin can change the rules', async () => {
  await adm.getByRole('button', { name: 'Change' }).click();
  await adm.getByLabel('PTO days a year').fill('18');
  await adm.getByLabel('Sick days a year').fill('6');
  await adm.getByLabel('PTO days carried over').fill('3');
  await adm.getByRole('button', { name: 'Save policy' }).click();
  await adm.getByText(/Policy saved/).waitFor({ timeout: 15000 });
  await adm.getByText(/18 days PTO · 6 sick days · 3 days carried over/).waitFor({ timeout: 10000 });
});

await step('the balance recalculates from the new policy', async () => {
  // Admin was hired 2025-01-06, so last year carries in, now capped at 3.
  const card = balanceCard(adm);
  await card.getByText('Carried over').first().waitFor({ timeout: 10000 });
  const text = await card.innerText();
  if (!/Carried over\s*3/.test(text.replace(/\n/g, ' ')))
    throw new Error(`expected 3 carried over after the change: "${text}"`);
});

// Put it back so the rest of the suites see the documented defaults.
await step('the rules can be set back', async () => {
  await adm.getByLabel('PTO days a year').fill('15');
  await adm.getByLabel('Sick days a year').fill('5');
  await adm.getByLabel('PTO days carried over').fill('5');
  await adm.getByRole('button', { name: 'Save policy' }).click();
  await adm.getByText(/15 days PTO · 5 sick days · 5 days carried over/).waitFor({ timeout: 15000 });
});

// --- an employee sees the rules but cannot change them ---
const empCtx = await browser.newContext({ viewport: { width: 420, height: 1000 } });
const emp = await empCtx.newPage();
emp.on('pageerror', (e) => errors.push(`employee pageerror: ${e.message}`));
await signIn(emp, 'frontdesk@domihealthcare.com');
await emp.getByRole('link', { name: /Time off/ }).click();

await step('an employee can read the policy', async () => {
  await emp.getByText(/15 days PTO · 5 sick days/).waitFor({ timeout: 15000 });
});

await step('an employee cannot change it', async () => {
  if (await emp.getByRole('button', { name: 'Change' }).count() > 0)
    throw new Error('employee was offered the policy editor');
});

await step('the request form says how many days are left afterwards', async () => {
  await emp.getByRole('button', { name: '+ Request time off' }).click();
  await emp.getByLabel('Type').selectOption('VACATION');
  await emp.getByLabel('First day').fill(`${YEAR}-06-01`);
  await emp.getByLabel('Last day').fill(`${YEAR}-06-05`);
  await emp.getByText(/5 days · .* left afterwards/).waitFor({ timeout: 10000 });
});
await emp.screenshot({ path: `${OUT}/31-pto-balance.png`, fullPage: true });

await step('asking for more than the allowance warns but still allows it', async () => {
  await emp.getByLabel('First day').fill(`${YEAR}-06-01`);
  await emp.getByLabel('Last day').fill(`${YEAR}-07-20`);
  await emp.getByText(/over your PTO allowance/).waitFor({ timeout: 10000 });
  if (!(await emp.getByRole('button', { name: 'Send request' }).isEnabled()))
    throw new Error('over-allowance request was blocked rather than warned');
});

await step('a taken request shows up against the balance', async () => {
  await emp.getByLabel('First day').fill(`${YEAR}-06-01`);
  await emp.getByLabel('Last day').fill(`${YEAR}-06-05`);
  await emp.getByRole('button', { name: 'Send request' }).click();
  const card = balanceCard(emp);
  await card.getByText('Awaiting approval').waitFor({ timeout: 15000 });
  const text = (await card.innerText()).replace(/\n/g, ' ');
  if (!/Awaiting approval\s*5/.test(text))
    throw new Error(`pending days not reflected in the balance: "${text}"`);
});

await step('sick days draw on their own allowance, not PTO', async () => {
  await emp.getByRole('button', { name: '+ Request time off' }).click();
  await emp.getByLabel('Type').selectOption('SICK');
  await emp.getByLabel('First day').fill(`${YEAR}-08-03`);
  await emp.getByText(/1 day · 4 left afterwards/).waitFor({ timeout: 10000 });
});

await step('a request in a different policy year says so instead of misreporting', async () => {
  // The form is still open from the previous step.
  await emp.getByLabel('Type').selectOption('VACATION');
  await emp.getByLabel('First day').fill(`${YEAR + 1}-06-01`);
  await emp.getByLabel('Last day').fill(`${YEAR + 1}-06-05`);
  await emp.getByText(/falls outside the \d+ policy year/).waitFor({ timeout: 10000 });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL POLICY CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
