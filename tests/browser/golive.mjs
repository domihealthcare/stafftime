import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { pickFromAccountMenu } from './account-menu.mjs';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const API_LOG = process.env.API_LOG || '/tmp/api.log';

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

/**
 * Going from a test deployment to real use, the way an admin does it in a
 * browser: clear the test data, add the staff list in one paste, and send the
 * welcome emails — then a new starter follows the link and signs in.
 *
 * The imported people all have addresses at example.com starting "imp-", so
 * run-all's reset can take them out again.
 */
async function signIn(email, password = 'shift-change-2026') {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

function latestWelcomeLink(email) {
  const log = readFileSync(API_LOG, 'utf8');
  const blocks = log.split('──────── email (not sent) ────────').filter((b) => b.includes(`To:      ${email}`));
  const link = blocks.at(-1)?.match(/\/reset-password\?token=[A-Za-z0-9_-]+&welcome=1/);
  if (!link) throw new Error(`no welcome link for ${email} in ${API_LOG}`);
  return link[0];
}

const admin = await signIn('admin@domihealthcare.com');

// Something to clear: the demo data, as a test deployment has it.
await admin.evaluate(async () => {
  const r = await fetch('/api/demo/load', { method: 'POST' });
  if (!r.ok) throw new Error(await r.text());
});

await step('an employee cannot see or clear the test data', async () => {
  const staff = await signIn('frontdesk@domihealthcare.com');
  const look = await staff.request.get(`${BASE}/api/demo/test-data`);
  const clear = await staff.request.post(`${BASE}/api/demo/clear`, {
    data: { confirm: 'clear-test-data' },
  });
  if (look.status() !== 403 || clear.status() !== 403) {
    throw new Error(`employee got ${look.status()} / ${clear.status()}`);
  }
  await staff.context().close();
});

await step('clearing needs the confirmation spelled out', async () => {
  const response = await admin.request.post(`${BASE}/api/demo/clear`, { data: {} });
  if (response.status() !== 400) throw new Error(`answered ${response.status()}`);
});

await step('Practice settings shows what would be cleared, and which accounts stay', async () => {
  await pickFromAccountMenu(admin, 'Practice settings');
  const card = admin.getByTestId('go-live');
  await card.getByRole('button', { name: 'See what would be cleared' }).click();
  await card.getByText(/\d+ demo staff accounts/).waitFor({ timeout: 10000 });
  await card.getByText(/\d+ shifts/).first().waitFor();
  const keeping = await card.getByTestId('go-live-keeping').innerText();
  if (!keeping.includes('admin@domihealthcare.com')) throw new Error(`keeping: ${keeping}`);
  if (/demo/i.test(keeping) || keeping.includes('j.santos')) {
    throw new Error(`a demo account is listed as staying: ${keeping}`);
  }
  await admin.screenshot({ path: `${OUT}/golive-preview.png`, fullPage: true });
});

await step('clearing asks first, then removes the demo staff and the test activity', async () => {
  const card = admin.getByTestId('go-live');
  await card.getByRole('button', { name: 'Clear the test data' }).click();
  await admin
    .getByRole('alertdialog', { name: 'Clear all the test data?' })
    .getByRole('button', { name: 'Yes, clear it' })
    .click();
  await card.getByText('The test data is cleared.').waitFor({ timeout: 20000 });

  const counts = await admin.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const preview = await fetch('/api/demo/test-data').then((r) => r.json());
    const roles = await fetch('/api/job-roles').then((r) => r.json());
    const places = await fetch('/api/locations').then((r) => r.json());
    return {
      demo: staff.filter((p) => p.externalId?.startsWith('demo:')).length,
      remaining: Object.values(preview.removing).reduce((a, b) => a + b, 0),
      roles: roles.length,
      places: places.length,
    };
  });
  if (counts.demo !== 0) throw new Error(`${counts.demo} demo staff left`);
  if (counts.remaining !== 0) throw new Error(`${counts.remaining} test records left`);
  if (counts.roles < 5 || counts.places < 2) throw new Error('the set-up went too');
});

await step('a demo account can no longer sign in', async () => {
  const response = await admin.request.post(`${BASE}/api/auth/login`, {
    data: { email: 'j.santos@domihealthcare.com', password: 'shift-change-2026' },
  });
  if (response.ok()) throw new Error('a demo account still signs in');
});

const LIST = [
  ['Name', 'Work Email', 'Mobile', 'Location', 'Position', 'Start Date', 'SSN', 'Access'],
  ['Imogen Park', 'IMP-Imogen@Example.com', '201-555-0101', 'NB', 'Front Desk', '3/1/2024', '123-45-6789', ''],
  ['Parker, Ivan', 'imp-ivan@example.com', '', 'Both', 'MA / Front Desk', '2023-06-15', '987-65-4321', 'Manager'],
  ['Isla Moreno', 'imp-isla@example.com', '', 'West New York', 'Provider, Administrative', 'June 2, 2022', '', ''],
];
const paste = (rows) => rows.map((row) => row.join('\t')).join('\n');

await step('a pasted list with a mistake is shown, marked, and not added', async () => {
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: 'Add several people' }).click();
  const panel = admin.getByTestId('import-staff');
  const broken = LIST.map((row) => [...row]);
  broken[3][3] = 'Hoboken';
  broken[3][5] = '13/45/2022';
  await panel.getByLabel('Staff list').fill(paste(broken));

  const columns = await panel.getByTestId('import-columns').innerText();
  if (!columns.includes('“SSN”') || !/Ignoring[^.]*SSN/.test(columns)) {
    throw new Error(`the SSN column is not called out as ignored: ${columns}`);
  }
  const bad = await panel.getByTestId('import-row-4').innerText();
  if (!bad.includes('No office called "Hoboken"') || !bad.includes('Cannot read the hire date')) {
    throw new Error(`line 4 reads: ${bad}`);
  }
  await panel.getByTestId('import-blocked').waitFor();
  if (await panel.getByRole('button', { name: /^Add \d/ }).isEnabled()) {
    throw new Error('Add is offered with a line still wrong');
  }
});

await step('the corrected list is read the way it was meant, and added in one go', async () => {
  const panel = admin.getByTestId('import-staff');
  await panel.getByLabel('Staff list').fill(paste(LIST));
  const line3 = await panel.getByTestId('import-row-3').innerText();
  for (const words of ['Ivan Parker', 'imp-ivan@example.com', 'Manager', 'North Bergen, West New York', 'Medical Assistant, Front Desk', 'Ready']) {
    if (!line3.includes(words)) throw new Error(`line 3 does not show "${words}": ${line3}`);
  }
  await admin.screenshot({ path: `${OUT}/golive-import.png`, fullPage: true });
  await panel.getByRole('button', { name: 'Add 3 people' }).click();
  await admin.getByText('3 people added.').waitFor({ timeout: 15000 });

  const people = await admin.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const roles = await fetch('/api/job-roles').then((r) => r.json());
    return staff
      .filter((p) => p.email.startsWith('imp-'))
      .map((p) => ({
        email: p.email,
        role: p.role,
        hireDate: p.hireDate.slice(0, 10),
        offices: p.locations.map((l) => l.location.name).sort(),
        jobs: roles.filter((r) => r.members.some((m) => m.id === p.id)).map((r) => r.name).sort(),
      }));
  });
  const imogen = people.find((p) => p.email === 'imp-imogen@example.com');
  if (!imogen) throw new Error(`the address was not stored in lower case: ${JSON.stringify(people)}`);
  if (imogen.hireDate !== '2024-03-01' || imogen.offices.join() !== 'North Bergen') {
    throw new Error(`Imogen: ${JSON.stringify(imogen)}`);
  }
  const ivan = people.find((p) => p.email === 'imp-ivan@example.com');
  if (ivan.role !== 'MANAGER' || ivan.jobs.join() !== 'Front Desk,Medical Assistant') {
    throw new Error(`Ivan: ${JSON.stringify(ivan)}`);
  }
  const isla = people.find((p) => p.email === 'imp-isla@example.com');
  if (isla.hireDate !== '2022-06-02' || isla.jobs.join() !== 'Administrative,Provider') {
    throw new Error(`Isla: ${JSON.stringify(isla)}`);
  }
});

await step('pasting the same people again is refused, naming who is already there', async () => {
  const response = await admin.evaluate(async () => {
    const places = await fetch('/api/locations').then((r) => r.json());
    const r = await fetch('/api/employees/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        people: [{ firstName: 'I', lastName: 'P', email: 'imp-ivan@example.com', hireDate: '2024-01-01', locationIds: [places[0].id] }],
      }),
    });
    return { status: r.status, body: await r.text() };
  });
  if (response.status !== 409 || !response.body.includes('imp-ivan@example.com')) {
    throw new Error(`${response.status} ${response.body}`);
  }
});

await step('new people show as not yet sent a welcome email, with a way to send them all', async () => {
  const card = admin.getByTestId('staff-imp-imogen@example.com');
  await card.getByTestId('welcome-status').getByText(/not sent a welcome email/).waitFor({ timeout: 10000 });
  await admin.getByTestId('welcome-everyone').getByText(/3 people have/).waitFor();
});

await step('one welcome email, sent from their card', async () => {
  const card = admin.getByTestId('staff-imp-imogen@example.com');
  await card.getByRole('button', { name: 'Send welcome email' }).click();
  await card.getByTestId('welcome-status').getByText(/welcome email sent/).waitFor({ timeout: 15000 });
  await card.getByRole('button', { name: 'Send the welcome email again' }).waitFor();
  latestWelcomeLink('imp-imogen@example.com');
});

await step('then everybody else in one go', async () => {
  await admin.reload({ waitUntil: 'networkidle' });
  const bar = admin.getByTestId('welcome-everyone');
  await bar.getByText(/2 people have/).waitFor({ timeout: 10000 });
  await bar.getByRole('button', { name: 'Send welcome emails' }).click();
  await admin
    .getByRole('alertdialog', { name: /Send welcome emails to 2 people\?/ })
    .getByRole('button', { name: 'Send them' })
    .click();
  await admin.getByText('2 welcome emails sent.').waitFor({ timeout: 30000 });
  if (await admin.getByTestId('welcome-everyone').count()) throw new Error('still offered after sending');
  latestWelcomeLink('imp-ivan@example.com');
  latestWelcomeLink('imp-isla@example.com');
});

await step('the email carries the phone set-up and the common questions', async () => {
  const log = readFileSync(API_LOG, 'utf8');
  const block = log.split('──────── email (not sent) ────────').filter((b) => b.includes('To:      imp-isla@example.com')).at(-1);
  for (const words of ['Welcome to Domi Staff', 'Add to Home Screen', 'iPhone, in Chrome', 'Tablet PIN', 'COMMON QUESTIONS', 'How do I clock in?']) {
    if (!block.includes(words)) throw new Error(`the email does not say "${words}"`);
  }
});

await step('a new starter follows the link, chooses a password and signs in', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${latestWelcomeLink('imp-isla@example.com')}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Welcome to Domi Staff' }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}/golive-welcome.png`, fullPage: true });
  await page.getByLabel('New password', { exact: true }).fill('first day 2026');
  await page.getByLabel('Confirm new password').fill('first day 2026');
  await page.getByRole('button', { name: 'Set my password' }).click();
  await page.getByRole('heading', { name: 'You are all set' }).waitFor({ timeout: 10000 });
  await ctx.close();

  const isla = await signIn('imp-isla@example.com', 'first day 2026');
  await isla.context().close();
});

await step('somebody with a password is not sent a welcome email', async () => {
  await admin.reload({ waitUntil: 'networkidle' });
  const card = admin.getByTestId('staff-imp-isla@example.com');
  await card.waitFor({ timeout: 10000 });
  if (await card.getByRole('button', { name: /welcome email/ }).count()) {
    throw new Error('offered a welcome email to somebody who has signed in');
  }
  const id = await admin.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    return staff.find((p) => p.email === 'imp-isla@example.com').id;
  });
  const response = await admin.request.post(`${BASE}/api/employees/${id}/welcome`);
  if (response.status() !== 400) throw new Error(`answered ${response.status()}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL GO-LIVE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
