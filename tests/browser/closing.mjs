import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// Closing checklists: what Front Desk and MAs confirm when they clock out, the
// manager's view of them and of the restock list, editing the lists — and
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
  await page.getByRole('button', { name: label, exact: true }).click();
  const names = await page.getByRole('navigation').getByRole('link').allInnerTexts();
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

const mgrCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const mgr = await mgrCtx.newPage();
mgr.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

// ------------------------------------------------------------------ the menus

await step('Front Desk and MA staff see no Licenses or Onboarding anywhere', async () => {
  const bar = await frankie.getByRole('navigation').getByRole('link').allInnerTexts();
  if (bar.some((t) => /Checklists|Licenses/.test(t))) throw new Error(`top bar: ${bar.join(', ')}`);
  const team = await menuItems(frankie, 'Team');
  if (team.some((t) => /licenses|onboarding/i.test(t))) throw new Error(`Team menu: ${team.join(', ')}`);
});

await step('managers find them under Manage, with Closing checklists, not on the top bar', async () => {
  const bar = (await mgr.getByRole('navigation').getByRole('link').allInnerTexts()).map((t) => t.trim());
  if (bar.includes('Checklists') || bar.includes('Licenses')) throw new Error(`top bar: ${bar.join(', ')}`);
  const manage = await menuItems(mgr, 'Manage');
  for (const name of ['Closing checklists', 'Onboarding & Offboarding', 'Licenses'])
    if (!manage.includes(name)) throw new Error(`Manage lacks ${name}: ${manage.join(', ')}`);
});

await step('a Provider sees their own under Team', async () => {
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
  const team = await menuItems(frankie, 'Team');
  for (const name of ['Your licenses', 'Your onboarding'])
    if (!team.includes(name)) throw new Error(`Team lacks ${name}: ${team.join(', ')}`);
  await call(mgr, `/job-roles/${provider.id}/members/${me.id}`, { method: 'DELETE' });
  await frankie.reload({ waitUntil: 'networkidle' });
});

// ------------------------------------------------------------------ at clock-out

const nowInNJ = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date());
const trashDay = nowInNJ === 'Tue' || nowInNJ === 'Thu';

await step('clocking in, then Clock out, opens the closing checklist instead of clocking out', async () => {
  await frankie.getByRole('button', { name: 'Clock in' }).click();
  await frankie.getByText('On the clock').waitFor({ timeout: 20000 });
  await frankie.getByRole('button', { name: 'Clock out', exact: true }).click();
  await frankie.getByTestId('closing-form').waitFor({ timeout: 10000 });
  await frankie.getByText('On the clock').waitFor({ timeout: 5000 });
});

const form = () => frankie.getByTestId('closing-form');

await step('both roles’ lists are there, with rules as reminders rather than ticks', async () => {
  const reminders = form().getByTestId('closing-reminders');
  await reminders.getByText(/Never leave a patient on hold longer than 1 minute/).waitFor({ timeout: 5000 });
  await reminders.getByText(/If vitals are out of the normal range/).waitFor({ timeout: 5000 });
  for (const section of ['Everyone', 'Check In', 'Before checking out', 'Inventory — tick anything we need more of'])
    await form().getByTestId(`closing-section-${section}`).waitFor({ timeout: 5000 });
  if ((await form().getByRole('checkbox', { name: /If vitals are out/ }).count()) > 0)
    throw new Error('a rule can be ticked');
});

await step('a desk section appears only once they say they worked it', async () => {
  if ((await form().getByTestId('closing-section-Outdesk').count()) > 0) throw new Error('Outdesk shown unasked');
  await form().getByRole('button', { name: 'Outdesk' }).click();
  await form().getByTestId('closing-section-Outdesk').waitFor({ timeout: 5000 });
  if ((await form().getByTestId('closing-section-Check In Desk').count()) > 0)
    throw new Error('Check In Desk shown when not worked');
});

await step('the North Bergen trash line shows only on a Tuesday or Thursday', async () => {
  const shown = (await form().getByText('Trash taken out', { exact: true }).count()) > 0;
  if (shown !== trashDay) throw new Error(`shown=${shown} on a ${nowInNJ}`);
});

await step('there is nowhere to type words — ticks and numbers only', async () => {
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
  await mgr.getByRole('button', { name: 'Manage', exact: true }).click();
  await mgr.getByRole('navigation').getByRole('link', { name: 'Closing checklists', exact: true }).click();
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

await step('the banner and the nightly round-up both carry it', async () => {
  await mgr.getByTestId('needs-attention').getByText(/Closing checklists with something missed/).waitFor({ timeout: 10000 });
  const attention = (await call(mgr, '/attention')).body;
  if (!attention.closingGaps.some((line) => /Frankie Front-Desk — North Bergen/.test(line)))
    throw new Error(`closingGaps: ${JSON.stringify(attention.closingGaps)}`);
  if (!attention.suppliesNeeded.some((line) => /North Bergen — 1 to order: Gloves S\/M\/L/.test(line)))
    throw new Error(`suppliesNeeded: ${JSON.stringify(attention.suppliesNeeded)}`);
});
await mgr.screenshot({ path: `${OUT}/131-closing-records.png`, fullPage: true });

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

await step('clocking out without the checklist works, and is recorded as not filled in', async () => {
  await frankie.getByRole('button', { name: 'Clock out', exact: true }).click();
  await form().getByRole('button', { name: 'Clock out without the checklist' }).click();
  await frankie.getByText('Not clocked in').waitFor({ timeout: 20000 });
  await mgr.getByRole('button', { name: 'Clock-outs', exact: true }).click();
  await mgr.getByText('Not filled in', { exact: true }).waitFor({ timeout: 10000 });
});

await step('somebody with no checklist clocks out as before', async () => {
  const mine = (await call(mgr, '/closing/mine')).body;
  if (mine.sections.length !== 0) throw new Error('the manager has a closing checklist');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CLOSING CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
