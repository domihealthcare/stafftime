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
 * Practice events (September 2026, asked for by Dominguez): office meetings,
 * provider meetings, a wellness day — on the schedule for the people they are
 * for, under the bell, and on their phones through the calendar feed. Never
 * counted as hours. Managers make them.
 *
 * Seeded people: Frankie is Front Desk and MA at North Bergen, Max is an MA at
 * West New York, and nobody is a Provider.
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
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
const monday = (d) => {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};
// Wednesday of next week: always in the future, always on one week's screen.
const nextWeek = new Date(monday(new Date()).getTime() + 7 * 86_400_000);
const wednesday = new Date(nextWeek);
wednesday.setDate(wednesday.getDate() + 2);
const thursday = new Date(nextWeek);
thursday.setDate(thursday.getDate() + 3);

async function bellTitles(page) {
  return page.evaluate(async () => {
    const list = await fetch('/api/notifications').then((r) => r.json());
    return list.items.map((item) => item.title);
  });
}

const manager = await signIn('manager@domihealthcare.com');

await step('a manager adds an office meeting from the Schedule', async () => {
  await manager.goto(`${BASE}/schedule?week=${key(nextWeek)}`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: 'Week', exact: true }).click();
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Event', exact: true }).click();
  const form = manager.getByRole('form', { name: 'New event' });
  await form.getByLabel('What is it?').fill('Office meeting');
  await form.getByLabel('Starts').fill(`${key(wednesday)}T12:30`);
  // Moving the start keeps the length; set the end explicitly anyway.
  await form.getByLabel('Ends').fill(`${key(wednesday)}T13:30`);
  await form.getByLabel('Where (optional)').fill('North Bergen office — break room');
  await form.getByLabel('Details (optional)').fill('New phones, and the holiday rota.');
  const saved = manager.waitForResponse((r) => r.url().endsWith('/api/events') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Add event' }).click();
  const response = await saved;
  if (response.status() !== 201) throw new Error(`answered ${response.status()}: ${await response.text()}`);
  await manager.getByTestId('rota-events-row').getByText('Office meeting').waitFor({ timeout: 10000 });
  await manager.screenshot({ path: `${OUT}/events-week-manager.png`, fullPage: true });
});

await step('an all-day wellness day for one office, and a meeting for one job role', async () => {
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Event', exact: true }).click();
  const form = manager.getByRole('form', { name: 'New event' });
  await form.getByLabel('What is it?').fill('Wellness day');
  await form.getByLabel('All day').check();
  await form.getByLabel('First day').fill(key(wednesday));
  await form.getByLabel('Last day').fill(key(thursday));
  // Who it is for is one searchable box: Everyone off, the office on.
  await form.getByRole('button', { name: 'Remove Everyone' }).click();
  await form.getByRole('combobox', { name: 'Who is it for?' }).fill('west new');
  await manager.getByRole('listbox').getByRole('option', { name: /^West New York/ }).click();
  await form.getByRole('button', { name: 'Add event' }).click();
  await manager.getByTestId('rota-events-row').getByText('Wellness day').first().waitFor({ timeout: 10000 });
  // Two days, so a chip on each.
  const chips = await manager.getByTestId('rota-events-row').getByText('Wellness day').count();
  if (chips !== 2) throw new Error(`${chips} chips for a two-day event`);

  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Event', exact: true }).click();
  const second = manager.getByRole('form', { name: 'New event' });
  await second.getByLabel('What is it?').fill('Provider meeting');
  await second.getByLabel('Starts').fill(`${key(thursday)}T08:00`);
  await second.getByLabel('Ends').fill(`${key(thursday)}T09:00`);
  await second.getByRole('button', { name: 'Remove Everyone' }).click();
  await second.getByRole('combobox', { name: 'Who is it for?' }).fill('provider');
  await manager.getByRole('listbox').getByRole('option', { name: /^Provider/ }).click();
  await second.getByRole('button', { name: 'Add event' }).click();
  await manager.getByTestId('rota-events-row').getByText('Provider meeting').waitFor({ timeout: 10000 });
});

await step('an event ending before it starts is refused, in words', async () => {
  const status = await manager.evaluate(async () => {
    const r = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Backwards',
        allDay: false,
        startsAt: '2030-01-01T15:00:00.000Z',
        endsAt: '2030-01-01T14:00:00.000Z',
        audience: 'EVERYONE',
      }),
    });
    return { status: r.status, body: await r.json() };
  });
  if (status.status !== 400 || !JSON.stringify(status.body).includes('end after it starts')) {
    throw new Error(JSON.stringify(status));
  }
});

const frankie = await signIn('frontdesk@domihealthcare.com');

await step('staff see the events for them, and only those', async () => {
  await frankie.goto(`${BASE}/schedule?week=${key(nextWeek)}`, { waitUntil: 'networkidle' });
  await frankie.getByRole('button', { name: 'Week', exact: true }).click();
  const row = frankie.getByTestId('rota-events-row');
  await row.getByText('Office meeting').waitFor({ timeout: 10000 });
  const text = await row.innerText();
  if (text.includes('Wellness day')) throw new Error('North Bergen staff see a West New York event');
  if (text.includes('Provider meeting')) throw new Error('a Front Desk member sees the Provider meeting');
  if (await frankie.getByRole('button', { name: '+ Add', exact: true }).count()) {
    throw new Error('staff are offered + Add event');
  }
});

await step('tapping one shows when, where and what — and no Edit for staff', async () => {
  await frankie.getByTestId('rota-events-row').getByText('Office meeting').click();
  const dialog = frankie.getByRole('dialog', { name: 'Office meeting' });
  await dialog.waitFor({ timeout: 5000 });
  const text = await dialog.innerText();
  for (const expected of ['12:30pm–1:30pm', 'North Bergen office — break room', 'Everyone', 'New phones']) {
    if (!text.includes(expected)) throw new Error(`missing "${expected}" in: ${text}`);
  }
  if (await dialog.getByRole('button', { name: 'Edit' }).count()) throw new Error('staff can edit');
  await frankie.screenshot({ path: `${OUT}/events-dialog-staff.png` });
  await dialog.getByRole('button', { name: 'Close' }).click();
});

await step('staff cannot make one through the API either', async () => {
  const status = await frankie.evaluate(async () => {
    const r = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Party',
        allDay: false,
        startsAt: '2030-01-01T15:00:00.000Z',
        endsAt: '2030-01-01T16:00:00.000Z',
        audience: 'EVERYONE',
      }),
    });
    return r.status;
  });
  if (status !== 403) throw new Error(`answered ${status}`);
});

await step('the bell says a new event is on, and goes to its week', async () => {
  const titles = await bellTitles(frankie);
  if (!titles.includes('New event: Office meeting')) throw new Error(`bell: ${titles.join(' | ')}`);
  if (titles.some((t) => t.includes('Wellness') || t.includes('Provider'))) {
    throw new Error(`told about events not for them: ${titles.join(' | ')}`);
  }
  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await frankie.getByRole('button', { name: /notification/i }).click();
  await frankie.getByText('New event: Office meeting').click();
  await frankie.waitForURL(/\/schedule\?week=/, { timeout: 10000 });
  await frankie.getByTestId('rota-events-row').getByText('Office meeting').waitFor({ timeout: 10000 });
});

await step('it is in the month too', async () => {
  await frankie.getByRole('button', { name: 'Month', exact: true }).click();
  await frankie.getByTestId(`month-event-${key(wednesday)}`).first().waitFor({ timeout: 10000 });
  await frankie.getByRole('button', { name: 'Week', exact: true }).click();
});

await step('it goes to the phone through the calendar feed — only the ones for them', async () => {
  const feed = await frankie.evaluate(async () => {
    const { token } = await fetch('/api/calendar/link', { method: 'POST' }).then((r) => r.json());
    return fetch(`/api/calendar/${token}/domi.ics`, { cache: 'no-store' }).then((r) => r.text());
  });
  if (!feed.includes('SUMMARY:Office meeting')) throw new Error('the meeting is not in the feed');
  if (!/UID:event-[0-9a-f-]+@staff\.domihealthcare\.com/.test(feed)) throw new Error('no stable UID');
  if (feed.includes('Wellness day') || feed.includes('Provider meeting')) {
    throw new Error('events for others are in the feed');
  }
});

const max = await signIn('ma@domihealthcare.com');

await step('West New York staff see the wellness day, all day, and it syncs as whole days', async () => {
  await max.goto(`${BASE}/schedule?week=${key(nextWeek)}`, { waitUntil: 'networkidle' });
  await max.getByRole('button', { name: 'Week', exact: true }).click();
  const row = max.getByTestId('rota-events-row');
  await row.getByText('Wellness day').first().waitFor({ timeout: 10000 });
  if (!(await row.innerText()).includes('All day')) throw new Error('not shown as all day');
  const feed = await max.evaluate(async () => {
    const { token } = await fetch('/api/calendar/link', { method: 'POST' }).then((r) => r.json());
    return fetch(`/api/calendar/${token}/domi.ics`, { cache: 'no-store' }).then((r) => r.text());
  });
  const compact = (d) => key(d).replace(/-/g, '');
  const friday = new Date(thursday.getTime() + 86_400_000);
  if (!feed.includes(`DTSTART;VALUE=DATE:${compact(wednesday)}`) || !feed.includes(`DTEND;VALUE=DATE:${compact(friday)}`)) {
    throw new Error(`the wellness day is not two whole days in the feed`);
  }
});

await step('events add nothing to anybody’s hours', async () => {
  const text = await manager.evaluate(async (week) => {
    const r = await fetch(`/api/shifts/coverage?from=${week.from}&to=${week.to}`);
    return r.json();
  }, { from: key(nextWeek), to: key(new Date(nextWeek.getTime() + 6 * 86_400_000)) });
  const hours = text.days.reduce((sum, day) => sum + day.staffedHours, 0);
  if (hours !== 0) throw new Error(`${hours} hours scheduled in a week with only events in it`);
});

await step('a manager moves the meeting; the people it is for are told', async () => {
  await manager.reload({ waitUntil: 'networkidle' });
  await manager.getByTestId('rota-events-row').getByText('Office meeting').click();
  const dialog = manager.getByRole('dialog', { name: 'Office meeting' });
  await dialog.getByRole('button', { name: 'Edit' }).click();
  const form = manager.getByRole('form', { name: 'Change event' });
  await form.getByLabel('Starts').fill(`${key(wednesday)}T13:00`);
  await form.getByLabel('Ends').fill(`${key(wednesday)}T14:00`);
  const saved = manager.waitForResponse((r) => r.url().includes('/api/events/') && r.request().method() === 'PATCH');
  await form.getByRole('button', { name: 'Save changes' }).click();
  if ((await saved).status() !== 200) throw new Error('not saved');
  await manager.getByTestId('rota-events-row').getByText('1pm–2pm').waitFor({ timeout: 10000 });
  const titles = await bellTitles(frankie);
  if (!titles.includes('Event changed: Office meeting')) throw new Error(`bell: ${titles.join(' | ')}`);
});

await step('removing one asks first, then takes it off and says it is cancelled', async () => {
  await manager.getByTestId('rota-events-row').getByText('Office meeting').click();
  const dialog = manager.getByRole('dialog', { name: 'Office meeting' });
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await manager.getByRole('button', { name: 'Keep it' }).click();
  await dialog.waitFor({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await manager.getByRole('button', { name: 'Yes, remove it' }).click();
  await manager.getByTestId('rota-events-row').getByText('Office meeting').waitFor({ state: 'detached', timeout: 10000 });
  const titles = await bellTitles(frankie);
  if (!titles.includes('Cancelled: Office meeting')) throw new Error(`bell: ${titles.join(' | ')}`);
  const feed = await frankie.evaluate(async () => {
    const { token } = await fetch('/api/calendar/link').then((r) => r.json());
    return fetch(`/api/calendar/${token}/domi.ics`, { cache: 'no-store' }).then((r) => r.text());
  });
  if (feed.includes('Office meeting')) throw new Error('still in the phone feed');
});

await step('on a phone the events row is there above the shifts', async () => {
  const phone = max;
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${BASE}/schedule?week=${key(nextWeek)}`, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: 'Week', exact: true }).click();
  await phone.getByTestId('rota-events-row').waitFor({ timeout: 10000 });
  const scroll = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (scroll > 1) throw new Error(`the page scrolls sideways by ${scroll}px`);
  await phone.screenshot({ path: `${OUT}/events-phone.png`, fullPage: true });
});

await step('a video call link: refused unless it is a real link, then a Join button and on the phone', async () => {
  await manager.goto(`${BASE}/schedule?week=${key(nextWeek)}`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: 'Week', exact: true }).click();
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Event', exact: true }).click();
  const form = manager.getByRole('form', { name: 'New event' });
  await form.getByLabel('What is it?').fill('Video check-in');
  await form.getByLabel('Starts').fill(`${key(wednesday)}T15:00`);
  await form.getByLabel('Ends').fill(`${key(wednesday)}T15:30`);
  // Google Meet is not set up here, so only the paste box is offered.
  if (await form.getByLabel(/Create a Google Meet link/).count()) throw new Error('offered Meet without it being set up');
  const refused = await manager.evaluate(async () => {
    const r = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Trick',
        allDay: false,
        startsAt: '2030-01-01T15:00:00.000Z',
        endsAt: '2030-01-01T16:00:00.000Z',
        audience: 'EVERYONE',
        meetingUrl: 'javascript:alert(document.cookie)',
      }),
    });
    return r.status;
  });
  if (refused !== 400) throw new Error(`a javascript: link answered ${refused}`);

  await form.getByLabel('Video call link (optional)').fill('https://meet.google.com/abc-defg-hij');
  await form.getByRole('button', { name: 'Add event' }).click();
  await manager.getByTestId('rota-events-row').getByText('Video check-in').waitFor({ timeout: 10000 });

  await frankie.goto(`${BASE}/schedule?week=${key(nextWeek)}`, { waitUntil: 'networkidle' });
  await frankie.getByRole('button', { name: 'Week', exact: true }).click();
  await frankie.getByTestId('rota-events-row').getByText('Video check-in').click();
  const join = frankie.getByRole('dialog', { name: 'Video check-in' }).getByRole('link', { name: /Join video call/ });
  if ((await join.getAttribute('href')) !== 'https://meet.google.com/abc-defg-hij') throw new Error('the Join link goes elsewhere');
  if ((await join.getAttribute('target')) !== '_blank' || !(await join.getAttribute('rel'))?.includes('noopener')) {
    throw new Error('the Join link does not open safely in a new tab');
  }
  await frankie.screenshot({ path: `${OUT}/events-join.png` });
  const feed = (
    await frankie.evaluate(async () => {
      const { token } = await fetch('/api/calendar/link').then((r) => r.json());
      return fetch(`/api/calendar/${token}/domi.ics`, { cache: 'no-store' }).then((r) => r.text());
    })
  ).replace(/\r\n /g, '');
  if (!feed.includes('URL:https://meet.google.com/abc-defg-hij')) throw new Error('no link in the phone feed');
  if (!feed.includes('Join the video call: https://meet.google.com/abc-defg-hij')) throw new Error('the link is not in the notes');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL EVENT CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
