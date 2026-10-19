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
 * Meetings: "Find a time" and replies (October 2026, Dominguez).
 *
 * A manager booking a meeting for Frankie and Max asks for a time; with both
 * on the rota next Wednesday 9 to 5, the best is 9:00 that morning, both at
 * work. Then each answers - Frankie can't go, Max is going - and both see
 * both answers (Dominguez: everybody it is for sees who is going). The
 * manager who made it hears that Frankie can't go. Moving it clears the
 * answers. Nobody else can answer, or learn it is there.
 *
 * Seeded people: Frankie is Front Desk and MA at North Bergen, Max an MA at
 * West New York (with a temporary password).
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
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
const WED = key(wednesday);

/// "HH:MM" on that day in New Jersey, as an instant.
function inNewJersey(date, time) {
  const noon = new Date(`${date}T12:00:00Z`);
  const hour = Number(
    noon.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }),
  );
  const offset = 12 - hour;
  return new Date(`${date}T${time}:00.000Z`).getTime() + offset * 3_600_000;
}
const NINE = new Date(inNewJersey(WED, '09:00')).toISOString();

async function bellTitles(page) {
  return page.evaluate(async () => {
    const list = await fetch('/api/notifications').then((r) => r.json());
    return list.items.map((item) => item.title);
  });
}

const manager = await signIn('manager@domihealthcare.com');
const people = await manager.evaluate(async () => {
  const staff = await fetch('/api/employees').then((r) => r.json());
  const locations = await fetch('/api/locations').then((r) => r.json());
  const id = (email) => staff.find((person) => person.email === email).id;
  return {
    frankie: id('frontdesk@domihealthcare.com'),
    max: id('ma@domihealthcare.com'),
    nb: locations.find((l) => l.name === 'North Bergen').id,
    wny: locations.find((l) => l.name === 'West New York').id,
  };
});

await step('Frankie and Max are on the rota next Wednesday, 9 to 5', async () => {
  const results = await manager.evaluate(
    async ({ people, start, end }) => {
      const make = (employeeId, locationId) =>
        fetch('/api/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId,
            locationId,
            startsAt: start,
            endsAt: end,
            status: 'PUBLISHED',
            notes: 'event-replies-suite',
          }),
        }).then((r) => r.status);
      return [await make(people.frankie, people.nb), await make(people.max, people.wny)];
    },
    { people, start: NINE, end: new Date(inNewJersey(WED, '17:00')).toISOString() },
  );
  if (results.some((status) => status !== 201)) throw new Error(`shifts: ${results}`);
});

let meetingId = null;

await step('Find a time puts 9:00 that morning first, both at work, and Use this time fills it in', async () => {
  await manager.goto(`${BASE}/schedule?week=${key(nextWeek)}`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: 'Week', exact: true }).click();
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Event', exact: true }).click();
  const form = manager.getByRole('form', { name: 'New event' });
  await form.getByLabel('What is it?').fill('Team huddle');
  await form.getByLabel('Starts').fill(`${WED}T07:00`);
  await form.getByLabel('Ends').fill(`${WED}T08:00`);
  await form.getByRole('button', { name: 'Remove Everyone' }).click();
  for (const name of ['Frankie', 'Max']) {
    await form.getByRole('combobox', { name: 'Who is it for?' }).fill(name);
    await manager.getByRole('listbox').getByRole('option', { name: new RegExp(`^${name}`) }).click();
  }
  // The list stays open after a pick; close it so it covers nothing.
  await form.getByRole('combobox', { name: 'Who is it for?' }).press('Escape');

  const looked = manager.waitForResponse((r) => r.url().endsWith('/api/events/find-a-time'));
  await form.getByRole('button', { name: 'Find a time everyone is free' }).click();
  const found = await (await looked).json();
  if (found.people !== 2) throw new Error(`looked at ${found.people} people`);
  const best = found.suggestions[0];
  if (best.startsAt !== NINE) throw new Error(`best was ${best.startsAt}, not ${NINE}`);
  if (best.atWork !== 2 || best.busy.length !== 0) throw new Error(JSON.stringify(best));

  const region = manager.getByRole('region', { name: 'Suggested times' });
  await region.getByTestId('time-suggestion').first().getByText('All 2 at work then').waitFor({ timeout: 10000 });
  await manager.screenshot({ path: `${OUT}/find-a-time.png`, fullPage: true });
  await region.getByRole('button', { name: /^Use / }).first().click();
  await region.getByRole('button', { name: /^Chosen: / }).waitFor();

  const saved = manager.waitForResponse((r) => r.url().endsWith('/api/events') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Add event' }).click();
  const response = await saved;
  if (response.status() !== 201) throw new Error(`answered ${response.status()}: ${await response.text()}`);
  const body = await response.json();
  if (body.startsAt !== NINE) throw new Error(`saved at ${body.startsAt}, not ${NINE}`);
  meetingId = body.id;
  await manager.getByTestId('rota-events-row').getByText('Team huddle').waitFor({ timeout: 10000 });
});

await step('staff cannot ask for a time', async () => {
  const frankieApi = await signIn('frontdesk@domihealthcare.com');
  const status = await frankieApi.evaluate(async (wed) => {
    const r = await fetch('/api/events/find-a-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience: 'EVERYONE', from: wed, minutes: 60 }),
    });
    return r.status;
  }, WED);
  if (status !== 403) throw new Error(`answered ${status}`);
  await frankieApi.context().close();
});

async function openMeeting(page) {
  await page.goto(`${BASE}/schedule?week=${key(nextWeek)}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByTestId('rota-events-row').getByText('Team huddle').click();
  const dialog = page.getByRole('dialog', { name: 'Team huddle' });
  await dialog.getByTestId('event-replies').waitFor({ timeout: 10000 });
  return dialog;
}

const frankie = await signIn('frontdesk@domihealthcare.com');

await step('Frankie answers Can’t go, and is listed under it', async () => {
  const dialog = await openMeeting(frankie);
  await dialog.getByText('Are you going?').waitFor();
  await dialog.getByTestId('replies-waiting').getByText('Max Assistant').waitFor();
  const answered = frankie.waitForResponse((r) => r.url().endsWith('/reply') && r.request().method() === 'PUT');
  await dialog.getByRole('button', { name: 'Can’t go' }).click();
  if ((await answered).status() !== 200) throw new Error('answer refused');
  await dialog.getByTestId('replies-not-going').getByText('Frankie Front-Desk').waitFor({ timeout: 10000 });
  if ((await dialog.getByRole('button', { name: 'Can’t go' }).getAttribute('aria-pressed')) !== 'true') {
    throw new Error('the answer is not shown as chosen');
  }
  await dialog.getByRole('button', { name: 'Close' }).click();
  const mark = frankie.getByTestId('rota-events-row').getByTestId('event-chip-reply');
  if ((await mark.textContent()) !== '✗') throw new Error(`chip shows ${await mark.textContent()}`);
});

await step('the manager who made it hears that Frankie can’t go', async () => {
  const titles = await bellTitles(manager);
  if (!titles.includes("Frankie Front-Desk can't go: Team huddle")) {
    throw new Error(`bell: ${titles.join(' | ')}`);
  }
});

const max = await signIn('ma@domihealthcare.com');

await step('Max answers Going, and sees Frankie’s answer too', async () => {
  const dialog = await openMeeting(max);
  await dialog.getByTestId('replies-not-going').getByText('Frankie Front-Desk').waitFor();
  await dialog.getByRole('button', { name: 'Going', exact: true }).click();
  await dialog.getByTestId('replies-going').getByText('Max Assistant').waitFor({ timeout: 10000 });
  if (await dialog.getByTestId('replies-waiting').count()) throw new Error('somebody still waiting');
  await max.screenshot({ path: `${OUT}/event-replies.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'Close' }).click();
});

await step('the manager sees both answers, and cannot answer for a meeting not theirs', async () => {
  const replies = await manager.evaluate(async (id) => {
    const list = await fetch(`/api/events/${id}/replies`).then((r) => r.json());
    const answer = await fetch(`/api/events/${id}/reply`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'GOING' }),
    });
    return { list, status: answer.status };
  }, meetingId);
  if (replies.list.canReply) throw new Error('a manager not on the list was offered an answer');
  if (replies.list.going.map((p) => p.name).join() !== 'Max Assistant') throw new Error(JSON.stringify(replies.list));
  if (replies.status !== 403) throw new Error(`a manager answered: ${replies.status}`);
});

await step('somebody a meeting is not for cannot see or answer it', async () => {
  const other = await manager.evaluate(
    async ({ frankie, start, end }) => {
      const r = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'One-to-one',
          allDay: false,
          startsAt: start,
          endsAt: end,
          audience: 'CHOSEN',
          invitees: { employeeIds: [frankie] },
        }),
      });
      return (await r.json()).id;
    },
    {
      frankie: people.frankie,
      start: new Date(inNewJersey(WED, '15:00')).toISOString(),
      end: new Date(inNewJersey(WED, '15:30')).toISOString(),
    },
  );
  const statuses = await max.evaluate(async (id) => {
    const list = await fetch(`/api/events/${id}/replies`);
    const answer = await fetch(`/api/events/${id}/reply`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'GOING' }),
    });
    return [list.status, answer.status];
  }, other);
  if (statuses.join() !== '404,404') throw new Error(`answered ${statuses}`);
});

await step('moving the meeting clears the answers and asks again', async () => {
  const moved = await manager.evaluate(
    async ({ id, frankie, max, start, end }) => {
      const r = await fetch(`/api/events/${id}?scope=one`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Team huddle',
          allDay: false,
          startsAt: start,
          endsAt: end,
          audience: 'CHOSEN',
          invitees: { employeeIds: [frankie, max] },
        }),
      });
      if (!r.ok) return `PATCH ${r.status}`;
      return fetch(`/api/events/${id}/replies`).then((x) => x.json());
    },
    {
      id: meetingId,
      frankie: people.frankie,
      max: people.max,
      start: new Date(inNewJersey(WED, '10:00')).toISOString(),
      end: new Date(inNewJersey(WED, '11:00')).toISOString(),
    },
  );
  if (typeof moved === 'string') throw new Error(moved);
  if (moved.going.length || moved.notGoing.length || moved.waiting.length !== 2) {
    throw new Error(JSON.stringify(moved));
  }
  const notice = await frankie.evaluate(async () => {
    const list = await fetch('/api/notifications').then((r) => r.json());
    return list.items.find((item) => item.title === 'Event changed: Team huddle');
  });
  if (!notice?.body?.includes('say again whether you can go')) throw new Error(JSON.stringify(notice));
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL MEETING REPLY CHECKS PASSED');
