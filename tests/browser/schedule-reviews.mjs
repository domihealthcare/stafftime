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
 * Who reviews which provider's patient schedule (Dominguez, October 2026):
 * a manager sets the usual pattern and changes one day; the reviewer sees it
 * on Home, everybody sees the week under Schedule → Reviews, and the
 * provider's Directory card says who is reviewing today. Only managers and
 * admins change it, and never a day gone by.
 *
 * Max (MA) is made a provider here; the seed puts his job roles back.
 * run-all.sh clears the schedule review tables.
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
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
const weekdayName = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' });
const dayLabel = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
let maxId;

await step('set-up: Max becomes a provider', async () => {
  const provider = (await call(admin, '/job-roles')).body.find((r) => r.name === 'Provider');
  const max = (await call(admin, '/employees')).body.find((p) => p.email === 'ma@domihealthcare.com');
  maxId = max.id;
  const joined = await call(admin, `/job-roles/${provider.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ employeeId: maxId }),
  });
  if (joined.status >= 300) throw new Error(`joining answered ${joined.status}`);
});

await step('a manager sets the usual pattern', async () => {
  await manager.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await manager.getByRole('link', { name: 'Reviews' }).click();
  await manager.getByRole('heading', { name: 'Schedule reviews', exact: true }).waitFor();
  const card = manager.getByTestId('schedule-review-pattern');
  await card.getByRole('button', { name: 'Set it' }).click();
  const form = manager.getByRole('form', { name: 'The usual pattern' });
  for (const date of [today, addDays(today, 1)]) {
    await form
      .getByLabel(`Max Assistant, ${weekdayName(date)}`, { exact: true })
      .selectOption({ label: 'Frankie Front-Desk' });
  }
  await form.getByRole('button', { name: 'Save the pattern' }).click();
  await manager.getByRole('status').getByText(/Saved/).waitFor();
  await card.getByText(`${weekdayName(today)}: Frankie Front-Desk`).waitFor();
  const line = manager.getByTestId(`reviews-${today}`).getByTestId('review-line');
  const text = await line.innerText();
  if (!/Max Assistant\s* - \s*Frankie Front-Desk/.test(text)) throw new Error(`today reads "${text}"`);
});
await manager.screenshot({ path: `${OUT}/schedule-reviews-manager.png`, fullPage: true });

await step('the reviewer sees it on Home', async () => {
  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const card = frankie.getByTestId('home-schedule-reviews');
  await card.waitFor();
  await card.getByText(/Today\s*·\s*Max Assistant/).waitFor();
});

await step('everybody sees the week, and the reviewer cannot change it', async () => {
  await frankie.goto(`${BASE}/schedule-reviews`, { waitUntil: 'networkidle' });
  const line = frankie.getByTestId(`reviews-${today}`).getByTestId('review-line');
  await line.getByText('You').waitFor();
  if ((await frankie.getByRole('button', { name: /Change who reviews/ }).count()) > 0)
    throw new Error('a member of staff was offered a change');
  if ((await frankie.getByTestId('schedule-review-pattern').count()) > 0)
    throw new Error('a member of staff was shown the pattern editor');
  const refused = await call(frankie, '/schedule-reviews/pattern', {
    method: 'PUT',
    body: JSON.stringify({ entries: [] }),
  });
  if (refused.status !== 403) throw new Error(`saving the pattern answered ${refused.status}`);
});

await step('the provider’s Directory card says who is reviewing today', async () => {
  await frankie.goto(`${BASE}/directory`, { waitUntil: 'networkidle' });
  await frankie
    .getByTestId('person-Max Assistant')
    .getByTestId('schedule-review-today')
    .getByText('Today’s schedule reviewed by Frankie Front-Desk')
    .waitFor();
  // Nothing on somebody who is not a provider.
  if ((await frankie.getByTestId('person-Frankie Front-Desk').getByTestId('schedule-review-today').count()) > 0)
    throw new Error('a non-provider card has a review line');
});

await step('a manager changes one day, with a note, and puts it back', async () => {
  await manager.reload({ waitUntil: 'networkidle' });
  await manager
    .getByRole('button', { name: `Change who reviews Max Assistant on ${dayLabel(today)}` })
    .click();
  const dialog = manager.getByTestId('schedule-review-day');
  await dialog.getByText(`Usually reviewed on ${weekdayName(today)}s by`).waitFor();
  await dialog.getByLabel('Who reviews it that day').selectOption({ label: 'Nobody that day' });
  await dialog.getByLabel(/Note/).fill('Frankie is at training');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await dialog.waitFor({ state: 'detached' });
  const day = manager.getByTestId(`reviews-${today}`);
  await day.getByText('Changed').waitFor();
  await day.getByText('“Frankie is at training”').waitFor();
  await day.getByTestId('review-line').getByText('Nobody').waitFor();

  // Everybody else sees it at once.
  await frankie.reload({ waitUntil: 'networkidle' });
  await frankie
    .getByTestId('person-Max Assistant')
    .getByText('Nobody is reviewing today’s schedule')
    .waitFor();

  await manager
    .getByRole('button', { name: `Change who reviews Max Assistant on ${dayLabel(today)}` })
    .click();
  await dialog.getByRole('button', { name: 'Back to the usual' }).click();
  await dialog.waitFor({ state: 'detached' });
  await day.getByText('Frankie Front-Desk').waitFor();
  if ((await day.getByText('Changed').count()) > 0) throw new Error('still marked changed');
});

await step('a day gone by cannot be changed', async () => {
  const yesterday = addDays(today, -1);
  const refused = await call(manager, `/schedule-reviews/days/${yesterday}/${maxId}`, {
    method: 'PUT',
    body: JSON.stringify({ reviewerId: null }),
  });
  if (refused.status !== 400) throw new Error(`answered ${refused.status}`);
  // And only a provider's schedule can be reviewed.
  const frankieId = (await call(frankie, '/profile')).body.id;
  const notProvider = await call(manager, `/schedule-reviews/days/${today}/${frankieId}`, {
    method: 'PUT',
    body: JSON.stringify({ reviewerId: null }),
  });
  if (notProvider.status !== 400) throw new Error(`a non-provider answered ${notProvider.status}`);
});

await step('each day shows where the provider is, and the resources beside the providers', async () => {
  const max = (await call(admin, '/employees')).body.find((p) => p.email === 'ma@domihealthcare.com');
  const made = await call(manager, '/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: max.id,
      locationId: max.locations[0].locationId,
      startsAt: `${today}T14:00:00.000Z`,
      endsAt: `${today}T20:00:00.000Z`,
      status: 'PUBLISHED',
    }),
  });
  if (made.status !== 201) throw new Error(`a shift answered ${made.status} ${JSON.stringify(made.body)}`);
  await frankie.goto(`${BASE}/schedule-reviews`, { waitUntil: 'networkidle' });
  const day = frankie.getByTestId(`reviews-${today}`);
  await day.getByTestId('review-place').first().waitFor({ timeout: 15000 });
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const resources = day.getByTestId('review-resources');
  if (weekday >= 1 && weekday <= 5) {
    for (const name of ['NB BW', 'NB Nurse', 'WNY BW', 'WNY Nurse']) {
      await resources.getByText(name, { exact: true }).waitFor({ timeout: 5000 });
    }
  } else if (await resources.count()) {
    throw new Error('resources shown on a weekend');
  }
  await call(manager, `/shifts/${made.body.id}`, { method: 'DELETE' });
});

await step('the groups: everybody reads who reviews each, a manager edits them', async () => {
  const seen = await call(frankie, '/schedule-reviews/areas');
  const names = seen.body.areas.map((area) => area.name);
  if (names.join('|') !== 'Telemedicine|NB Providers|WNY Providers|NB BW|NB Nurse|WNY BW|WNY Nurse')
    throw new Error(`groups were ${names}`);
  const refused = await call(frankie, '/schedule-reviews/areas', {
    method: 'PUT',
    body: JSON.stringify({ areas: [] }),
  });
  if (refused.status !== 403) throw new Error(`staff saving answered ${refused.status}`);
  await manager.goto(`${BASE}/schedule-reviews`, { waitUntil: 'networkidle' });
  const card = manager.getByTestId('review-areas');
  await card.getByText('Telemedicine').waitFor({ timeout: 15000 });
  await card.getByRole('button', { name: 'Edit' }).click();
  const dialog = manager.getByTestId('review-areas-edit');
  await dialog.getByLabel('Who reviews Telemedicine').selectOption({ label: 'Morgan Manager' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await card.getByText('Morgan Manager').first().waitFor({ timeout: 15000 });
  // Put it back as found.
  await call(manager, '/schedule-reviews/areas', {
    method: 'PUT',
    body: JSON.stringify({ areas: seen.body.areas.map((a) => ({ name: a.name, reviewerId: null, forResources: a.forResources })) }),
  });
});

await step('on a phone all six Schedule tabs fit without scrolling sideways', async () => {
  // A manager has On call as well: the most tabs anybody gets.
  const phone = await signIn('manager@domihealthcare.com', { width: 390, height: 844 });
  await phone.goto(`${BASE}/schedule-reviews`, { waitUntil: 'networkidle' });
  await phone.getByRole('heading', { name: 'Schedule reviews', exact: true }).waitFor();
  const wide = await phone.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (wide) throw new Error('the page scrolls sideways');
  const tabs = phone.getByRole('navigation', { name: 'Schedule or calendar' });
  const overflow = await tabs.evaluate((nav) =>
    [...nav.querySelectorAll('a')].some((a) => a.scrollWidth > a.clientWidth + 1),
  );
  if ((await tabs.getByRole('link').count()) !== 6) throw new Error('expected six tabs (Time off joined in October 2026)');
  if (overflow) throw new Error('a tab’s name does not fit');
  await phone.screenshot({ path: `${OUT}/schedule-reviews-phone.png`, fullPage: true });
});

await browser.close();
console.log(
  `\n${errors.length === 0 ? 'ALL SCHEDULE REVIEW CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`,
);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
