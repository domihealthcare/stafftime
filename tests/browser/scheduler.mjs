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
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Repeating shifts', exact: true }).click();
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
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Repeating shifts', exact: true }).click();
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
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Repeating shifts', exact: true }).click();
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

await step('it is whole weeks, starting Sunday, with every day of the month', async () => {
  const grid = page.getByTestId('month-grid');
  const cells = grid.getByRole('button');
  const count = await cells.count();

  if (count % 7 !== 0) throw new Error(`${count} day cells, which is not whole weeks`);

  // February 2027 starts on a Monday and has 28 days. Weeks run Sunday to
  // Saturday (Dominguez, September 2026), so it is five rows: Sunday 31
  // January before it, and the first week of March after.
  if (count !== 35) throw new Error(`expected 35 cells for February 2027, got ${count}`);

  const first = await cells.first().getAttribute('aria-label');
  if (!/^Sunday, January 31/.test(first ?? ''))
    throw new Error(`the grid starts on "${first}"`);
  const last = await cells.last().getAttribute('aria-label');
  if (!/^Saturday, March 6/.test(last ?? ''))
    throw new Error(`the grid ends on "${last}"`);
});

await step('a manager sees who is on, not just how many', async () => {
  // Monday 1 February carries one of the nine-hour shifts from the overtime
  // rota above. A manager is looking at everybody, so the name is the useful
  // part.
  const monday = page.getByTestId('month-grid').getByRole('button').nth(1);
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
  // The warning sits at the top of the page in both views.
  await page.getByTestId('overtime-notice').waitFor({ timeout: 10000 });
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

// --- one person's month ---

const personBox = page.getByRole('combobox', { name: 'Show person' });
// Only the picker's own list — the office and job role selects have options too.
const personList = page.getByRole('listbox', { name: 'Show person' });

await step('a manager can find one person by typing part of their name', async () => {
  await personBox.click();
  await personBox.fill('frank');
  const options = personList.getByRole('option');
  // "Everyone" drops out while a name is being typed; only Frankie matches.
  if ((await options.count()) !== 1)
    throw new Error(`"frank" matched ${await options.count()} options`);
  await personList.getByRole('option', { name: /Frankie Front-Desk/ }).click();
  const shown = await page.getByTestId('month-person').innerText();
  if (!/^Only Frankie Front-Desk — \d+ shifts? this month\.$/.test(shown))
    throw new Error(`the month says "${shown}"`);
  if ((await personBox.inputValue()) !== 'Frankie Front-Desk')
    throw new Error(`the box reads "${await personBox.inputValue()}"`);
});
await page.screenshot({ path: `${OUT}/39c-month-one-person.png`, fullPage: true });

await step("with one person picked, a day shows their times, not their name", async () => {
  const monday = page.getByTestId('month-grid').getByRole('button').nth(1);
  const label = await monday.getAttribute('aria-label');
  if (!/1 shift: \d{1,2}(:\d\d)?(am|pm)–\d/.test(label ?? ''))
    throw new Error(`Monday reads "${label}"`);
});

await step('the picked person stays picked from month to month', async () => {
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByText('March 2027').waitFor({ timeout: 10000 });
  await page.getByTestId('month-person').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '← Previous' }).click();
  await page.getByText('February 2027').waitFor({ timeout: 10000 });
  await page.getByTestId('month-person').getByText('Frankie Front-Desk').waitFor({ timeout: 10000 });
});

await step("somebody else's month leaves Frankie's shifts out", async () => {
  await personBox.click();
  await personBox.fill('max');
  await personList.getByRole('option', { name: /Max Assistant/ }).click();
  await page.getByText(/^Only Max Assistant/).waitFor({ timeout: 10000 });
  // This suite only ever schedules Frankie, so Max's February is empty.
  const shown = await page.getByTestId('month-person').innerText();
  if (!/no shifts this month/.test(shown)) throw new Error(`the month says "${shown}"`);
  const labels = await page
    .getByTestId('month-grid')
    .getByRole('button')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''));
  const withShifts = labels.filter((label) => !/no shifts/.test(label));
  if (withShifts.length > 0) throw new Error(`still showing shifts: ${withShifts[0]}`);
});

await step('a name nobody has says so', async () => {
  await personBox.click();
  await personBox.fill('zzzz');
  await page.getByText('Nobody by that name.').waitFor({ timeout: 5000 });
  await personBox.press('Escape');
});

await step('✕ goes back to everyone', async () => {
  await page.getByRole('button', { name: 'Show everyone' }).click();
  if ((await page.getByTestId('month-person').count()) > 0)
    throw new Error('still showing one person');
  const monday = page.getByTestId('month-grid').getByRole('button').nth(1);
  const label = await monday.getAttribute('aria-label');
  if (!/1 shift: Frankie/.test(label ?? '')) throw new Error(`Monday reads "${label}"`);
});

// --- a group's month: a job role, an office, or both ---

await step('the month narrows to one job role at one office (Front Desk in North Bergen)', async () => {
  // Frankie is Front Desk and Medical Assistant at North Bergen; Max is an MA
  // at West New York. The rota above is all Frankie's, at North Bergen, and
  // made as Front Desk — her first role, which the forms pick for her.
  await page.getByLabel('Show job role').selectOption({ label: 'Front Desk' });
  await page.getByLabel('Show location').selectOption({ label: 'North Bergen' });
  const shown = await page.getByTestId('month-person').innerText();
  if (!/^Only Front Desk at North Bergen — [1-9]\d* shifts? this month\.$/.test(shown))
    throw new Error(`the month says "${shown}"`);
  // A group is several people, so the squares go back to names.
  const monday = page.getByTestId('month-grid').getByRole('button').nth(1);
  const label = await monday.getAttribute('aria-label');
  if (!/1 shift: Frankie/.test(label ?? '')) throw new Error(`Monday reads "${label}"`);
});
await page.screenshot({ path: `${OUT}/39d-month-group.png`, fullPage: true });

await step('a job role shows the shifts for that role, not everything its people work', async () => {
  // Frankie is an MA too, but none of these shifts are MA shifts (Dominguez,
  // September 2026: Provider in North Bergen showed more than it should).
  await page.getByLabel('Show job role').selectOption({ label: 'Medical Assistant' });
  await page.getByText('Only Medical Assistant at North Bergen — no shifts this month.').waitFor({
    timeout: 5000,
  });
  await page.getByLabel('Show job role').selectOption({ label: 'Front Desk' });
});

await step('the person list only offers people in that group', async () => {
  await personBox.click();
  // Read the list once it is open, not while it opens.
  await personList.getByRole('option', { name: /Frankie Front-Desk/ }).waitFor({ timeout: 5000 });
  const names = await personList.getByRole('option').allInnerTexts();
  // "✓ Everyone" is always there to go back to; the rest are people.
  const people = names.filter((name) => !/Everyone/.test(name));
  if (people.length !== 1 || !/Frankie Front-Desk/.test(people[0]))
    throw new Error(`offered: ${names.map((name) => name.split('\n')[0]).join(' | ')}`);
  await personBox.press('Escape');
});

await step('the other office leaves North Bergen shifts out', async () => {
  await page.getByLabel('Show location').selectOption({ label: 'West New York' });
  await page.getByText('Only Front Desk at West New York — no shifts this month.').waitFor({
    timeout: 5000,
  });
});

await step('an office alone, and back to all', async () => {
  await page.getByLabel('Show job role').selectOption({ label: 'All job roles' });
  await page.getByLabel('Show location').selectOption({ label: 'North Bergen' });
  await page.getByText(/^Only North Bergen — [1-9]\d* shifts? this month\.$/).waitFor({ timeout: 5000 });
  await page.getByLabel('Show location').selectOption({ label: 'All locations' });
  if ((await page.getByTestId('month-person').count()) > 0)
    throw new Error('still narrowed with every filter off');
});

await step('an employee is not offered the person picker', async () => {
  // Staff only ever get their own shifts, so there is nobody else to pick.
  const empCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const emp = await empCtx.newPage();
  await emp.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await emp.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await emp.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await emp.getByRole('button', { name: 'Sign in' }).click();
  await emp.getByText('Not clocked in').waitFor({ timeout: 15000 });
  await emp.getByRole('link', { name: 'Schedule' }).click();
  await emp.getByRole('button', { name: 'Month', exact: true }).click();
  await emp.getByTestId('month-grid').waitFor({ timeout: 15000 });
  if ((await emp.getByRole('combobox', { name: 'Show person' }).count()) > 0)
    throw new Error('an employee was offered the person picker');
  await empCtx.close();
});

await step('picking a day opens that week', async () => {
  // The month view is an overview; the week is where shifts are edited, so a
  // day has to be a way back into it.
  await page.getByTestId('month-grid').getByRole('button').nth(8).click(); // Mon 8 Feb
  await page.getByTestId('week-grid').waitFor({ timeout: 15000 });

  // Its week, which starts on Sunday the 7th.
  const text = await page.getByTestId('schedule-period').innerText();
  if (!/^Feb 7/.test(text)) throw new Error(`the week did not follow the day picked: ${text}`);
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

  for (const name of ['+ Add', /Copy last week/]) {
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
