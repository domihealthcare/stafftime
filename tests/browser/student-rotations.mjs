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
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

/**
 * Students and residents on rotation with a provider (November 2026,
 * Dominguez: "we have students/residents who do rotations at our office(s)
 * with specific providers"). A seventh kind of practice calendar entry:
 * managers add it with a student from their list (or a new one, added in the
 * form), a provider, an office and hours; everybody sees it; only the
 * provider is told; the provider sees it on Home and their Directory card.
 * Names only - no file, nothing to reach a student by.
 *
 * Frankie (front desk) is made a provider here; the seed puts her job roles
 * back, and run-all.sh clears the students and the calendar.
 *
 * The form's date is in March 2027, far enough ahead to be the future
 * whatever the clock; the one for "today" goes in through the API with
 * instants worked out here, so the test browser's time zone cannot move it.
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
    await unlocked.first().waitFor({ timeout: 15000 });
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
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: r.status, body };
    },
    { path, init },
  );

const MONTH = '2027-03-01';
const calendar = async (page) => {
  await page.goto(`${BASE}/schedule/calendar?month=${MONTH}`, { waitUntil: 'networkidle' });
  await page.getByTestId('calendar-month').getByText('March 2027').waitFor({ timeout: 10000 });
};
const day = (page, date) => page.getByTestId(`calendar-day-${date}`);

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
const max = await signIn('ma@domihealthcare.com');
let frankieId;
let northBergen;

await step('set-up: Frankie becomes a provider', async () => {
  const provider = (await call(admin, '/job-roles')).body.find((r) => r.name === 'Provider');
  frankieId = (await call(frankie, '/profile')).body.id;
  const joined = await call(admin, `/job-roles/${provider.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ employeeId: frankieId }),
  });
  if (joined.status >= 300) throw new Error(`joining answered ${joined.status}`);
  northBergen = (await call(admin, '/locations')).body.find((l) => l.name === 'North Bergen').id;
});

await step('staff cannot read the students list', async () => {
  const answer = await call(max, '/students');
  if (answer.status !== 403) throw new Error(`answered ${answer.status}`);
});

await step('a manager adds a rotation, adding the student right in the form', async () => {
  await calendar(manager);
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Student rotation' }).click();
  const form = manager.getByRole('form', { name: 'New student rotation' });
  // Named after the student, for everyone: no title, no "who", no call.
  if (await form.getByLabel('Who is it for?').count()) throw new Error('a rotation asks who it is for');
  if (await form.getByLabel('What is it?').count()) throw new Error('a rotation asks for a title');
  if ((await form.getByLabel('Starts').inputValue()).slice(11) !== '09:00') throw new Error('a rotation does not start at 9');

  const student = form.getByRole('combobox', { name: 'Which student or resident?' });
  await student.fill('Robin Rotation-Suite');
  await form.getByRole('button', { name: '+ Add a new student' }).click();
  const quick = form.getByTestId('student-form');
  if ((await quick.getByLabel('Name').inputValue()) !== 'Robin Rotation-Suite') throw new Error('the typed name was not carried over');
  await quick.getByLabel('They are a').selectOption({ label: 'Resident' });
  await quick.getByLabel(/School or program/).fill('Rutgers NJMS');
  await quick.getByRole('button', { name: 'Add student' }).click();
  await quick.waitFor({ state: 'detached', timeout: 10000 });
  if ((await student.inputValue()) !== 'Robin Rotation-Suite - Resident, Rutgers NJMS') throw new Error(`the new student was not chosen: ${await student.inputValue()}`);

  await form.getByLabel('With which provider?').selectOption({ label: 'Frankie Front-Desk' });
  await form.getByLabel('Which office?').selectOption({ label: 'North Bergen' });
  await form.getByLabel('Starts').fill('2027-03-09T08:30');
  await form.getByLabel('Ends').fill('2027-03-09T16:00');
  if (await manager.locator('input[type=file]').count()) throw new Error('a file input in the form');
  await form.getByRole('button', { name: 'Add student rotation' }).click();

  const chip = day(manager, '2027-03-09').getByTestId('rotation-chip');
  await chip.waitFor({ timeout: 10000 });
  const text = await chip.innerText();
  // The student on the first line; the time, office and provider under it.
  if (!text.includes('Robin Rotation-Suite') || !/8:30am.*NB · Frankie Front-Desk/.test(text)) throw new Error(`the chip reads "${text}"`);
  await manager.screenshot({ path: `${OUT}/student-rotation-calendar.png` });
});

await step('the provider alone is told', async () => {
  const theirs = (await call(frankie, '/notifications')).body.items;
  const note = theirs.find((n) => n.title === 'Student with you: Robin Rotation-Suite');
  if (!note) throw new Error(`Frankie has ${JSON.stringify(theirs.map((n) => n.title))}`);
  if (!note.body.includes('Resident, Rutgers NJMS, with Frankie Front-Desk')) throw new Error(`the note reads "${note.body}"`);
  const maxs = (await call(max, '/notifications')).body.items;
  if (maxs.some((n) => n.title.includes('Robin Rotation-Suite'))) throw new Error('Max was told too');
});

await step('everybody sees it, with the student and the provider, and cannot change it', async () => {
  await calendar(max);
  const chip = day(max, '2027-03-09').getByTestId('rotation-chip');
  await chip.waitFor({ timeout: 10000 });
  await chip.click();
  const dialog = max.getByRole('dialog', { name: 'Robin Rotation-Suite' });
  await dialog.waitFor({ timeout: 10000 });
  const words = await dialog.innerText();
  for (const expected of ['Resident, Rutgers NJMS', 'Frankie Front-Desk', 'North Bergen']) {
    if (!words.includes(expected)) throw new Error(`the pop-up has no "${expected}": ${words}`);
  }
  if (await dialog.getByRole('button', { name: /Change|Remove/ }).count()) throw new Error('staff can change it');
});

await step('Students under Show narrows the calendar to them', async () => {
  await calendar(max);
  const show = max.getByRole('group', { name: 'Show on the calendar' });
  await show.getByRole('button', { name: /Students/ }).click();
  await day(max, '2027-03-09').getByTestId('rotation-chip').waitFor({ timeout: 10000 });
  await show.getByRole('button', { name: /^All/ }).click();
});

await step('the provider sees today\'s student on Home, and the Directory says so', async () => {
  const now = Date.now();
  const made = await call(manager, '/events', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'ROTATION',
      studentId: (await call(manager, '/students')).body.find((s) => s.name === 'Robin Rotation-Suite').id,
      providerId: frankieId,
      atLocationId: northBergen,
      allDay: false,
      audience: 'EVERYONE',
      startsAt: new Date(now - 30 * 60_000).toISOString(),
      endsAt: new Date(now + 3 * 3_600_000).toISOString(),
    }),
  });
  if (made.status !== 201) throw new Error(`adding answered ${made.status}: ${JSON.stringify(made.body)}`);

  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const card = frankie.getByTestId('home-students');
  await card.waitFor({ timeout: 10000 });
  if (!(await card.innerText()).includes('Robin Rotation-Suite')) throw new Error(`Home reads ${await card.innerText()}`);

  // Somebody who is not the provider has no such card.
  await max.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await max.getByText('Not clocked in').first().waitFor();
  if (await max.getByTestId('home-students').count()) throw new Error('Max has a students card');

  await max.goto(`${BASE}/directory`, { waitUntil: 'networkidle' });
  const line = max.getByTestId('person-Frankie Front-Desk').getByTestId('students-today');
  await line.waitFor({ timeout: 10000 });
  if (!(await line.innerText()).includes('Robin Rotation-Suite (Resident, Rutgers NJMS)')) throw new Error(`the card reads ${await line.innerText()}`);
});

await step('a rotation needs a provider who is a provider', async () => {
  const maxId = (await call(max, '/profile')).body.id;
  const refused = await call(manager, '/events', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'ROTATION',
      studentId: (await call(manager, '/students')).body[0].id,
      providerId: maxId,
      atLocationId: northBergen,
      allDay: false,
      audience: 'EVERYONE',
      startsAt: '2027-03-10T14:00:00.000Z',
      endsAt: '2027-03-10T20:00:00.000Z',
    }),
  });
  if (refused.status !== 400) throw new Error(`answered ${refused.status}`);
});

await step('taking the student off the list keeps their dates, still named', async () => {
  const student = (await call(manager, '/students')).body.find((s) => s.name === 'Robin Rotation-Suite');
  const removed = await call(manager, `/students/${student.id}`, { method: 'DELETE' });
  if (removed.status !== 200) throw new Error(`removing answered ${removed.status}`);
  await calendar(max);
  const chip = day(max, '2027-03-09').getByTestId('rotation-chip');
  await chip.waitFor({ timeout: 10000 });
  if (!(await chip.innerText()).includes('Robin Rotation-Suite')) throw new Error('the date lost its name');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL STUDENT ROTATION CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
