import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { openAccountMenu } from './account-menu.mjs';

// Provider productivity (September 2026): managers work out each provider's
// patients expected and seen per interval, with a multiplier on the
// difference, and publish it; only that provider can then read it. The
// numbers below are the practice's own sheet (Patients & Providers): 169 + 154
// against 300 at $50 is $1,150, and 74 + 210 is 16 short, -$800.
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
let mgr;
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); await mgr?.screenshot({ path: `${OUT}/productivity-fail.png`, fullPage: true }).catch(() => {}); }
};

const signIn = async (page, email, password = 'shift-change-2026') => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Max is seeded with a temporary password, to be changed on first sign-in.
  const unlocked = page.getByRole('navigation').getByRole('link', { name: /^Schedule/ });
  const mustChange = page.getByText('Choose a new password');
  await unlocked.or(mustChange).first().waitFor({ timeout: 20000 });
  if (await mustChange.isVisible()) {
    await page.getByLabel('Temporary password').fill('shift-change-2026');
    await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
    await page.getByLabel('Confirm new password').fill('harbour lantern 7');
    await page.getByRole('button', { name: 'Change password' }).click();
    await unlocked.waitFor({ timeout: 15000 });
  }
};
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
/// A provider's own productivity is in the account menu (October 2026).
const accountMenuItems = async (page) => {
  await openAccountMenu(page);
  const names = await page.getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  return names.map((n) => n.trim());
};

mgr = await (await browser.newContext({ viewport: { width: 1280, height: 1400 } })).newPage();
const doc = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const other = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const admin = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
for (const page of [mgr, doc, other, admin]) page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');
await signIn(doc, 'frontdesk@domihealthcare.com'); // Frankie is our provider here
await signIn(other, 'ma@domihealthcare.com');
await signIn(admin, 'admin@domihealthcare.com');

const frankie = (await call(doc, '/profile')).body;
const providerRole = (await call(admin, '/job-roles')).body.find((r) => r.name === 'Provider');
const joined = await call(admin, `/job-roles/${providerRole.id}/members`, {
  method: 'POST',
  body: JSON.stringify({ employeeId: frankie.id }),
});
const max = (await call(other, '/profile')).body;
if (joined.status >= 300) throw new Error(`making Frankie a Provider answered ${joined.status}`);

const openPage = async () => {
  await mgr.goto(`${BASE}/productivity`, { waitUntil: 'networkidle' });
  await mgr.getByRole('heading', { name: 'Provider productivity' }).waitFor({ timeout: 15000 });
};
const choose = async (label) => {
  await mgr.getByLabel('Provider', { exact: true }).selectOption({ label });
};

await step('a manager has no say in it until an admin chooses them: no menu item, and refused', async () => {
  if ((await menuItems(mgr, 'Manage')).includes('Provider productivity')) throw new Error('shown before access was given');
  await mgr.goto(`${BASE}/productivity`, { waitUntil: 'networkidle' });
  await mgr.getByText('Provider productivity is only for the people an admin has chosen.').waitFor({ timeout: 10000 });
  if ((await mgr.getByTestId('productivity-access').count()) > 0) throw new Error('a manager sees the access list');
  for (const path of ['/productivity/plans', '/productivity/people', '/productivity/access']) {
    const got = await call(mgr, path);
    if (got.status !== 403) throw new Error(`${path} answered ${got.status} to a manager without access`);
  }
});

await step('an admin chooses who: gives Morgan access, and it can be taken away and given back', async () => {
  await admin.goto(`${BASE}/productivity`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId('productivity-access');
  await card.waitFor({ timeout: 10000 });
  await card.getByLabel('Give access to').selectOption({ label: 'Morgan Manager' });
  await card.getByRole('button', { name: 'Give access' }).click();
  await card.getByText('Morgan Manager').waitFor({ timeout: 10000 });
  await card.getByRole('button', { name: 'Take access away from Morgan Manager' }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }).click();
  await card.getByText('Morgan Manager').waitFor({ timeout: 5000 });
  await card.getByRole('button', { name: 'Take access away from Morgan Manager' }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Yes, take it away' }).click();
  await card.getByText('Nobody yet.').waitFor({ timeout: 10000 });
  await card.getByLabel('Give access to').selectOption({ label: 'Morgan Manager' });
  await card.getByRole('button', { name: 'Give access' }).click();
  await card.getByText('Morgan Manager').waitFor({ timeout: 10000 });
});

await step('only admins can change the list', async () => {
  const me = (await call(mgr, '/profile')).body;
  const got = await call(mgr, `/productivity/access/${me.id}`, { method: 'DELETE' });
  if (got.status !== 403) throw new Error(`a manager changing the list answered ${got.status}`);
});

await mgr.reload({ waitUntil: 'networkidle' });

await step('once chosen it is under Manage; an ordinary employee does not have it, and is refused', async () => {
  if (!(await menuItems(mgr, 'Manage')).includes('Provider productivity')) throw new Error('not under Manage');
  const manage = await other.getByRole('button', { name: 'Manage', exact: true }).count();
  if (manage > 0) throw new Error('an employee has a Manage menu');
  await other.goto(`${BASE}/productivity`, { waitUntil: 'networkidle' });
  await other.getByText('Provider productivity is only for the people an admin has chosen.').waitFor({ timeout: 10000 });
  for (const path of ['/productivity/plans', `/productivity/statements?employeeId=${frankie.id}`]) {
    const got = await call(other, path);
    if (got.status !== 403) throw new Error(`${path} answered ${got.status} to an employee`);
  }
});

await openPage();

await step('only people in a provider job role are listed, and non-providers are refused', async () => {
  const names = await mgr.getByLabel('Provider', { exact: true }).locator('option').allInnerTexts();
  if (names.join('|') !== 'Choose somebody…|Frankie Front-Desk') throw new Error(names.join('|'));
  for (const [method, path, body] of [
    ['PUT', `/productivity/plans/${max.id}`, { intervalWeeks: 2, intervalsPerStatement: 1 }],
    ['POST', '/productivity/statements', { employeeId: max.id, startDate: '2026-06-07' }],
  ]) {
    const got = await call(mgr, path, { method, body: JSON.stringify(body) });
    if (got.status !== 400) throw new Error(`${method} ${path} answered ${got.status} for a non-provider`);
  }
});

await step('set up how Frankie is counted, in the sheet’s own terms', async () => {
  await choose('Frankie Front-Desk');
  await mgr.getByRole('button', { name: 'How theirs is counted' }).click();
  await mgr.getByLabel('Interval length').selectOption('2');
  await mgr.getByLabel('Intervals per statement').fill('2');
  await mgr.getByLabel('Expected per interval').fill('150');
  await mgr.getByLabel('Plan multiplier').fill('50');
  await mgr.getByLabel('Categories').fill('In-Office / Hospital');
  await mgr.getByText(/150 patients expected every 2 weeks \(300 over 2 intervals\)/).waitFor({ timeout: 5000 });
  await mgr.getByRole('button', { name: 'Save', exact: true }).click();
  await mgr.getByText('Saved.').waitFor({ timeout: 10000 });
  await openPage();
  await choose('Frankie Front-Desk ✓');
});

await step('the first statement needs a first day; it lays out two intervals from the plan', async () => {
  await mgr.getByRole('button', { name: '+ New statement' }).click();
  if (!(await mgr.getByRole('button', { name: 'Start', exact: true }).isDisabled())) throw new Error('Start was enabled with no day');
  await mgr.getByLabel('First day').fill('2026-06-07'); // a Sunday
  await mgr.getByRole('button', { name: 'Start', exact: true }).click();
  await mgr.getByLabel('Interval 2 to').waitFor({ timeout: 10000 });
  const to2 = await mgr.getByLabel('Interval 2 to').inputValue();
  if (to2 !== '2026-07-04') throw new Error(`second interval ends ${to2}`);
  if ((await mgr.getByLabel('Interval 1 expected').inputValue()) !== '150') throw new Error('target not copied from the plan');
  if ((await mgr.getByLabel('Multiplier', { exact: true }).inputValue()) !== '50') throw new Error('multiplier not copied');
});

await step('typing the sheet’s counts works out 323 against 300: +23, $1,150.00', async () => {
  await mgr.getByLabel('Interval 1 patients').fill('169');
  await mgr.getByLabel('Interval 2 patients').fill('154');
  const worked = mgr.getByLabel('Worked out');
  await worked.getByText('300', { exact: true }).waitFor({ timeout: 5000 });
  await worked.getByText('323', { exact: true }).waitFor({ timeout: 5000 });
  await worked.getByText('+23', { exact: true }).waitFor({ timeout: 5000 });
  await worked.getByText('$1,150.00', { exact: true }).first().waitFor({ timeout: 5000 });
  await mgr.getByLabel('Note').fill('Paid 07.05.24');
  await mgr.screenshot({ path: `${OUT}/productivity-editor.png` });
  await mgr.getByRole('button', { name: 'Save draft' }).click();
  const card = mgr.getByTestId('productivity-2026-06-07');
  await card.getByText('Draft', { exact: true }).waitFor({ timeout: 10000 });
  await card.getByText('$1,150.00').first().waitFor({ timeout: 5000 });
  await card.getByText('Paid 07.05.24').waitFor({ timeout: 5000 });
});

await step('a bad number is refused before it is sent', async () => {
  await mgr.getByTestId('productivity-2026-06-07').getByRole('button', { name: 'Edit' }).click();
  await mgr.getByLabel('Interval 1 patients').fill('12x');
  if (!(await mgr.getByRole('button', { name: 'Save draft' }).isDisabled())) throw new Error('saved a non-number');
  await mgr.getByLabel('Interval 1 patients').fill('169');
  await mgr.getByRole('button', { name: 'Cancel' }).click();
});

await step('while it is a draft the provider sees nothing at all', async () => {
  await doc.reload({ waitUntil: 'networkidle' });
  if ((await accountMenuItems(doc)).includes('Your productivity')) throw new Error('the link shows on a draft');
  const mine = await call(doc, '/productivity/mine');
  if (mine.status !== 200 || mine.body.length !== 0) throw new Error(`mine: ${JSON.stringify(mine)}`);
});

await step('publishing asks first, and then the provider can read it', async () => {
  await mgr.getByTestId('productivity-2026-06-07').getByRole('button', { name: 'Publish' }).click();
  await mgr.getByRole('alertdialog').getByRole('button', { name: 'Yes, publish' }).click();
  await mgr.getByTestId('productivity-2026-06-07').getByText('Published', { exact: true }).waitFor({ timeout: 10000 });
  await doc.reload({ waitUntil: 'networkidle' });
  if (!(await accountMenuItems(doc)).includes('Your productivity')) throw new Error('no link for the provider');
  await doc.goto(`${BASE}/my-productivity`, { waitUntil: 'networkidle' });
  const card = doc.getByTestId('productivity-2026-06-07');
  await card.getByText('$1,150.00').first().waitFor({ timeout: 10000 });
  await card.getByText('+23').first().waitFor({ timeout: 5000 });
  await card.getByText('Paid 07.05.24').waitFor({ timeout: 5000 });
  if ((await card.getByText('Published', { exact: true }).count()) > 0) throw new Error('the provider sees manager status');
  await doc.screenshot({ path: `${OUT}/productivity-provider.png` });
});

await step('the bell tells them, without any numbers in it', async () => {
  const inbox = await call(doc, '/notifications');
  const item = inbox.body.items.find((n) => n.kind === 'PRODUCTIVITY');
  if (!item) throw new Error('no notification');
  if (/\$|1,?150|323/.test(JSON.stringify(item))) throw new Error(`numbers in the bell: ${JSON.stringify(item)}`);
  if (item.link !== '/my-productivity') throw new Error(`links to ${item.link}`);
});

await step('the next statement follows on by itself; a short period stays negative: 284 vs 300 = -$800.00', async () => {
  await mgr.getByRole('button', { name: '+ New statement' }).click();
  await mgr.getByRole('button', { name: 'Start', exact: true }).click();
  await mgr.getByLabel('Interval 1 from').waitFor({ timeout: 10000 });
  if ((await mgr.getByLabel('Interval 1 from').inputValue()) !== '2026-07-05') throw new Error('did not follow the last statement');
  await mgr.getByLabel('Interval 1 patients').fill('74');
  await mgr.getByLabel('Interval 2 patients').fill('210');
  const worked = mgr.getByLabel('Worked out');
  await worked.getByText('−16', { exact: true }).waitFor({ timeout: 5000 });
  await worked.getByText('-$800.00', { exact: true }).waitFor({ timeout: 5000 });
  await mgr.getByLabel('Note').fill('Paid with 08.15.25');
  await mgr.getByLabel('Paid on').fill('2026-08-15');
  await mgr.getByRole('button', { name: 'Save and publish' }).click();
  const card = mgr.getByTestId('productivity-2026-07-05');
  await card.getByText('Published', { exact: true }).waitFor({ timeout: 10000 });
  await card.getByText('-$800.00').first().waitFor({ timeout: 5000 });
});

await step('the running balance: -$800 is carried into the next period, which pays $1,700 not $2,500', async () => {
  await mgr.getByRole('button', { name: '+ New statement' }).click();
  await mgr.getByRole('button', { name: 'Start', exact: true }).click();
  await mgr.getByLabel('Interval 1 from').waitFor({ timeout: 10000 });
  if ((await mgr.getByLabel('Interval 1 from').inputValue()) !== '2026-08-02') throw new Error('did not follow on');
  await mgr.getByLabel('Interval 1 patients').fill('180');
  await mgr.getByLabel('Interval 2 patients').fill('170');
  const worked = mgr.getByLabel('Worked out');
  await worked.getByText('$2,500.00', { exact: true }).waitFor({ timeout: 5000 });
  await worked.getByText('To pay (after -$800.00 brought forward)').waitFor({ timeout: 5000 });
  await worked.getByText('$1,700.00', { exact: true }).waitFor({ timeout: 5000 });
  await mgr.getByRole('button', { name: 'Save and publish' }).click();
  const card = mgr.getByTestId('productivity-2026-08-02');
  await card.getByText('Brought forward').waitFor({ timeout: 10000 });
  await card.getByText('$1,700.00').first().waitFor({ timeout: 5000 });
  // The short period itself pays nothing, and says what is carried.
  const short = mgr.getByTestId('productivity-2026-07-05');
  await short.getByText('Carried forward').waitFor({ timeout: 5000 });
  await short.getByText('$0.00').first().waitFor({ timeout: 5000 });
  // The provider sees the same.
  await doc.goto(`${BASE}/my-productivity`, { waitUntil: 'networkidle' });
  const theirs = doc.getByTestId('productivity-2026-08-02');
  await theirs.getByText('Brought forward').waitFor({ timeout: 10000 });
  await theirs.getByText('$1,700.00').first().waitFor({ timeout: 5000 });
  await doc.getByText(/\$2,850\.00 in all/).waitFor({ timeout: 5000 });
});

await step('two statements may not cover the same days', async () => {
  await mgr.getByRole('button', { name: '+ New statement' }).click();
  await mgr.getByLabel('First day').fill('2026-06-20');
  await mgr.getByRole('button', { name: 'Start', exact: true }).click();
  await mgr.getByText(/That overlaps another statement/).waitFor({ timeout: 10000 });
  await mgr.getByRole('button', { name: 'Cancel' }).click();
});

await step('the provider reads only their own, with this year’s total', async () => {
  await doc.reload({ waitUntil: 'networkidle' });
  const mine = (await call(doc, '/productivity/mine')).body;
  if (mine.length !== 3) throw new Error(`${mine.length} statements`);
  if (mine.some((s) => 'employee' in s)) throw new Error('names another person');
  await doc.getByText(/2026 so far:/).waitFor({ timeout: 5000 });
  await doc.getByText(/\$2,850\.00 in all/).waitFor({ timeout: 5000 });
});

await step('nobody else can read them: not a colleague, not by asking for Frankie', async () => {
  const theirs = await call(other, '/productivity/mine');
  if (theirs.body.length !== 0) throw new Error('a colleague sees a statement');
  const sneaky = await call(other, `/productivity/mine?employeeId=${frankie.id}`);
  if (sneaky.body.length !== 0) throw new Error('employeeId was honoured');
  await other.goto(`${BASE}/my-productivity`, { waitUntil: 'networkidle' });
  await other.getByText('Nothing has been published for you yet.').waitFor({ timeout: 10000 });
});

await step('unpublishing takes it away from the provider again', async () => {
  const card = mgr.getByTestId('productivity-2026-07-05');
  await card.getByRole('button', { name: 'Unpublish' }).click();
  await mgr.getByRole('alertdialog').getByRole('button', { name: 'Yes, unpublish' }).click();
  await card.getByText('Draft', { exact: true }).waitFor({ timeout: 10000 });
  const mine = (await call(doc, '/productivity/mine')).body;
  if (mine.length !== 2) throw new Error(`${mine.length} left for the provider`);
});

await call(admin, `/job-roles/${providerRole.id}/members`, {
  method: 'POST',
  body: JSON.stringify({ employeeId: max.id }),
});
await mgr.reload({ waitUntil: 'networkidle' });

await step('a provider with no plan still works: a bare count, no target, no money', async () => {
  await choose('Max Assistant');
  await mgr.getByRole('button', { name: '+ New statement' }).click();
  await mgr.getByLabel('First day').fill('2026-06-07');
  await mgr.getByRole('button', { name: 'Start', exact: true }).click();
  await mgr.getByLabel('Interval 1 patients').fill('80');
  if ((await mgr.getByLabel('Worked out').getByText('Expected').count()) > 0) throw new Error('shows a target');
  if ((await mgr.getByLabel('Worked out').getByText('Amount').count()) > 0) throw new Error('shows money');
  await mgr.getByRole('button', { name: 'Save draft' }).click();
  const card = mgr.getByTestId('productivity-2026-06-07');
  await card.getByText('80', { exact: true }).first().waitFor({ timeout: 10000 });
  for (const word of ['Expected', 'Difference', 'Multiplier', 'Amount']) {
    if ((await card.getByText(word, { exact: true }).count()) > 0) throw new Error(`shows ${word}`);
  }
});

await step('deleting asks first', async () => {
  await mgr.getByTestId('productivity-2026-06-07').getByRole('button', { name: 'Delete' }).click();
  await mgr.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }).click();
  await mgr.getByTestId('productivity-2026-06-07').waitFor({ timeout: 5000 });
  await mgr.getByTestId('productivity-2026-06-07').getByRole('button', { name: 'Delete' }).click();
  await mgr.getByRole('alertdialog').getByRole('button', { name: 'Yes, delete it' }).click();
  await mgr.getByText('No statements yet for them.').waitFor({ timeout: 10000 });
});

await step('phone width: the statement view has no sideways scroll', async () => {
  await doc.setViewportSize({ width: 390, height: 800 });
  await doc.goto(`${BASE}/my-productivity`, { waitUntil: 'networkidle' });
  await doc.getByTestId('productivity-2026-06-07').waitFor({ timeout: 10000 });
  const wide = await doc.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (wide) throw new Error('the page scrolls sideways');
  await doc.screenshot({ path: `${OUT}/productivity-phone.png` });
});

// Clean up the membership this suite added.
await call(admin, `/job-roles/${providerRole.id}/members/${frankie.id}`, { method: 'DELETE' });
await call(admin, `/job-roles/${providerRole.id}/members/${max.id}`, { method: 'DELETE' });
await browser.close();
if (errors.length) {
  console.log(`\n${errors.length} failing`);
  process.exit(1);
}
