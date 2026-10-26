import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const API = process.env.API_URL || 'http://127.0.0.1:3000/api';
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
 * Downtime (October 2026, Dominguez: "a downtime section - things that are
 * needed or to do when downtime happens (i.e. no access to EMR) it should be
 * activated by manager/admin and then closed by them as well - it should put
 * notifications for employees who have a shift now or upcoming today"):
 *
 * - staff cannot start one; a manager starts one at North Bergen, and the
 *   person on shift there is told, the one at West New York is not;
 * - the red bar on every screen, the person's own steps first;
 * - who was contacted and an update, told to the same people;
 * - closed with a cause, everybody told, in the log with its summary,
 *   caught up and shredded;
 * - the printed forms (17 sign-in rows, every provider on the pads, the
 *   managers' sheet with the numbers, the Spanish window sign);
 * - somebody coming on shift later is told by the five-minute timer;
 * - a planned one, cancelled;
 * - the monthly check from the admin team, and what managers see of it.
 *
 * Downtimes, checks and the shifts tagged `downtime-suite` are removed by
 * run-all.sh.
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
const TAG = 'downtime-suite';

// A clean slate: no downtimes or checks left from an earlier run.
sql('delete from downtimes; delete from downtime_checks; delete from downtime_check_notices;');
sql(`delete from shifts where notes = '${TAG}';`);
sql("delete from notifications where kind = 'DOWNTIME';");

/// A published shift today, `fromMinutes` from now for `hours`.
const shift = (email, slug, fromMinutes, hours) =>
  sql(`insert into shifts (id, "employeeId", "locationId", "startsAt", "endsAt", status, notes, "updatedAt")
       select gen_random_uuid(), e.id, l.id,
         now() + interval '${fromMinutes} minutes',
         now() + interval '${fromMinutes} minutes' + interval '${hours} hours', 'PUBLISHED', '${TAG}', now()
       from employees e, locations l
       where e.email = '${email}' and l.slug = '${slug}'
       returning id`);

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
      const r = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
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

const told = (email) =>
  Number(
    sql(`select count(*) from notifications n join employees e on e.id = n."employeeId"
         where e.email = '${email}' and n.kind = 'DOWNTIME'`),
  );

// Frankie on shift at North Bergen now, Max at West New York.
shift('frontdesk@domihealthcare.com', 'north-bergen', -30, 4);
shift('ma@domihealthcare.com', 'west-new-york', -30, 4);

const manager = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
const nb = (await call(manager, '/locations')).body.find((l) => l.slug === 'north-bergen');

await step('staff see nothing is down, and cannot start one', async () => {
  await frankie.goto(`${BASE}/downtime`, { waitUntil: 'networkidle' });
  await frankie.getByTestId('downtime-none').waitFor();
  if (await frankie.getByRole('button', { name: 'Start a downtime' }).count()) {
    throw new Error('staff are offered Start a downtime');
  }
  const tried = await call(frankie, '/downtime', {
    method: 'POST',
    body: JSON.stringify({ systems: ['ECW'], locationIds: [nb.id] }),
  });
  if (tried.status !== 403) throw new Error(`staff starting one answered ${tried.status}`);
  if (await frankie.locator('input[type=file]').count()) throw new Error('a file input on the page');
});

await step('a manager starts an eCW downtime at North Bergen; the people on shift there are told', async () => {
  await manager.goto(`${BASE}/downtime`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: 'Start a downtime' }).click();
  const dialog = manager.getByTestId('start-downtime');
  await dialog.getByLabel('West New York').waitFor();
  // eCW starts on both offices; this one is at North Bergen alone.
  if (!(await dialog.getByLabel('West New York').isChecked())) throw new Error('eCW did not start on both');
  await dialog.getByLabel('West New York').uncheck();
  await dialog.getByLabel('A note (optional)').fill('eCW down since 9:10, support says about an hour');
  await dialog.screenshot({ path: `${OUT}/downtime-start.png` });
  const started = manager.waitForResponse((r) => r.url().endsWith('/api/downtime') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Start it and tell staff' }).click();
  if ((await started).status() !== 201) throw new Error('start failed');
  const card = manager.getByTestId('downtime-active');
  await card.getByRole('heading', { name: 'eCW is down at North Bergen' }).waitFor();
  if (told('frontdesk@domihealthcare.com') !== 1) throw new Error('Frankie was not told once');
  if (told('ma@domihealthcare.com') !== 0) throw new Error('Max at West New York was told');
  if (told('admin@domihealthcare.com') !== 1) throw new Error('the admin was not told');
  if (told('manager@domihealthcare.com') !== 0) throw new Error('whoever started it was told');
});

await step('the red bar shows on every screen, and What to do opens on their own job', async () => {
  await frankie.goto(`${BASE}/directory`, { waitUntil: 'networkidle' });
  const bar = frankie.getByTestId('downtime-banner');
  await bar.getByText('eCW is down at North Bergen').waitFor({ timeout: 15000 });
  await frankie.screenshot({ path: `${OUT}/downtime-banner.png` });
  await bar.getByRole('link', { name: 'What to do' }).click();
  const guide = frankie.getByTestId('guide-downtime');
  await guide.getByRole('heading', { name: 'eCW is down' }).first().waitFor();
  await guide.getByRole('button', { name: 'Front desk', pressed: true }).waitFor();
  if (await guide.getByRole('heading', { name: 'Starting a downtime' }).count()) {
    throw new Error('the managers’ steps are shown first to the front desk');
  }
  // The bell says it too.
  const list = (await call(frankie, '/notifications')).body;
  const items = Array.isArray(list) ? list : list.items ?? list.notifications ?? [];
  if (!items.some((n) => n.kind === 'DOWNTIME' && /eCW is down at North Bergen/.test(n.title))) {
    throw new Error(`no bell note: ${JSON.stringify(items.slice(0, 2))}`);
  }
});

await step('a manager ticks who they called and posts an update; the same people hear it', async () => {
  await manager.goto(`${BASE}/downtime`, { waitUntil: 'networkidle' });
  const card = manager.getByTestId('downtime-active');
  const contacts = card.getByTestId('downtime-contacts');
  await contacts.getByText('Stephanie Parker').waitFor();
  if (await contacts.getByText('Miguel (IT)').count()) throw new Error('the internet contact shows for eCW');
  // Ticked once the server has it: wait for the save, then the tick.
  const box = contacts.getByLabel('Contacted eCW: Stephanie Parker');
  const ticked = manager.waitForResponse((r) => /\/contacts\//.test(r.url()));
  await box.click();
  await ticked;
  await contacts.getByText(/^Done /).waitFor();
  if (!(await box.isChecked())) throw new Error('not ticked');
  await card.getByLabel('Post an update').fill('Stephanie says another 30 minutes.');
  await card.getByRole('button', { name: 'Post update' }).click();
  await card.getByTestId('downtime-updates').getByText('Stephanie says another 30 minutes.').waitFor();
  await manager.screenshot({ path: `${OUT}/downtime-now.png`, fullPage: true });
  if (told('frontdesk@domihealthcare.com') !== 2) throw new Error('Frankie did not hear the update');
  if (told('ma@domihealthcare.com') !== 0) throw new Error('Max heard the update');
  // Staff never see who was contacted.
  const staffView = (await call(frankie, '/downtime/current')).body;
  if (staffView.active[0].contactsMade.length !== 0 || staffView.contacts.length !== 0) {
    throw new Error('staff are sent the contacts');
  }
});

await step('somebody coming on shift later is told by the five-minute timer', async () => {
  // Max is moved to North Bergen, starting in an hour.
  sql(`update shifts set "locationId" = '${nb.id}', "startsAt" = now() + interval '60 minutes',
       "endsAt" = now() + interval '5 hours' where notes = '${TAG}'
       and "employeeId" = (select id from employees where email = 'ma@domihealthcare.com')`);
  const secret = process.env.PUNCH_REMINDER_SECRET;
  if (!secret) {
    console.log('  (no PUNCH_REMINDER_SECRET: the timer is not called)');
    return;
  }
  const run = await fetch(`${API}/maintenance/punch-reminders`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const report = await run.json();
  if (!report.downtime || report.downtime.later !== 1) throw new Error(JSON.stringify(report.downtime));
  if (told('ma@domihealthcare.com') !== 1) throw new Error('Max was not told');
  const again = await (
    await fetch(`${API}/maintenance/punch-reminders`, { headers: { Authorization: `Bearer ${secret}` } })
  ).json();
  if (again.downtime.later !== 0) throw new Error('told twice');
});

await step('a manager closes it with the cause; everybody told hears it is back', async () => {
  await manager.goto(`${BASE}/downtime`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: "It's back: close the downtime" }).click();
  const dialog = manager.getByTestId('end-downtime');
  await dialog.getByLabel('What caused it?').selectOption('ECW_OUTAGE');
  await dialog.getByLabel('More about it (optional)').fill('eCW server restarted by TMG');
  await dialog.getByText('Under 4 hours: caught up before the end of today.').waitFor();
  await dialog.getByRole('button', { name: 'Close it and tell staff' }).click();
  await manager.getByTestId('downtime-none').waitFor();
  const back = sql(`select n.title from notifications n join employees e on e.id = n."employeeId"
       where e.email = 'frontdesk@domihealthcare.com' and n.kind = 'DOWNTIME' order by n."createdAt" desc limit 1`);
  if (back !== 'eCW is back at North Bergen') throw new Error(`Frankie was told "${back}"`);
  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await frankie.getByText('Not clocked in').first().waitFor();
  if (await frankie.getByTestId('downtime-banner').count()) throw new Error('the red bar is still up');
});

await step('the log adds it up; a manager marks it caught up and the paper shredded', async () => {
  await manager.goto(`${BASE}/downtime?tab=log`, { waitUntil: 'networkidle' });
  const log = manager.getByTestId('downtime-log');
  await log.getByTestId('downtime-summary').getByText('Downtimes').waitFor();
  const entry = log.getByTestId('downtime-logged').first();
  await entry.getByText('eCW outage').waitFor();
  await entry.getByText('What happened').click();
  await entry.getByText(/Contacted eCW: Stephanie Parker/).waitFor();
  await entry.getByText(/Stephanie says another 30 minutes/).waitFor();
  await manager.screenshot({ path: `${OUT}/downtime-log.png`, fullPage: true });
  await entry.getByRole('button', { name: 'Mark caught up' }).click();
  await entry.getByRole('button', { name: 'Mark the paper shredded' }).click();
  await entry.getByText(/^Paper shredded /).waitFor();
  const summary = (await call(manager, '/downtime/log')).body.summary;
  if (summary.count !== 1 || summary.byCause[0].label !== 'eCW outage') throw new Error(JSON.stringify(summary));
  const staffLog = await call(frankie, '/downtime/log');
  if (staffLog.status !== 403) throw new Error(`staff reading the log answered ${staffLog.status}`);
});

await step('the forms print: 17 sign-in rows, every provider on the pads, the Spanish sign', async () => {
  const ctx = manager.context();
  const sheet = await ctx.newPage();
  // The print window opens by itself; in a test it is a no-op.
  await sheet.addInitScript(() => {
    window.print = () => {
      window.__printed = (window.__printed ?? 0) + 1;
    };
  });
  await sheet.goto(`${BASE}/downtime/print?form=sign-in&copies=2`, { waitUntil: 'networkidle' });
  const signIn = sheet.getByTestId('downtime-print-sign-in');
  await signIn.locator('section').first().waitFor();
  if ((await signIn.locator('section').count()) !== 2) throw new Error('not two copies');
  if ((await signIn.locator('section').first().locator('tbody tr').count()) !== 17) {
    throw new Error('not 17 rows');
  }
  await sheet.screenshot({ path: `${OUT}/downtime-print-sign-in.png` });

  await sheet.goto(`${BASE}/downtime/print?form=pads&copies=1`, { waitUntil: 'networkidle' });
  const pads = sheet.getByTestId('downtime-print-pads');
  await pads.getByText('Jonathan M. Dominguez, M.D.').first().waitFor();
  for (const npi of ['1376923755', '1700383924', '1740926161', '1891484499', '1003370875']) {
    if ((await pads.getByText(`NPI ${npi}`).count()) !== 2) throw new Error(`NPI ${npi} not on both slips`);
  }
  await pads.getByText('219 60th Street, West New York, NJ 07093').first().waitFor();
  await sheet.screenshot({ path: `${OUT}/downtime-print-pads.png` });

  await sheet.goto(`${BASE}/downtime/print?form=role&group=Managers%20and%20admins&copies=1`, {
    waitUntil: 'networkidle',
  });
  const role = sheet.getByTestId('downtime-print-role');
  await role.getByText('Starting a downtime').waitFor();
  await role.getByText('347-580-9685').waitFor();

  await sheet.goto(`${BASE}/downtime/print?form=sign&copies=1`, { waitUntil: 'networkidle' });
  await sheet.getByText('Seguimos atendiendo a los pacientes. Gracias por su paciencia.').waitFor();
  await sheet.getByText('Our computer system is down right now.').waitFor();
  if (!(await sheet.evaluate(() => window.__printed))) throw new Error('the print window never opened');
  await sheet.close();
});

await step('the BrainCheck Care Plan and the AWV print on paper, the AWV in Spanish too', async () => {
  const sheet = await frankie.context().newPage();
  await sheet.addInitScript(() => {
    window.print = () => {};
  });
  await sheet.goto(`${BASE}/downtime/print?form=braincheck&copies=1`, { waitUntil: 'networkidle' });
  const bc = sheet.getByTestId('downtime-print-braincheck');
  await bc.getByText('J. Written care plan').waitFor();
  await bc.getByText('Repeat the BrainCheck memory assessment in 6 to 12 months.').waitFor();
  await bc.getByText('Keep memory and thinking skills as strong as possible').waitFor();
  await sheet.screenshot({ path: `${OUT}/downtime-print-braincheck.png` });
  await sheet.goto(`${BASE}/downtime/print?form=awv-es&copies=1`, { waitUntil: 'networkidle' });
  const awv = sheet.getByTestId('downtime-print-awv-es');
  await awv.getByText('¿Vive solo o sola?').waitFor();
  await awv.getByText('Abdominal aortic aneurysm screening').waitFor();
  if (await sheet.locator('input').count()) throw new Error('a paper form has an input on it');
  await sheet.close();
  // On the Forms tab for everybody, front desk included, to print the stack.
  await frankie.goto(`${BASE}/downtime?tab=forms`, { waitUntil: 'networkidle' });
  await frankie.getByTestId('downtime-forms').getByRole('heading', { name: 'BrainCheck Care Plan' }).waitFor();
  await frankie.getByTestId('downtime-forms').getByRole('heading', { name: 'Annual Wellness Visit, in Spanish' }).waitFor();
});

await step('staff do not get the managers’ sheet or the support numbers', async () => {
  await frankie.goto(`${BASE}/downtime?tab=forms`, { waitUntil: 'networkidle' });
  await frankie.getByTestId('downtime-forms').getByText('What to do: Front desk').waitFor();
  if (await frankie.getByText('What to do: Managers and admins').count()) {
    throw new Error('staff are offered the managers’ sheet');
  }
  const contacts = await call(frankie, '/downtime/setup/contacts');
  if (contacts.status !== 403) throw new Error(`staff reading the contacts answered ${contacts.status}`);
});

await step('a planned downtime is listed, and cancelled', async () => {
  const tomorrow = new Date(Date.now() + 36 * 3600_000).toISOString();
  const planned = await call(manager, '/downtime', {
    method: 'POST',
    body: JSON.stringify({ systems: ['ECW'], locationIds: [nb.id], planned: true, startsAt: tomorrow, note: 'eCW upgrade' }),
  });
  if (planned.status !== 201 || planned.body.status !== 'PLANNED') throw new Error(JSON.stringify(planned.body));
  await manager.goto(`${BASE}/downtime`, { waitUntil: 'networkidle' });
  const card = manager.getByTestId('downtime-planned');
  await card.getByText('eCW upgrade').waitFor();
  await card.getByRole('button', { name: 'Cancel it' }).click();
  await manager.getByRole('alertdialog').getByRole('button', { name: 'Cancel it' }).click();
  await card.waitFor({ state: 'detached' });
  const past = await call(manager, '/downtime', {
    method: 'POST',
    body: JSON.stringify({ systems: ['ECW'], locationIds: [nb.id], planned: true, startsAt: new Date(Date.now() - 60_000).toISOString() }),
  });
  if (past.status !== 400) throw new Error(`a planned one in the past answered ${past.status}`);
});

await step('the admin team is asked for the monthly check, and managers see what it found', async () => {
  const admin = await signIn('admin@domihealthcare.com');
  await admin.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const homeCard = admin.getByTestId('home-downtime-check');
  await homeCard.waitFor({ timeout: 15000 });
  await homeCard.getByRole('link', { name: 'Do the check' }).click();
  const form = admin.getByTestId('downtime-check-form');
  await form.waitFor();
  await form.locator('li', { hasText: 'Downtime progress notes' }).getByLabel('Low').check();
  await form.getByLabel(/Anything changed/).fill('We keep the folder in the second drawer now.');
  await admin.screenshot({ path: `${OUT}/downtime-check.png`, fullPage: true });
  await form.getByRole('button', { name: 'Send' }).click();
  await admin.getByTestId('downtime-check-done').waitFor();
  await admin.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await admin.getByText('Not clocked in').first().waitFor();
  if (await admin.getByTestId('home-downtime-check').count()) throw new Error('still asked on Home');

  // Frankie, front desk, is not asked.
  const frankieCheck = (await call(frankie, '/downtime/check/mine')).body;
  if (frankieCheck.asked) throw new Error('the front desk is asked for the check');

  const attention = (await call(manager, '/attention')).body;
  if (!(attention.downtime ?? []).some((line) => /Running low.*Downtime progress notes/.test(line))) {
    throw new Error(`not in the round-up: ${JSON.stringify(attention.downtime)}`);
  }
  await manager.goto(`${BASE}/downtime?tab=check`, { waitUntil: 'networkidle' });
  const found = manager.getByTestId('downtime-checks');
  await found.getByText('We keep the folder in the second drawer now.').waitFor();
  await found.getByRole('button', { name: 'Mark read' }).click();
  await found.getByText(/^Read/).waitFor();
  const after = (await call(manager, '/attention')).body;
  if ((after.downtime ?? []).length) throw new Error(`still in the round-up: ${after.downtime}`);
});

await step('set-up: an NPI that does not check out is refused', async () => {
  const providers = (await call(manager, '/downtime/setup/pad-providers')).body;
  const bad = await call(manager, '/downtime/setup/pad-providers', {
    method: 'PUT',
    body: JSON.stringify({
      providers: [...providers.map(({ id, name, npi }) => ({ id, name, npi })), { name: 'Test Provider, M.D.', npi: '1700383942' }],
    }),
  });
  if (bad.status !== 400) throw new Error(`a bad NPI answered ${bad.status}`);
  await manager.goto(`${BASE}/downtime?tab=setup`, { waitUntil: 'networkidle' });
  await manager.getByTestId('downtime-contacts-editor').getByText('Who to contact').waitFor();
  await manager.getByTestId('downtime-pad-providers').locator('input[value="1003370875"]').waitFor();
});

await browser.close();
sql('delete from downtimes; delete from downtime_checks; delete from downtime_check_notices;');
sql(`delete from shifts where notes = '${TAG}';`);
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL DOWNTIME STEPS PASSED');
