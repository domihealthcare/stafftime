import { chromium } from 'playwright';
import { goTo } from './nav.mjs';
import { mkdirSync } from 'node:fs';
// A note on a shift (Dominguez, October 2026: "so I can write 7–12 upstairs
// and 12–3 downstairs"): written when the shift is added or from the shift's
// pop-up, shown on the chip, and seen by the person on it — with a word under
// the bell when it changes on a published shift.
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
// The last note the suite leaves carries this, so run-all.sh can clear it.
const MARK = '(notes suite)';

const signIn = async (email) => {
  const page = await (
    await browser.newContext({ viewport: { width: 1400, height: 1000 }, timezoneId: 'America/New_York' })
  ).newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await goTo(page, 'Schedule');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  // Next week, so every day in it is still ahead.
  await page.getByRole('button', { name: 'Next →' }).click();
  return page;
};

const mgr = await signIn('manager@domihealthcare.com');
await mgr.getByText('Coverage this week').waitFor({ timeout: 15000 });
const frankie = () => mgr.getByTestId('rota-row-Frankie Front-Desk');
const chip = () => frankie().getByTestId('shift-chip').filter({ hasText: '7am–3pm' });
let shiftId = null;

await step('a note can be written as the shift is added, and shows on the rota', async () => {
  await frankie().getByRole('button', { name: /^Add a shift for Frankie Front-Desk on Tuesday/ }).click();
  const dialog = mgr.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
  await dialog.getByLabel('Starts').fill('07:00');
  await dialog.getByLabel('Ends').fill('15:00');
  await dialog.getByLabel('Notes (optional)').fill('7–12 upstairs, 12–3 downstairs');
  const saved = mgr.waitForResponse((r) => r.url().endsWith('/api/shifts') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Add shift' }).click();
  const response = await saved;
  if (response.status() !== 201) throw new Error(`answered ${response.status()}: ${await response.text()}`);
  const shift = await response.json();
  shiftId = shift.id;
  if (shift.notes !== '7–12 upstairs, 12–3 downstairs') throw new Error(`saved the note as ${JSON.stringify(shift.notes)}`);
  await chip().getByTestId('shift-note').getByText('7–12 upstairs, 12–3 downstairs').waitFor({ timeout: 15000 });
  await mgr.screenshot({ path: `${OUT}/shift-note-rota.png`, fullPage: true });
});

await step('the shift pop-up shows the note, and clearing it saves nothing in it', async () => {
  await chip().click();
  const dialog = mgr.getByRole('dialog', { name: /Frankie/ });
  const box = dialog.getByLabel('Notes', { exact: true });
  if ((await box.inputValue()) !== '7–12 upstairs, 12–3 downstairs') throw new Error(`the box held ${await box.inputValue()}`);
  if (await dialog.getByRole('button', { name: 'Save note' }).count()) throw new Error('Save note showed before anything changed');
  await mgr.screenshot({ path: `${OUT}/shift-note-dialog.png` });
  await box.fill('   ');
  const saved = mgr.waitForResponse((r) => r.url().includes(`/api/shifts/${shiftId}`) && r.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Save note' }).click();
  const shift = await (await saved).json();
  if (shift.notes !== null) throw new Error(`a blank note was kept as ${JSON.stringify(shift.notes)}`);
  await mgr.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await chip().waitFor({ timeout: 15000 });
  if (await chip().getByTestId('shift-note').count()) throw new Error('the chip still shows a note');
});

await step('a note can be added to a shift already there', async () => {
  if (await mgr.getByRole('dialog').count()) await mgr.keyboard.press('Escape');
  await chip().click();
  const dialog = mgr.getByRole('dialog', { name: /Frankie/ });
  await dialog.getByLabel('Notes', { exact: true }).fill(`9–12 upstairs ${MARK}`);
  const saved = mgr.waitForResponse((r) => r.url().includes(`/api/shifts/${shiftId}`) && r.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Save note' }).click();
  if (!(await saved).ok()) throw new Error('the note was refused');
  await chip().getByTestId('shift-note').getByText(`9–12 upstairs ${MARK}`).waitFor({ timeout: 15000 });
});

await step('the person on it sees the note on their schedule, and was told under the bell', async () => {
  const me = await signIn('frontdesk@domihealthcare.com');
  await me.getByTestId('shift-note').getByText(`9–12 upstairs ${MARK}`).waitFor({ timeout: 15000 });
  await me.screenshot({ path: `${OUT}/shift-note-staff.png`, fullPage: true });
  await me.getByRole('button', { name: /^Notifications/ }).click();
  const panel = me.getByRole('dialog', { name: 'Notifications' });
  await panel.getByText(/^Shift note changed:/).first().waitFor({ timeout: 10000 });
  await panel.getByText(`Note: 9–12 upstairs ${MARK}`).first().waitFor({ timeout: 10000 });
  await panel.getByText(/^Shift note removed:/).first().waitFor({ timeout: 10000 });
});

await step('a note longer than 500 characters is refused', async () => {
  const status = await mgr.evaluate(
    async ({ id }) =>
      (await fetch(`/api/shifts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'x'.repeat(501) }),
      })).status,
    { id: shiftId },
  );
  if (status !== 400) throw new Error(`answered ${status}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL SHIFT-NOTE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
