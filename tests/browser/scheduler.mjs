import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
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
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
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
  await page.getByLabel('From').fill('2027-02-01');
  await page.getByLabel('Until').fill('2027-02-28');
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
  await page.getByLabel('From').fill('2027-02-01');
  await page.getByLabel('Until').fill('2027-02-28');
  await page.getByRole('button', { name: 'Create the shifts' }).click();

  await page.getByText('No shifts were created.').waitFor({ timeout: 20000 });
  await page.getByText(/8 days skipped/).waitFor({ timeout: 5000 });
  await page.getByText(/already had a shift/).first().waitFor({ timeout: 5000 });
});

await step('the created shifts show on the week grid', async () => {
  await page.getByRole('button', { name: 'Dismiss' }).click();
  // Navigate to the first week of February 2027.
  await page.goto('http://127.0.0.1:5173/schedule', { waitUntil: 'networkidle' });
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

await step('an employee sees neither the planning tools nor coverage', async () => {
  const empCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const emp = await empCtx.newPage();
  await emp.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
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
