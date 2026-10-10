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
 * "Someone called out: ask who can cover" (Dominguez, October 2026 — a
 * "smarter" idea). In an open shift's pop-up the manager asks the people who
 * are free, by bell and email; the first to say yes gets it, published to
 * them; the manager is told, and so is everybody else asked. Only the people
 * asked can see it.
 *
 * Open shifts at North Bergen in February 2027, which run-all.sh clears
 * between suites. Frankie and Ada are the people asked; Frankie already works
 * the morning of the 17th, so she cannot be asked about that one.
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

const mgr = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
const ada = await signIn('admin@domihealthcare.com');

const staff = (await call(mgr, '/employees')).body;
const idOf = (email) => staff.find((p) => p.email === email).id;
const places = (await call(mgr, '/locations')).body;
const nb = places.find((l) => l.name === 'North Bergen').id;
// New Jersey is on EST in February: UTC-5.
const at = (day, hour) =>
  `2027-02-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00-05:00`;
async function shift(employeeId, day, from, to) {
  const made = await call(mgr, '/shifts', {
    method: 'POST',
    body: JSON.stringify({ employeeId, locationId: nb, startsAt: at(day, from), endsAt: at(day, to) }),
  });
  if (made.status !== 201) throw new Error(`making a shift answered ${made.status}: ${JSON.stringify(made.body)}`);
  return made.body;
}
const latest = async (page) => (await call(page, '/notifications')).body.items.find((n) => n.kind === 'COVER_REQUEST');

let open;
let request;
const dialog = mgr.getByRole('dialog', { name: 'Open shift' });

await step('set-up: an open shift on Tue Feb 16', async () => {
  open = await shift(null, 16, 9, 17);
});

await step('the pop-up offers to ask the free people, ticked, and asks them', async () => {
  await mgr.goto(`${BASE}/schedule?week=2027-02-16`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: 'Week', exact: true }).click();
  await mgr.getByTestId('open-shift').first().click();
  const ask = dialog.getByTestId('ask-to-cover');
  await ask.getByRole('button', { name: 'Choose who to ask' }).click();
  const ticked = await ask.locator('input[type=checkbox]:checked').count();
  if (ticked < 1) throw new Error('nobody was ticked to start with');
  // Ask exactly Frankie and Ada.
  for (const box of await ask.locator('label').all()) {
    const name = await box.innerText();
    const want = /Frankie|Ada/.test(name);
    const input = box.locator('input');
    if ((await input.isChecked()) !== want) await input.click();
  }
  await ask.getByRole('button', { name: 'Ask 2 people' }).click();
  await ask.getByTestId('cover-asked').getByText('Frankie Front-Desk — not answered yet').waitFor({ timeout: 10000 });
  await mgr.screenshot({ path: `${OUT}/ask-cover.png` });
});

await step('Frankie and Ada are each told on the bell, with a link to answer', async () => {
  const told = await latest(frankie);
  if (!told || told.title !== 'Can you cover Tue, Feb 16, 9:00 AM–5:00 PM?') throw new Error(`Frankie's bell: ${JSON.stringify(told)}`);
  request = told.link.split('/').pop();
  if (!(await latest(ada))) throw new Error('Ada was not told');
  if (await latest(mgr)) throw new Error('the manager was told as if asked');
});

await step('Frankie says yes from the link: the shift is hers, published', async () => {
  await frankie.goto(`${BASE}/cover/${request}`, { waitUntil: 'networkidle' });
  const card = frankie.getByTestId('cover-request');
  await card.getByText('Tue, Feb 16, 9:00 AM–5:00 PM').waitFor({ timeout: 10000 });
  await card.getByText('at North Bergen').waitFor();
  await card.getByRole('button', { name: 'Yes, I’ll take it' }).click();
  await card.getByText('It’s yours').waitFor({ timeout: 10000 });
  const shifts = (await call(mgr, `/shifts?from=${at(16, 0)}&to=${at(17, 0)}`)).body;
  const taken = shifts.find((s) => s.id === open.id);
  if (taken.employeeId !== idOf('frontdesk@domihealthcare.com') || taken.status !== 'PUBLISHED')
    throw new Error(`the shift is ${taken.employeeId} / ${taken.status}`);
});

await step('the manager hears who took it; Ada hears it is covered and cannot take it now', async () => {
  const told = (await call(mgr, '/notifications')).body.items.find((n) => n.title.startsWith('Frankie Front-Desk will cover'));
  if (!told) throw new Error('the manager was not told');
  const adaTold = (await call(ada, '/notifications')).body.items.find((n) => n.title === 'Tue, Feb 16, 9:00 AM–5:00 PM is covered');
  if (!adaTold) throw new Error('Ada was not told it is covered');
  await ada.goto(`${BASE}/cover/${request}`, { waitUntil: 'networkidle' });
  await ada.getByText('It’s covered').waitFor({ timeout: 10000 });
  if (await ada.getByRole('button', { name: 'Yes, I’ll take it' }).count()) throw new Error('Ada can still say yes');
  const late = await call(ada, `/cover/${request}/answer`, { method: 'POST', body: JSON.stringify({ yes: true }) });
  if (late.status !== 400) throw new Error(`a late yes answered ${late.status}`);
});

await step('when everybody asked says no, the manager is told', async () => {
  const second = await shift(null, 18, 9, 17);
  const asked = await call(mgr, `/shifts/${second.id}/ask-cover`, {
    method: 'POST',
    body: JSON.stringify({ employeeIds: [idOf('admin@domihealthcare.com')] }),
  });
  if (asked.status !== 200) throw new Error(`asking answered ${asked.status}: ${JSON.stringify(asked.body)}`);
  const link = (await call(ada, '/notifications')).body.items.find((n) => n.title.startsWith('Can you cover Thu, Feb 18')).link;
  await ada.goto(`${BASE}${link}`, { waitUntil: 'networkidle' });
  await ada.getByRole('button', { name: 'No, I can’t' }).click();
  await ada.getByText('You said you can’t').waitFor({ timeout: 10000 });
  const told = (await call(mgr, '/notifications')).body.items.find((n) => n.title === 'Nobody you asked can cover Thu, Feb 18, 9:00 AM–5:00 PM');
  if (!told) throw new Error('the manager was not told nobody can');
});

await step('somebody already working then cannot be asked; stopping tells those still to answer', async () => {
  await shift(idOf('frontdesk@domihealthcare.com'), 17, 8, 12);
  const third = await shift(null, 17, 9, 17);
  const refused = await call(mgr, `/shifts/${third.id}/ask-cover`, {
    method: 'POST',
    body: JSON.stringify({ employeeIds: [idOf('frontdesk@domihealthcare.com')] }),
  });
  if (refused.status !== 400) throw new Error(`asking somebody already on answered ${refused.status}`);
  await call(mgr, `/shifts/${third.id}/ask-cover`, {
    method: 'POST',
    body: JSON.stringify({ employeeIds: [idOf('admin@domihealthcare.com')] }),
  });
  const stopped = await call(mgr, `/shifts/${third.id}/cover-request/stop`, { method: 'POST' });
  if (stopped.body.request.state !== 'stopped') throw new Error(`stopping left it ${stopped.body.request.state}`);
  const told = (await call(ada, '/notifications')).body.items.find((n) => n.title === 'Wed, Feb 17, 9:00 AM–5:00 PM no longer needs covering');
  if (!told) throw new Error('Ada was not told it is no longer needed');
});

await step('staff who were not asked learn nothing, and only managers ask', async () => {
  // Thursday's request asked only Ada.
  const thursday = (await call(ada, '/notifications')).body.items.find((n) => n.title.startsWith('Can you cover Thu, Feb 18'));
  const peek = await call(frankie, `/cover/${thursday.link.split('/').pop()}`);
  if (peek.status !== 404) throw new Error(`somebody not asked answered ${peek.status}`);
  const ask = await call(frankie, `/shifts/${open.id}/ask-cover`, {
    method: 'POST',
    body: JSON.stringify({ employeeIds: [idOf('admin@domihealthcare.com')] }),
  });
  if (ask.status !== 403) throw new Error(`staff asking answered ${ask.status}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL ASK-COVER CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
