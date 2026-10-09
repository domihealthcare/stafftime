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
 * Too many off at once (Dominguez, October 2026 — making the app smarter):
 * more than half of one job role at an office off the same day, approved or
 * asked for. Warned on the request while a manager decides it, on the
 * Dashboard and in the nightly email; never refused.
 *
 * Ada and Morgan join Frankie in Medical Assistant (three at North Bergen),
 * then Frankie and Ada both ask for the same weekday off. Frankie is also the
 * only Front Desk there. run-all.sh re-seeds job roles and clears time off.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
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

/// A weekday at least a week away, inside the email's fortnight.
const day = (() => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7);
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
})();

const mgr = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
const ada = await signIn('admin@domihealthcare.com');
let frankiesRequest;

await step('set-up: three MAs at North Bergen, and two of them ask for the same day', async () => {
  const staff = (await call(mgr, '/employees')).body;
  const idOf = (email) => staff.find((p) => p.email === email).id;
  const ma = (await call(mgr, '/job-roles')).body.find((r) => r.name === 'Medical Assistant');
  for (const email of ['admin@domihealthcare.com', 'manager@domihealthcare.com']) {
    const added = await call(mgr, `/job-roles/${ma.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ employeeId: idOf(email) }),
    });
    if (added.status >= 300) throw new Error(`adding to MA answered ${added.status}`);
  }
  for (const page of [frankie, ada]) {
    const asked = await call(page, '/pto', {
      method: 'POST',
      body: JSON.stringify({ type: 'SICK', startDate: day, endDate: day }),
    });
    if (asked.status !== 201) throw new Error(`asking answered ${asked.status}: ${JSON.stringify(asked.body)}`);
    if (page === frankie) frankiesRequest = asked.body;
  }
});

const toDecide = mgr.getByTestId('requests-to-decide');
// Each request's own line, by the name it starts with — the warning inside
// it is a list too, and names the others off.
const lineFor = (name) =>
  toDecide.locator('ul.divide-y > li').filter({ has: mgr.locator('span.font-medium', { hasText: name }) });

await step('deciding Frankie’s: the office is left with 1 of 3 MAs and no Front Desk', async () => {
  await mgr.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  // Folded to one line until opened (October 2026).
  await toDecide.locator('summary').click();
  const note = lineFor('Frankie').getByTestId('time-off-clash');
  await note.waitFor({ timeout: 15000 });
  const text = await note.textContent();
  for (const expected of [
    'leaves North Bergen with nobody in Front Desk',
    'leaves North Bergen with 1 of 3 in Medical Assistant',
    'also off: Ada Admin (asked)',
  ]) {
    if (!text.includes(expected)) throw new Error(`the note reads "${text}"`);
  }
});

await step('deciding Ada’s says the same about MAs, and nothing about Front Desk', async () => {
  const text = await lineFor('Ada').getByTestId('time-off-clash').textContent();
  if (!text.includes('1 of 3 in Medical Assistant') || !text.includes('also off: Frankie Front-Desk (asked)'))
    throw new Error(`the note reads "${text}"`);
  if (text.includes('Front Desk on')) throw new Error('Ada is not in Front Desk');
});
await mgr.screenshot({ path: `${OUT}/clashes-decide.png`, fullPage: true });

await step('the Dashboard lists it for the coming weeks', async () => {
  await mgr.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  const card = mgr.getByTestId('overview-clashes');
  await card.getByText(/2 of 3 in Medical Assistant off: Ada Admin \(asked\), Frankie Front-Desk \(asked\)/).waitFor({
    timeout: 15000,
  });
  await card.getByText(/all 1 in Front Desk off: Frankie Front-Desk \(asked\)/).waitFor({ timeout: 5000 });
});

await step('the nightly round-up carries it, being in the next two weeks', async () => {
  const attention = (await call(mgr, '/attention')).body;
  if (!attention.timeOffClashes.some((line) => line.includes('2 of 3 in Medical Assistant off')))
    throw new Error(`round-up: ${JSON.stringify(attention.timeOffClashes)}`);
});

await step('it warns, never refuses: Frankie’s is approved all the same', async () => {
  await mgr.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await toDecide.locator('summary').click();
  const saved = mgr.waitForResponse((r) => r.url().includes(`/api/pto/${frankiesRequest.id}/review`));
  await lineFor('Frankie').getByRole('button', { name: 'Approve' }).click();
  if (!(await saved).ok()) throw new Error('the approval was refused');
});

await step('staff cannot ask who else is off', async () => {
  const asked = await call(frankie, `/pto/${frankiesRequest.id}/clashes`);
  if (asked.status !== 403) throw new Error(`staff were answered ${asked.status}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CLASH CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
