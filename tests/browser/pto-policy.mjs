import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { openTimeOff } from './nav.mjs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
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
const signIn = async (page, email) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
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
await openTimeOff(adm);

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
  // Admin was hired 2025-01-06 but added to the app this year: nothing is
  // assumed to roll over from a year the app never saw (October 2026).
  const card = balanceCard(adm);
  await card.getByText(/Allowance\s*18/).first().waitFor({ timeout: 10000 });
  const text = (await card.innerText()).replace(/\n/g, ' ');
  if (/Carried over/.test(text)) throw new Error(`a rollover was invented for last year: "${text}"`);
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
await openTimeOff(emp);

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

// --- the switch-over: time taken before Domi Staff (Dominguez, September 2026) ---
const leftIn = async (row, label) => {
  const text = (await row.innerText()).replace(/\n/g, ' ');
  const match = text.match(new RegExp(`${label} (-?[\\d.]+) left`));
  if (!match) throw new Error(`no ${label} balance in "${text}"`);
  return Number(match[1]);
};
const frankieRow = () => adm.getByTestId('balance-frontdesk@domihealthcare.com');
let before;

await step('a manager sees everybody’s balance, closed until asked for', async () => {
  await adm.reload({ waitUntil: 'networkidle' });
  const card = adm.getByTestId('staff-pto-balances');
  if (await card.getByTestId('balance-frontdesk@domihealthcare.com').count() > 0)
    throw new Error('the list was worked out before anybody opened it');
  await card.getByRole('button', { name: 'Open' }).click();
  await frankieRow().waitFor({ timeout: 15000 });
  before = { pto: await leftIn(frankieRow(), 'PTO'), sick: await leftIn(frankieRow(), 'Sick') };
});

await step('a manager puts in time already taken, and a yearly allowance of their own', async () => {
  await frankieRow().getByRole('button', { name: 'Adjust' }).click();
  const form = adm.getByRole('form', { name: /Adjust Frankie/ });
  await form.getByLabel('PTO already taken').fill('4');
  await form.getByLabel('Sick days already taken').fill('1.5');
  await form.getByLabel('Their own PTO a year').fill('20');
  await form.getByRole('button', { name: 'Save' }).click();
  await form.waitFor({ state: 'detached', timeout: 15000 });
  const after = { pto: await leftIn(frankieRow(), 'PTO'), sick: await leftIn(frankieRow(), 'Sick') };
  // Four taken, five more a year: one more left than before.
  if (after.pto !== before.pto + 1) throw new Error(`PTO went from ${before.pto} to ${after.pto}`);
  if (after.sick !== before.sick - 1.5) throw new Error(`sick went from ${before.sick} to ${after.sick}`);
});

await step('it asks for whole or half days', async () => {
  const answer = await adm.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const frankie = staff.find((p) => p.email === 'frontdesk@domihealthcare.com');
    const r = await fetch(`/api/pto/balances/${frankie.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vacationUsed: 0.3 }),
    });
    return { status: r.status, body: await r.text() };
  });
  if (answer.status !== 400 || !answer.body.includes('whole or half days'))
    throw new Error(`answered ${answer.status}: ${answer.body}`);
});

await step('the person sees it on their own balance', async () => {
  await emp.reload({ waitUntil: 'networkidle' });
  const text = (await balanceCard(emp).innerText()).replace(/\n/g, ' ');
  if (!/Taken before Domi Staff\s*4/.test(text) || !/Allowance\s*20/.test(text))
    throw new Error(`the card reads: "${text}"`);
});

await step('staff can neither read the list nor change anybody’s', async () => {
  const statuses = await emp.evaluate(async () => {
    const list = await fetch('/api/pto/balances');
    const change = await fetch('/api/pto/balances/00000000-0000-4000-8000-000000000000', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vacationUsed: 20 }),
    });
    return [list.status, change.status];
  });
  if (statuses.join() !== '403,403') throw new Error(`answered ${statuses}`);
  if (await emp.getByTestId('staff-pto-balances').count() > 0)
    throw new Error('staff were shown the list');
});
await adm.screenshot({ path: `${OUT}/32-pto-staff-balances.png`, fullPage: true });

await step('blank puts it back to the practice’s', async () => {
  await frankieRow().getByRole('button', { name: 'Adjust' }).click();
  const form = adm.getByRole('form', { name: /Adjust Frankie/ });
  for (const label of ['PTO already taken', 'Sick days already taken', 'Their own PTO a year'])
    await form.getByLabel(label).fill('');
  await form.getByRole('button', { name: 'Save' }).click();
  await form.waitFor({ state: 'detached', timeout: 15000 });
  if ((await leftIn(frankieRow(), 'PTO')) !== before.pto) throw new Error('PTO did not go back');
  if ((await leftIn(frankieRow(), 'Sick')) !== before.sick) throw new Error('sick did not go back');
});

await step('somebody can be given no PTO at all', async () => {
  await frankieRow().getByRole('button', { name: 'Adjust' }).click();
  const form = adm.getByRole('form', { name: /Adjust Frankie/ });
  await form.getByLabel('No PTO').check();
  if (await form.getByLabel('PTO rolled over into this year').count() > 0)
    throw new Error('a rollover was asked for somebody with no PTO');
  await form.getByRole('button', { name: 'Save' }).click();
  await form.waitFor({ state: 'detached', timeout: 15000 });
  // Frankie asked for five days above, so it reads as five over rather than
  // "No PTO", which is kept for somebody with nothing asked for either.
  const left = await leftIn(frankieRow(), 'PTO');
  if (left > 0 || left >= before.pto) throw new Error(`still ${left} PTO left`);
});

await step('a rollover can be put in, and the practice’s PTO put back', async () => {
  await frankieRow().getByRole('button', { name: 'Adjust' }).click();
  const form = adm.getByRole('form', { name: /Adjust Frankie/ });
  await form.getByLabel(/The practice’s \d+ days/).check();
  await form.getByLabel('PTO rolled over into this year').fill('3');
  await form.getByRole('button', { name: 'Save' }).click();
  await form.waitFor({ state: 'detached', timeout: 15000 });
  if ((await leftIn(frankieRow(), 'PTO')) !== before.pto + 3) throw new Error('the rollover was not added');
  await frankieRow().getByRole('button', { name: 'Adjust' }).click();
  await form.getByLabel('PTO rolled over into this year').fill('');
  await form.getByRole('button', { name: 'Save' }).click();
  await form.waitFor({ state: 'detached', timeout: 15000 });
  if ((await leftIn(frankieRow(), 'PTO')) !== before.pto) throw new Error('PTO did not go back');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL POLICY CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
