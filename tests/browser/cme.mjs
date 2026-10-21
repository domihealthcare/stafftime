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
 * CME requests (October 2026, Dominguez: "a CME reimbursement submission form
 * for providers for managers to approve ... it's to approve a cme
 * activity/event", with a yearly allowance per provider). A provider asks,
 * with what it will cost; a manager approves (at another amount), declines
 * with a reason or records it paid back, and sets the allowance. Going past
 * the allowance warns, never refuses. Nothing is uploaded.
 *
 * Max becomes a provider for the suite (the seed puts the job roles back);
 * run-all.sh removes the requests and allowances.
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
const nextYear = Number(today.slice(0, 4)) + 1;
const FIRST = `${nextYear}-03-03`;
const LAST = `${nextYear}-03-05`;

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const max = await signIn('ma@domihealthcare.com');
let maxId;

await step('before being a provider, it is not for them', async () => {
  const mine = await call(max, '/cme/mine');
  if (mine.status !== 200 || mine.body.isProvider !== false) throw new Error(JSON.stringify(mine));
  const asked = await call(max, '/cme', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Not a provider',
      format: 'ONLINE',
      startsOn: FIRST,
      endsOn: FIRST,
      registrationCents: 100,
      travelCents: 0,
      lodgingCents: 0,
      otherCents: 0,
    }),
  });
  if (asked.status !== 403) throw new Error(`asking answered ${asked.status}`);
  if (await accountMenuHas(max, 'Your CME')) throw new Error('the menu offers Your CME');
  if ((await call(max, '/cme')).status !== 403) throw new Error('staff can read everybody’s');
});

await step('set-up: Max becomes a provider', async () => {
  const provider = (await call(admin, '/job-roles')).body.find((r) => r.name === 'Provider');
  maxId = (await call(max, '/profile')).body.id;
  const joined = await call(admin, `/job-roles/${provider.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ employeeId: maxId }),
  });
  if (joined.status >= 300) throw new Error(`joining answered ${joined.status}`);
});

await step('a manager sets Max’s yearly allowance on Manage → People → CME', async () => {
  await goToManage(manager, 'CME');
  await manager.getByRole('heading', { name: 'CME', level: 1 }).waitFor({ timeout: 10000 });
  const card = manager.getByTestId('cme-allowances');
  await card.getByLabel('CME allowance a year for Max Assistant').fill('1000');
  await card.getByRole('listitem').filter({ hasText: 'Max Assistant' }).getByRole('button', { name: 'Save' }).click();
  await manager.getByText('Allowance saved for Max Assistant.').waitFor();
});

await step('Max asks from Your CME, and is told when it goes past the allowance', async () => {
  await max.reload({ waitUntil: 'networkidle' });
  await pickFromAccountMenu(max, 'Your CME');
  await max.getByRole('heading', { name: 'CME', level: 1 }).waitFor({ timeout: 10000 });
  await max.getByRole('button', { name: '+ Ask for a CME activity' }).click();
  const form = max.getByTestId('cme-ask');
  await form.getByLabel('Activity or event').fill('AAFP Family Medicine Experience');
  await form.getByLabel('Who runs it').fill('AAFP');
  await form.getByLabel('Where').fill('Orlando, FL');
  await form.getByLabel('First day').fill(FIRST);
  await form.getByLabel('Last day').fill(LAST);
  await form.getByLabel('CME credits').fill('20');
  await form.getByLabel('Registration').fill('800');
  await form.getByLabel('Travel').fill('300');
  await form.getByLabel('Lodging').fill('$450.50');
  const total = form.getByTestId('cme-total');
  await total.getByText('$1,550.50').waitFor();
  if (!(await total.innerText()).includes(`goes $550.50 past the $1,000.00 allowance for ${nextYear}`)) {
    throw new Error(await total.innerText());
  }
  if ((await max.locator('input[type=file]').count()) !== 0) throw new Error('a file input');
  await max.screenshot({ path: `${OUT}/cme-ask.png`, fullPage: true });
  await form.getByRole('button', { name: 'Send for approval' }).click();
  await max.getByText('Sent. The managers have been told').waitFor();
  await max.getByTestId('your-cme').getByText('Waiting for a decision', { exact: true }).waitFor();
});

await step('the managers hear on the bell, and it is in the round-up to decide', async () => {
  const bell = await call(manager, '/notifications');
  const items = bell.body.items ?? bell.body;
  if (!items.some((n) => n.title === 'Max Assistant asked for CME approval')) {
    throw new Error(JSON.stringify(items.slice(0, 3)));
  }
  const attention = await call(manager, '/attention');
  const line = attention.body.cmeWaiting?.[0] ?? '';
  if (!line.includes('Max Assistant - AAFP Family Medicine Experience') || !line.includes('$1,550.50')) {
    throw new Error(line || 'nothing to decide');
  }
});

await step('a manager approves it at a lower amount, and Max is told', async () => {
  await manager.reload({ waitUntil: 'networkidle' });
  const waiting = manager.getByTestId('cme-waiting');
  await waiting.getByText('AAFP Family Medicine Experience').waitFor();
  await waiting.getByText(/Approving it goes \$550\.50 past/).waitFor();
  await manager.screenshot({ path: `${OUT}/cme-manager.png`, fullPage: true });
  await waiting.getByRole('button', { name: 'Approve' }).click();
  const dialog = manager.getByTestId('cme-decide');
  await dialog.getByLabel('Amount approved').fill('1000');
  await dialog.getByLabel('Note').fill('Up to the allowance.');
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await manager.getByText('Approved. Max Assistant has been told.').waitFor();
  const bell = (await call(max, '/notifications')).body;
  const items = bell.items ?? bell;
  const told = items.find((n) => n.title === 'Your CME request was approved');
  if (!told || !told.body.includes('$1,000.00 of the $1,550.50 asked')) throw new Error(JSON.stringify(told));
  await max.reload({ waitUntil: 'networkidle' });
  await max.getByTestId('your-cme-allowance').getByText(`${nextYear}`).waitFor();
  const years = await max.getByTestId('your-cme-allowance').innerText();
  if (!years.includes('$1,000.00 of $1,000.00 used, $0.00 left')) throw new Error(years);
});

await step('Max cannot decide, and a second request can be withdrawn', async () => {
  const mine = (await call(max, '/cme/mine')).body;
  const approve = await call(max, `/cme/${mine.requests[0].id}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (approve.status !== 403) throw new Error(`approving answered ${approve.status}`);
  await max.getByRole('button', { name: '+ Ask for a CME activity' }).click();
  const form = max.getByTestId('cme-ask');
  await form.getByLabel('Activity or event').fill('Online diabetes update');
  await form.getByText('Online', { exact: true }).click();
  await form.getByLabel('First day').fill(`${nextYear}-05-10`);
  await form.getByLabel('Registration').fill('99');
  if ((await form.getByLabel('Travel').count()) !== 0) throw new Error('travel online');
  await form.getByRole('button', { name: 'Send for approval' }).click();
  await max.getByText('Sent. The managers have been told').waitFor();
  const item = max.getByTestId('your-cme').getByRole('listitem').filter({ hasText: 'Online diabetes update' });
  await item.getByRole('button', { name: 'Withdraw' }).click();
  await max.getByRole('button', { name: 'Yes, withdraw' }).click();
  await item.getByText('Withdrawn').waitFor();
});

await step('declining needs a reason, which Max reads', async () => {
  const asked = await call(max, '/cme', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Second conference',
      format: 'IN_PERSON',
      startsOn: `${nextYear}-06-01`,
      endsOn: `${nextYear}-06-02`,
      registrationCents: 50000,
      travelCents: 0,
      lodgingCents: 0,
      otherCents: 0,
    }),
  });
  if (asked.status !== 201) throw new Error(`asking answered ${asked.status}`);
  await manager.reload({ waitUntil: 'networkidle' });
  const item = manager.getByTestId('cme-waiting').getByRole('listitem').filter({ hasText: 'Second conference' });
  await item.getByRole('button', { name: 'Decline' }).click();
  const dialog = manager.getByTestId('cme-decide');
  await dialog.getByRole('button', { name: 'Decline' }).click();
  await dialog.getByText('Say why, for them.').waitFor();
  await dialog.getByLabel('Why not').fill('The allowance is used for next year.');
  await dialog.getByRole('button', { name: 'Decline' }).click();
  await manager.getByText('Declined. Max Assistant has been told.').waitFor();
  await max.reload({ waitUntil: 'networkidle' });
  const theirs = max.getByTestId('your-cme').getByRole('listitem').filter({ hasText: 'Second conference' });
  await theirs.getByText('Not approved').waitFor();
  await theirs.getByText('The allowance is used for next year.').waitFor();
});

await step('a manager records it paid back, and Max sees it', async () => {
  const card = manager.getByTestId('cme-to-pay');
  await card.getByRole('button', { name: 'Mark paid back' }).click();
  const dialog = manager.getByTestId('cme-paid');
  await dialog.getByLabel('Amount paid').fill('950');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await manager.getByText('Recorded as paid back.').waitFor();
  await max.reload({ waitUntil: 'networkidle' });
  const item = max.getByTestId('your-cme').getByRole('listitem').filter({ hasText: 'AAFP Family Medicine Experience' });
  await item.getByText('Paid back', { exact: true }).waitFor();
  await item.getByText(/paid back \$950\.00/).waitFor();
  const years = await max.getByTestId('your-cme-allowance').innerText();
  if (!years.includes('$950.00 of $1,000.00 used, $50.00 left')) throw new Error(years);
});

await step('on a phone the form fits without scrolling sideways', async () => {
  const phone = max;
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${BASE}/cme`, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: '+ Ask for a CME activity' }).click();
  await phone.getByTestId('cme-ask').waitFor();
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (wide) throw new Error('scrolls sideways');
  await phone.screenshot({ path: `${OUT}/cme-phone.png`, fullPage: true });
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL CME CHECKS PASSED');
