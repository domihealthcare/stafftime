import { chromium } from 'playwright';
import { clockOut } from './clock-out.mjs';
import { mkdirSync } from 'node:fs';
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

/**
 * Half of this app is used on a phone — clocking in at the desk, a manager
 * approving hours between patients, an admin setting a geofence while standing
 * at the front door. 390px wide is about the narrowest phone anyone at the
 * practice is likely to have; anything that works here works on everything
 * bigger.
 *
 * The check that matters is horizontal overflow. A page wider than the window
 * means the whole layout slides sideways under your thumb, which makes
 * everything feel broken even when it works. A table that scrolls inside its
 * own box is fine; the page itself scrolling is not.
 */
const PHONE = { width: 390, height: 844 };

async function assertNoSidewaysScroll(page, where) {
  // Give layout and any late-arriving data a moment to settle first.
  await page.waitForTimeout(400);
  const info = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    culprits: Array.from(document.querySelectorAll('body *'))
      .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 3)
      .map((el) => `<${el.tagName.toLowerCase()} class="${(el.className || '').toString().slice(0, 60)}">`),
  }));

  if (info.scrollWidth > info.clientWidth + 1) {
    throw new Error(
      `${where} scrolls sideways: ${info.scrollWidth}px of content in a ${info.clientWidth}px window. First culprits: ${info.culprits.join(', ')}`,
    );
  }
}

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
}

const ctx = await browser.newContext({
  viewport: PHONE,
  permissions: ['geolocation'],
  geolocation: { latitude: 40.8045, longitude: -74.012, accuracy: 25 }, // on site, North Bergen
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await step('the sign-in screen fits a phone', async () => {
  await assertNoSidewaysScroll(page, 'Sign in');
});

await signIn(page, 'admin@domihealthcare.com');

await step('the clock screen fits a phone', async () => {
  await assertNoSidewaysScroll(page, 'Clock');
});

// The screens below need something on them. This suite makes its own rather
// than depending on whatever suite happened to run before it.
await step('a punch can be made and closed from a phone', async () => {
  await page.getByRole('button', { name: 'Clock in' }).click();
  await page.getByRole('button', { name: 'Clock out' }).waitFor({ timeout: 20000 });
  await assertNoSidewaysScroll(page, 'Clock (on the clock)');
  // The closing checklist is long; it has to fit a phone too.
  await clockOut(page, {
    onChecklist: () => assertNoSidewaysScroll(page, 'Clock (closing checklist)'),
  });
  await page.getByRole('button', { name: 'Clock in' }).waitFor({ timeout: 20000 });
});

await step('a checklist can be started from a phone', async () => {
  await page.getByRole('link', { name: /^Checklists/ }).first().click();
  await page.getByRole('button', { name: 'Start a checklist' }).click();
  await assertNoSidewaysScroll(page, 'Start a checklist');

  await page.getByLabel('Who').selectOption({ label: 'Frankie Front-Desk' });
  await page.getByRole('button', { name: 'Start it' }).click();
  await page.getByText(/0 of \d+/).waitFor({ timeout: 20000 });
});
await page.screenshot({ path: `${OUT}/50-phone-clock.png`, fullPage: true });

/// Which top-bar menu a screen sits under, if any.
const MENU = {
  Directory: 'Team',
  Resources: 'Team',
  Surveys: 'Team',
  Dashboard: 'Manage',
  'Job roles': 'Manage',
  Export: 'Manage',
  Staff: 'Manage',
  Kiosks: 'Manage',
  Locations: 'Manage',
};

async function openMenuFor(page, name) {
  if (MENU[name]) await page.getByRole('button', { name: MENU[name], exact: true }).click();
}

await step('every navigation link is reachable without scrolling sideways', async () => {
  // The everyday screens sit in the top bar; the rest open from Team and
  // Manage. Either way, nothing may run off the edge of the phone.
  for (const name of [
    'Clock', 'News', 'Timesheet', 'Schedule', 'Time off', 'Checklists', 'Licenses',
    'Directory', 'Resources', 'Surveys', 'Dashboard', 'Job roles', 'Export', 'Staff', 'Kiosks', 'Locations',
  ]) {
    await openMenuFor(page, name);
    const link = page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${name}`) }).first();
    if ((await link.count()) === 0) throw new Error(`${name} is missing from the nav`);
    const box = await link.boundingBox();
    if (!box) throw new Error(`${name} is not visible`);
    if (box.x < -1 || box.x + box.width > PHONE.width + 1)
      throw new Error(`${name} sits at ${Math.round(box.x)}–${Math.round(box.x + box.width)}px, off a ${PHONE.width}px screen`);
    if (MENU[name]) await page.keyboard.press('Escape');
  }
});

for (const [label, screen] of [
  ['Timesheet', 'Timesheet'],
  ['Schedule', 'Schedule'],
  ['Time off', 'Time off'],
  ['Checklists', 'Checklists'],
  ['Licenses', 'Licenses'],
  ['News', 'News'],
  ['Directory', 'Directory'],
  ['Resources', 'Resources'],
  ['Surveys', 'Surveys'],
  ['Dashboard', 'Dashboard'],
  ['Job roles', 'Job roles'],
  ['Export', 'Export'],
  ['Staff', 'Staff'],
  ['Kiosks', 'Kiosks'],
  ['Locations', 'Locations'],
]) {
  await step(`the ${screen.toLowerCase()} screen fits a phone`, async () => {
    await openMenuFor(page, label);
    await page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${label}`) }).first().click();
    await assertNoSidewaysScroll(page, screen);
  });
}

await step('a manager can approve hours without scrolling sideways to find the button', async () => {
  await page.getByRole('link', { name: /^Timesheet/ }).first().click();
  const approve = page.getByRole('button', { name: 'Approve' }).first();
  await approve.waitFor({ timeout: 15000 });

  const box = await approve.boundingBox();
  if (!box) throw new Error('Approve is not visible at all');
  if (box.x + box.width > PHONE.width + 1)
    throw new Error(`Approve sits at ${Math.round(box.x + box.width)}px, off a ${PHONE.width}px screen`);
});
await page.screenshot({ path: `${OUT}/51-phone-timesheet.png`, fullPage: true });

await step('the rota scrolls inside itself on a phone, keeping names in view', async () => {
  await page.getByRole('link', { name: /^Schedule/ }).first().click();
  await page.getByText('Coverage this week').waitFor({ timeout: 15000 });
  // The page itself never scrolls sideways; the rota is a table that does,
  // in its own box, with the name column pinned.
  await assertNoSidewaysScroll(page, 'Schedule');

  const grid = page.getByTestId('week-grid');
  const scrolls = await grid.evaluate((el) => el.scrollWidth > el.clientWidth);
  if (!scrolls) throw new Error('the rota does not scroll within its own box');

  const firstName = grid.locator('tbody th[scope=row]').first();
  const before = await firstName.boundingBox();
  await grid.evaluate((el) => el.scrollBy({ left: 400 }));
  const after = await firstName.boundingBox();
  if (!before || !after || Math.abs(after.x - before.x) > 1)
    throw new Error('the name column scrolls away with the days');
});
await page.screenshot({ path: `${OUT}/52-phone-schedule.png`, fullPage: true });

await step('the repeating-shifts form fits a phone', async () => {
  await page.getByRole('button', { name: 'Repeating shifts' }).click();
  await page.getByText('One rota line at a time').waitFor({ timeout: 10000 });
  await assertNoSidewaysScroll(page, 'Repeating shifts');
});
await page.screenshot({ path: `${OUT}/53-phone-repeat.png`, fullPage: true });

await step('the month view fits a phone', async () => {
  // Seven columns is about fifty pixels each at this width, which is exactly
  // why the month view shows counts rather than shift cards. If it ever goes
  // back to names, this is what should notice.
  await page.getByRole('link', { name: /^Schedule/ }).first().click();
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await page.getByTestId('month-grid').waitFor({ timeout: 15000 });
  await assertNoSidewaysScroll(page, 'Month view');

  // And the weekday headings still line up with seven columns of days.
  const headings = await page.getByTestId('month-grid').locator('p').first().innerText();
  if (headings.trim().length === 0) throw new Error('the weekday headings vanished');

  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByTestId('week-grid').waitFor({ timeout: 15000 });
});
await page.screenshot({ path: `${OUT}/53a-phone-month.png`, fullPage: true });

await step('an open checklist fits a phone', async () => {
  await page.getByRole('link', { name: /^Checklists/ }).first().click();
  await page.getByRole('button', { name: /onboarding/ }).first().click();
  await page.getByText('Form I-9 completed and verified').first().waitFor({ timeout: 15000 });
  // A task row carries a title, a due date and two buttons on one line, which
  // is the thing most likely to push a phone layout sideways.
  await page
    .getByRole('button', { name: 'Not applicable' })
    .first()
    .waitFor({ timeout: 10000 });
  await assertNoSidewaysScroll(page, 'Checklist detail');
});
await page.screenshot({ path: `${OUT}/54-phone-checklist.png`, fullPage: true });

await step('the correction dialog fits a phone', async () => {
  await page.getByRole('link', { name: /^Timesheet/ }).first().click();
  // The desktop table is still in the DOM, just hidden, so ask for the button
  // that is actually on screen rather than the first one in document order.
  await page.getByRole('button', { name: 'Correct' }).locator('visible=true').first().click();
  await page.getByLabel(/Reason/i).waitFor({ timeout: 10000 });
  await assertNoSidewaysScroll(page, 'Correction dialog');
});
await page.screenshot({ path: `${OUT}/55-phone-correct.png`, fullPage: true });

await step('the kiosk screen fits a phone too', async () => {
  const kioskCtx = await browser.newContext({ viewport: PHONE });
  const kiosk = await kioskCtx.newPage();
  await kiosk.goto(`${BASE}/kiosk`, { waitUntil: 'networkidle' });
  await assertNoSidewaysScroll(kiosk, 'Kiosk');
  await kioskCtx.close();
});

await step('an employee sees a phone-sized app too', async () => {
  const empCtx = await browser.newContext({ viewport: PHONE });
  const emp = await empCtx.newPage();
  emp.on('pageerror', (e) => errors.push(`employee pageerror: ${e.message}`));
  await signIn(emp, 'frontdesk@domihealthcare.com');

  for (const name of ['Timesheet', 'Schedule', 'Time off', 'Checklists']) {
    await emp.getByRole('link', { name: new RegExp(`^${name}`) }).first().click();
    await assertNoSidewaysScroll(emp, `${name} (employee)`);
  }
  await emp.screenshot({ path: `${OUT}/56-phone-employee.png`, fullPage: true });
  await empCtx.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL PHONE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
