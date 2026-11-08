import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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
 * A provider's day off (Dominguez, 8 November 2026): a manager decides first,
 * then each shift gets its own answer - keep, remove, leave open or ask for
 * cover - and Ask for cover has the manager pick who is asked. Nothing is
 * sent until Approve. Afterwards the request shows who covers each shift, and
 * a colleague whose own telemedicine shift would be released is told so.
 *
 * Max (MA) is made a provider here (the seed puts the job role back). He has
 * office shifts at North Bergen on Tue 9 and Wed 10 March 2027. Frankie has a
 * telemedicine shift on the 10th, so she can be asked but with a catch; Ada
 * is free. Shifts are tagged `provider-day-off-suite`; run-all.sh removes them
 * and the time off.
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

const TAG = 'provider-day-off-suite';
// New Jersey is on EST until 14 March 2027, then EDT.
const at = (day, hour) =>
  `2027-03-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00${day < 14 ? '-05:00' : '-04:00'}`;

// The seed leaves Max on a temporary password and at West New York only; the
// suite signs him in and gives him North Bergen too (the seed puts both back).
execFileSync(
  'psql',
  [
    '-h',
    process.env.PGHOST_LOCAL || '127.0.0.1',
    '-p',
    process.env.PGPORT_LOCAL || '5433',
    '-U',
    process.env.PGUSER_LOCAL || 'postgres',
    '-d',
    process.env.PGDATABASE_LOCAL || 'stafftime',
    '-q',
    '-c',
    `update employees set "mustChangePassword" = false where email = 'ma@domihealthcare.com';
     insert into employee_locations ("employeeId", "locationId")
       select e.id, l.id from employees e, locations l
       where e.email = 'ma@domihealthcare.com' and l.slug = 'north-bergen'
       on conflict do nothing;`,
  ],
  { encoding: 'utf8' },
);

const admin = await signIn('admin@domihealthcare.com');
const mgr = await signIn('manager@domihealthcare.com');
const max = await signIn('ma@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
const ada = admin;

const staff = (await call(mgr, '/employees')).body;
const idOf = (email) => staff.find((p) => p.email === email).id;
const nb = (await call(mgr, '/locations')).body.find((l) => l.name === 'North Bergen').id;
let providerRole = null;
async function shift(email, day, from, to, extra = {}) {
  const made = await call(mgr, '/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: idOf(email),
      locationId: nb,
      jobRoleId: providerRole,
      startsAt: at(day, from),
      endsAt: at(day, to),
      notes: TAG,
      status: 'PUBLISHED',
      ...extra,
    }),
  });
  if (made.status !== 201)
    throw new Error(`making a shift answered ${made.status}: ${JSON.stringify(made.body)}`);
  return made.body;
}
const covers = async (page) =>
  (await call(page, '/notifications')).body.items.filter((n) => n.kind === 'COVER_REQUEST');

let tue, wed, request;

await step(
  'set-up: Max is a provider with two office shifts; Frankie is on telemedicine the 10th',
  async () => {
    const provider = (await call(admin, '/job-roles')).body.find((r) => r.name === 'Provider');
    providerRole = provider.id;
    // Max asks; Ada and Frankie are the colleagues who could cover (same role).
    for (const email of [
      'ma@domihealthcare.com',
      'admin@domihealthcare.com',
      'frontdesk@domihealthcare.com',
    ]) {
      const joined = await call(admin, `/job-roles/${provider.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ employeeId: idOf(email) }),
      });
      if (joined.status >= 300) throw new Error(`joining answered ${joined.status}`);
    }
    tue = await shift('ma@domihealthcare.com', 9, 9, 17);
    wed = await shift('ma@domihealthcare.com', 10, 9, 17);
    await shift('frontdesk@domihealthcare.com', 10, 9, 17, { isRemote: true });
    const asked = await call(max, '/pto', {
      method: 'POST',
      body: JSON.stringify({
        type: 'UNPAID',
        startDate: '2027-03-09',
        endDate: '2027-03-10',
        notes: TAG,
      }),
    });
    if (asked.status !== 201)
      throw new Error(`asking answered ${asked.status}: ${JSON.stringify(asked.body)}`);
    request = asked.body.id;
  },
);

await step('the server knows it is a provider with two shifts', async () => {
  const day = (await call(mgr, `/pto/${request}/provider-day-off`)).body;
  if (!day.isProvider || day.shifts.length !== 2) throw new Error(JSON.stringify(day));
});

await step(
  'approving opens a choice for each shift, and cover lists the people with their catches',
  async () => {
    await mgr.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
    const card = mgr.getByTestId(`time-off-request-${request}`);
    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    const dialog = mgr.getByTestId('provider-day-off');
    await dialog.waitFor({ timeout: 10000 });
    const shifts = dialog.getByTestId('provider-shift');
    await shifts.nth(1).waitFor({ timeout: 10000 });
    if ((await shifts.count()) !== 2) throw new Error('both shifts should be listed');
    for (const label of ['Keep', 'Remove', 'Leave open', 'Ask for cover']) {
      if ((await shifts.first().getByLabel(label, { exact: true }).count()) !== 1)
        throw new Error(`no ${label}`);
    }
    // The 10th: Frankie is offered with the telemedicine catch, unticked.
    const second = shifts.nth(1);
    await second.getByLabel('Ask for cover', { exact: true }).check();
    const frankieRow = second.locator('label', { hasText: 'Frankie' });
    await frankieRow.waitFor({ timeout: 10000 });
    if (!/telemedicine/i.test(await frankieRow.innerText()))
      throw new Error(`catch: ${await frankieRow.innerText()}`);
    if (await frankieRow.locator('input').isChecked())
      throw new Error('a catch should start unticked');
    await dialog.screenshot({ path: `${OUT}/provider-day-off.png` });
  },
);

await step('nothing is sent before Approve', async () => {
  if ((await covers(frankie)).length || (await covers(ada)).length)
    throw new Error('somebody was told early');
});

await step('Approve with Ada asked for the 9th and Frankie for the 10th', async () => {
  const dialog = mgr.getByTestId('provider-day-off');
  const shifts = dialog.getByTestId('provider-shift');
  const first = shifts.first();
  await first.getByLabel('Ask for cover', { exact: true }).check();
  for (const row of await first.getByTestId('provider-ask-people').locator('label').all()) {
    const want = /Ada/.test(await row.innerText());
    const box = row.locator('input');
    if ((await box.isChecked()) !== want) await box.click();
  }
  const second = shifts.nth(1);
  await second.locator('label', { hasText: 'Frankie' }).locator('input').check();
  for (const row of await second.getByTestId('provider-ask-people').locator('label').all()) {
    const want = /Frankie/.test(await row.innerText());
    const box = row.locator('input');
    if ((await box.isChecked()) !== want) await box.click();
  }
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
  // The pop-up closes as the save starts; wait for the decision to land.
  let listed;
  for (let i = 0; i < 20 && !listed; i++) {
    listed = (await call(mgr, '/pto?status=APPROVED')).body.find((r) => r.id === request);
    if (!listed) await mgr.waitForTimeout(500);
  }
  if (!listed) throw new Error('not approved');
});

await step('Ada and Frankie are told; Max is not asked', async () => {
  if ((await covers(ada)).length < 1) throw new Error('Ada was not asked');
  if ((await covers(frankie)).length < 1) throw new Error('Frankie was not asked');
  if ((await covers(max)).length) throw new Error('Max was asked to cover his own shift');
});

await step('Frankie is warned her telemedicine shift would be released', async () => {
  const told = (await covers(frankie))[0];
  await frankie.goto(`${BASE}${told.link}`, { waitUntil: 'networkidle' });
  const warning = frankie.getByTestId('cover-releases');
  await warning.waitFor({ timeout: 10000 });
  if (!/free your telemedicine/.test(await warning.innerText()))
    throw new Error(await warning.innerText());
  await frankie.screenshot({ path: `${OUT}/provider-cover-releases.png` });
});

await step('Ada has no warning: nothing of hers is released', async () => {
  const told = (await covers(ada))[0];
  await ada.goto(`${BASE}${told.link}`, { waitUntil: 'networkidle' });
  await ada.getByRole('button', { name: 'Yes, I’ll take it' }).waitFor({ timeout: 10000 });
  if (await ada.getByTestId('cover-releases').count()) throw new Error('Ada was warned');
  await ada.getByRole('button', { name: 'Yes, I’ll take it' }).click();
  await ada.getByText('It’s yours').waitFor({ timeout: 10000 });
});

await step('the request shows coverage per shift for the manager', async () => {
  await mgr.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: 'Approved', exact: true }).first().click();
  const coverage = mgr.getByTestId(`time-off-request-${request}`).getByTestId('provider-coverage');
  await coverage.waitFor({ timeout: 10000 });
  const lines = await coverage.getByTestId('coverage-line').allInnerTexts();
  if (lines.length !== 2) throw new Error(`lines: ${lines.join(' | ')}`);
  if (!/Covered by Ada/.test(lines[0])) throw new Error(`first: ${lines[0]}`);
  if (!/Asked 1, waiting/.test(lines[1])) throw new Error(`second: ${lines[1]}`);
  await coverage.screenshot({ path: `${OUT}/provider-coverage.png` });
});

await step('staff do not get the provider look-up', async () => {
  const peek = await call(max, `/pto/${request}/provider-day-off`);
  if (peek.status !== 403 && peek.status !== 404) throw new Error(`staff answered ${peek.status}`);
});

await step("a request that is not a provider's keeps the three simple buttons", async () => {
  // Frankie joined Provider above as a cover; here she is plain front desk again.
  execFileSync(
    'psql',
    [
      '-h',
      process.env.PGHOST_LOCAL || '127.0.0.1',
      '-p',
      process.env.PGPORT_LOCAL || '5433',
      '-U',
      process.env.PGUSER_LOCAL || 'postgres',
      '-d',
      process.env.PGDATABASE_LOCAL || 'stafftime',
      '-q',
      '-c',
      `delete from employee_job_roles where "employeeId" = (select id from employees where email = 'frontdesk@domihealthcare.com') and "jobRoleId" = (select id from job_roles where name = 'Provider')`,
    ],
    { encoding: 'utf8' },
  );
  await shift('frontdesk@domihealthcare.com', 16, 9, 17, { jobRoleId: null });
  const asked = await call(frankie, '/pto', {
    method: 'POST',
    body: JSON.stringify({
      type: 'UNPAID',
      startDate: '2027-03-16',
      endDate: '2027-03-16',
      notes: TAG,
    }),
  });
  if (asked.status !== 201) throw new Error(`asking answered ${asked.status}`);
  await mgr.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  await mgr
    .getByTestId(`time-off-request-${asked.body.id}`)
    .getByRole('button', { name: 'Approve', exact: true })
    .click();
  const dialog = mgr.getByTestId('approve-time-off');
  await dialog.waitFor({ timeout: 10000 });
  if (await mgr.getByTestId('provider-day-off').count())
    throw new Error('a per-shift dialog for staff');
  await dialog.getByRole('button', { name: 'Approve, and leave it on the rota' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
});

await step(
  'filing for a provider opens the per-shift choice straight away, and does not approve',
  async () => {
    await shift('ma@domihealthcare.com', 23, 9, 17);
    const maxId = idOf('ma@domihealthcare.com');
    await mgr.goto(`${BASE}/time-off?request=1&for=${maxId}`, { waitUntil: 'networkidle' });
    await mgr.getByLabel('First day').fill('2027-03-23');
    await mgr.getByLabel('Last day').fill('2027-03-23');
    await mgr.getByLabel('Notes').fill(TAG);
    await mgr.getByRole('button', { name: 'Send request' }).click();
    const dialog = mgr.getByTestId('provider-day-off');
    await dialog.waitFor({ timeout: 10000 });
    await dialog.getByTestId('provider-shift').first().waitFor();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    const pending = (await call(mgr, '/pto?status=PENDING')).body.filter(
      (r) => r.employeeId === maxId && r.startDate.startsWith('2027-03-23'),
    );
    if (pending.length !== 1) throw new Error(`pending requests for the 23rd: ${pending.length}`);
  },
);

await step('nobody files their own and gets the per-shift choice', async () => {
  await max.goto(`${BASE}/time-off?request=1`, { waitUntil: 'networkidle' });
  await max.getByLabel('First day').fill('2027-03-30');
  await max.getByLabel('Last day').fill('2027-03-30');
  await max.getByLabel('Notes').fill(TAG);
  await max.getByRole('button', { name: 'Send request' }).click();
  await max.getByText(TAG).first().waitFor({ timeout: 10000 });
  if (await max.getByTestId('provider-day-off').count())
    throw new Error('Max got a manager dialog');
});

await step(
  'Frankie takes the North Bergen shift: her telemedicine shift is released and the manager is told',
  async () => {
    const told = (await covers(frankie))[0];
    await frankie.goto(`${BASE}${told.link}`, { waitUntil: 'networkidle' });
    await frankie.getByRole('button', { name: 'Yes, I’ll take it' }).click();
    await frankie.getByText('It’s yours').waitFor({ timeout: 10000 });
    const day = (await call(mgr, `/pto/${request}/provider-day-off`)).body;
    const second = day.shifts.find((x) => x.cover?.takenBy?.firstName === 'Frankie');
    if (!second) throw new Error(JSON.stringify(day.shifts.map((x) => x.cover?.state)));
    if (!second.releasedRemote || second.releasedRemote.length !== 1)
      throw new Error(`released: ${JSON.stringify(second.releasedRemote)}`);
    const bell = (await call(mgr, '/notifications')).body.items.find((n) =>
      /telemedicine/i.test(`${n.title} ${n.body}`),
    );
    if (!bell) throw new Error('the manager was not told about the telemedicine hours');
  },
);

await browser.close();
console.log(
  `\n${errors.length === 0 ? 'ALL PROVIDER-DAY-OFF CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`,
);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
