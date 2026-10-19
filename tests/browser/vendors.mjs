import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo, navLink, goToManage } from './nav.mjs';

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
 * Vendor payments (October 2026, Dominguez - in place of the "Payments to
 * vendors" spreadsheet): admins add each vendor and every payment to them,
 * and move it from to pay, to sent, to completed. Managers and staff have
 * none of it.
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

await step('an admin opens Vendor payments from Manage and adds a vendor', async () => {
  await goToManage(admin, 'Vendor payments');
  await admin.getByRole('heading', { name: 'Vendor payments' }).waitFor({ timeout: 10000 });
  await admin.getByRole('button', { name: '+ Vendor' }).click();
  const dialog = admin.getByRole('dialog', { name: 'New vendor' });
  await dialog.getByLabel('Name').fill('MVRS Diagnostics');
  await dialog.getByLabel(/What for/).fill('Monthly readings invoice');
  await dialog.getByRole('button', { name: 'Add vendor' }).click();
  await admin.getByTestId('vendor-MVRS Diagnostics').waitFor({ timeout: 10000 });
});

await step('a check to pay, then sent, then completed', async () => {
  const card = admin.getByTestId('vendor-MVRS Diagnostics');
  await card.getByRole('button', { name: '+ Payment' }).click();
  let dialog = admin.getByRole('dialog', { name: 'Payment to MVRS Diagnostics' });
  await dialog.getByLabel('What for').fill('September 2026');
  await dialog.getByLabel('Amount').fill('4,720.00');
  await dialog.getByLabel(/Invoice #/).fill('570');
  await dialog.getByLabel('Check #').fill('1499');
  await dialog.getByRole('button', { name: 'Add payment' }).click();
  const payment = card.getByTestId('vendor-payment').filter({ hasText: 'September 2026' });
  await payment.getByText('$4,720.00').waitFor({ timeout: 10000 });
  await payment.getByText('To pay', { exact: true }).waitFor();
  await admin.getByTestId('vendor-outstanding').getByText('1 payment not completed yet.').waitFor();

  await payment.getByRole('button', { name: 'Edit' }).click();
  dialog = admin.getByRole('dialog', { name: /Change a payment/ });
  await dialog.getByRole('radio', { name: 'Completed' }).check();
  // Sent and completed both start on today; a completed one needs both.
  await dialog.getByLabel(/Date sent/).fill('2026-10-01');
  await dialog.getByLabel('Received and deposited on').fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await payment.getByText('Completed', { exact: true }).waitFor({ timeout: 10000 });
  await payment.getByText(/Check #1499 · Invoice #570 · sent .*Oct 1.* · completed .*Oct 8/).waitFor();
  await admin.getByTestId('vendor-outstanding').getByText('Every payment is completed.').waitFor();
  await admin.screenshot({ path: `${OUT}/vendor-payments.png`, fullPage: true });
});

await step('a payment is added from the top by typing part of the vendor name', async () => {
  await admin.getByRole('button', { name: '+ Payment' }).first().click();
  const dialog = admin.getByRole('dialog', { name: 'New payment' });
  await dialog.getByLabel('Vendor').fill('Diagn');
  await dialog.getByRole('button', { name: 'MVRS Diagnostics' }).click();
  // Once chosen, the pop-up is named after the vendor.
  const picked = admin.getByRole('dialog', { name: 'Payment to MVRS Diagnostics' });
  await picked.getByLabel('What for').fill('October 2026');
  await picked.getByLabel('Paid by').selectOption('QuickBooks');
  await picked.getByLabel(/Date sent/).fill('2026-10-12');
  await picked.getByRole('button', { name: 'Add payment' }).click();
  await admin.getByTestId('vendor-payment').filter({ hasText: 'October 2026' }).getByText(/QuickBooks · sent .*Oct 12/).waitFor({ timeout: 10000 });
  await admin.getByLabel('Search vendors').fill('zzz');
  await admin.getByText('Nobody matches').waitFor();
  await admin.getByLabel('Search vendors').fill('1499');
  await admin.getByTestId('vendor-MVRS Diagnostics').waitFor();
  await admin.getByLabel('Search vendors').fill('');
});

await step('a completed payment with no day it was done is refused, in words', async () => {
  const vendors = await admin.evaluate(async () => (await fetch('/api/vendors')).json());
  const id = vendors.find((v) => v.name === 'MVRS Diagnostics').id;
  const answer = await admin.evaluate(async (id) => {
    const r = await fetch(`/api/vendors/${id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forWhat: 'October 2026', method: 'CASH', status: 'COMPLETED', sentOn: '2026-10-10' }),
    });
    return { status: r.status, body: await r.json() };
  }, id);
  if (answer.status !== 400 || !/completed/.test(JSON.stringify(answer.body))) throw new Error(JSON.stringify(answer));
});

await step('managers and staff have no vendor payments', async () => {
  for (const email of ['manager@domihealthcare.com', 'frontdesk@domihealthcare.com']) {
    const page = await signIn(email);
    // A manager has the Money section but not this tab; staff have no Manage.
    if (email.startsWith('manager')) {
      await goToManage(page, 'Export');
      const tab = page.getByRole('navigation', { name: 'Money screens' }).getByRole('link', { name: 'Vendor payments' });
      if (await tab.count()) throw new Error(`${email} is offered it`);
    } else if (await (await navLink(page, 'Vendor payments')).isVisible().catch(() => false)) {
      throw new Error(`${email} is offered it`);
    }
    const status = await page.evaluate(async () => (await fetch('/api/vendors')).status);
    if (status !== 403) throw new Error(`${email} read it: ${status}`);
    await page.context().close();
  }
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL VENDOR PAYMENT CHECKS PASSED');
