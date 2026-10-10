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
 * The provider on-call schedule (Dominguez, October 2026): a usual pattern
 * by weekday with an exception for the 4th weekend, a day changed by a
 * manager, and a swap one provider asks for and the other accepts. Noon to
 * noon; providers, managers and admins only.
 *
 * Frankie (front desk) and Max (MA) are made providers here; the seed puts
 * their job roles back. run-all.sh clears the on-call tables.
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
    await unlocked.waitFor({ timeout: 15000 });
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

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 Sunday
/// The next date on or after `from` that falls on `day` (0 Sunday … 6 Saturday).
const next = (from, day) => {
  let date = from;
  while (weekday(date) !== day) date = addDays(date, 1);
  return date;
};
// The month after this one, and its 4th Saturday.
const nextMonth = addDays(`${today.slice(0, 7)}-28`, 7).slice(0, 7);
const fourthSaturday = addDays(next(`${nextMonth}-01`, 6), 21);

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
const max = await signIn('ma@domihealthcare.com');
let frankieId;
let maxId;

await step('before being a provider, it is not for them', async () => {
  const answer = await call(frankie, `/on-call?from=${today}&to=${today}`);
  if (answer.status !== 403) throw new Error(`answered ${answer.status}`);
});

await step('set-up: Frankie and Max become providers', async () => {
  const provider = (await call(admin, '/job-roles')).body.find((r) => r.name === 'Provider');
  frankieId = (await call(frankie, '/profile')).body.id;
  maxId = (await call(max, '/profile')).body.id;
  for (const id of [frankieId, maxId]) {
    const joined = await call(admin, `/job-roles/${provider.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ employeeId: id }),
    });
    if (joined.status >= 300) throw new Error(`joining answered ${joined.status}`);
  }
});

await step('a manager sets the usual pattern, with the 4th weekend as an exception', async () => {
  await manager.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await manager.getByRole('link', { name: 'On call' }).click();
  await manager.getByRole('heading', { name: 'On call', exact: true }).waitFor();
  const card = manager.getByTestId('on-call-pattern');
  await card.getByRole('button', { name: 'Set it' }).click();
  const form = manager.getByRole('form', { name: 'The usual pattern' });
  for (const day of ['Mondays', 'Tuesdays', 'Wednesdays', 'Fridays', 'Saturdays', 'Sundays']) {
    await form.getByLabel(day, { exact: true }).selectOption({ label: 'Frankie Front-Desk' });
  }
  await form.getByLabel('Thursdays', { exact: true }).selectOption({ label: 'Max Assistant' });
  for (const day of ['Saturday', 'Sunday']) {
    await form.getByRole('button', { name: '+ Add an exception' }).click();
    const row = form.getByTestId('pattern-exception').last();
    await row.getByLabel('Which week').selectOption('4');
    await row.getByLabel('Which day').selectOption({ label: day });
    await row.getByLabel('Who').selectOption({ label: 'Max Assistant' });
  }
  await form.getByRole('button', { name: 'Save the pattern' }).click();
  await manager.getByText('Saved. The providers have been told.').waitFor();
  await manager.screenshot({ path: `${OUT}/on-call.png`, fullPage: true });
  await card.getByText(/Max Assistant on the 4th Saturday/).waitFor();
});

await step('the 4th weekend goes to Max, Saturday and Sunday; other days follow the weekdays', async () => {
  const days = (await call(manager, `/on-call?from=${nextMonth}-01&to=${addDays(fourthSaturday, 1)}`)).body.days;
  const on = (date) => days.find((d) => d.date === date)?.employee?.id;
  if (on(fourthSaturday) !== maxId || on(addDays(fourthSaturday, 1)) !== maxId) {
    throw new Error('the 4th weekend is not Max’s');
  }
  const thirdSaturday = addDays(fourthSaturday, -7);
  if (on(thirdSaturday) !== frankieId) throw new Error('the 3rd Saturday is not Frankie’s');
  const thursday = next(`${nextMonth}-01`, 4);
  if (on(thursday) !== maxId) throw new Error('a Thursday is not Max’s');
});

await step('a provider sees who is on call now on Home', async () => {
  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await frankie.getByTestId('home-on-call').getByText('On call now').waitFor();
});

const monday = next(addDays(today, 2), 1);
const thursday = next(monday, 4);

await step('Frankie asks Max to take a Monday, taking Max’s Thursday back', async () => {
  await frankie.goto(`${BASE}/on-call`, { waitUntil: 'networkidle' });
  if (monday.slice(0, 7) !== today.slice(0, 7)) {
    await frankie.getByRole('button', { name: 'Next →' }).click();
  }
  await frankie.getByTestId(`on-call-${monday}`).click();
  const dialog = frankie.getByTestId('on-call-day');
  const form = dialog.getByRole('form', { name: 'Ask to swap' });
  await form.getByLabel('Who').selectOption({ label: 'Max Assistant' });
  await form.getByLabel('And you take one of theirs').locator(`option[value="${thursday}"]`).waitFor({ state: 'attached' });
  await form.getByLabel('And you take one of theirs').selectOption(thursday);
  await form.getByLabel('Note').fill('Dentist');
  await form.getByRole('button', { name: 'Ask them' }).click();
  await frankie.getByText('Asked. They have been told').waitFor();
});

await step('Max is told, says yes, and the days change hands', async () => {
  const bell = await call(max, '/notifications');
  if (!bell.body.items.some((n) => n.kind === 'ON_CALL' && n.title.includes('asks you to take on call'))) {
    throw new Error('no bell for Max');
  }
  await max.goto(`${BASE}/on-call`, { waitUntil: 'networkidle' });
  await max.getByRole('button', { name: 'Yes, swap' }).click();
  await max.getByText(/Done — you are on call/).waitFor();
  const days = (await call(max, `/on-call?from=${monday}&to=${thursday}`)).body.days;
  const mon = days.find((d) => d.date === monday);
  const thu = days.find((d) => d.date === thursday);
  if (mon.employee.id !== maxId || mon.source !== 'SWAPPED') throw new Error('Monday did not go to Max');
  if (thu.employee.id !== frankieId || thu.source !== 'SWAPPED') throw new Error('Thursday did not go to Frankie');
  const back = await call(frankie, '/notifications');
  if (!back.body.items.some((n) => n.kind === 'ON_CALL' && n.title.includes('will take your on call'))) {
    throw new Error('Frankie was not told');
  }
});

await step('a manager changes a day, and puts it back to the usual', async () => {
  const tuesday = next(addDays(today, 2), 2);
  const changed = await call(manager, `/on-call/days/${tuesday}`, {
    method: 'PUT',
    body: JSON.stringify({ employeeId: maxId, note: 'Covering a conference' }),
  });
  if (changed.status !== 200) throw new Error(`changing answered ${changed.status}`);
  let day = (await call(manager, `/on-call?from=${tuesday}&to=${tuesday}`)).body.days[0];
  if (day.employee.id !== maxId || day.source !== 'CHANGED' || day.note !== 'Covering a conference') {
    throw new Error(`the day reads ${JSON.stringify(day)}`);
  }
  await call(manager, `/on-call/days/${tuesday}`, { method: 'PUT', body: JSON.stringify({ employeeId: null }) });
  day = (await call(manager, `/on-call?from=${tuesday}&to=${tuesday}`)).body.days[0];
  if (day.employee.id !== frankieId || day.source !== 'USUAL') throw new Error('not back to the usual');
});

await step('a provider cannot change a day or the pattern, or swap a day not theirs', async () => {
  const day = await call(frankie, `/on-call/days/${monday}`, { method: 'PUT', body: JSON.stringify({ employeeId: frankieId }) });
  if (day.status !== 403) throw new Error(`changing a day answered ${day.status}`);
  const rota = await call(frankie, '/on-call/rotas', {
    method: 'PUT',
    body: JSON.stringify({ startsOn: today, changesAt: '12:00', entries: [] }),
  });
  if (rota.status !== 403) throw new Error(`the pattern answered ${rota.status}`);
  const swap = await call(frankie, '/on-call/swaps', {
    method: 'POST',
    body: JSON.stringify({ giveDate: monday, partnerId: maxId }),
  });
  if (swap.status !== 400) throw new Error(`swapping Max’s day answered ${swap.status}`);
});

await step('a provider’s calendar feed carries their own turns, noon to noon', async () => {
  const link = await call(frankie, '/calendar/link', { method: 'POST' });
  const url = link.body.url ?? link.body.feedUrl;
  const token = link.body.token ?? (url ? url.split('/calendar/')[1].split('/')[0] : null);
  if (!token) throw new Error(`no token in ${JSON.stringify(link.body)}`);
  const feed = await call(frankie, `/calendar/${token}/on-call.ics`);
  if (typeof feed.body !== 'string' || !feed.body.includes('SUMMARY:On call')) {
    throw new Error('no turns in the feed');
  }
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL ON-CALL CHECKS PASSED');
