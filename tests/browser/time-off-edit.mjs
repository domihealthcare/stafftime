import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

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
 * Editing time off, and paid and unpaid days kept apart (2 November 2026,
 * Dominguez: "I need to be able to edit PTO/SICK ... can have notes ... can
 * say who it is altered by ... it says Approved but does not say UNPAID ...
 * I just need it to say 0 of 5 sick days left"):
 * - a request past the balance is split when approved: the days still
 *   covered stay Sick, the rest become a separate Unpaid part;
 * - balances never show below 0;
 * - a manager edits the kind, the dates and a note, the change is kept with
 *   their name, and the person is told;
 * - withdrawing one part withdraws both.
 * (Also the October 2026 check that a manager can turn PTO into Sick.)
 *
 * Seeded: Frankie (front desk, 5 sick days a year) and Morgan (manager).
 * Requests are cleared by run-all.sh.
 */
async function signIn(email) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    timezoneId: 'America/New_York',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}
const call = (page, path, init) =>
  page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );

/// The Time off list starts on what is waiting; approved ones are a filter away.
const showApproved = (page) =>
  page.getByRole('button', { name: 'Approved', exact: true }).first().click();

const iso = (d) => d.toISOString().slice(0, 10);
const plusDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
// A Monday at least a week ahead, with the Tuesday after next in the same
// policy year (the calendar year): seven weekdays, Monday to the next Tuesday.
const MON = (() => {
  const d = new Date(
    `${new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}T12:00:00Z`,
  );
  d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  if (plusDays(d, 9).getUTCFullYear() !== d.getUTCFullYear()) {
    // Late December: the second Monday of next year instead.
    const next = new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 8, 12));
    while (next.getUTCDay() !== 1) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  return d;
})();
const NEXT_MON = plusDays(MON, 7);
const NEXT_TUE = plusDays(MON, 8);

const manager = await signIn('manager@domihealthcare.com');
const desk = await signIn('frontdesk@domihealthcare.com');
let askedId;
let unpaidId;

await step('Frankie asks for 7 sick days with 5 left, ticking that the rest may be unpaid', async () => {
  const made = await call(desk, '/pto', {
    method: 'POST',
    body: JSON.stringify({
      type: 'SICK',
      startDate: iso(MON),
      endDate: iso(NEXT_TUE),
      acknowledgedUnpaid: true,
    }),
  });
  if (made.status !== 201) throw new Error(`asking answered ${made.status} ${JSON.stringify(made.body)}`);
  if (made.body.days !== 7) throw new Error(`${made.body.days} days`);
  askedId = made.body.id;
});

await step('the manager sees what approving will split off before deciding', async () => {
  await manager.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  const split = manager.getByTestId('approval-split').first();
  await split.waitFor({ timeout: 10000 });
  const text = await split.innerText();
  if (!/5 days are paid as Sick and 2 days are unpaid/.test(text)) throw new Error(`said "${text}"`);
});

await step('approving keeps 5 days Sick and makes the other 2 a separate Unpaid part', async () => {
  const decided = manager.waitForResponse(
    (r) => r.url().endsWith(`/api/pto/${askedId}/review`) && r.request().method() === 'PATCH',
  );
  await manager
    .getByTestId(`time-off-request-${askedId}`)
    .getByRole('button', { name: 'Approve' })
    .click();
  // No shifts in those days, so it approves at once.
  if ((await decided).status() !== 200) throw new Error('approving failed');
  await showApproved(manager);
  await manager.getByTestId('split-unpaid-part').first().waitFor({ timeout: 10000 });
  const list = await call(manager, `/pto?status=APPROVED`);
  const mine = list.body.filter((r) => r.employee?.firstName === 'Frankie');
  const sick = mine.find((r) => r.id === askedId);
  const unpaid = mine.find((r) => r.type === 'UNPAID');
  if (!sick || sick.type !== 'SICK' || sick.days !== 5)
    throw new Error(`the paid part: ${JSON.stringify(sick)}`);
  if (sick.endDate !== iso(plusDays(MON, 6))) throw new Error(`paid part ends ${sick.endDate}`);
  if (!unpaid || unpaid.days !== 2 || unpaid.startDate !== iso(NEXT_MON))
    throw new Error(`the unpaid part: ${JSON.stringify(unpaid)}`);
  if (unpaid.unpaidPastBalanceOf !== 'SICK' || unpaid.splitFrom?.id !== askedId)
    throw new Error(`not marked past the sick balance: ${JSON.stringify(unpaid)}`);
  if (!/Approved past the sick balance: 5 days Sick/.test(sick.changes?.[0]?.summary ?? ''))
    throw new Error(`no record of the split: ${JSON.stringify(sick.changes)}`);
  unpaidId = unpaid.id;
  await manager.screenshot({ path: `${OUT}/time-off-split.png`, fullPage: true });
});

await step('Frankie sees 0 of 5 sick days left, never a minus number, and which days are unpaid', async () => {
  const balance = await call(desk, '/pto/balance');
  if (balance.body.sick.remaining !== 0) throw new Error(`sick left ${balance.body.sick.remaining}`);
  await desk.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  const left = await desk.getByTestId('your-sick-left').innerText();
  if (!/0\s+of 5 days left/.test(left)) throw new Error(`Schedule says "${left}"`);
  await desk.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  await desk.getByTestId('none-left').first().waitFor({ timeout: 10000 });
  await showApproved(desk);
  const unpaid = await desk.getByTestId('unpaid-past-balance').first().innerText();
  if (!/Unpaid: past the sick balance/.test(unpaid)) throw new Error(`said "${unpaid}"`);
  const bell = await call(desk, '/notifications');
  const told = JSON.stringify(bell.body);
  if (!/is unpaid: it was past your sick balance/.test(told)) throw new Error(`bell: ${told.slice(0, 400)}`);
  await desk.screenshot({ path: `${OUT}/time-off-unpaid-staff.png`, fullPage: true });
});

await step('staff cannot edit time off, even their own', async () => {
  const r = await call(desk, `/pto/${unpaidId}`, {
    method: 'PATCH',
    body: JSON.stringify({ type: 'SICK' }),
  });
  if (r.status !== 403) throw new Error(`answered ${r.status}`);
});

await step('the manager pays one unpaid day after all: Edit, with a note, kept with their name', async () => {
  await manager.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  await showApproved(manager);
  await manager
    .getByTestId(`time-off-request-${unpaidId}`)
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  const dialog = manager.getByTestId('edit-time-off');
  await dialog.waitFor();
  await dialog.getByLabel('Kind').selectOption({ label: 'Sick' });
  await dialog.getByLabel('Last day').fill(iso(NEXT_MON));
  await dialog.getByLabel('Note').fill('Paid this one after all');
  const saved = manager.waitForResponse(
    (r) => r.url().endsWith(`/api/pto/${unpaidId}`) && r.request().method() === 'PATCH',
  );
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  const response = await saved;
  if (response.status() !== 200) throw new Error(`saving answered ${response.status()}`);
  const after = (await call(manager, `/pto/${unpaidId}`)).body;
  if (after.type !== 'SICK' || after.endDate !== iso(NEXT_MON) || after.unpaidPastBalanceOf)
    throw new Error(`after: ${JSON.stringify(after)}`);
  const change = after.changes[0];
  if (change.changedBy?.firstName !== 'Morgan' || change.note !== 'Paid this one after all')
    throw new Error(`change: ${JSON.stringify(change)}`);
  if (!/Kind: Sick \(was Unpaid\); Dates: /.test(change.summary)) throw new Error(change.summary);
});

await step('Frankie is told, and sees who changed it and why', async () => {
  const bell = await call(desk, '/notifications');
  const told = JSON.stringify(bell.body);
  if (!/Your time off was changed/.test(told) || !/Morgan Manager/.test(told))
    throw new Error(`bell: ${told.slice(0, 400)}`);
  await desk.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  await showApproved(desk);
  await desk.getByText('Changed by Morgan Manager').first().waitFor({ timeout: 10000 });
  await desk.getByText('Paid this one after all').first().waitFor();
  // Paid past the balance on purpose: still shown as 0, not -1.
  const balance = await call(desk, '/pto/balance');
  if (balance.body.sick.remaining !== -1) throw new Error(`sick left ${balance.body.sick.remaining}`);
  await desk.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  const shown = await desk.getByTestId('your-sick-left').innerText();
  if (!/0\s+of 5 days left/.test(shown)) throw new Error(`Schedule says "${shown}"`);
  await desk.screenshot({ path: `${OUT}/time-off-changed-staff.png`, fullPage: true });
});

await step('an edit that changes nothing is refused, and so is an overlap', async () => {
  const nothing = await call(manager, `/pto/${askedId}`, {
    method: 'PATCH',
    body: JSON.stringify({ type: 'SICK' }),
  });
  if (nothing.status !== 400) throw new Error(`nothing changed answered ${nothing.status}`);
  const overlap = await call(manager, `/pto/${askedId}`, {
    method: 'PATCH',
    body: JSON.stringify({ endDate: iso(NEXT_MON) }),
  });
  if (overlap.status !== 400 || !/overlaps/.test(JSON.stringify(overlap.body)))
    throw new Error(`overlap answered ${overlap.status} ${JSON.stringify(overlap.body)}`);
});

await step('withdrawing the paid part withdraws the part split from it too', async () => {
  const r = await call(desk, `/pto/${askedId}/cancel`, { method: 'PATCH' });
  if (r.status !== 200) throw new Error(`cancel answered ${r.status}`);
  const other = (await call(manager, `/pto/${unpaidId}`)).body;
  if (other.status !== 'CANCELLED') throw new Error(`the other part is ${other.status}`);
});

await step('a manager still turns somebody’s PTO into Sick (October 2026)', async () => {
  const made = await call(desk, '/pto', {
    method: 'POST',
    body: JSON.stringify({ type: 'VACATION', startDate: iso(MON), endDate: iso(MON) }),
  });
  if (made.status !== 201) throw new Error(`asking answered ${made.status}`);
  const changed = await call(manager, `/pto/${made.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ type: 'SICK' }),
  });
  if (changed.status !== 200 || changed.body.type !== 'SICK')
    throw new Error(`answered ${changed.status} ${JSON.stringify(changed.body)}`);
  await call(desk, `/pto/${made.body.id}/cancel`, { method: 'PATCH' });
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL TIME-OFF-EDIT CHECKS PASSED');
