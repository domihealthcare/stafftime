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
 * Repeating events and chosen people (September 2026, asked for by Dominguez):
 * the office meeting and the admin meeting on alternate Fridays, 9–10am; "every
 * 2 weeks on Monday and Friday"; an event for "Provider, Kayla, Angelina" typed
 * into one box; and changing or removing one date, or this and all after it.
 *
 * Seeded people: Frankie is Front Desk and MA at North Bergen, Max is an MA at
 * West New York, and nobody is a Provider.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Max is seeded with a temporary password, to be changed on first sign-in.
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

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const monday = (d) => {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};
// Next week's Friday starts the office meeting; the Friday after, the admin meeting.
const week1 = plusDays(monday(new Date()), 7);
const friday1 = plusDays(week1, 4);
const friday2 = plusDays(friday1, 7);
const friday3 = plusDays(friday1, 14);
const until = plusDays(friday1, 7 * 8);
// 13:00–14:00 UTC is 9–10am in New Jersey. The browser here runs on UTC, so
// it shows the times as UTC ("1pm–2pm"); the API is checked in UTC hours too.
const NINE = '13:00';
const TEN = '14:00';

const weekView = async (page, day) => {
  await page.goto(`${BASE}/schedule?week=${key(day)}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Week', exact: true }).click();
};
const eventsRow = (page) => page.getByTestId('rota-events-row');
const feedOf = (page) =>
  page.evaluate(async () => {
    const { token } = await fetch('/api/calendar/link', { method: 'POST' }).then((r) => r.json());
    return fetch(`/api/calendar/${token}/domi.ics`, { cache: 'no-store' }).then((r) => r.text());
  });
/// The hour on New Jersey's clock — what stays the same across the clocks
/// changing on 1 November, when 9am goes from 13:00 to 14:00 UTC.
const njHour = (iso) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)));
/// Everything up to and including the last day a series can land on.
const through = plusDays(until, 1);
const eventsBetween = (page, from, to) =>
  page.evaluate(
    ([f, t]) => fetch(`/api/events?from=${f}&to=${t}`).then((r) => r.json()),
    [from.toISOString(), to.toISOString()],
  );

const manager = await signIn('manager@domihealthcare.com');

await step('the office meeting: every 2 weeks on Friday, 9 to 10, for everyone', async () => {
  await weekView(manager, week1);
  await manager.getByRole('button', { name: '+ Add event' }).click();
  const form = manager.getByRole('form', { name: 'New event' });
  await form.getByLabel('What is it?').fill('Office meeting');
  await form.getByLabel('Starts').fill(`${key(friday1)}T${NINE}`);
  await form.getByLabel('Ends').fill(`${key(friday1)}T${TEN}`);
  await form.getByLabel('Repeats').selectOption({ label: 'Every 2 weeks on Friday' });
  await form.getByLabel('Until').fill(key(until));
  // Everyone is the starting point.
  await form.getByTestId('invitee-tag').filter({ hasText: 'Everyone' }).waitFor({ timeout: 5000 });
  await form.getByRole('button', { name: 'Add event' }).click();
  await manager.getByRole('status').getByText('5 dates are on the schedule').waitFor({ timeout: 10000 });
  await eventsRow(manager).getByText('Office meeting').waitFor({ timeout: 10000 });
  await manager.screenshot({ path: `${OUT}/recurring-office.png`, fullPage: true });
});

await step('it is on alternate Fridays: the week after has none, the one after that has it', async () => {
  await weekView(manager, plusDays(week1, 7));
  if ((await eventsRow(manager).count()) && (await eventsRow(manager).innerText()).includes('Office meeting')) {
    throw new Error('the office meeting is on the week in between');
  }
  await weekView(manager, plusDays(week1, 14));
  await eventsRow(manager).getByText('Office meeting').waitFor({ timeout: 10000 });
});

await step('the admin meeting alternates with it, for chosen people typed into one box', async () => {
  await weekView(manager, plusDays(week1, 7));
  await manager.getByRole('button', { name: '+ Add event' }).click();
  const form = manager.getByRole('form', { name: 'New event' });
  await form.getByLabel('What is it?').fill('Admin meeting');
  await form.getByLabel('Starts').fill(`${key(friday2)}T${NINE}`);
  await form.getByLabel('Ends').fill(`${key(friday2)}T${TEN}`);
  await form.getByLabel('Repeats').selectOption({ label: 'Every 2 weeks on Friday' });
  await form.getByLabel('Until').fill(key(until));

  const who = form.getByRole('combobox', { name: 'Who is it for?' });
  // Everyone off first; then "Providers" and a person by part of her name.
  await form.getByRole('button', { name: 'Remove Everyone' }).click();
  await who.fill('providers');
  await manager.getByRole('listbox').getByRole('option', { name: /^Provider/ }).click();
  await who.fill('fran');
  await who.press('Enter');
  const tags = await form.getByTestId('invitee-tag').allInnerTexts();
  if (tags.length !== 2 || !tags.some((t) => t.includes('Provider')) || !tags.some((t) => t.includes('Frankie'))) {
    throw new Error(`the list reads: ${tags.join(' | ')}`);
  }
  await manager.screenshot({ path: `${OUT}/recurring-invitees.png`, fullPage: true });
  await form.getByRole('button', { name: 'Add event' }).click();
  await manager.getByRole('status').getByText(/\d+ dates are on the schedule/).waitFor({ timeout: 10000 });
  await eventsRow(manager).getByText('Admin meeting').waitFor({ timeout: 10000 });
});

await step('every 2 weeks on Monday and Friday, from the custom choice', async () => {
  await weekView(manager, week1);
  await manager.getByRole('button', { name: '+ Add event' }).click();
  const form = manager.getByRole('form', { name: 'New event' });
  await form.getByLabel('What is it?').fill('Huddle');
  await form.getByLabel('Starts').fill(`${key(week1)}T12:00`);
  await form.getByLabel('Ends').fill(`${key(week1)}T12:30`);
  await form.getByLabel('Repeats').selectOption({ label: 'Custom…' });
  await form.getByLabel('Every how many').fill('2');
  // Monday is already on, from the start date; add Friday.
  await form.getByRole('button', { name: 'Friday', exact: true }).click();
  await form.getByLabel('Until').fill(key(plusDays(week1, 27)));
  await form.getByRole('button', { name: 'Add event' }).click();
  // Weeks 1 and 3: two Mondays and two Fridays.
  await manager.getByRole('status').getByText('4 dates are on the schedule').waitFor({ timeout: 10000 });
  const huddles = (await eventsBetween(manager, week1, plusDays(week1, 28))).filter((e) => e.title === 'Huddle');
  const days = huddles.map((e) => new Date(e.startsAt).getUTCDay()).join(',');
  if (days !== '1,5,1,5') throw new Error(`lands on weekdays ${days}`);
  if (!huddles[0].series?.summary.startsWith('Every 2 weeks on Mon and Fri')) {
    throw new Error(`described as "${huddles[0].series?.summary}"`);
  }
});

const frankie = await signIn('frontdesk@domihealthcare.com');
const max = await signIn('ma@domihealthcare.com');

await step('Frankie, on the list, sees the admin meeting; Max, not on it, does not', async () => {
  await weekView(frankie, plusDays(week1, 7));
  await eventsRow(frankie).getByText('Admin meeting').waitFor({ timeout: 10000 });
  const mine = await eventsBetween(max, week1, through);
  if (mine.some((e) => e.title === 'Admin meeting')) throw new Error('Max sees the admin meeting');
  if (!mine.some((e) => e.title === 'Office meeting')) throw new Error('Max does not see the office meeting');
});

await step('one notification for a whole series, not one per date', async () => {
  const titles = await frankie.evaluate(async () => {
    const list = await fetch('/api/notifications').then((r) => r.json());
    return list.items.map((item) => ({ title: item.title, body: item.body }));
  });
  const office = titles.filter((t) => t.title === 'New event: Office meeting');
  if (office.length !== 1) throw new Error(`${office.length} notifications for the office meeting`);
  if (!/^Every 2 weeks on Fri until/.test(office[0].body)) throw new Error(`it says: ${office[0].body}`);
});

await step('every date is on the phone, each as its own calendar entry', async () => {
  const feed = await feedOf(frankie);
  const count = (feed.match(/SUMMARY:Office meeting/g) ?? []).length;
  if (count !== 5) throw new Error(`${count} office meetings in the feed`);
});

await step('the pop-up says how it repeats', async () => {
  await weekView(manager, week1);
  await eventsRow(manager).getByText('Office meeting').click();
  const dialog = manager.getByRole('dialog', { name: 'Office meeting' });
  const text = await dialog.getByTestId('event-series').innerText();
  if (!text.includes('Every 2 weeks on Fri')) throw new Error(`it says: ${text}`);
  await dialog.getByRole('button', { name: 'Close' }).click();
});

await step('moving just one date leaves the others where they were', async () => {
  await weekView(manager, plusDays(week1, 14));
  await eventsRow(manager).getByText('Office meeting').click();
  await manager.getByRole('dialog', { name: 'Office meeting' }).getByRole('button', { name: 'Edit' }).click();
  const form = manager.getByRole('form', { name: 'Change event' });
  await form.getByLabel('Change only this date', { exact: false }).check();
  // A single date is not re-planned: no repeat choices.
  if (await form.getByLabel('Repeats').count()) throw new Error('offered to change how it repeats');
  await form.getByLabel('Starts').fill(`${key(friday3)}T14:00`);
  await form.getByLabel('Ends').fill(`${key(friday3)}T15:00`);
  await form.getByRole('button', { name: 'Save changes' }).click();
  await eventsRow(manager).getByText('2pm–3pm').waitFor({ timeout: 10000 });
  const all = (await eventsBetween(manager, week1, through)).filter((e) => e.title === 'Office meeting');
  const hours = all.map((e) => njHour(e.startsAt)).join(',');
  if (hours !== '9,10,9,9,9') throw new Error(`start hours in New Jersey ${hours}`);
});

await step('this date and all after: a new time from here on, the earlier ones untouched', async () => {
  await weekView(manager, plusDays(week1, 28));
  await eventsRow(manager).getByText('Office meeting').click();
  await manager.getByRole('dialog', { name: 'Office meeting' }).getByRole('button', { name: 'Edit' }).click();
  const form = manager.getByRole('form', { name: 'Change event' });
  await form.getByLabel('Change this date and all after it').check();
  await form.getByLabel('Repeats').waitFor({ timeout: 5000 });
  await form.getByLabel('Starts').fill(`${key(plusDays(friday1, 28))}T15:00`);
  await form.getByLabel('Ends').fill(`${key(plusDays(friday1, 28))}T16:00`);
  await form.getByRole('button', { name: 'Save changes' }).click();
  await eventsRow(manager).getByText('3pm–4pm').waitFor({ timeout: 10000 });
  const all = (await eventsBetween(manager, week1, through)).filter((e) => e.title === 'Office meeting');
  // 15:00 UTC on a November date is 10am in New Jersey, and every date after
  // it keeps that wall-clock time.
  const hours = all.map((e) => njHour(e.startsAt)).join(',');
  if (hours !== '9,10,10,10,10') throw new Error(`start hours in New Jersey ${hours}`);
});

await step('removing just one date asks which, then takes only that one', async () => {
  await weekView(manager, week1);
  await eventsRow(manager).getByText('Office meeting').click();
  const dialog = manager.getByRole('dialog', { name: 'Office meeting' });
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await dialog.getByRole('button', { name: 'Just this date' }).click();
  await manager.getByRole('button', { name: 'Yes, remove it' }).click();
  await eventsRow(manager).getByText('Office meeting').waitFor({ state: 'detached', timeout: 10000 });
  const left = (await eventsBetween(manager, week1, through)).filter((e) => e.title === 'Office meeting');
  if (left.length !== 4) throw new Error(`${left.length} left`);
});

await step('removing this and all after takes the rest of the series', async () => {
  await weekView(manager, plusDays(week1, 7));
  await eventsRow(manager).getByText('Admin meeting').click();
  const dialog = manager.getByRole('dialog', { name: 'Admin meeting' });
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await dialog.getByRole('button', { name: 'This and all after' }).click();
  await manager.getByRole('button', { name: 'Yes, remove it' }).click();
  await eventsRow(manager).getByText('Admin meeting').waitFor({ state: 'detached', timeout: 10000 });
  const left = (await eventsBetween(manager, week1, through)).filter((e) => e.title === 'Admin meeting');
  if (left.length !== 0) throw new Error(`${left.length} left`);
  const bell = await frankie.evaluate(async () =>
    (await fetch('/api/notifications').then((r) => r.json())).items.map((i) => i.title),
  );
  if (bell.filter((t) => t === 'Cancelled: Admin meeting').length !== 1) {
    throw new Error(`bell: ${bell.join(' | ')}`);
  }
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL RECURRING CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
