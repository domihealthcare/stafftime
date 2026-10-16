import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo, navLink } from './nav.mjs';

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
 * The reimbursements board (October 2026, Dominguez — the "Reimbursements -
 * Domi TCHG" sheet: "a big board, but also searchable"), loaded with the
 * sheet. Managers and admins only. run-all.sh puts the sheet's data back.
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

const manager = await signIn('manager@domihealthcare.com');
const board = manager.getByTestId('reimbursements-table');
const row = (code) => board.getByRole('row').filter({ has: manager.getByRole('rowheader', { name: new RegExp(`^${code.replace(/[()]/g, "\\$&")}(?=\\s|$)`) }) });

await step('a manager opens Reimbursements from Manage, loaded with the sheet', async () => {
  await goTo(manager, 'Reimbursements');
  await manager.getByRole('heading', { name: 'Reimbursements' }).waitFor({ timeout: 10000 });
  await board.getByRole('columnheader', { name: /^Medicare \('25\)/ }).waitFor({ timeout: 10000 });
  await board.getByRole('columnheader', { name: /^BCBS NJ.*Including Omnia & Anthem/ }).waitFor();
  await manager.getByText('170 codes · 36 insurances', { exact: false }).waitFor();
  // 99202 for Medicare, as on the sheet; 70.488 shows to the cent.
  await row('99202').getByRole('cell', { name: '$78.32' }).first().waitFor();
  await row('99202').getByRole('cell', { name: '$70.49' }).first().waitFor();
  // Two amounts in one cell stay as the sheet wrote them.
  await row('99213').getByRole('cell', { name: '117.13 / 76.13' }).waitFor();
  await manager.screenshot({ path: `${OUT}/reimbursements.png` });
});

await step('searching by code or description narrows the rows', async () => {
  await manager.getByLabel('Find a code or description').fill('echo');
  await row('93306').waitFor();
  if (await row('99213').count()) throw new Error('99213 still shown');
  await manager.getByLabel('Find a code or description').fill('9921');
  await row('99214 (95)').waitFor();
  if (await row('93306').count()) throw new Error('93306 still shown');
});

await step('one code found shows every insurance’s amount, highest first', async () => {
  await manager.getByLabel('Find a code or description').fill('G0439');
  const card = manager.getByTestId('reimbursement-code-card');
  await card.getByRole('heading', { name: 'G0439' }).waitFor({ timeout: 10000 });
  await card.getByText('AWV Sub').waitFor();
  const amounts = (await card.locator('li .tabular-nums').allInnerTexts()).filter((x) => x.startsWith('$') && !x.includes('/'));
  const values = amounts.map((x) => Number(x.replace(/[$,]/g, '')));
  if (values.length < 5) throw new Error(`only ${values.length} amounts`);
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > values[i - 1]) throw new Error(`not highest first: ${amounts.join(', ')}`);
  }
  await manager.screenshot({ path: `${OUT}/reimbursements-code.png`, fullPage: true });
});

await step('narrowing the insurances keeps the codes and drops the other columns', async () => {
  await manager.getByLabel('Find a code or description').fill('');
  await manager.getByLabel('Only insurances with').fill('aetna');
  await board.getByRole('columnheader', { name: /^Aetna - COMM/ }).waitFor();
  if (await board.getByRole('columnheader', { name: /^Medicare/ }).count()) throw new Error('Medicare still shown');
  await manager.getByLabel('Only insurances with').fill('');
});

await step('a manager changes an amount, then clears it', async () => {
  await manager.getByRole('button', { name: 'Edit the board' }).click();
  await row('99211').getByRole('button', { name: 'Change 99211, Braven - MCARE' }).click();
  let box = manager.getByRole('textbox', { name: '99211, Braven - MCARE' });
  await box.fill('$31.50');
  let saved = manager.waitForResponse((r) => r.url().endsWith('/api/reimbursements/rates'));
  await box.press('Enter');
  if ((await saved).status() !== 200) throw new Error('not saved');
  await row('99211').getByRole('button', { name: 'Change 99211, Braven - MCARE' }).getByText('$31.50').waitFor();

  await row('99211').getByRole('button', { name: 'Change 99211, Braven - MCARE' }).click();
  box = manager.getByRole('textbox', { name: '99211, Braven - MCARE' });
  await box.fill('');
  saved = manager.waitForResponse((r) => r.url().endsWith('/api/reimbursements/rates'));
  await box.press('Enter');
  await saved;
  await row('99211').getByRole('button', { name: 'Change 99211, Braven - MCARE' }).getByText('—').waitFor();
});

await step('a manager adds a code, and a code already there is refused', async () => {
  await manager.getByRole('button', { name: '+ Code' }).click();
  let dialog = manager.getByRole('dialog', { name: 'New code' });
  await dialog.getByLabel('Code', { exact: true }).fill('99213');
  await dialog.getByRole('button', { name: 'Add code' }).click();
  await dialog.getByText('99213 is already on the board.').waitFor({ timeout: 10000 });
  await dialog.getByLabel('Code', { exact: true }).fill('99417');
  await dialog.getByLabel('Description').fill('Prolonged service, each 15 min');
  await dialog.getByRole('button', { name: 'Add code' }).click();
  await row('99417').waitFor({ timeout: 10000 });

  await row('99417').getByRole('rowheader').getByRole('button').click();
  dialog = manager.getByRole('dialog', { name: 'Change 99417' });
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await manager.getByRole('alertdialog').getByRole('button', { name: 'Yes, remove it' }).click();
  await row('99417').waitFor({ state: 'detached', timeout: 10000 });
});

await step('the big board fills the screen', async () => {
  await manager.getByRole('button', { name: 'Done editing' }).click();
  await manager.getByRole('button', { name: /Big board/ }).click();
  const big = manager.getByTestId('big-board');
  await big.getByRole('columnheader', { name: /^Medicare/ }).waitFor();
  await manager.screenshot({ path: `${OUT}/reimbursements-big-board.png` });
  await big.getByRole('button', { name: 'Exit big board' }).click();
  await big.waitFor({ state: 'detached', timeout: 5000 });
});

await step('staff have no reimbursements', async () => {
  const page = await signIn('frontdesk@domihealthcare.com');
  const link = await navLink(page, 'Reimbursements');
  if (await link.isVisible().catch(() => false)) throw new Error('offered in the menu');
  await goTo(page, 'Resources');
  await page.getByTestId('reference-section').getByRole('link', { name: /Diagnostics/ }).waitFor({ timeout: 10000 });
  if (await page.getByTestId('reference-section').getByText('Reimbursements').count()) throw new Error('on Resources');
  const status = await page.evaluate(async () => (await fetch('/api/reimbursements')).status);
  if (status !== 403) throw new Error(`read it: ${status}`);
  await page.context().close();
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL REIMBURSEMENTS CHECKS PASSED');
