import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { openNews } from './nav.mjs';

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
 * The AI helpers (October 2026, Dominguez): help writing a News post, News in
 * Spanish with an English | Español switch, a pasted booking read into the
 * calendar's form, and wording for declining time off — plus the decline
 * pop-up itself, which mended the Schedule's Decline (it sent no reason, so
 * the server refused it).
 *
 * Neither CI nor a test deployment has an Anthropic key, so: everything is
 * checked off (nothing offered, the routes refuse); what needs no AI is
 * checked for real (declining with a reason, Spanish an admin typed, the
 * switch); and the screens with the AI switched on have its answers stood in
 * for in the browser. What is sent, and the rules, are unit-tested.
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
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

/// Waits for an input to hold a value (React sets the property, not the
/// attribute, so a selector on it would not see it).
async function waitForValue(locator, expected, timeout = 10000) {
  const until = Date.now() + timeout;
  let value = '';
  while (Date.now() < until) {
    value = await locator.inputValue().catch(() => '');
    if (typeof expected === 'string' ? value === expected : expected.test(value)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`waited for ${expected}, it reads "${value}"`);
}

/// The AI helpers switched on, as far as the screens can tell.
async function aiOn(page) {
  await page.context().route('**/api/config', async (route) => {
    const real = await route.fetch();
    await route.fulfill({ response: real, json: { ...(await real.json()), assistant: true } });
  });
  // The app keeps what /config said for a minute; start the page afresh.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
}

const ada = await signIn('admin@domihealthcare.com');
const mgr = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');

// ------------------------------------------------------------------ off

await step('with no key, every helper route refuses and Spanish on demand has none', async () => {
  const post = await call(ada, '/announcements', {
    method: 'POST',
    body: JSON.stringify({ title: 'Flu shots on Friday', body: 'Bring your card.' }),
  });
  if (post.status !== 201) throw new Error(`posting answered ${post.status}`);
  const checks = [
    [ada, '/announcements/draft', { notes: 'flu shots friday' }],
    [ada, '/announcements/translate', { title: 'Flu shots', body: 'Friday' }],
    [mgr, '/events/read-booking', { text: 'Sarah from Pfizer, lunch Tuesday' }],
  ];
  for (const [page, path, body] of checks) {
    const answer = await call(page, path, { method: 'POST', body: JSON.stringify(body) });
    if (answer.status !== 503) throw new Error(`${path} answered ${answer.status}`);
  }
  const spanish = await call(frankie, `/announcements/${post.body.id}/spanish`);
  if (spanish.status !== 200 || spanish.body.spanish !== null)
    throw new Error(`Spanish on demand: ${JSON.stringify(spanish)}`);
});

await step('staff cannot use an admin’s or a manager’s helper', async () => {
  const draft = await call(frankie, '/announcements/draft', {
    method: 'POST',
    body: JSON.stringify({ notes: 'party friday' }),
  });
  const booking = await call(frankie, '/events/read-booking', {
    method: 'POST',
    body: JSON.stringify({ text: 'Lunch on Tuesday' }),
  });
  if (draft.status !== 403 || booking.status !== 403)
    throw new Error(`staff got ${draft.status} and ${booking.status}`);
});

await step('switched off, nothing is offered: no writing help, no switch with no Spanish', async () => {
  await openNews(ada);
  await ada.getByRole('button', { name: '+ New post' }).click();
  await ada.getByLabel('Title', { exact: true }).waitFor({ timeout: 10000 });
  if (await ada.getByRole('button', { name: '✨ Help me write it' }).count())
    throw new Error('writing help offered while off');
  await ada.getByText('In Spanish').click();
  if (await ada.getByRole('button', { name: '✨ Translate from the English' }).count())
    throw new Error('translation offered while off');
  await ada.getByRole('button', { name: 'Cancel' }).click();
  if (await ada.getByTestId('news-language').count())
    throw new Error('the language switch shows with no Spanish to switch to');
});

// ------------------------------------------- declining time off (no AI)

let frankiesRequest;
await step('the Schedule’s Decline asks for the reason, and declines with it', async () => {
  const asked = await call(frankie, '/pto', {
    method: 'POST',
    body: JSON.stringify({ type: 'VACATION', startDate: '2027-04-14', endDate: '2027-04-14' }),
  });
  if (asked.status !== 201) throw new Error(`asking answered ${asked.status}`);
  frankiesRequest = asked.body;
  await mgr.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  const toDecide = mgr.getByTestId('requests-to-decide');
  await toDecide.locator('summary').click();
  await toDecide.getByRole('button', { name: 'Decline', exact: true }).first().click();
  const dialog = mgr.getByTestId('decline-time-off');
  await dialog.waitFor({ timeout: 10000 });
  if (await dialog.getByRole('button', { name: '✨ Help me word it' }).count())
    throw new Error('wording help offered while off');
  if (await dialog.getByRole('button', { name: 'Decline it' }).isEnabled())
    throw new Error('it can be declined with no reason');
  await dialog.getByLabel(/The reason .* will read/).fill('We are short at the front desk that week.');
  await dialog.getByRole('button', { name: 'Decline it' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
  const mine = await call(frankie, `/pto/${frankiesRequest.id}`);
  if (mine.body.status !== 'DENIED' || mine.body.reviewNote !== 'We are short at the front desk that week.')
    throw new Error(`the request is ${mine.body.status}: ${mine.body.reviewNote}`);
});

// ---------------------------------------------- Spanish typed by an admin

await step('an admin writes the Spanish by hand; staff switch to Español and back', async () => {
  await openNews(ada);
  await ada.getByRole('button', { name: '+ New post' }).click();
  await ada.getByLabel('Title', { exact: true }).fill('Staff meeting on Thursday');
  await ada.getByLabel('Message', { exact: true }).fill('In the North Bergen break room at 1pm.');
  await ada.getByText('In Spanish').click();
  await ada.getByLabel('Título en español').fill('Reunión de personal el jueves');
  await ada.getByLabel('Mensaje en español').fill('En la sala de descanso de North Bergen a la 1pm.');
  await ada.getByRole('button', { name: 'Post it' }).click();
  await ada.getByRole('heading', { name: 'Staff meeting on Thursday' }).waitFor({ timeout: 10000 });

  await openNews(frankie);
  const toggle = frankie.getByTestId('news-language');
  await toggle.waitFor({ timeout: 10000 });
  await toggle.getByRole('button', { name: 'Español' }).click();
  await frankie.getByRole('heading', { name: 'Reunión de personal el jueves' }).waitFor({ timeout: 10000 });
  await frankie.getByText('En la sala de descanso de North Bergen a la 1pm.').waitFor();
  // Typed by an admin, so not marked as translated automatically.
  const notes = await frankie.getByTestId('post-language-note').allInnerTexts();
  if (notes.some((note) => note.includes('Traducido'))) throw new Error(`marked: ${notes}`);
  // The other post has no Spanish and the AI service is off: it says so.
  if (!notes.some((note) => note.includes('aún no está en español')))
    throw new Error(`notes read: ${notes.join(' | ')}`);
  // Remembered, and the same on Home.
  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await frankie.getByTestId('home-news').getByText('Reunión de personal el jueves').waitFor({ timeout: 10000 });
  await frankie.getByTestId('home-news').getByRole('button', { name: 'English' }).click();
  await frankie.getByTestId('home-news').getByText('Staff meeting on Thursday').first().waitFor();
});

await step('changing the English clears Spanish that was not redone with it', async () => {
  const posts = (await call(ada, '/announcements')).body;
  const post = posts.find((p) => p.title === 'Staff meeting on Thursday');
  const edited = await call(ada, `/announcements/${post.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: 'In the North Bergen break room at 2pm.' }),
  });
  if (edited.body.titleEs !== null) throw new Error(`the old Spanish stayed: ${edited.body.titleEs}`);
});

// ---------------------------------------- switched on, answers stood in for

await step('“Help me write it” fills the title and message from notes', async () => {
  await aiOn(ada);
  const sent = [];
  await ada.context().route('**/api/announcements/draft', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({
      json: { title: 'West New York closes early Friday', body: 'West New York closes at 2pm on Friday.' },
    });
  });
  await openNews(ada);
  await ada.getByRole('button', { name: '+ New post' }).click();
  await ada.getByRole('button', { name: '✨ Help me write it' }).click();
  await ada.getByLabel('Notes for the post').fill('wny closing 2pm fri');
  await ada.getByRole('button', { name: 'Write it' }).click();
  await waitForValue(ada.getByLabel('Title', { exact: true }), 'West New York closes early Friday');
  if ((await ada.getByLabel('Message', { exact: true }).inputValue()) !== 'West New York closes at 2pm on Friday.')
    throw new Error('the message was not filled in');
  if (sent[0]?.notes !== 'wny closing 2pm fri') throw new Error(`sent ${JSON.stringify(sent)}`);
});

await step('“Translate from the English” fills the Spanish, marked as the AI service’s', async () => {
  const sent = [];
  await ada.context().route('**/api/announcements/translate', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({
      json: { title: 'West New York cierra temprano el viernes', body: 'West New York cierra a las 2pm el viernes.' },
    });
  });
  await ada.getByText('In Spanish').click();
  await ada.getByRole('button', { name: '✨ Translate from the English' }).click();
  await ada.getByText('Translated by the AI service').waitFor({ timeout: 10000 });
  if ((await ada.getByLabel('Título en español').inputValue()) !== 'West New York cierra temprano el viernes')
    throw new Error('the Spanish title was not filled in');
  await ada.getByRole('button', { name: 'Post it' }).click();
  await ada.getByRole('heading', { name: 'West New York closes early Friday' }).waitFor({ timeout: 10000 });
  const posts = (await call(ada, '/announcements')).body;
  const saved = posts.find((p) => p.title === 'West New York closes early Friday');
  if (!saved.spanishByAi || saved.titleEs !== 'West New York cierra temprano el viernes')
    throw new Error(`saved: ${JSON.stringify({ titleEs: saved.titleEs, byAi: saved.spanishByAi })}`);
  await ada.screenshot({ path: `${OUT}/ai-news-editor.png` });
  await ada.context().unrouteAll({ behavior: 'ignoreErrors' });

  await openNews(frankie);
  await frankie.getByTestId('news-language').getByRole('button', { name: 'Español' }).click();
  await frankie.getByRole('heading', { name: 'West New York cierra temprano el viernes' }).waitFor({ timeout: 10000 });
  await frankie.getByText('Traducido automáticamente.').first().waitFor();
});

await step('a post with no Spanish is translated when a reader asks, then shown as such', async () => {
  // Stood in for before the page starts afresh: a reader already on
  // Español asks as soon as it loads.
  let asked = 0;
  await frankie.context().route('**/api/announcements/*/spanish', async (route) => {
    asked += 1;
    await route.fulfill({
      json: { spanish: { titleEs: 'Vacunas contra la gripe el viernes', bodyEs: 'Traiga su tarjeta.', spanishByAi: true } },
    });
  });
  await aiOn(frankie);
  await openNews(frankie);
  await frankie.getByTestId('news-language').getByRole('button', { name: 'Español' }).click();
  await frankie.getByRole('heading', { name: 'Vacunas contra la gripe el viernes' }).waitFor({ timeout: 10000 });
  if (asked === 0) throw new Error('nothing was asked for');
  await frankie.getByTestId('news-language').getByRole('button', { name: 'English' }).click();
  await frankie.getByRole('heading', { name: 'Flu shots on Friday' }).waitFor({ timeout: 10000 });
  await frankie.context().unrouteAll({ behavior: 'ignoreErrors' });
});

await step('a pasted rep booking fills in the calendar’s form, and says what it left out', async () => {
  await aiOn(mgr);
  const sent = [];
  await mgr.context().route('**/api/events/read-booking', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        booking: {
          kind: 'DIAGNOSTIC',
          title: 'US + ECHO',
          date: '2027-04-20',
          endDate: null,
          startTime: '08:00',
          endTime: '14:00',
          allDay: false,
          locationId: null,
          repId: null,
          newRep: null,
          place: '',
          description: 'Patients fasting from midnight.',
        },
      },
    });
  });
  await mgr.goto(`${BASE}/schedule/calendar?month=2027-04`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: '+ Add', exact: true }).click();
  await mgr.getByRole('menuitem', { name: 'Event', exact: true }).click();
  await mgr.getByRole('button', { name: '✨ Fill this in from a message' }).click();
  await mgr.getByLabel('The message').fill('Ultrasound and echo on April 20, 8 to 2.');
  await mgr.getByRole('button', { name: 'Fill it in' }).click();
  const form = mgr.getByRole('form', { name: 'New diagnostics date' });
  await form.waitFor({ timeout: 10000 });
  if ((await form.getByLabel('Which tests?').inputValue()) !== 'US + ECHO') throw new Error('no title');
  if ((await form.getByLabel('Starts').inputValue()) !== '2027-04-20T08:00') throw new Error('no start');
  if ((await form.getByLabel('Ends').inputValue()) !== '2027-04-20T14:00') throw new Error('no end');
  const read = await form.getByTestId('booking-read').innerText();
  if (!read.includes('check it before saving') || !read.includes('which office'))
    throw new Error(`the note reads: ${read}`);
  if (sent[0]?.text !== 'Ultrasound and echo on April 20, 8 to 2.') throw new Error(`sent ${JSON.stringify(sent)}`);
  await mgr.screenshot({ path: `${OUT}/ai-booking.png` });
});

await step('a rep who is not on the list is named, to be added', async () => {
  await mgr.context().unroute('**/api/events/read-booking');
  await mgr.context().route('**/api/events/read-booking', (route) =>
    route.fulfill({
      json: {
        booking: {
          kind: 'REP_LUNCH',
          title: '',
          date: '2027-04-21',
          endDate: null,
          startTime: '12:30',
          endTime: null,
          allDay: false,
          locationId: null,
          repId: null,
          newRep: { name: 'Dana Ruiz', company: 'Lilly', medication: 'Mounjaro' },
          place: '',
          description: '',
        },
      },
    }),
  );
  await mgr.goto(`${BASE}/schedule/calendar?month=2027-04`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: '+ Add', exact: true }).click();
  await mgr.getByRole('menuitem', { name: 'Rep lunch' }).click();
  await mgr.getByRole('button', { name: '✨ Fill this in from a message' }).click();
  await mgr.getByLabel('The message').fill('Dana from Lilly, lunch the 21st at 12:30');
  await mgr.getByRole('button', { name: 'Fill it in' }).click();
  const form = mgr.getByRole('form', { name: 'New rep lunch' });
  await form.getByText('Dana Ruiz, Lilly is not on the reps list yet').waitFor({ timeout: 10000 });
  // No end time in the message: an hour.
  if ((await form.getByLabel('Ends').inputValue()) !== '2027-04-21T13:30') throw new Error('no hour-long default');
  await mgr.context().unrouteAll({ behavior: 'ignoreErrors' });
});

await step('“Help me word it” fills the reason from what the manager typed', async () => {
  await aiOn(mgr);
  const sent = [];
  await mgr.context().route('**/api/pto/*/decline-wording', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({
      json: { reason: 'Sorry Frankie — we are short at the front desk that day. Could another day work?' },
    });
  });
  const asked = await call(frankie, '/pto', {
    method: 'POST',
    body: JSON.stringify({ type: 'VACATION', startDate: '2027-04-15', endDate: '2027-04-15' }),
  });
  if (asked.status !== 201) throw new Error(`asking answered ${asked.status}`);
  await mgr.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  const toDecide = mgr.getByTestId('requests-to-decide');
  await toDecide.locator('summary').click();
  await toDecide.getByRole('button', { name: 'Decline', exact: true }).first().click();
  const dialog = mgr.getByTestId('decline-time-off');
  await dialog.getByLabel(/The reason .* will read/).fill('short at front desk');
  await dialog.getByRole('button', { name: '✨ Help me word it' }).click();
  await waitForValue(dialog.getByLabel(/The reason .* will read/), /Could another day work/);
  if (sent[0]?.notes !== 'short at front desk') throw new Error(`sent ${JSON.stringify(sent)}`);
  // Never sent until the manager presses Decline it.
  const still = await call(frankie, `/pto/${asked.body.id}`);
  if (still.body.status !== 'PENDING') throw new Error(`already ${still.body.status}`);
  await dialog.getByRole('button', { name: 'Keep it waiting' }).click();
  await mgr.context().unrouteAll({ behavior: 'ignoreErrors' });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL AI HELPER CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
