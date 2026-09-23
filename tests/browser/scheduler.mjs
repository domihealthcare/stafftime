import { chromium } from 'playwright';
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

const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('manager@domihealthcare.com');
await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByText('Not clocked in').waitFor({ timeout: 15000 });
await page.getByRole('link', { name: 'Schedule' }).click();

await step('a manager sees a coverage summary for the week', async () => {
  await page.getByText('Coverage this week').waitFor({ timeout: 15000 });
  await page.getByText(/hours scheduled/).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/37-coverage.png`, fullPage: true });

await step('an empty week is called out rather than left blank', async () => {
  const text = await page.locator('main').innerText();
  if (!/Nobody is scheduled at all this week|Nobody scheduled on/.test(text))
    throw new Error('an empty week was not flagged');
});

await step('the repeating-shifts form opens', async () => {
  await page.getByRole('button', { name: 'Repeating shifts' }).click();
  await page.getByText('One rota line at a time').waitFor({ timeout: 10000 });
});

await step('weekdays default to Monday through Friday', async () => {
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    const pressed = await page.getByRole('button', { name: day, exact: true }).getAttribute('aria-pressed');
    if (pressed !== 'true') throw new Error(`${day} was not selected by default`);
  }
  for (const day of ['Sat', 'Sun']) {
    const pressed = await page.getByRole('button', { name: day, exact: true }).getAttribute('aria-pressed');
    if (pressed !== 'false') throw new Error(`${day} was selected by default`);
  }
});

await step('a rota can be created in one go', async () => {
  await page.getByLabel('Employee').selectOption({ label: 'Frankie Front-Desk' });
  // Just Tuesdays and Thursdays.
  for (const day of ['Mon', 'Wed', 'Fri']) {
    await page.getByRole('button', { name: day, exact: true }).click();
  }
  await page.getByLabel('Starts').fill('09:00');
  await page.getByLabel('Ends').fill('17:00');
  await page.getByLabel('From', { exact: true }).fill('2027-02-01');
  await page.getByLabel('Until', { exact: true }).fill('2027-02-28');
  await page.getByLabel(/Publish straight away/).check();
  await page.getByRole('button', { name: 'Create the shifts' }).click();

  // February 2027 has 4 Tuesdays and 4 Thursdays.
  await page.getByText('8 shifts created.').waitFor({ timeout: 20000 });
});
await page.screenshot({ path: `${OUT}/38-repeat-result.png`, fullPage: true });

await step('running the same rota again reports every day as skipped', async () => {
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.getByRole('button', { name: 'Repeating shifts' }).click();
  await page.getByLabel('Employee').selectOption({ label: 'Frankie Front-Desk' });
  for (const day of ['Mon', 'Wed', 'Fri']) {
    await page.getByRole('button', { name: day, exact: true }).click();
  }
  await page.getByLabel('From', { exact: true }).fill('2027-02-01');
  await page.getByLabel('Until', { exact: true }).fill('2027-02-28');
  await page.getByRole('button', { name: 'Create the shifts' }).click();

  await page.getByText('No shifts were created.').waitFor({ timeout: 20000 });
  await page.getByText(/8 days skipped/).waitFor({ timeout: 5000 });
  await page.getByText(/already had a shift/).first().waitFor({ timeout: 5000 });
});

await step('the created shifts show on the week grid', async () => {
  await page.getByRole('button', { name: 'Dismiss' }).click();
  // Navigate to the first week of February 2027.
  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  for (let i = 0; i < 20; i += 1) {
    const label = await page.locator('main').innerText();
    if (/Feb 1|Feb 2/.test(label)) break;
    await page.getByRole('button', { name: 'Next →' }).click();
    await page.waitForTimeout(250);
  }
  await page.getByText(/Frankie Front-Desk/).first().waitFor({ timeout: 10000 });
});

await step('copy-last-week pulls a rota forward', async () => {
  // Move to the week after, which should be empty of copies, then copy back.
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Copy last week into this one/ }).click();
  await page.getByText(/shifts created|No shifts were created/).waitFor({ timeout: 25000 });
});
await page.screenshot({ path: `${OUT}/39-copy-week.png`, fullPage: true });

await step('removing a shift asks first, and Keep it keeps it', async () => {
  const chips = page.getByTestId('shift-chip');
  await chips.first().waitFor({ timeout: 10000 });
  const before = await chips.count();

  await chips.first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^Remove .* shift, / }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Remove this shift?' });
  await confirm.waitFor({ timeout: 5000 });
  await confirm.getByRole('button', { name: 'Keep it' }).click();
  await confirm.waitFor({ state: 'detached', timeout: 5000 });
  await dialog.getByRole('button', { name: 'Close' }).click();
  if ((await chips.count()) !== before) throw new Error('Keep it removed the shift');

  await chips.first().click();
  await dialog.getByRole('button', { name: /^Remove .* shift, / }).click();
  const deleted = page.waitForResponse(
    (r) => r.url().includes('/api/shifts/') && r.request().method() === 'DELETE',
  );
  await confirm.getByRole('button', { name: 'Yes, remove' }).click();
  if (!(await deleted).ok()) throw new Error('the removal was refused');
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="shift-chip"]').length === n - 1,
    before,
    { timeout: 10000 },
  );
});

// --- overtime ---
//
// Against real Postgres, so the query's own filters do the work rather than a
// mock returning everything regardless.

await step('a normal week says nothing about overtime', async () => {
  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  for (let i = 0; i < 20; i += 1) {
    if (/Feb 1|Feb 2/.test(await page.locator('main').innerText())) break;
    await page.getByRole('button', { name: 'Next →' }).click();
    await page.waitForTimeout(250);
  }
  await page.getByText('Coverage this week').waitFor({ timeout: 15000 });

  if ((await page.getByText(/scheduled past 40 hours/).count()) > 0)
    throw new Error('two 8-hour shifts were reported as overtime');
});

await step('a rota that crosses 40 hours is called out, in hours', async () => {
  // Frankie already has Tuesday and Thursday that week. Six 9-hour days on top
  // is well over.
  await page.getByRole('button', { name: 'Repeating shifts' }).click();
  await page.getByLabel('Employee').selectOption({ label: 'Frankie Front-Desk' });
  for (const day of ['Sat', 'Sun']) {
    await page.getByRole('button', { name: day, exact: true }).click();
  }
  await page.getByLabel('Starts').fill('08:00');
  await page.getByLabel('Ends').fill('17:00');
  await page.getByLabel('From', { exact: true }).fill('2027-02-01');
  await page.getByLabel('Until', { exact: true }).fill('2027-02-07');
  await page.getByLabel(/Publish straight away/).check();
  await page.getByRole('button', { name: 'Create the shifts' }).click();
  await page.getByText(/shifts created/).waitFor({ timeout: 20000 });

  // No reload: the week being viewed is component state, and reloading would
  // drop the manager back on today's week, where none of this applies.
  await page.getByText(/scheduled past 40 hours/).waitFor({ timeout: 20000 });

  const panel = await page.locator('main').innerText();
  if (!/Frankie Front-Desk/.test(panel))
    throw new Error('the warning did not name who it is about');
  // 5 nine-hour days + the Tuesday and Thursday eights = 61.
  if (!/61 hours in the week of/.test(panel))
    throw new Error(`the warning did not give the week's hours: ${panel.slice(0, 400)}`);
  if (!/21 at overtime/.test(panel))
    throw new Error('the warning did not say how many hours are over');
});
await page.screenshot({ path: `${OUT}/39a-overtime.png`, fullPage: true });

await step('the warning follows the week, not the days on screen', async () => {
  // The following week has none of those shifts, so it must go quiet — and
  // coming back must bring it back, rather than it being sticky UI state.
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.waitForTimeout(1500);
  if ((await page.getByText(/scheduled past 40 hours/).count()) > 0)
    throw new Error('the warning followed the manager into a week it does not apply to');

  await page.getByRole('button', { name: '← Previous' }).click();
  await page.waitForTimeout(1500);
  await page.getByText(/scheduled past 40 hours/).waitFor({ timeout: 15000 });
});

// --- the month view ---

await step('the month view shows the month it says it does', async () => {
  // The suite has been working in February 2027; switching views should stay
  // there rather than jumping back to today.
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await page.getByTestId('month-grid').waitFor({ timeout: 15000 });
  await page.getByText('February 2027').waitFor({ timeout: 10000 });
});
await page.screenshot({ path: `${OUT}/39b-month.png`, fullPage: true });

await step('it is whole weeks, starting Monday, with every day of the month', async () => {
  const grid = page.getByTestId('month-grid');
  const cells = grid.getByRole('button');
  const count = await cells.count();

  if (count % 7 !== 0) throw new Error(`${count} day cells, which is not whole weeks`);

  // February 2027 starts on a Monday and has 28 days, so it is exactly four
  // rows with nothing spilling either side.
  if (count !== 28) throw new Error(`expected 28 cells for February 2027, got ${count}`);

  const first = await cells.first().getAttribute('aria-label');
  if (!/^Monday, February 1/.test(first ?? ''))
    throw new Error(`the grid starts on "${first}"`);
  const last = await cells.last().getAttribute('aria-label');
  if (!/^Sunday, February 28/.test(last ?? ''))
    throw new Error(`the grid ends on "${last}"`);
});

await step('a manager sees who is on, not just how many', async () => {
  // Monday 1 February carries one of the nine-hour shifts from the overtime
  // rota above. A manager is looking at everybody, so the name is the useful
  // part.
  const monday = page.getByTestId('month-grid').getByRole('button').first();
  const label = await monday.getAttribute('aria-label');
  if (!/1 shift: Frankie/.test(label ?? ''))
    throw new Error(`Monday reads "${label}"`);

  const text = await monday.innerText();
  if (!/Frankie/.test(text))
    throw new Error(`the cell shows "${text.replace(/\n/g, ' ')}"`);
});

await step('an empty day is visibly empty rather than blank', async () => {
  // Found rather than assumed: this suite has built several overlapping rotas
  // by now, and guessing which square is free is how a test ends up asserting
  // something that happens to be true today.
  const cells = page.getByTestId('month-grid').getByRole('button');
  const labels = await cells.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label') ?? ''),
  );

  const emptyIndex = labels.findIndex((label) => /no shifts/.test(label));
  if (emptyIndex === -1)
    throw new Error(`every day in the month has a shift, so nothing was tested: ${labels[0]}`);

  const text = await cells.nth(emptyIndex).innerText();
  if (!/—/.test(text))
    throw new Error(`an empty day rendered as "${text.replace(/\n/g, ' ')}" rather than a dash`);
});

await step('overtime is still called out a month at a time', async () => {
  // It is a per-week question either way, and the month view would be worse
  // than useless if it quietly used a different rule.
  // The card is "Worth a look this month" now that availability clashes sit
  // beside overtime; the overtime warning inside it is what this checks.
  await page.getByText('Worth a look this month').waitFor({ timeout: 10000 });
  await page.getByText(/scheduled past \d+ hours/).waitFor({ timeout: 10000 });
  const text = await page.locator('main').innerText();
  if (!/61 hours in the week of/.test(text))
    throw new Error('the month view lost the overtime warning');
});

await step('Previous and Next move a month, not a week', async () => {
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByText('March 2027').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '← Previous' }).click();
  await page.getByText('February 2027').waitFor({ timeout: 10000 });
});

await step('picking a day opens that week', async () => {
  // The month view is an overview; the week is where shifts are edited, so a
  // day has to be a way back into it.
  await page.getByTestId('month-grid').getByRole('button').nth(7).click(); // Mon 8 Feb
  await page.getByTestId('week-grid').waitFor({ timeout: 15000 });

  const text = await page.locator('main').innerText();
  if (!/Feb 8/.test(text)) throw new Error(`the week did not follow the day picked: ${text.slice(0, 200)}`);
});

await step('an employee sees when they are on, not their own name', async () => {
  // This is mostly who the month view is for: somebody checking which days
  // they are working. They only ever see their own shifts, so the name would
  // be their own name twenty times over — the time is the useful part.
  const empCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const emp = await empCtx.newPage();
  await emp.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await emp.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await emp.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await emp.getByRole('button', { name: 'Sign in' }).click();
  await emp.getByText('Not clocked in').waitFor({ timeout: 15000 });
  await emp.getByRole('link', { name: 'Schedule' }).click();
  await emp.getByRole('button', { name: 'Month', exact: true }).click();
  await emp.getByTestId('month-grid').waitFor({ timeout: 15000 });

  // Navigate to February 2027, where this suite built the rota.
  for (let i = 0; i < 20; i += 1) {
    if (/February 2027/.test(await emp.locator('main').innerText())) break;
    await emp.getByRole('button', { name: 'Next →' }).click();
    await emp.waitForTimeout(250);
  }

  const withShifts = emp
    .getByTestId('month-grid')
    .getByRole('button')
    .filter({ hasNotText: '—' })
    .first();
  const label = await withShifts.getAttribute('aria-label');

  if (/Frankie/.test(label ?? ''))
    throw new Error(`an employee was shown their own name: "${label}"`);
  if (!/\d(am|pm)–\d/.test(label ?? ''))
    throw new Error(`expected a time range, got "${label}"`);

  await empCtx.close();
});

await step('an employee sees neither the planning tools nor coverage', async () => {
  const empCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const emp = await empCtx.newPage();
  await emp.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await emp.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await emp.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await emp.getByRole('button', { name: 'Sign in' }).click();
  await emp.getByText('Not clocked in').waitFor({ timeout: 15000 });
  await emp.getByRole('link', { name: 'Schedule' }).click();
  await emp.getByText('Your upcoming shifts').waitFor({ timeout: 10000 });

  for (const name of ['Repeating shifts', /Copy last week/]) {
    if (await emp.getByRole('button', { name }).count() > 0)
      throw new Error(`employee was offered ${name}`);
  }
  if (await emp.getByText('Coverage this week').count() > 0)
    throw new Error('employee was shown the coverage summary');
  await empCtx.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL SCHEDULER CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
