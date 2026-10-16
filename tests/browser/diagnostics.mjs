import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo } from './nav.mjs';

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
 * The diagnostics board (October 2026, Dominguez — the DIAGNOSTIC_INFO sheet
 * as "an app inside the app … a 'big board' for staff to reference"), loaded
 * with the sheet: everybody looks an insurance up, managers and admins keep
 * it. run-all.sh puts the sheet's data back after.
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

const staff = await signIn('frontdesk@domihealthcare.com');
const board = staff.getByTestId('diagnostics-table');
const cell = (plan, test) =>
  board.getByRole('cell', { name: new RegExp(`^${plan.replace(/[-/]/g, '\\$&')}, ${test}:`) });

await step('staff open Diagnostics from Home, loaded with the sheet', async () => {
  await staff.getByTestId('quick-actions').getByRole('link', { name: 'Diagnostics' }).click();
  await staff.getByRole('heading', { name: 'Diagnostics' }).waitFor({ timeout: 10000 });
  await board.getByRole('columnheader', { name: /^ECHO/ }).waitFor({ timeout: 10000 });
  await board.getByRole('rowheader', { name: /^Aetna - COMM/ }).waitFor();
  // The sheet's reminders, its time and prep, and self-pay.
  await staff.getByTestId('diagnostics-reminders').getByText('We do not do ultrasounds for testicles.').waitFor();
  await board.getByRole('cell', { name: '20 min · Fast 6 hrs' }).first().waitFor();
  await board.getByRole('row', { name: /^Self-pay/ }).getByRole('cell', { name: '$200' }).first().waitFor();
  const yes = cell('Aetna-MCARE', 'ECHO');
  if ((await yes.innerText()).trim() !== 'YES') throw new Error(`Aetna-MCARE ECHO reads ${await yes.innerText()}`);
  if (!/bg-emerald-100/.test((await yes.getAttribute('class')) ?? '')) throw new Error('YES is not green');
  const no = cell('Aetna-MCARE', 'CAROTID');
  if (!/bg-rose-100/.test((await no.getAttribute('class')) ?? '')) throw new Error('NO is not red');
  const pa = cell('Allied-COMM', 'ECHO');
  if (!/bg-sky-100/.test((await pa.getAttribute('class')) ?? '')) throw new Error('PA is not blue');
  if (await staff.getByRole('button', { name: 'Edit the board' }).count()) throw new Error('staff can edit');
  await staff.screenshot({ path: `${OUT}/diagnostics.png`, fullPage: true });
});

await step('finding an insurance shows its answers as large tiles, with how it is found in eCW', async () => {
  await staff.getByLabel('Find an insurance').fill('aetna medicare');
  const card = staff.getByTestId('diagnostics-plan-answers');
  await card.getByRole('heading', { name: 'Aetna-MCARE' }).waitFor({ timeout: 10000 });
  await card.getByText('eCW: Aetna Medicare / 60054 / 456').waitFor();
  const echo = card.getByTestId('diagnostics-answer').filter({ hasText: 'ECHO' });
  await echo.getByText('Covered', { exact: true }).waitFor();
  const aorta = card.getByTestId('diagnostics-answer').filter({ hasText: /^Aorta/ });
  await aorta.getByText('Not on the guide: ask a manager').waitFor();
  await staff.screenshot({ path: `${OUT}/diagnostics-lookup.png`, fullPage: true });
});

await step('picking a test narrows the board to it', async () => {
  await staff.getByLabel('Find an insurance').fill('');
  await staff.getByLabel('Test', { exact: true }).selectOption({ label: 'THYROID' });
  await board.getByRole('columnheader', { name: /^THYROID/ }).waitFor();
  if (await board.getByRole('columnheader', { name: /^ECHO/ }).count()) throw new Error('ECHO still shown');
  await staff.getByLabel('Test', { exact: true }).selectOption({ label: 'All ultrasounds' });
});

await step('Testing has its own tests, and a note on a cell', async () => {
  await staff.getByRole('button', { name: 'Testing', exact: true }).click();
  await board.getByRole('columnheader', { name: /^EEG/ }).waitFor({ timeout: 10000 });
  await board.getByRole('cell', { name: /Relay to Admin \(note\/demo to andres\)/ }).waitFor();
  const noted = cell('HNJH Total Care - MediMedi', 'BrainCheck');
  if (!/973-274-4396/.test((await noted.getAttribute('aria-label')) ?? '')) throw new Error('the note is missing');
  await noted.getByRole('button', { name: 'PA *' }).click();
  await staff.getByRole('tooltip').filter({ hasText: '973-274-4396' }).waitFor();
  await board.getByRole('row', { name: /^Self-pay/ }).getByRole('cell', { name: '$220 / night' }).waitFor();
});

await step('the big board fills the screen, and Escape puts it back', async () => {
  await staff.getByRole('button', { name: /Big board/ }).click();
  const big = staff.getByTestId('big-board');
  await big.getByRole('heading', { name: 'Diagnostics · Testing' }).waitFor();
  await big.getByRole('columnheader', { name: /^EEG/ }).waitFor();
  await staff.screenshot({ path: `${OUT}/diagnostics-big-board.png` });
  await staff.keyboard.press('Escape');
  await big.waitFor({ state: 'detached', timeout: 5000 });
});

await step('staff cannot change it', async () => {
  const status = await staff.evaluate(async () => {
    const board = await (await fetch('/api/diagnostics')).json();
    const r = await fetch('/api/diagnostics/answers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testId: board.tests[0].id, planId: board.plans[0].id, answer: 'NO' }),
    });
    return r.status;
  });
  if (status !== 403) throw new Error(`answered ${status}`);
});

await step('on a phone the board scrolls inside its card, not the page', async () => {
  const phone = await signIn('frontdesk@domihealthcare.com', { width: 390, height: 844 });
  await phone.goto(`${BASE}/diagnostics`, { waitUntil: 'networkidle' });
  await phone.getByTestId('diagnostics-table').getByRole('columnheader', { name: /^ECHO/ }).waitFor({ timeout: 10000 });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (wide) throw new Error('the page scrolls sideways');
  await phone.getByLabel('Find an insurance').fill('oscar');
  await phone.getByTestId('diagnostics-plan-answers').getByText('Must say QualCare').waitFor();
  await phone.screenshot({ path: `${OUT}/diagnostics-phone.png`, fullPage: true });
  await phone.context().close();
});

const manager = await signIn('manager@domihealthcare.com');
const mBoard = manager.getByTestId('diagnostics-table');

await step('a manager sets an answer with a note, then clears it', async () => {
  await manager.goto(`${BASE}/diagnostics`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: 'Edit the board' }).click();
  const target = mBoard.getByRole('cell', { name: /^Aetna-MCARE, Aorta:/ });
  await target.getByRole('button').click();
  let dialog = manager.getByRole('dialog', { name: 'Aetna-MCARE · Aorta' });
  await dialog.getByRole('radio', { name: /Needs a prior authorization/ }).check();
  await dialog.getByLabel('Note (optional)').fill('Fax the order first');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await target.getByRole('button', { name: 'PA *' }).waitFor({ timeout: 10000 });

  await target.getByRole('button').click();
  dialog = manager.getByRole('dialog', { name: 'Aetna-MCARE · Aorta' });
  await dialog.getByRole('radio', { name: /Not known/ }).check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await target.getByRole('button', { name: '—' }).waitFor({ timeout: 10000 });
});

await step('a manager adds a test, moves it and removes it', async () => {
  await manager.getByRole('button', { name: '+ Test' }).click();
  let dialog = manager.getByRole('dialog', { name: 'New test' });
  await dialog.getByLabel('Name', { exact: true }).fill('Breast');
  await dialog.getByLabel('Time', { exact: true }).fill('30 min');
  await dialog.getByLabel('Self-pay', { exact: true }).fill('$250');
  await dialog.getByRole('button', { name: 'Add test' }).click();
  const header = mBoard.getByRole('columnheader', { name: /^Breast/ });
  await header.waitFor({ timeout: 10000 });
  await mBoard.getByRole('cell', { name: '30 min · No prep' }).waitFor();

  await header.getByRole('button', { name: 'Breast' }).click();
  dialog = manager.getByRole('dialog', { name: 'Change Breast' });
  const moved = manager.waitForResponse((r) => /\/api\/diagnostics\/tests\/.+\/move$/.test(r.url()));
  await dialog.getByRole('button', { name: '← Move left' }).click();
  if ((await moved).status() !== 201) throw new Error('not moved');
  // The board redraws with the answer; give it a moment to.
  let names = [];
  for (let tries = 0; tries < 20; tries += 1) {
    names = await mBoard.getByRole('columnheader').allInnerTexts();
    const at = names.findIndex((name) => name.startsWith('Breast'));
    if (at > 0 && names[at + 1]?.startsWith('Soft Tissue (Groin/Scrotum)')) break;
    await manager.waitForTimeout(250);
    if (tries === 19) throw new Error(`order ${names.join(' | ')}`);
  }
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await manager.getByRole('alertdialog').getByRole('button', { name: 'Yes, remove it' }).click();
  await header.waitFor({ state: 'detached', timeout: 10000 });
});

await step('there is nowhere to upload a file', async () => {
  if (await manager.locator('input[type=file]').count()) throw new Error('a file input');
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL DIAGNOSTICS CHECKS PASSED');
