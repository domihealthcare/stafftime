import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

// Overtime, as the rota is built: the scheduler warns while a shift is being
// added, asks before saving one that puts somebody over, says so at the top of
// the week and beside their total — and the person is told too, on their own
// screens and by email. Plus the confirmation pop-up's escape hatches.
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Defaults to the dev server; point at `vite preview` to test the built bundle
// with the deployed security headers applied.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
// Where the API writes the emails it would send (no provider in tests).
const API_LOG = process.env.API_LOG || '/tmp/api.log';
const browser = await chromium.launch(
  // Fall back to whatever Playwright downloaded when CHROMIUM_PATH is unset.
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
}

const mgrCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const mgr = await mgrCtx.newPage();
mgr.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

// Next week, so it is close enough to show on Frankie's own screens (which
// look six weeks ahead) and clear of the shift the seed puts on today. Four
// published nine-hour days, made through the API and tagged so the runner can
// clear them: 36 hours, four short of the line.
const setup = await mgr.evaluate(async () => {
  const staff = await fetch('/api/employees').then((r) => r.json());
  const frankie = staff.find((p) => p.email === 'frontdesk@domihealthcare.com');
  const locations = await fetch('/api/locations').then((r) => r.json());
  const northBergen = locations.find((l) => l.name === 'North Bergen');
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7);
  for (let day = 0; day < 4; day += 1) {
    const startsAt = new Date(monday);
    startsAt.setDate(monday.getDate() + day);
    startsAt.setHours(9, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setHours(18);
    const response = await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: frankie.id,
        locationId: northBergen.id,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: 'PUBLISHED',
        notes: 'overtime-suite',
      }),
    });
    if (!response.ok) throw new Error(`could not make a shift: ${await response.text()}`);
  }
  return { frankieId: frankie.id, monday: monday.toISOString() };
});

const frankieRow = () => mgr.getByTestId('rota-row-Frankie Front-Desk');

await step('a week close to the line but not over it leaves nothing standing on the rota', async () => {
  // "Close" is for the moment of scheduling; once a rota is agreed, only
  // actually going over is worth a warning.
  await mgr.getByRole('link', { name: /^Schedule/ }).first().click();
  await mgr.getByRole('button', { name: 'Next →' }).click();
  await frankieRow().getByText('36 h').waitFor({ timeout: 15000 });
  await mgr.waitForTimeout(1000);
  if ((await frankieRow().locator('[data-testid^="week-standing"]').count()) > 0)
    throw new Error('the rota flagged a week that is under the line');
  if ((await mgr.getByTestId('overtime-notice').count()) > 0)
    throw new Error('the schedule showed an overtime banner for a week nobody is over');
  if ((await mgr.getByText(/close to overtime/i).count()) > 0)
    throw new Error('"close to overtime" stayed on the rota after scheduling');
});

let posts = 0;
mgr.on('request', (r) => {
  if (r.method() === 'POST' && /\/api\/shifts$/.test(r.url())) posts += 1;
});

await step('while adding a shift, landing close to the line says so in the form', async () => {
  await frankieRow().getByRole('button', { name: /^Add a shift for Frankie Front-Desk on Friday/ }).click();
  const dialog = mgr.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
  await dialog.waitFor({ timeout: 10000 });
  // Three hours on top of thirty-six: 39, one short of the line.
  await dialog.getByLabel('Ends').fill('12:00');
  const preview = dialog.getByTestId('overtime-preview');
  await preview.getByText('Close to overtime').waitFor({ timeout: 10000 });
  await preview.getByText(/39 of 40 hours/).waitFor({ timeout: 5000 });
});

await step('adding a shift that tips somebody over warns while the form is open', async () => {
  const dialog = mgr.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
  // Back to 9 to 5: eight hours on top of thirty-six.
  await dialog.getByLabel('Ends').fill('17:00');
  const preview = dialog.getByTestId('overtime-preview');
  await preview.getByText('This puts Frankie Front-Desk into overtime').waitFor({ timeout: 10000 });
  await preview.getByText(/44 hours in the week of .* 4 hours past the 40-hour line/).waitFor({ timeout: 5000 });
});
await mgr.screenshot({ path: `${OUT}/110-overtime-preview.png`, fullPage: true });

await step('saving it asks first, and Go back saves nothing', async () => {
  const dialog = mgr.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
  await dialog.getByRole('button', { name: 'Add shift' }).click();
  const asked = mgr.getByRole('alertdialog', { name: 'Schedule Frankie Front-Desk into overtime?' });
  await asked.waitFor({ timeout: 10000 });
  // The safe answer has the focus, so a stray Enter keeps things as they were.
  const focused = await mgr.evaluate(() => document.activeElement?.textContent);
  if (focused !== 'Go back') throw new Error(`the focus was on "${focused}"`);
  await mgr.screenshot({ path: `${OUT}/111-overtime-confirm.png`, fullPage: true });
  await asked.getByRole('button', { name: 'Go back' }).click();
  await asked.waitFor({ state: 'detached', timeout: 5000 });
  await dialog.waitFor({ timeout: 5000 });
  if (posts !== 0) throw new Error('Go back created the shift anyway');
});

// The API log is shared by every suite, and earlier ones rightly email Frankie
// about their own overtime; only what is written after this save counts.
let logOffset = 0;

await step('confirming saves it, and the week says so at the top and beside their total', async () => {
  logOffset = readFileSync(API_LOG, 'utf8').length;
  const dialog = mgr.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
  await dialog.getByRole('button', { name: 'Add shift' }).click();
  const created = mgr.waitForResponse((r) => /\/api\/shifts$/.test(r.url()) && r.request().method() === 'POST');
  await mgr.getByRole('alertdialog').getByRole('button', { name: 'Yes, schedule it' }).click();
  if (!(await created).ok()) throw new Error('the shift was refused');

  const notice = mgr.getByTestId('overtime-notice');
  await notice.getByText('1 person is scheduled past 40 hours').waitFor({ timeout: 15000 });
  await notice.getByText(/44 hours in the week of/).waitFor({ timeout: 5000 });
  await frankieRow().getByTestId('week-standing-over').getByText('4 h overtime').waitFor({ timeout: 5000 });

  // Above the rota, not under it at the foot of the page.
  const noticeTop = (await notice.boundingBox())?.y ?? Infinity;
  const rotaTop = (await frankieRow().boundingBox())?.y ?? -Infinity;
  if (noticeTop > rotaTop) throw new Error('the overtime warning is below the rota');
});
await mgr.screenshot({ path: `${OUT}/112-overtime-rota.png`, fullPage: true });

await step('Frankie is emailed once, when the week first goes over', async () => {
  let mentions = 0;
  for (let i = 0; i < 20 && mentions === 0; i += 1) {
    const log = readFileSync(API_LOG, 'utf8').slice(logOffset);
    mentions = [...log.matchAll(/To:\s+frontdesk@domihealthcare\.com\s+Subject: (\[Test\] )?Your schedule puts you into overtime/g)].length;
    if (mentions === 0) await mgr.waitForTimeout(250);
  }
  // A moment more, so a second email would have had time to arrive.
  await mgr.waitForTimeout(1000);
  mentions = [...readFileSync(API_LOG, 'utf8').slice(logOffset).matchAll(/To:\s+frontdesk@domihealthcare\.com\s+Subject: (\[Test\] )?Your schedule puts you into overtime/g)].length;
  if (mentions !== 1) throw new Error(`${mentions} overtime emails to Frankie since the save, in ${API_LOG}`);
});

const staffCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const frankie = await staffCtx.newPage();
frankie.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await step('Frankie sees it on the Clock screen', async () => {
  await signIn(frankie, 'frontdesk@domihealthcare.com');
  const mine = frankie.getByTestId('my-overtime');
  await mine.getByText('Your schedule puts you into overtime').waitFor({ timeout: 15000 });
  await mine.getByText(/44 hours/).waitFor({ timeout: 5000 });
  await mine.getByText(/talk to your manager/).waitFor({ timeout: 5000 });
});
await frankie.screenshot({ path: `${OUT}/113-overtime-staff.png`, fullPage: true });

await step('and on the Schedule, where the week in question carries its total', async () => {
  await frankie.getByRole('link', { name: /^Schedule/ }).first().click();
  await frankie.getByTestId('my-overtime').getByText('Your schedule puts you into overtime').waitFor({ timeout: 15000 });
  await frankie.getByRole('button', { name: 'Next →' }).click();
  await frankie.getByTestId('week-standing-over').getByText('4 h overtime').waitFor({ timeout: 10000 });
});

await step('Escape and the backdrop both answer a removal with no', async () => {
  const chip = frankieRow().getByTestId('shift-chip').first();
  const before = await frankieRow().getByTestId('shift-chip').count();

  await chip.click();
  await mgr.getByRole('dialog').getByRole('button', { name: /^Remove .* shift, / }).click();
  const asked = mgr.getByRole('alertdialog', { name: 'Remove this shift?' });
  await asked.waitFor({ timeout: 5000 });
  await mgr.keyboard.press('Escape');
  await asked.waitFor({ state: 'detached', timeout: 5000 });

  await mgr.getByRole('dialog').getByRole('button', { name: /^Remove .* shift, / }).click();
  await asked.waitFor({ timeout: 5000 });
  await mgr.mouse.click(5, 5);
  await asked.waitFor({ state: 'detached', timeout: 5000 });
  await mgr.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  if ((await frankieRow().getByTestId('shift-chip').count()) !== before)
    throw new Error('a shift went although nobody said yes');
});

// Tidy up: the tagged four are cleared by the runner; the one added through
// the rota is not tagged, so it goes the way a manager would remove it.
await mgr.evaluate(async ({ frankieId, monday }) => {
  const from = new Date(monday);
  const to = new Date(from);
  to.setDate(from.getDate() + 7);
  const shifts = await fetch(
    `/api/shifts?employeeId=${frankieId}&from=${from.toISOString()}&to=${to.toISOString()}`,
  ).then((r) => r.json());
  for (const shift of shifts) {
    if (shift.notes !== 'overtime-suite') await fetch(`/api/shifts/${shift.id}`, { method: 'DELETE' });
  }
}, setup);

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL OVERTIME CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
for (const e of errors) console.log(` - ${e}`);
process.exit(errors.length === 0 ? 0 : 1);
