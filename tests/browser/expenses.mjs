import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goToManage } from './nav.mjs';
import { accountMenuHas, pickFromAccountMenu } from './account-menu.mjs';

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
 * Expense reimbursements (November 2026, Dominguez: everyone asks, the kind is
 * optional, he and Angelica Dominguez approve, the receipt is emailed, never
 * part of payroll, and the person running payroll is asked about each one not
 * paid yet, with "defer" or "it was addressed (i.e. via paper check)").
 *
 * The seed puts Ada (admin) on the approvers list; run-all.sh removes the
 * requests.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const unlocked = page.getByText('Not clocked in');
  const mustChange = page.getByText('Choose a new password');
  await unlocked.or(mustChange).first().waitFor({ timeout: 20000 });
  if (await mustChange.isVisible()) {
    await page.getByLabel('Temporary password').fill('shift-change-2026');
    await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
    await page.getByLabel('Confirm new password').fill('harbour lantern 7');
    await page.getByRole('button', { name: 'Change password' }).click();
    await unlocked.waitFor({ timeout: 15000 });
  }
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

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
const max = await signIn('ma@domihealthcare.com');

await step('anybody asks from the account menu, and the receipt has to be emailed first', async () => {
  if (!(await accountMenuHas(frankie, 'Expense reimbursements')))
    throw new Error('not in the account menu');
  await pickFromAccountMenu(frankie, 'Expense reimbursements');
  await frankie
    .getByRole('heading', { name: 'Expense reimbursements', level: 1 })
    .waitFor({ timeout: 15000 });
  await frankie.getByRole('button', { name: '+ New reimbursement request' }).click();
  const dialog = frankie.getByRole('dialog', { name: 'New reimbursement request' });
  await dialog.getByLabel('Description').fill('Printer ink for the front desk');
  await dialog.getByLabel('Amount ($)').fill('42.10');
  // Says who the receipt goes to, and offers an email to them.
  await dialog.getByText('admin@domihealthcare.com', { exact: false }).waitFor();
  const href = await dialog.getByTestId('email-receipt').getAttribute('href');
  if (!href?.startsWith('mailto:admin@domihealthcare.com?subject=Receipt'))
    throw new Error(`mailto: ${href}`);
  // Nothing is uploaded: there is no file input.
  if ((await frankie.locator('input[type=file]').count()) > 0) throw new Error('a file input');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await dialog.getByText('Email the receipt to the approvers, then confirm it below.').waitFor();
  await dialog.getByLabel('I have emailed the receipt to the approvers.').check();
  await dialog.getByRole('button', { name: 'Send' }).click();
  await frankie.getByText('Request submitted. The approvers have been notified.').waitFor({ timeout: 10000 });
  await frankie.getByTestId('my-expense').getByText('Waiting for a decision').waitFor();
  await frankie.screenshot({ path: `${OUT}/expenses-asked.png` });
});

await step('the server refuses one without the receipt, and the list is the approvers only', async () => {
  const noReceipt = await call(frankie, '/expenses', {
    method: 'POST',
    body: JSON.stringify({
      description: 'Gloves',
      spentOn: today,
      amountCents: 1500,
      receiptEmailed: false,
    }),
  });
  if (noReceipt.status !== 400) throw new Error(`without receipt: ${noReceipt.status}`);
  for (const [who, page] of [
    ['staff', frankie],
    ['a manager not on the list', manager],
  ]) {
    const all = await call(page, '/expenses');
    if (all.status !== 403) throw new Error(`${who} read everybody's: ${all.status}`);
  }
  const payouts = await call(frankie, '/payouts');
  if (payouts.status !== 403) throw new Error(`staff read the payroll prompt: ${payouts.status}`);
});

await step('an approver approves once the receipt arrived, at another amount', async () => {
  await goToManage(admin, 'Expenses');
  const card = admin.getByTestId('expense-to-decide').filter({ hasText: 'Printer ink' });
  await card.waitFor({ timeout: 15000 });
  await card.getByRole('button', { name: 'Approve…' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Approve reimbursement request' });
  await dialog.getByLabel('Amount approved ($)').fill('40');
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await dialog.getByText('Confirm that the receipt was received.').waitFor();
  await dialog.getByLabel('The receipt was received by email.').check();
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await admin.getByText('Approved. Frankie Front-Desk has been notified').waitFor({ timeout: 10000 });
  // Now on the payroll prompt, here too.
  await admin
    .getByTestId('unpaid-reimbursements')
    .getByText('Printer ink for the front desk')
    .waitFor({ timeout: 10000 });
});

await step('a request is declined with a reason, and one still waiting is withdrawn', async () => {
  const asked = await call(max, '/expenses', {
    method: 'POST',
    body: JSON.stringify({
      description: 'Lunch with a friend',
      kind: 'MEALS',
      spentOn: today,
      amountCents: 2500,
      receiptEmailed: true,
    }),
  });
  if (asked.status !== 201) throw new Error(JSON.stringify(asked));
  const declined = await call(admin, `/expenses/${asked.body.id}/decline`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Not a practice expense' }),
  });
  if (declined.status !== 201) throw new Error(JSON.stringify(declined));
  const mine = await call(max, '/expenses/mine');
  const theirs = mine.body.requests.find((request) => request.id === asked.body.id);
  if (theirs?.status !== 'DECLINED' || theirs.decisionNote !== 'Not a practice expense')
    throw new Error(JSON.stringify(theirs));

  const second = await call(max, '/expenses', {
    method: 'POST',
    body: JSON.stringify({
      description: 'Pens',
      spentOn: today,
      amountCents: 600,
      receiptEmailed: true,
    }),
  });
  await max.goto(`${BASE}/expenses`, { waitUntil: 'networkidle' });
  const card = max.getByTestId('my-expense').filter({ hasText: 'Pens' });
  await card.getByRole('button', { name: 'Withdraw' }).click();
  await max.getByRole('button', { name: 'Yes, withdraw' }).click();
  await card.getByText('Withdrawn', { exact: true }).waitFor({ timeout: 10000 });
  const own = await call(max, `/expenses/${second.body.id}/withdraw`, { method: 'POST' });
  if (own.status !== 400) throw new Error(`withdrawn twice: ${own.status}`);
});

await step('before you export names it, as never in the file', async () => {
  const check = await call(manager, '/pay-lock/unlock', {
    method: 'POST',
    body: JSON.stringify({ password: 'shift-change-2026' }),
  });
  if (check.status >= 300) throw new Error(`unlock: ${check.status}`);
  const warned = await call(manager, '/exports/timesheet/check', {
    method: 'POST',
    body: JSON.stringify({ from: '2025-04-01T00:00:00Z', to: '2025-05-01T00:00:00Z' }),
  });
  const section = warned.body.sections?.find((s) => s.key === 'reimbursements');
  if (!section?.lines.some((line) => line.includes('Printer ink for the front desk, $40.00')))
    throw new Error(JSON.stringify(warned.body));
});

await step('whoever runs payroll puts it off, brings it back, then records a paper check', async () => {
  await goToManage(manager, 'Export');
  const prompt = manager.getByTestId('unpaid-reimbursements');
  const line = prompt.getByTestId('payout').filter({ hasText: 'Printer ink' });
  await line.waitFor({ timeout: 15000 });
  await prompt.getByText('1 reimbursement pending payment, $40.00').waitFor();
  await manager.screenshot({ path: `${OUT}/expenses-export-prompt.png` });

  await line.getByRole('button', { name: 'Defer to next payroll' }).click();
  await prompt.getByText(/reimbursement is deferred until/).waitFor({ timeout: 10000 });
  // Put off, it is no longer named before exporting.
  const later = await call(manager, '/exports/timesheet/check', {
    method: 'POST',
    body: JSON.stringify({ from: '2025-04-01T00:00:00Z', to: '2025-05-01T00:00:00Z' }),
  });
  if (later.body.sections?.some((s) => s.key === 'reimbursements'))
    throw new Error('still named once put off');

  await prompt.getByRole('button', { name: 'Show 1 deferred' }).click();
  await prompt
    .getByTestId('payout-deferred')
    .getByRole('button', { name: 'Undo deferral' })
    .click();
  await prompt.getByText('reimbursement is back on the list').waitFor({ timeout: 10000 });

  await prompt
    .getByTestId('payout')
    .filter({ hasText: 'Printer ink' })
    .getByRole('button', { name: 'Mark as paid…' })
    .click();
  const dialog = manager.getByRole('dialog', { name: 'Record payment' });
  await dialog.getByLabel('Payment method').selectOption('PAPER_CHECK');
  await dialog.getByLabel('Note (optional)').fill('Check #1042');
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await prompt.waitFor({ state: 'detached', timeout: 10000 });

  const mine = await call(frankie, '/expenses/mine');
  const paid = mine.body.requests.find((request) => request.description.startsWith('Printer'));
  if (paid?.paidHow !== 'PAPER_CHECK' || paid.paidCents !== 4000 || paid.paidNote !== 'Check #1042')
    throw new Error(JSON.stringify(paid));
});

await step('the employee sees it reimbursed, and was notified on the bell', async () => {
  await frankie.goto(`${BASE}/expenses`, { waitUntil: 'networkidle' });
  await frankie
    .getByTestId('my-expense')
    .getByText(/Reimbursed \$40\.00 on .* by paper check \(Check #1042\)/)
    .waitFor({ timeout: 10000 });
  const bell = await call(frankie, '/notifications');
  const titles = (bell.body.items ?? []).map((item) => item.title);
  for (const title of ['Your reimbursement request was approved', 'Your expense reimbursement has been paid'])
    if (!titles.includes(title)) throw new Error(`no "${title}": ${titles.join(', ')}`);
});

await step('the approvers list is kept by the people on it, never emptied', async () => {
  const notOn = await call(manager, '/expenses/approvers');
  if (notOn.status !== 403) throw new Error(`a manager not on it read the list: ${notOn.status}`);
  const list = await call(admin, '/expenses/approvers');
  const ada = list.body.holders.find((person) => person.firstName === 'Ada');
  if (!ada) throw new Error(JSON.stringify(list.body));
  const self = await call(admin, `/expenses/approvers/${ada.id}`, { method: 'DELETE' });
  if (self.status !== 400) throw new Error(`took themselves off: ${self.status}`);
});

await browser.close();
console.log(
  `\n${errors.length === 0 ? 'ALL EXPENSES CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`,
);
for (const e of errors) console.log(` - ${e}`);
process.exit(errors.length === 0 ? 0 : 1);
