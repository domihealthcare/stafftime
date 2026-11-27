import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goToManage, unlockPay } from './nav.mjs';

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
 * Secret Santa (27 November 2026, Dominguez: managers set it up with a day,
 * a budget, where and who is in it, staff may sign themselves up, and once
 * it is closed each is told anonymously who they drew, by email too).
 *
 * Morgan (manager) sets one up with sign-ups on; Frankie signs up from Home
 * and writes gift ideas; Morgan adds Ada, Max and themselves and draws. Then:
 * one circle, nobody told anybody else's draw, the bell never naming who was
 * drawn, the name behind the PIN, an organizer's emergency look-up of one
 * person on the day, taking Frankie out after the draw closing the circle,
 * and cancelling it. run-all.sh clears secret_santas.
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
      const text = await r.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: r.status, body, text };
    },
    { path, init },
  );

/// A day three weeks on, on New Jersey's calendar.
const inThreeWeeks = (() => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date(),
  );
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 21);
  return date.toISOString().slice(0, 10);
})();

const manager = await signIn('manager@domihealthcare.com');
const admin = await signIn('admin@domihealthcare.com');
const staff = await signIn('frontdesk@domihealthcare.com');
const pages = { manager, admin, staff };

const me = async (page) => (await call(page, '/auth/me')).body;
const people = {};
for (const [key, page] of Object.entries(pages)) people[key] = await me(page);
// Max has a temporary password in the seed, so is added rather than signed in.
people.ma = (await call(manager, '/employees')).body.find(
  (person) => person.email === 'ma@domihealthcare.com',
);
const keyOf = (id) => Object.keys(people).find((key) => people[key].id === id);

const TITLE = 'Secret Santa suite';
let id = null;

await step('staff cannot set one up or draw names', async () => {
  const made = await call(staff, '/secret-santa', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Not allowed',
      exchangeOn: inThreeWeeks,
      budgetDollars: 25,
      selfSignUp: true,
    }),
  });
  if (made.status !== 403) throw new Error(`gave ${made.status}`);
});

await step('a manager sets one up from Manage, with sign-ups on', async () => {
  await goToManage(manager, 'Secret Santa');
  await manager.getByRole('button', { name: '+ Set up a Secret Santa' }).click();
  const form = manager.getByTestId('secret-santa-editor');
  await form.getByLabel('Name', { exact: true }).fill(TITLE);
  await form.getByLabel('Day of the exchange').fill(inThreeWeeks);
  await form.getByLabel('Budget ($)').fill('30');
  await form.getByLabel('Where exactly').fill('Break room');
  if (!(await form.getByLabel(/Let staff sign themselves up/).isChecked()))
    throw new Error('sign-ups should start ticked');
  await form.getByRole('button', { name: 'Set it up' }).click();
  await manager.getByTestId('secret-santa-organizer').waitFor({ timeout: 15000 });
  id = manager.url().split('/secret-santa/')[1];
  if (!/^[0-9a-f-]{36}$/.test(id ?? '')) throw new Error(`landed on ${manager.url()}`);
  await manager.getByText('Budget $30').waitFor();
  await manager.screenshot({ path: `${OUT}/secret-santa-organizer.png`, fullPage: true });
});
// Everything after needs it; stop here rather than time out step by step.
if (!id) {
  await browser.close();
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}

await step('staff are told sign-ups are open, on the bell', async () => {
  const bell = (await call(staff, '/notifications')).body.items;
  const told = bell.find(
    (item) => item.kind === 'SECRET_SANTA' && item.link === `/secret-santa/${id}`,
  );
  if (!told) throw new Error('no bell');
  if (!/Sign up/.test(told.body)) throw new Error(told.body);
});

await step('staff sign up from Home and write gift ideas', async () => {
  await staff.reload({ waitUntil: 'networkidle' });
  const card = staff.getByTestId('home-secret-santa');
  await card.getByRole('link', { name: 'Sign up →' }).click();
  await staff.getByRole('button', { name: 'Sign me up' }).click();
  await staff.getByText('You are in! Add some gift ideas').waitFor({ timeout: 10000 });
  await staff.getByLabel('Your gift ideas, for whoever draws you').fill('Coffee, no candles');
  await staff.getByRole('button', { name: 'Save my gift ideas' }).click();
  await staff.getByText('Your gift ideas are saved.').waitFor({ timeout: 10000 });
  await staff.getByTestId('secret-santa-members').getByText('Frankie').waitFor();
});

await step('staff can leave and join again before the draw', async () => {
  const out = await call(staff, `/secret-santa/${id}/leave`, { method: 'POST' });
  if (out.status !== 200 || out.body.me.inIt) throw new Error(`leave ${out.status}`);
  const back = await call(staff, `/secret-santa/${id}/join`, { method: 'POST' });
  if (back.status !== 200 || !back.body.me.inIt) throw new Error(`join ${back.status}`);
  // Leaving takes the gift ideas with it; put them back.
  await call(staff, `/secret-santa/${id}/wishes`, {
    method: 'PUT',
    body: JSON.stringify({ wishes: 'Coffee, no candles' }),
  });
});

await step('drawing needs at least three people', async () => {
  const early = await call(manager, `/secret-santa/${id}/draw`, { method: 'POST' });
  if (early.status !== 400) throw new Error(`gave ${early.status}`);
  await manager.reload({ waitUntil: 'networkidle' });
  if (await manager.getByRole('button', { name: /Draw the names/ }).isEnabled())
    throw new Error('Draw is pressable with one person');
});

await step('the manager adds Ada, Max and themselves', async () => {
  const added = await call(manager, `/secret-santa/${id}/people`, {
    method: 'POST',
    body: JSON.stringify({
      employeeIds: [people.admin.id, people.manager.id, people.staff.id, people.ma.id],
    }),
  });
  if (added.status !== 200) throw new Error(`add ${added.status}: ${added.text}`);
  // Frankie was in already.
  if (added.body.added !== 3) throw new Error(`added ${added.body.added}`);
  if (added.body.exchange.members.length !== 4) throw new Error('not four in it');
});

await step('the manager draws the names', async () => {
  await manager.reload({ waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: /Draw the names/ }).click();
  await manager.getByRole('button', { name: 'Yes, draw the names' }).click();
  await manager.getByText('Names drawn. 4 people have been told').waitFor({ timeout: 20000 });
});

const drew = {};
await step('who you drew is behind the PIN, and never in the page itself', async () => {
  for (const [key, page] of Object.entries(pages)) {
    const answer = await call(page, `/secret-santa/${id}`);
    if (answer.status !== 200) throw new Error(`${key}: ${answer.status}`);
    if (/recipient/i.test(answer.text)) throw new Error(`${key} was sent a recipient field`);
    if ('drew' in answer.body.me) throw new Error(`${key} was sent who they drew without a PIN`);
    if (!answer.body.me.drawn) throw new Error(`${key} has nobody`);
    for (const member of answer.body.members) {
      if ('wishes' in member) throw new Error(`${key} was sent somebody's gift ideas in the list`);
    }
    const locked = await call(page, `/secret-santa/${id}/mine`);
    if (locked.status !== 403 || locked.body.code !== 'PIN_REQUIRED')
      throw new Error(`${key} read it without a PIN: ${locked.status}`);
  }
});

await step('the page asks for the PIN, then shows who you drew', async () => {
  await manager.goto(`${BASE}/secret-santa/${id}`, { waitUntil: 'networkidle' });
  const card = manager.getByTestId('secret-santa-drew');
  if (await card.getByTestId('secret-santa-drew-name').count()) throw new Error('shown at once');
  await card.getByRole('button', { name: 'Show who I drew' }).click();
  await card.getByText(/Enter your PIN to see who you drew/).waitFor({ timeout: 10000 });
  if (await card.getByTestId('secret-santa-drew-name').count())
    throw new Error('shown before the PIN');
  await manager.screenshot({ path: `${OUT}/secret-santa-pin.png`, fullPage: true });
  await card.getByTestId('pay-pin').fill('7394');
  await card.getByRole('button', { name: 'Show', exact: true }).click();
  await card.getByTestId('secret-santa-drew-name').waitFor({ timeout: 10000 });
  await manager.screenshot({ path: `${OUT}/secret-santa-drew.png`, fullPage: true });
});

await step('it is one circle, and nobody draws themselves', async () => {
  for (const [key, page] of Object.entries(pages)) {
    if (key !== 'manager' && (await unlockPay(page)) !== 200) throw new Error(`${key} unlock`);
    const mine = (await call(page, `/secret-santa/${id}/mine`)).body;
    if (!mine?.id) throw new Error(`${key} drew nobody`);
    if (mine.id === people[key].id) throw new Error(`${key} drew themselves`);
    drew[key] = keyOf(mine.id);
  }
  // Max, who is not signed in here, drew whoever nobody else did.
  drew.ma = Object.keys(people).find((key) => !Object.values(drew).includes(key));
  // Each person once as a recipient, and one circle of four.
  if (new Set(Object.values(drew)).size !== 4) throw new Error(JSON.stringify(drew));
  const seen = new Set();
  let at = 'manager';
  for (let i = 0; i < 4; i += 1) {
    seen.add(at);
    at = drew[at];
  }
  if (at !== 'manager' || seen.size !== 4) throw new Error('not one circle');
  const shown = await manager.getByTestId('secret-santa-drew-name').innerText();
  if (!shown.includes(people[drew.manager].firstName)) throw new Error(`page showed ${shown}`);
});

await step('the bell says the name is ready, never whose it is', async () => {
  const bell = (await call(admin, '/notifications')).body.items;
  const told = bell.find(
    (item) => item.kind === 'SECRET_SANTA' && /your name is drawn/.test(item.title),
  );
  if (!told) throw new Error('no bell');
  const named = people[drew.admin];
  if (`${told.title} ${told.body}`.includes(named.firstName))
    throw new Error(`the bell names ${named.firstName}`);
});

await step('whoever drew you sees your gift ideas', async () => {
  // Everybody signed in writes gift ideas, so whoever drew them sees them.
  for (const key of ['manager', 'admin']) {
    await call(pages[key], `/secret-santa/${id}/wishes`, {
      method: 'PUT',
      body: JSON.stringify({ wishes: `Ideas from ${people[key].firstName}` }),
    });
  }
  const ideas = {
    staff: 'Coffee, no candles',
    manager: `Ideas from ${people.manager.firstName}`,
    admin: `Ideas from ${people.admin.firstName}`,
  };
  let checked = 0;
  for (const key of ['manager', 'admin', 'staff']) {
    const theirs = drew[key];
    if (!ideas[theirs]) continue; // Max wrote none
    const answer = (await call(pages[key], `/secret-santa/${id}/mine`)).body;
    if (answer.wishes !== ideas[theirs])
      throw new Error(`${key} sees "${answer.wishes}" for ${theirs}`);
    checked += 1;
  }
  if (checked < 2) throw new Error(`only ${checked} gift ideas checked`);
});

await step('nobody joins or leaves by themselves once drawn', async () => {
  const leave = await call(admin, `/secret-santa/${id}/leave`, { method: 'POST' });
  if (leave.status !== 409) throw new Error(`leave gave ${leave.status}`);
  const join = await call(staff, `/secret-santa/${id}/join`, { method: 'POST' });
  if (join.status !== 409) throw new Error(`join gave ${join.status}`);
});

await step(
  'an emergency look-up is for organizers, from the day, one person at a time',
  async () => {
    const staffTry = await call(staff, `/secret-santa/${id}/look-up/${people.admin.id}`, {
      method: 'POST',
    });
    if (staffTry.status !== 403) throw new Error(`staff gave ${staffTry.status}`);
    const early = await call(manager, `/secret-santa/${id}/look-up/${people.admin.id}`, {
      method: 'POST',
    });
    if (early.status !== 400 || !/day of the exchange/.test(early.body.message))
      throw new Error(`before the day gave ${early.status}`);

    // The exchange is today.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
      new Date(),
    );
    const moved = await call(manager, `/secret-santa/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: TITLE,
        exchangeOn: today,
        budgetDollars: 30,
        place: 'Break room',
        selfSignUp: true,
      }),
    });
    if (moved.status !== 200) throw new Error(`move ${moved.status}: ${moved.text}`);
    if (!moved.body.canLookUp) throw new Error('cannot look up on the day');

    const self = await call(manager, `/secret-santa/${id}/look-up/${people.manager.id}`, {
      method: 'POST',
    });
    if (self.status !== 400) throw new Error(`own gave ${self.status}`);

    await manager.goto(`${BASE}/secret-santa/${id}`, { waitUntil: 'networkidle' });
    const box = manager.getByTestId('secret-santa-look-up');
    await box
      .getByLabel('Whose draw')
      .selectOption({ label: people.admin.firstName + ' ' + people.admin.lastName });
    await box.getByRole('button', { name: 'Look it up' }).click();
    const answer = box.getByTestId('secret-santa-look-up-answer');
    await answer.waitFor({ timeout: 10000 });
    const said = await answer.innerText();
    if (!said.includes(people[drew.admin].firstName)) throw new Error(`answered ${said}`);
    await box.getByText(/looked up who Ada .* drew/).waitFor();
    await manager.screenshot({ path: `${OUT}/secret-santa-look-up.png`, fullPage: true });

    const bell = (await call(admin, '/notifications')).body.items;
    const told = bell.find((item) => /your draw was looked up/.test(item.title));
    if (!told) throw new Error('Ada was not told');
    if (told.body.includes(people[drew.admin].firstName)) throw new Error('the bell names who');

    const listed = (await call(manager, `/secret-santa/${id}`)).body;
    if (listed.lookups.length !== 1) throw new Error(`${listed.lookups.length} look-ups listed`);
    if (/drew"|recipient/.test(JSON.stringify(listed.lookups)))
      throw new Error('the list carries the answer');
    const notManager = (await call(admin, `/secret-santa/${id}`)).body;
    if (!notManager.canManage && notManager.lookups.length) throw new Error('staff see look-ups');
  },
);

await step('taking somebody out after the draw gives their Santa their person', async () => {
  // Somebody signed in here drew Frankie, unless it was Max: then it is
  // Max's new person that cannot be read, so the check is on the circle.
  const santaKey = Object.keys(drew).find((key) => drew[key] === 'staff');
  const theirs = drew.staff;
  await manager.goto(`${BASE}/secret-santa/${id}`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: /^Take Frankie .* out$/ }).click();
  await manager.getByRole('button', { name: 'Yes, take them out' }).click();
  await manager.getByText(/is out\./).waitFor({ timeout: 10000 });
  const left = {};
  for (const key of ['manager', 'admin']) {
    const now = (await call(pages[key], `/secret-santa/${id}`)).body;
    if (now.members.length !== 3) throw new Error('not three left');
    left[key] = keyOf((await call(pages[key], `/secret-santa/${id}/mine`)).body.id);
  }
  const frankie = (await call(staff, `/secret-santa/${id}`)).status;
  if (frankie !== 404) throw new Error(`Frankie can still open it: ${frankie}`);
  if (santaKey !== 'ma') {
    if (left[santaKey] !== theirs)
      throw new Error(`${santaKey} now has ${left[santaKey]}, wanted ${theirs}`);
    const bell = (await call(pages[santaKey], '/notifications')).body.items;
    if (!bell.some((item) => /you have a new person/.test(item.title)))
      throw new Error('their Santa was not told');
  }
  for (const key of ['manager', 'admin']) {
    if (santaKey !== key && left[key] !== drew[key]) throw new Error(`${key}'s person changed`);
    if (left[key] === 'staff') throw new Error(`${key} still has Frankie`);
  }
});

await step('it refuses to leave fewer than three', async () => {
  const out = await call(manager, `/secret-santa/${id}/people/${people.ma.id}`, {
    method: 'DELETE',
  });
  if (out.status !== 400) throw new Error(`gave ${out.status}`);
});

await step('the Secret Santa page fits a phone', async () => {
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.goto(`${BASE}/secret-santa/${id}`, { waitUntil: 'networkidle' });
  await admin.getByTestId('secret-santa-drew').waitFor();
  const wide = await admin.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (wide) throw new Error('scrolls sideways');
  await admin.screenshot({ path: `${OUT}/secret-santa-phone.png`, fullPage: true });
  await admin.setViewportSize({ width: 1280, height: 1000 });
});

await step('cancelling it tells the people in it', async () => {
  await manager.goto(`${BASE}/secret-santa/${id}`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: 'Cancel this Secret Santa' }).click();
  await manager.getByRole('button', { name: 'Yes, cancel it' }).click();
  await manager.waitForURL(/\/secret-santa$/, { timeout: 10000 });
  const gone = await call(admin, `/secret-santa/${id}`);
  if (gone.status !== 404) throw new Error(`still there: ${gone.status}`);
  const bell = (await call(admin, '/notifications')).body.items;
  if (!bell.some((item) => /is cancelled/.test(item.title))) throw new Error('not told');
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL SECRET SANTA CHECKS PASSED');
