import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo, openMenu, goToManage } from './nav.mjs';
import { openAccountMenu } from './account-menu.mjs';

// Closing checklists: what Front Desk and MAs confirm when they clock out, the
// manager's view of them and of the restock list, editing the lists - and
// Licenses / Onboarding moved off the top bar.
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

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
}

const call = (page, path, init = {}) =>
  page.evaluate(
    async ([path, init]) => {
      const response = await fetch(`/api${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    [path, init],
  );

const menuItems = async (page, label) => {
  await openMenu(page, label);
  const names = await page.getByRole('navigation').getByRole('link').allInnerTexts();
  await page.keyboard.press('Escape');
  return names.map((n) => n.trim());
};
/// Somebody's own licenses and onboarding live in the account menu (October 2026).
const accountMenuItems = async (page) => {
  await openAccountMenu(page);
  const names = await page.getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  return names.map((n) => n.trim());
};

// Frankie works Front Desk and MA, on a phone, at the North Bergen desk.
const fdCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  permissions: ['geolocation'],
  geolocation: { latitude: 40.8045, longitude: -74.012, accuracy: 25 },
});
const frankie = await fdCtx.newPage();
frankie.on('pageerror', (e) => errors.push(`staff pageerror: ${e.message}`));
await signIn(frankie, 'frontdesk@domihealthcare.com');

// The manager's browser is in New Jersey, as it is at the practice: the
// closing screen opens on the viewer's today, which on a UTC runner is
// already tomorrow every evening after 8pm.
const mgrCtx = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  timezoneId: 'America/New_York',
});
const mgr = await mgrCtx.newPage();
mgr.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

// ------------------------------------------------------------------ the menus

await step('Front Desk and MA staff see no Licenses or Onboarding anywhere', async () => {
  const bar = await frankie.getByRole('navigation').getByRole('link').allInnerTexts();
  if (bar.some((t) => /Checklists|Licenses/.test(t))) throw new Error(`top bar: ${bar.join(', ')}`);
  if ((await accountMenuItems(frankie)).some((t) => /licenses|onboarding/i.test(t)))
    throw new Error(`account menu: ${(await accountMenuItems(frankie)).join(', ')}`);
});

await step('managers find them under Manage, with Closing checklists, not on the top bar', async () => {
  const bar = (await mgr.getByRole('navigation').getByRole('link').allInnerTexts()).map((t) => t.trim());
  if (bar.includes('Checklists') || bar.includes('Licenses')) throw new Error(`top bar: ${bar.join(', ')}`);
  const manage = await menuItems(mgr, 'Manage');
  for (const name of ['Staff', 'Offices'])
    if (!manage.includes(name)) throw new Error(`Manage lacks ${name}: ${manage.join(', ')}`);
  // Each heading opens a strip of tabs to its screens.
  const tabs = async (section) =>
    (await mgr.getByRole('navigation', { name: `${section} screens` }).getByRole('link').allInnerTexts()).map((t) => t.trim());
  await goToManage(mgr, 'Licenses');
  const people = await tabs('Staff');
  // Staff carries the job roles, so a manager has it too (October 2026).
  for (const name of ['Onboarding & Offboarding', 'Licenses', 'Staff'])
    if (!people.includes(name)) throw new Error(`People lacks ${name}: ${people.join(', ')}`);
  await goToManage(mgr, 'Closing checklists');
  const offices = await tabs('Offices');
  if (!offices.includes('Closing checklists')) throw new Error(`Offices lacks Closing checklists: ${offices.join(', ')}`);
  // Leave Closing, so opening it later loads the records afresh.
  await goTo(mgr, 'Home');
});

await step('a Provider sees their own in the account menu', async () => {
  const roles = (await call(mgr, '/job-roles')).body;
  const provider = roles.find((r) => r.name === 'Provider');
  if (!provider.seesOwnPersonnelTabs) throw new Error('Provider does not have the flag');
  const me = (await call(frankie, '/profile')).body;
  const added = await call(mgr, `/job-roles/${provider.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ employeeId: me.id }),
  });
  if (added.status >= 300) throw new Error(`adding answered ${added.status}`);
  await frankie.reload({ waitUntil: 'networkidle' });
  const mine = await accountMenuItems(frankie);
  for (const name of ['Your licenses', 'Your onboarding'])
    if (!mine.includes(name)) throw new Error(`account menu lacks ${name}: ${mine.join(', ')}`);
  await call(mgr, `/job-roles/${provider.id}/members/${me.id}`, { method: 'DELETE' });
  await frankie.reload({ waitUntil: 'networkidle' });
});

// ------------------------------------------------------------------ at clock-out

const nowInNJ = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date());
const trashDay = nowInNJ === 'Tue' || nowInNJ === 'Thu';

// Front Desk's own list has no supply line, so the manager gives it one the
// suite can tick (the MA list's gloves are not Frankie's any more).
await step('set-up: a supply line on the Front Desk list', async () => {
  const templates = (await call(mgr, '/closing/templates')).body;
  const everyone = templates.find((r) => r.name === 'Front Desk').closingSections.find((s) => s.title === 'Everyone');
  if (everyone.items.some((i) => i.text === 'Gloves S/M/L')) return; // a rerun on the same database
  const made = await call(mgr, '/closing/items', {
    method: 'POST',
    body: JSON.stringify({ sectionId: everyone.id, kind: 'SUPPLY', text: 'Gloves S/M/L' }),
  });
  if (made.status !== 201) throw new Error(`adding the line answered ${made.status} ${JSON.stringify(made.body)}`);
});

await step('clocking in, then Clock out, opens the closing checklist instead of clocking out', async () => {
  await frankie.getByRole('button', { name: 'Clock in' }).click();
  await frankie.getByText('On the clock').waitFor({ timeout: 20000 });
  await frankie.getByRole('button', { name: 'Clock out', exact: true }).click();
  await frankie.getByTestId('closing-form').waitFor({ timeout: 10000 });
  await frankie.getByText('On the clock').waitFor({ timeout: 5000 });
});

const form = () => frankie.getByTestId('closing-form');

await step('only the main job role’s list is there (Front Desk, not Medical Assistant), with rules as reminders rather than ticks', async () => {
  const reminders = form().getByTestId('closing-reminders');
  await reminders.getByText(/Never leave a patient on hold longer than 1 minute/).waitFor({ timeout: 5000 });
  await form().getByTestId('closing-section-Everyone').waitFor({ timeout: 5000 });
  // Frankie is Front Desk first and Medical Assistant second (October 2026,
  // Dominguez: "Celeste should not be getting checklists"): no MA lines.
  if (await reminders.getByText(/If vitals are out of the normal range/).count()) throw new Error('the MA rules are on a Front Desk list');
  for (const section of ['Check In', 'Before checking out', 'Inventory - tick anything we need more of'])
    if (await form().getByTestId(`closing-section-${section}`).count()) throw new Error(`${section} (MA) is on the list`);
  if ((await form().getByRole('checkbox', { name: /Never leave a patient/ }).count()) > 0)
    throw new Error('a rule can be ticked');
});

await step('a desk section appears only once they say they worked it', async () => {
  if ((await form().getByTestId('closing-section-Outdesk').count()) > 0) throw new Error('Outdesk shown unasked');
  await form().getByRole('button', { name: 'Outdesk' }).click();
  await form().getByTestId('closing-section-Outdesk').waitFor({ timeout: 5000 });
  if ((await form().getByTestId('closing-section-Check In Desk').count()) > 0)
    throw new Error('Check In Desk shown when not worked');
});

await step('there is nowhere to type words - ticks and numbers only', async () => {
  const free = await form().locator('textarea, input[type=text], input:not([type])').count();
  if (free > 0) throw new Error(`${free} free-text boxes on the checklist`);
});

await step('it fits a phone', async () => {
  const wide = await frankie.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (wide) throw new Error('the checklist scrolls sideways on a phone');
});

await step('ticks, numbers and a supply go with the clock-out, and it clocks out', async () => {
  await form().getByText('TVs and scanners powered off').click();
  await form().getByLabel('Calls answered').fill('12');
  await form().getByLabel('Calls placed').fill('3');
  await form().getByText('Gloves S/M/L', { exact: true }).click();
  await form().getByTestId('closing-progress').getByText(/^1 of \d+ ticked$/).waitFor({ timeout: 5000 });
  const sent = frankie.waitForRequest((r) => r.url().endsWith('/api/time-entries/clock-out'));
  await form().getByRole('button', { name: 'Clock out', exact: true }).click();
  const body = JSON.parse((await sent).postData() ?? '{}');
  if (body.closing?.positions?.length !== 1) throw new Error(`positions sent: ${JSON.stringify(body.closing?.positions)}`);
  if (!body.closing.counts.some((c) => c.value === 12)) throw new Error('calls answered not sent');
  if (body.closing.needed?.length !== 1) throw new Error('the supply was not sent');
  await frankie.getByText('Not clocked in').waitFor({ timeout: 20000 });
});
await frankie.screenshot({ path: `${OUT}/130-closing-done.png`, fullPage: true });

await step('staff cannot read the records, the restock list or the templates', async () => {
  for (const path of ['/closing/records?date=2026-01-01', '/closing/supplies', '/closing/templates']) {
    const { status } = await call(frankie, path);
    if (status !== 403) throw new Error(`${path} answered ${status}`);
  }
});

// ------------------------------------------------------------------ managers

const openClosing = async () => {
  await goToManage(mgr, 'Closing checklists');
  await mgr.getByRole('heading', { name: 'Closing checklists' }).waitFor({ timeout: 15000 });
};

await step('the manager sees the clock-out, what was missed, and the short call count', async () => {
  await openClosing();
  const card = mgr.getByTestId('closing-record-Frankie Front-Desk');
  await card.waitFor({ timeout: 10000 });
  await card.getByText(/\d+ missed/).waitFor({ timeout: 5000 });
  await card.getByText(/Outdesk/).first().waitFor({ timeout: 5000 });
  await card.getByText('12 (target 20)').waitFor({ timeout: 5000 });
  await card.getByText(/Asked for:.*Gloves S\/M\/L/).waitFor({ timeout: 5000 });
});

await step('the manager chooses themselves to look after closing checklists', async () => {
  await mgr.getByRole('button', { name: 'Who looks after them', exact: true }).click();
  const card = mgr.getByTestId('topic-assignees-CLOSING');
  await card.waitFor({ timeout: 10000 });
  await card.getByLabel(/Morgan Manager/).check();
  await card.getByRole('button', { name: 'Save' }).click();
  await card.getByText('Saved.', { exact: true }).waitFor({ timeout: 10000 });
  const chosen = (await call(mgr, '/digest-settings/assignees')).body;
  const me = (await call(mgr, '/employees/me')).body;
  if (!chosen.CLOSING.includes(me.id)) throw new Error(`CLOSING: ${JSON.stringify(chosen.CLOSING)}`);
  await mgr.getByRole('button', { name: 'Clock-outs', exact: true }).click();
});

await step('the banner and the nightly round-up both carry it', async () => {
  await mgr.getByTestId('needs-attention').getByText(/Closing checklists with something missed/).waitFor({ timeout: 10000 });
  const attention = (await call(mgr, '/attention')).body;
  if (!attention.closingGaps.some((line) => /Frankie Front-Desk - North Bergen/.test(line)))
    throw new Error(`closingGaps: ${JSON.stringify(attention.closingGaps)}`);
  if (!attention.suppliesNeeded.some((line) => /North Bergen - 1 to order: Gloves S\/M\/L/.test(line)))
    throw new Error(`suppliesNeeded: ${JSON.stringify(attention.suppliesNeeded)}`);
});
await mgr.screenshot({ path: `${OUT}/131-closing-records.png`, fullPage: true });

await step('clearing the clock-out takes it off the banner and the round-up, and says who cleared it', async () => {
  const card = mgr.getByTestId('closing-record-Frankie Front-Desk');
  await card.getByRole('button', { name: /^Clear / }).click();
  await card.getByTestId('closing-cleared').waitFor({ timeout: 10000 });
  if (!/Cleared by Morgan Manager/.test(await card.getByTestId('closing-cleared').innerText())) throw new Error('no name on the clearing');
  await card.getByText('Cleared', { exact: true }).waitFor({ timeout: 5000 });
  const attention = (await call(mgr, '/attention')).body;
  if (attention.closingGaps.some((line) => /Frankie Front-Desk/.test(line))) throw new Error('still in the round-up after clearing');
  // Somebody not chosen cannot clear one.
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const admin = await adminCtx.newPage();
  await signIn(admin, 'admin@domihealthcare.com');
  const records = (await call(admin, `/closing/records?date=${new Date().toISOString().slice(0, 10)}`)).body;
  if (!Array.isArray(records) || records.some((r) => r.canClear)) throw new Error('somebody not chosen may clear');
  await adminCtx.close();
});

await step('the restock list has it under its office, until it is marked ordered', async () => {
  await mgr.getByRole('button', { name: 'Restock', exact: true }).click();
  const office = mgr.getByTestId('restock-North Bergen');
  await office.getByText('Gloves S/M/L', { exact: true }).waitFor({ timeout: 10000 });
  await mgr.screenshot({ path: `${OUT}/132-closing-restock.png`, fullPage: true });
  await office.getByRole('button', { name: 'Mark ordered' }).click();
  await mgr.getByText('Ordered in the last two weeks').waitFor({ timeout: 10000 });
  await mgr.getByText('Nothing to order.', { exact: false }).waitFor({ timeout: 5000 });
});

await step('a manager adds a line, and the next clock-out has it', async () => {
  await mgr.getByRole('button', { name: 'Edit lists', exact: true }).click();
  const everyone = mgr.getByTestId('closing-role-Front Desk').getByTestId('closing-edit-section-Everyone');
  await everyone.waitFor({ timeout: 10000 });
  await everyone.getByLabel('New line', { exact: true }).fill('Waiting room lights off');
  await everyone.getByRole('button', { name: 'Add', exact: true }).click();
  await mgr.getByText('Line added.', { exact: true }).waitFor({ timeout: 10000 });
  await everyone.getByText('Waiting room lights off').waitFor({ timeout: 5000 });
  await mgr.screenshot({ path: `${OUT}/133-closing-edit.png`, fullPage: true });

  await frankie.getByRole('button', { name: 'Clock in' }).click();
  await frankie.getByText('On the clock').waitFor({ timeout: 20000 });
  const mine = (await call(frankie, '/closing/mine')).body;
  if (!mine.sections.some((s) => s.items.some((i) => i.text === 'Waiting room lights off')))
    throw new Error('the new line is not on the next checklist');
});

await step('made Medical Assistant first, Frankie gets the MA list instead (with its Tuesday and Thursday trash line); put back, the Front Desk one', async () => {
  const roles = (await call(mgr, '/job-roles')).body;
  const fd = roles.find((r) => r.name === 'Front Desk');
  const ma = roles.find((r) => r.name === 'Medical Assistant');
  const me = (await call(frankie, '/employees/me')).body;
  const swap = await call(mgr, `/job-roles/${ma.id}/members/${me.id}/main`, { method: 'PUT' });
  if (swap.status !== 200) throw new Error(`making MA the main role answered ${swap.status}`);
  const asMa = (await call(frankie, '/closing/mine')).body;
  if (!asMa.sections.some((s) => s.jobRole === 'Medical Assistant') || asMa.sections.some((s) => s.jobRole === 'Front Desk'))
    throw new Error(`as an MA: ${asMa.sections.map((s) => `${s.jobRole}/${s.title}`).join(', ')}`);
  // The MA list's North Bergen trash line is a Tuesday and Thursday line.
  const trashShown = asMa.sections.some((s) => s.items.some((i) => i.text === 'Trash taken out'));
  if (trashShown !== trashDay) throw new Error(`trash line shown=${trashShown} on a ${nowInNJ}`);
  await call(mgr, `/job-roles/${fd.id}/members/${me.id}/main`, { method: 'PUT' });
  const asFd = (await call(frankie, '/closing/mine')).body;
  if (asFd.sections.some((s) => s.jobRole === 'Medical Assistant')) throw new Error('still the MA list');
});

await step('clocking out without the checklist works, is recorded as not filled in, and rings the chosen manager', async () => {
  await frankie.getByRole('button', { name: 'Clock out', exact: true }).click();
  await form().getByRole('button', { name: 'Clock out without the checklist' }).click();
  await frankie.getByText('Not clocked in').waitFor({ timeout: 20000 });
  await mgr.getByRole('button', { name: 'Clock-outs', exact: true }).click();
  await mgr.getByText('Not filled in', { exact: true }).waitFor({ timeout: 10000 });
  const bell = (await call(mgr, '/notifications')).body;
  if (!bell.items.some((n) => n.kind === 'CLOSING' && /Frankie Front-Desk clocked out without the closing checklist/.test(n.title)))
    throw new Error(`no bell note: ${JSON.stringify(bell.items.slice(0, 3).map((n) => n.title))}`);
});

await step('somebody with no checklist clocks out as before', async () => {
  const mine = (await call(mgr, '/closing/mine')).body;
  if (mine.sections.length !== 0) throw new Error('the manager has a closing checklist');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CLOSING CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
