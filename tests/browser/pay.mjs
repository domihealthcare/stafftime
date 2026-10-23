import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
let admin;
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`);
    errors.push(`${name}: ${e.message}`);
    await admin?.screenshot({ path: `${OUT}/pay-fail.png`, fullPage: true }).catch(() => {});
  }
};

/**
 * Pay & raises (October 2026, Dominguez: "i want to stop having to use this
 * excel workflow"), and pay behind the PIN ("even if the certain user has
 * access to view it, should prompt them to insert pin to view").
 *
 * For the people an admin chose to see the rota's cost. The suite's own
 * people are imp-*@example.com, which run-all.sh removes; raises, leaving
 * details and the check-in events are cleared there too.
 */
function sql(statement) {
  return execFileSync(
    'psql',
    [
      '-h', process.env.PGHOST_LOCAL || '127.0.0.1',
      '-p', process.env.PGPORT_LOCAL || '5433',
      '-U', process.env.PGUSER_LOCAL || 'postgres',
      '-d', process.env.PGDATABASE_LOCAL || 'stafftime',
      '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', statement,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  ).toString().trim();
}

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

const call = (page, path, init = {}) =>
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

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const me = (await call(admin, '/auth/me')).body;
const adminId = me.employee?.id ?? me.id;

const addPerson = async (first, last, email) => {
  const places = (await call(admin, '/locations')).body;
  const r = await call(admin, '/employees', {
    method: 'POST',
    body: JSON.stringify({
      firstName: first,
      lastName: last,
      email,
      hireDate: '2025-03-10',
      locationIds: [places[0].id],
      primaryLocationId: places[0].id,
    }),
  });
  if (r.status >= 300) throw new Error(`could not add ${first}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const casey = await addPerson('Casey', 'Paysuite', 'imp-casey@example.com');
const drew = await addPerson('Drew', 'Paysuite', 'imp-drew@example.com');

await step('pay asks for the PIN first, even for somebody allowed to see it', async () => {
  const granted = await call(admin, `/rota-cost/access/${adminId}`, { method: 'PUT' });
  if (granted.status !== 200) throw new Error(`grant answered ${granted.status}`);
  const locked = await call(admin, '/pay');
  if (locked.status !== 403 || locked.body?.code !== 'PIN_REQUIRED') {
    throw new Error(`a locked session got ${locked.status} ${JSON.stringify(locked.body)}`);
  }
  for (const path of ['/rota-cost?from=2027-03-07&to=2027-03-13', '/vendors', `/staff-records/${casey.id}`]) {
    const r = await call(admin, path);
    if (r.status !== 403 || r.body?.code !== 'PIN_REQUIRED') {
      throw new Error(`${path} answered ${r.status} without the PIN`);
    }
  }
});

await step('the screen shows the prompt and opens on the password', async () => {
  await admin.goto(`${BASE}/pay`, { waitUntil: 'networkidle' });
  await admin.getByRole('heading', { name: /Enter your PIN to see pay/ }).waitFor();
  if ((await admin.getByText('Casey Paysuite').count()) > 0) throw new Error('pay showed before the PIN');
  // A wrong PIN is refused, then the password works instead.
  await admin.getByTestId('pay-pin').fill('0000');
  await admin.getByRole('button', { name: 'Show', exact: true }).click();
  await admin.getByText(/That PIN is not right|Too many incorrect PINs/).waitFor();
  await admin.getByRole('button', { name: 'Use your password instead' }).click();
  await admin.getByTestId('pay-pin').fill('not-the-password');
  await admin.getByRole('button', { name: 'Show', exact: true }).click();
  await admin.getByText('That password is not right.').waitFor();
  await admin.getByTestId('pay-pin').fill('shift-change-2026');
  await admin.getByRole('button', { name: 'Show', exact: true }).click();
  await admin.getByRole('heading', { level: 1, name: 'Pay & raises' }).waitFor();
  await admin.getByTestId('pay-row').filter({ hasText: 'Casey Paysuite' }).waitFor();
});

await step('somebody not chosen is refused, PIN or not', async () => {
  const unlocked = await call(manager, '/pay-lock/unlock', {
    method: 'POST',
    body: JSON.stringify({ password: 'shift-change-2026' }),
  });
  if (unlocked.status !== 200) throw new Error(`manager unlock answered ${unlocked.status}`);
  const r = await call(manager, '/pay');
  if (r.status !== 403 || r.body?.code === 'PIN_REQUIRED') {
    throw new Error(`a manager not on the list got ${r.status} ${JSON.stringify(r.body)}`);
  }
});

const dialog = () => admin.getByTestId('pay-person');

await step('pay is recorded from the screen', async () => {
  await admin.getByTestId('pay-row').filter({ hasText: 'Casey Paysuite' }).click();
  await dialog().getByText('No raises recorded.').waitFor();
  await dialog().getByRole('button', { name: '+ Add a change' }).click();
  await dialog().getByLabel('Pay', { exact: true }).fill('20');
  await dialog().getByRole('button', { name: 'Add it' }).click();
  await dialog().getByTestId('current-pay').filter({ hasText: '$20.00 an hour' }).waitFor();
});

await step('a raise goes from the ask to a meeting to an offer', async () => {
  await dialog().getByRole('button', { name: '+ Raise asked for' }).click();
  await dialog().getByLabel('Amount asked for').fill('23');
  await dialog().getByRole('button', { name: 'Save', exact: true }).click();
  await dialog().getByTestId('open-raise').waitFor();

  await dialog().getByRole('button', { name: 'Set a meeting' }).click();
  await dialog().getByLabel('Day', { exact: true }).fill(addDays(today(), 3));
  await dialog().getByLabel('From', { exact: true }).fill('10:00');
  await dialog().getByLabel('To', { exact: true }).fill('10:30');
  await dialog().getByRole('button', { name: 'Set the meeting' }).click();
  await dialog().getByTestId('raise-meeting').waitFor();
  const title = sql(
    `select title from practice_events where title like 'Check-in: Casey%' limit 1`,
  );
  if (!/^Check-in: Casey( and .+)?$/.test(title)) throw new Error(`the meeting was "${title}"`);
  if (/pay|raise/i.test(title)) throw new Error('the calendar says what it is about');

  await dialog().getByRole('button', { name: 'Make an offer' }).click();
  await dialog().getByLabel('New pay').fill('22.50');
  await dialog().getByRole('button', { name: 'Save the offer' }).click();
  await dialog().getByText('Offered', { exact: true }).first().waitFor();
});

await step('approving it from a day to come puts it in the history as coming up', async () => {
  const starts = addDays(today(), 10);
  await dialog().getByRole('button', { name: 'Accepted: approve it' }).click();
  await dialog().getByLabel('Starts on').fill(starts);
  await dialog().getByRole('button', { name: 'Approve', exact: true }).click();
  await dialog().getByText('Earlier raises (1)').waitFor();
  // Still paid the old rate until the day comes.
  await dialog().getByTestId('current-pay').filter({ hasText: '$20.00 an hour' }).waitFor();
  await dialog()
    .getByTestId('employment-change')
    .filter({ hasText: '$22.50 an hour' })
    .getByText('Coming up')
    .waitFor();
  await dialog().getByRole('button', { name: 'Close' }).click();
  await admin
    .getByTestId('pay-row')
    .filter({ hasText: 'Casey Paysuite' })
    .getByText(/Coming up/)
    .waitFor();
});

await step('somebody who left has their leaving details and exit checklist', async () => {
  const left = await call(admin, `/employees/${drew.id}?terminationDate=${today()}`, { method: 'DELETE' });
  if (left.status >= 300) throw new Error(`terminate answered ${left.status}`);
  await admin.reload({ waitUntil: 'networkidle' });
  await admin.getByRole('tab', { name: /Former staff/ }).click();
  const card = admin.getByTestId('former-row').filter({ hasText: 'Drew Paysuite' });
  await card.waitFor();
  const progress = await card.getByTestId('exit-checklist').innerText();
  if (!/^0 of \d+ done$/.test(progress)) throw new Error(`exit checklist read "${progress}"`);
  const tasks = sql(
    `select string_agg(t.title, ' | ') from employee_checklist_tasks t join employee_checklists c on c.id = t."checklistId" where c."employeeId" = '${drew.id}'`,
  );
  for (const word of ['WhatsApp', 'EMR', 'Domi Staff', 'key']) {
    if (!tasks.toLowerCase().includes(word.toLowerCase())) throw new Error(`no ${word} step: ${tasks}`);
  }

  await card.getByRole('button', { name: 'Open Drew Paysuite' }).click();
  await dialog().getByLabel('How they left').selectOption('RESIGNED');
  await dialog().getByLabel('Reason').fill('Moving away');
  await dialog().getByLabel('Last paycheck').fill(addDays(today(), 7));
  await dialog().getByRole('button', { name: 'Save leaving details' }).click();
  await dialog().getByText('Saved.').waitFor();
  // Escape closes it even after the save button has taken focus away (October 2026).
  await admin.keyboard.press('Escape');
  await dialog().waitFor({ state: 'detached' });
  await card.getByText('Resigned: Moving away').waitFor();
});

await step('Lock pay now puts the prompt back', async () => {
  if (await dialog().isVisible()) await dialog().getByRole('button', { name: 'Close' }).click();
  await admin.getByRole('button', { name: /Lock pay now/ }).click();
  await admin.getByRole('heading', { name: /Enter your PIN to see pay/ }).waitFor();
  const r = await call(admin, '/pay');
  if (r.status !== 403) throw new Error(`still open after locking: ${r.status}`);
});

await step('providers are left out', async () => {
  const provider = sql(
    `select e.id from employees e join employee_job_roles m on m."employeeId" = e.id join job_roles j on j.id = m."jobRoleId" where j."usesClinicalForms" limit 1`,
  );
  if (!provider) return;
  await call(admin, '/pay-lock/unlock', {
    method: 'POST',
    body: JSON.stringify({ password: 'shift-change-2026' }),
  });
  const r = await call(admin, `/pay/${provider}`);
  if (r.status !== 404) throw new Error(`a provider's pay answered ${r.status}`);
  const all = await call(admin, '/pay');
  if (all.body.current.some((person) => person.id === provider)) throw new Error('a provider is listed');
});

await call(admin, `/rota-cost/access/${adminId}`, { method: 'DELETE' });
await browser.close();
if (errors.length) {
  console.log(`\n${errors.length} failing:`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log('\nAll pay checks passed.');
