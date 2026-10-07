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
 * The practice calendar (October 2026, Dominguez: "a calendar that staff can
 * reference for multiple things — events, diagnostic schedule,
 * holidays/office closures"), under Schedule → Calendar.
 *
 * Diagnostics are at an office and for everyone; a holiday names a day and
 * shuts nothing; pay days are worked out from the pay period (the Friday after
 * it ends) and never entered. Managers add; everybody reads; it all reaches
 * phones through the calendar feed.
 *
 * Rep lunches (October 2026) pick their rep from Manage → Reps: staff see the
 * rep, company, medication and food; the phone, status and notes stay with
 * managers — but the front desk sees the cell (a job role setting). A rep
 * lunch is told to the staff of its office only. A rep marked "Don't book"
 * is warned about, never refused.
 *
 * Seeded people: Frankie is Front Desk and MA at North Bergen, Max an MA at
 * West New York.
 *
 * Built in March 2027 — far enough ahead to be the future, near enough to be
 * inside the feed's year.
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
    await unlocked.first().waitFor({ timeout: 15000 });
  }
  return page;
}

const MONTH = '2027-03-01';
const calendar = async (page) => {
  await page.goto(`${BASE}/schedule/calendar?month=${MONTH}`, { waitUntil: 'networkidle' });
  await page.getByTestId('calendar-month').getByText('March 2027').waitFor({ timeout: 10000 });
};
const day = (page, date) => page.getByTestId(`calendar-day-${date}`);

// Periods start on Sundays from 18 October 2026, so March 2027 is paid on
// Fridays the 12th and the 26th.
const admin = await signIn('admin@domihealthcare.com');
await step('an admin sets the pay period', async () => {
  const status = await admin.evaluate(async () => {
    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payPeriodStart: '2026-10-18' }),
    });
    return response.status;
  });
  if (status !== 200) throw new Error(`settings answered ${status}`);
});

const manager = await signIn('manager@domihealthcare.com');

await step('Calendar is a tab of Schedule', async () => {
  await manager.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await manager.getByRole('navigation', { name: 'Schedule or calendar' }).getByRole('link', { name: 'Calendar' }).click();
  await manager.getByRole('heading', { name: 'Calendar', level: 1 }).waitFor({ timeout: 10000 });
  // Schedule stays the tab that is lit.
  const lit = await manager.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Schedule/ }).getAttribute('aria-current');
  if (lit !== 'page') throw new Error('Schedule is not marked as the page you are on');
});

await step('a manager adds a diagnostics date at an office', async () => {
  await calendar(manager);
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Diagnostics date' }).click();
  const form = manager.getByRole('form', { name: 'New diagnostics date' });
  await form.getByLabel('Which tests?').fill('US + ECHO');
  // For everyone, at an office: no "who", no place, no call.
  if (await form.getByLabel('Who is it for?').count()) throw new Error('diagnostics ask who they are for');
  if (await form.getByLabel('Where (optional)').count()) throw new Error('diagnostics ask where');
  await form.getByLabel('Which office?').selectOption({ label: 'West New York' });
  await form.getByLabel('Starts').fill('2027-03-07T08:00');
  await form.getByLabel('Ends').fill('2027-03-07T14:00');
  await form.getByRole('button', { name: 'Add diagnostics date' }).click();
  const chip = day(manager, '2027-03-07').getByTestId('diagnostic-chip');
  await chip.waitFor({ timeout: 10000 });
  const text = await chip.innerText();
  if (!text.includes('US + ECHO') || !text.includes('8am') || !text.includes('WNY')) {
    throw new Error(`the chip reads "${text}"`);
  }
});

await step('"Add another date like this" copies it to a new day and office', async () => {
  await day(manager, '2027-03-07').getByTestId('diagnostic-chip').click();
  const dialog = manager.getByRole('dialog', { name: 'US + ECHO' });
  await dialog.getByText('West New York').waitFor();
  await dialog.getByRole('button', { name: 'Add another date like this' }).click();
  const form = manager.getByRole('form', { name: 'New diagnostics date' });
  if ((await form.getByLabel('Which tests?').inputValue()) !== 'US + ECHO') throw new Error('the tests were not copied');
  const starts = await form.getByLabel('Starts').inputValue();
  if (!starts.endsWith('T08:00')) throw new Error(`the time was not copied: ${starts}`);
  await form.getByLabel('Starts').fill('2027-03-14T08:00');
  await form.getByLabel('Ends').fill('2027-03-14T14:00');
  await form.getByLabel('Which office?').selectOption({ label: 'North Bergen' });
  await form.getByRole('button', { name: 'Add diagnostics date' }).click();
  await day(manager, '2027-03-14').getByTestId('diagnostic-chip').getByText('NB').waitFor({ timeout: 10000 });
  // The first is untouched.
  await day(manager, '2027-03-07').getByTestId('diagnostic-chip').getByText('WNY').waitFor();
});

await step('a holiday is a whole day, for everyone, and shuts nothing', async () => {
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Holiday' }).click();
  const form = manager.getByRole('form', { name: 'New holiday' });
  await form.getByLabel('Which holiday?').fill('St Patrick’s Day');
  if (await form.getByLabel('All day').count()) throw new Error('a holiday offers a time of day');
  if (await form.getByLabel('Which offices are closed?').count()) throw new Error('a holiday asks which office is closed');
  await form.getByLabel('First day').fill('2027-03-17');
  await form.getByLabel('Last day').fill('2027-03-17');
  await form.getByRole('button', { name: 'Add holiday' }).click();
  await day(manager, '2027-03-17').getByTestId('holiday-chip').getByText('St Patrick’s Day').waitFor({ timeout: 10000 });
  // Listed with the closures, as open.
  await manager.getByTestId('closures-card').getByText('Open as usual').waitFor();
});

await step('pay days are the Friday after each period, worked out', async () => {
  await day(manager, '2027-03-12').getByTestId('payday-chip').waitFor({ timeout: 10000 });
  await day(manager, '2027-03-26').getByTestId('payday-chip').waitFor();
  if (await day(manager, '2027-03-19').getByTestId('payday-chip').count()) throw new Error('a pay day on the 19th');
  await manager.screenshot({ path: `${OUT}/practice-calendar-month.png`, fullPage: true });
});

await step('a manager keeps the rep list', async () => {
  await manager.goto(`${BASE}/reps`, { waitUntil: 'networkidle' });
  await manager.getByRole('heading', { name: 'Reps', level: 1 }).waitFor({ timeout: 10000 });
  for (const rep of [
    { name: 'Jane Smith', cell: '(201) 555-0142', company: 'Novo Nordisk', medication: 'Ozempic', lunch: 'Office orders (self-order)', status: 'Don’t book', notes: 'Late twice' },
    { name: 'Pat Lee', cell: '', company: 'Pfizer', medication: 'Eliquis', lunch: 'Brings catering', status: 'Preferred', notes: '' },
  ]) {
    await manager.getByRole('button', { name: '+ Add rep' }).click();
    const form = manager.getByRole('form', { name: 'New rep' });
    await form.getByLabel('Name').fill(rep.name);
    await form.getByLabel('Cell phone').fill(rep.cell);
    await form.getByLabel('Company').fill(rep.company);
    await form.getByLabel('Medication').fill(rep.medication);
    await form.getByLabel('Lunch').selectOption({ label: rep.lunch });
    await form.getByLabel('Status').selectOption({ label: rep.status });
    await form.getByLabel('Notes').fill(rep.notes);
    await form.getByRole('button', { name: 'Add rep' }).click();
    await manager.getByTestId(`rep-${rep.name}`).waitFor({ timeout: 10000 });
  }
  const jane = await manager.getByTestId('rep-Jane Smith').innerText();
  for (const expected of ['Novo Nordisk', 'Ozempic', 'Don’t book', 'Late twice', '(201) 555-0142']) {
    if (!jane.includes(expected)) throw new Error(`Jane's card has no "${expected}": ${jane}`);
  }
});

await step('a rep lunch picks its rep, warns about a "Don’t book", and is named after them', async () => {
  await calendar(manager);
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Rep lunch' }).click();
  const form = manager.getByRole('form', { name: 'New rep lunch' });
  if (await form.getByLabel('What is it?').count()) throw new Error('a rep lunch asks for a title');
  await form.getByLabel('Which rep?').selectOption({ label: 'Jane Smith — Novo Nordisk (don’t book)' });
  await form.getByTestId('chosen-rep').getByText('Late twice').waitFor();
  await form.getByLabel('Which office?').selectOption({ label: 'North Bergen' });
  await form.getByLabel('Starts').fill('2027-03-09T12:30');
  await form.getByLabel('Ends').fill('2027-03-09T13:30');
  await form.getByRole('button', { name: 'Add rep lunch' }).click();
  const asked = manager.getByRole('alertdialog', { name: /Jane Smith is marked/ });
  await asked.waitFor({ timeout: 10000 });
  await asked.getByRole('button', { name: 'Book them anyway' }).click();
  const chip = day(manager, '2027-03-09').getByTestId('rep_lunch-chip');
  await chip.waitFor({ timeout: 10000 });
  const text = await chip.innerText();
  if (!text.includes('Jane Smith') || !text.includes('NB') || !text.includes('Novo Nordisk')) {
    throw new Error(`the chip reads "${text}"`);
  }
  // A second, with the preferred rep, needs no warning.
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Rep lunch' }).click();
  const second = manager.getByRole('form', { name: 'New rep lunch' });
  await second.getByLabel('Which rep?').selectOption({ label: 'Pat Lee — Pfizer' });
  await second.getByLabel('Which office?').selectOption({ label: 'West New York' });
  await second.getByLabel('Starts').fill('2027-03-23T12:00');
  await second.getByLabel('Ends').fill('2027-03-23T13:00');
  await second.getByRole('button', { name: 'Add rep lunch' }).click();
  await day(manager, '2027-03-23').getByTestId('rep_lunch-chip').getByText('Pat Lee').waitFor({ timeout: 10000 });
  await manager.screenshot({ path: `${OUT}/practice-calendar-reps.png`, fullPage: true });
});

const frankie = await signIn('frontdesk@domihealthcare.com');

await step('staff see all of it, and cannot add', async () => {
  await calendar(frankie);
  await day(frankie, '2027-03-07').getByTestId('diagnostic-chip').waitFor({ timeout: 10000 });
  await day(frankie, '2027-03-17').getByTestId('holiday-chip').waitFor();
  await day(frankie, '2027-03-12').getByTestId('payday-chip').waitFor();
  if (await frankie.getByRole('button', { name: '+ Add', exact: true }).count()) throw new Error('staff can add');
  await day(frankie, '2027-03-07').getByTestId('diagnostic-chip').click();
  const dialog = frankie.getByRole('dialog', { name: 'US + ECHO' });
  await dialog.waitFor();
  if (await dialog.getByRole('button', { name: 'Edit' }).count()) throw new Error('staff can edit');
  await dialog.getByRole('button', { name: 'Close' }).click();
});

await step('the front desk sees a rep lunch’s rep, food and cell — not the status or notes', async () => {
  await day(frankie, '2027-03-09').getByTestId('rep_lunch-chip').click();
  const dialog = frankie.getByRole('dialog', { name: 'Rep lunch: Jane Smith' });
  await dialog.waitFor({ timeout: 10000 });
  const text = await dialog.innerText();
  for (const expected of ['Novo Nordisk', 'Ozempic', 'Office orders', 'North Bergen', '(201) 555-0142']) {
    if (!text.includes(expected)) throw new Error(`no "${expected}" in ${text}`);
  }
  for (const secret of ['Late twice', 'Don’t book']) {
    if (text.includes(secret)) throw new Error(`the front desk sees "${secret}"`);
  }
  await dialog.getByRole('button', { name: 'Close' }).click();
  const status = await frankie.evaluate(() => fetch('/api/reps').then((r) => r.status));
  if (status !== 403) throw new Error(`staff reading the rep list got ${status}`);
});

const max = await signIn('ma@domihealthcare.com');

await step('a Medical Assistant sees the lunch but not the cell', async () => {
  await calendar(max);
  await day(max, '2027-03-09').getByTestId('rep_lunch-chip').click();
  const dialog = max.getByRole('dialog', { name: 'Rep lunch: Jane Smith' });
  await dialog.waitFor({ timeout: 10000 });
  const text = await dialog.innerText();
  if (!text.includes('Ozempic')) throw new Error(`no medication in ${text}`);
  for (const secret of ['555-0142', 'Late twice', 'Don’t book']) {
    if (text.includes(secret)) throw new Error(`an MA sees "${secret}"`);
  }
  await dialog.getByRole('button', { name: 'Close' }).click();
});

await step('a rep lunch rings the bell at its own office only', async () => {
  const titles = async (page) =>
    page.evaluate(async () => (await fetch('/api/notifications').then((r) => r.json())).items.map((i) => i.title));
  const nb = await titles(frankie);
  const wny = await titles(max);
  if (!nb.includes('Rep lunch: Jane Smith (Novo Nordisk)')) throw new Error(`North Bergen's bell: ${nb.join(' | ')}`);
  if (nb.some((t) => t.includes('Pat Lee'))) throw new Error('North Bergen heard about West New York’s lunch');
  if (!wny.includes('Rep lunch: Pat Lee (Pfizer)')) throw new Error(`West New York's bell: ${wny.join(' | ')}`);
  if (wny.some((t) => t.includes('Jane Smith'))) throw new Error('West New York heard about North Bergen’s lunch');
});

await step('the cell is a job role setting, on for Front Desk alone', async () => {
  const roles = await manager.evaluate(() => fetch('/api/job-roles').then((r) => r.json()));
  const on = roles.filter((role) => role.seesRepCell).map((role) => role.name);
  if (on.join() !== 'Front Desk') throw new Error(`sees the cell: ${on.join(', ')}`);
});

await step('Show: All, one kind, several, and All again — and an office narrows', async () => {
  const show = frankie.getByRole('group', { name: 'Show on the calendar' });
  const pressed = async (name) => (await show.getByRole('button', { name }).getAttribute('aria-pressed')) === 'true';
  if (!(await pressed(/^All/))) throw new Error('does not start on All');
  // One kind: only rep lunches.
  await show.getByRole('button', { name: /Rep lunches/ }).click();
  await day(frankie, '2027-03-09').getByTestId('rep_lunch-chip').waitFor();
  if (await pressed(/^All/)) throw new Error('All still pressed with one kind picked');
  if (await day(frankie, '2027-03-07').getByTestId('diagnostic-chip').count()) throw new Error('diagnostics shown with only rep lunches picked');
  if (await day(frankie, '2027-03-12').getByTestId('payday-chip').count()) throw new Error('pay days shown with only rep lunches picked');
  // Several: and diagnostics.
  await show.getByRole('button', { name: /Diagnostics/ }).click();
  await day(frankie, '2027-03-07').getByTestId('diagnostic-chip').waitFor();
  await day(frankie, '2027-03-09').getByTestId('rep_lunch-chip').waitFor();
  if (await day(frankie, '2027-03-17').getByTestId('holiday-chip').count()) throw new Error('holidays shown when not picked');
  // Remembered on this browser.
  await frankie.reload({ waitUntil: 'networkidle' });
  if (await day(frankie, '2027-03-12').getByTestId('payday-chip').count()) throw new Error('the choice was not remembered');
  // All again.
  await show.getByRole('button', { name: /^All/ }).click();
  await day(frankie, '2027-03-12').getByTestId('payday-chip').waitFor();
  await day(frankie, '2027-03-17').getByTestId('holiday-chip').waitFor();

  await frankie.getByLabel('Show office').selectOption({ label: 'North Bergen' });
  if (await day(frankie, '2027-03-07').getByTestId('diagnostic-chip').count()) throw new Error('West New York’s diagnostics shown for North Bergen');
  await day(frankie, '2027-03-14').getByTestId('diagnostic-chip').waitFor();
  if (await day(frankie, '2027-03-23').getByTestId('rep_lunch-chip').count()) throw new Error('West New York’s rep lunch shown for North Bergen');
  // Practice-wide entries stay.
  await day(frankie, '2027-03-17').getByTestId('holiday-chip').waitFor();
  await frankie.getByLabel('Show office').selectOption({ label: 'Both offices' });
});

await step('the list shows the month day by day', async () => {
  await frankie.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  const list = frankie.getByTestId('calendar-list');
  await list.getByTestId('calendar-list-2027-03-07').getByText('US + ECHO').waitFor({ timeout: 10000 });
  await list.getByTestId('calendar-list-2027-03-26').getByTestId('payday-chip').waitFor();
  if (await list.getByTestId('calendar-list-2027-03-08').count()) throw new Error('an empty day is listed');
  await frankie.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Month' }).click();
});

await step('it all reaches the phone through the calendar feed', async () => {
  const feed = (
    await frankie.evaluate(async () => {
      const { token } = await fetch('/api/calendar/link', { method: 'POST' }).then((r) => r.json());
      return fetch(`/api/calendar/${token}/domi.ics`, { cache: 'no-store' }).then((r) => r.text());
    })
  ).replace(/\r\n /g, '');
  for (const expected of [
    'SUMMARY:US + ECHO — West New York',
    'SUMMARY:US + ECHO — North Bergen',
    'SUMMARY:St Patrick’s Day',
    'UID:payday-2027-03-12@staff.domihealthcare.com',
    'SUMMARY:Rep lunch: Jane Smith (Novo Nordisk) — North Bergen',
    'Medication: Ozempic',
  ]) {
    if (!feed.includes(expected)) throw new Error(`the feed has no "${expected}"`);
  }
  if (feed.includes('Late twice') || feed.includes('555-0142')) throw new Error('the feed carries the managers’ side of a rep');
});

await step('a holiday rings nobody’s bell; diagnostics do', async () => {
  const titles = await frankie.evaluate(async () => {
    const list = await fetch('/api/notifications').then((r) => r.json());
    return list.items.map((item) => item.title);
  });
  if (!titles.includes('Diagnostics: US + ECHO')) throw new Error(`bell: ${titles.join(' | ')}`);
  if (titles.some((t) => t.includes('Patrick'))) throw new Error('a holiday rang the bell');
});

await step('on a phone, staff start on the list', async () => {
  const phone = await signIn('frontdesk@domihealthcare.com', { width: 390, height: 844 });
  await phone.evaluate(() => window.localStorage.removeItem('domi-staff:calendar-view'));
  await calendar(phone);
  await phone.getByTestId('calendar-list').getByText('US + ECHO').first().waitFor({ timeout: 10000 });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (wide) throw new Error('the page scrolls sideways on a phone');
  await phone.screenshot({ path: `${OUT}/practice-calendar-phone.png`, fullPage: true });
});

await step('correcting a rep’s name renames their lunches', async () => {
  await manager.goto(`${BASE}/reps`, { waitUntil: 'networkidle' });
  await manager.getByTestId('rep-Pat Lee').getByRole('button', { name: 'Edit' }).click();
  const form = manager.getByRole('form', { name: 'Change Pat Lee' });
  await form.getByLabel('Name').fill('Patricia Lee');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await manager.getByTestId('rep-Patricia Lee').getByText('Next lunch').waitFor({ timeout: 10000 });
  await calendar(manager);
  await day(manager, '2027-03-23').getByTestId('rep_lunch-chip').getByText('Patricia Lee').waitFor({ timeout: 10000 });
});

await step('separate calendars: one address per kind, each carrying only its own', async () => {
  await calendar(frankie);
  // Syncing is already on from the feed step above.
  await frankie.getByRole('button', { name: 'Show link' }).click();
  await frankie.getByRole('group', { name: 'How many calendars' }).getByRole('button', { name: 'Separate calendars' }).click();
  const list = frankie.getByTestId('separate-calendars');
  const address = await list.getByLabel('Rep lunches', { exact: true }).inputValue();
  if (!/\/api\/calendar\/[A-Za-z0-9_-]+\/rep-lunches\.ics$/.test(address)) throw new Error(`rep lunches address: ${address}`);
  for (const label of ['My shifts & time off', 'Diagnostics', 'Holidays & closures', 'Pay days', 'Meetings & events']) {
    await list.getByLabel(label, { exact: true }).waitFor();
  }
  const feeds = await frankie.evaluate(async (url) => {
    const path = new URL(url).pathname;
    const get = (slug) => fetch(path.replace('rep-lunches.ics', `${slug}.ics`), { cache: 'no-store' }).then((r) => r.text());
    return { lunches: await get('rep-lunches'), diagnostics: await get('diagnostics'), pay: await get('pay-days'), nope: (await fetch(path.replace('rep-lunches.ics', 'salaries.ics'))).status };
  }, address);
  const unfold = (text) => text.replace(/\r\n /g, '');
  const summaries = (text) => [...unfold(text).matchAll(/^SUMMARY:(.*)$/gm)].map((m) => m[1].trim());
  if (!unfold(feeds.lunches).includes('X-WR-CALNAME:Rep lunches — Domi Staff')) throw new Error('the rep lunches calendar is not named');
  if (!summaries(feeds.lunches).every((s) => s.startsWith('Rep lunch:')) || summaries(feeds.lunches).length !== 2) throw new Error(`rep lunches feed: ${summaries(feeds.lunches).join(' | ')}`);
  if (!summaries(feeds.diagnostics).every((s) => s.startsWith('US + ECHO'))) throw new Error(`diagnostics feed: ${summaries(feeds.diagnostics).join(' | ')}`);
  if (!summaries(feeds.pay).length || !summaries(feeds.pay).every((s) => s === 'Pay day')) throw new Error('pay days feed');
  if (feeds.nope !== 404) throw new Error(`an unknown calendar answered ${feeds.nope}`);
});

await step('the printed month: the paper calendar, with what the calendar shows', async () => {
  await calendar(manager);
  await manager.getByRole('link', { name: 'Print', exact: true }).click();
  const month = manager.getByTestId('print-month');
  await month.waitFor({ timeout: 10000 });
  if (!(await month.getByRole('heading', { level: 1 }).textContent()).includes('March 2027')) throw new Error('not March 2027');
  const sunday = await manager.getByTestId('print-day-2027-03-07').innerText();
  if (!sunday.includes('WNY') || !sunday.includes('US + ECHO 8am–2pm')) throw new Error(`7 March reads ${sunday}`);
  const lunch = await manager.getByTestId('print-day-2027-03-09').innerText();
  if (!lunch.includes('Jane Smith') || lunch.includes('555-0142') || lunch.includes('Late twice')) throw new Error(`9 March reads ${lunch}`);
  if (!(await manager.getByTestId('print-day-2027-03-12').innerText()).includes('Pay day')) throw new Error('no pay day on the 12th');
  if (!(await manager.getByTestId('print-day-2027-03-17').innerText()).includes('St Patrick’s Day')) throw new Error('no holiday');
  await manager.screenshot({ path: `${OUT}/practice-calendar-print.png`, fullPage: true });
  // Only rep lunches, as picked on the calendar.
  await manager.goto(`${BASE}/schedule/calendar/print?month=2027-03-01&kinds=REP_LUNCH`, { waitUntil: 'networkidle' });
  await manager.getByTestId('print-month').waitFor({ timeout: 10000 });
  if ((await manager.getByTestId('print-day-2027-03-07').innerText()).includes('US + ECHO')) throw new Error('diagnostics printed with only rep lunches picked');
  if (!(await manager.getByTestId('print-day-2027-03-09').innerText()).includes('Jane Smith')) throw new Error('the rep lunch was not printed');
});

await step('a shift says whether there is a rep lunch: 🍽️ or 🥪', async () => {
  const made = await manager.evaluate(async () => {
    const people = await fetch('/api/employees').then((r) => r.json());
    const offices = await fetch('/api/locations').then((r) => r.json());
    const frankie = people.find((p) => p.email === 'frontdesk@domihealthcare.com');
    const nb = offices.find((o) => o.name === 'North Bergen');
    const statuses = [];
    for (const day of ['2027-03-09', '2027-03-10']) {
      const response = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: frankie.id,
          locationId: nb.id,
          startsAt: `${day}T14:00:00.000Z`,
          endsAt: `${day}T22:00:00.000Z`,
          status: 'PUBLISHED',
        }),
      });
      statuses.push(response.status);
    }
    return statuses;
  });
  if (made.some((status) => status !== 201)) throw new Error(`making the shifts answered ${made.join(', ')}`);
  await frankie.goto(`${BASE}/schedule?week=2027-03-07`, { waitUntil: 'networkidle' });
  const week = frankie.getByRole('button', { name: 'Week', exact: true });
  if (await week.count()) await week.click();
  const icons = frankie.getByTestId('lunch-icon');
  await icons.first().waitFor({ timeout: 10000 });
  const kinds = await icons.evaluateAll((all) => all.map((el) => `${el.dataset.lunch}:${el.title}`));
  if (!kinds.some((k) => k.startsWith('rep:Rep lunch at 12:30pm with Jane Smith (Novo Nordisk)'))) throw new Error(`icons: ${kinds.join(' | ')}`);
  if (!kinds.some((k) => k.startsWith('none:No rep lunch'))) throw new Error(`icons: ${kinds.join(' | ')}`);
  await frankie.getByTestId('rota-legend').getByText('a rep is bringing lunch to that office').waitFor();
  await frankie.screenshot({ path: `${OUT}/practice-calendar-lunch-icons.png`, fullPage: true });
});

await step('My shifts: your own schedule for the month on the calendar, alone or with the rest', async () => {
  // A day off on the 11th, asked for by Frankie and approved.
  const requestId = await frankie.evaluate(async () => {
    const r = await fetch('/api/pto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'VACATION', startDate: '2027-03-11', endDate: '2027-03-11' }),
    });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).id;
  });
  await manager.evaluate(async (id) => {
    const r = await fetch(`/api/pto/${id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'APPROVED' }),
    });
    if (!r.ok) throw new Error(await r.text());
  }, requestId);

  await calendar(frankie);
  const show = frankie.getByRole('group', { name: 'Show on the calendar' });
  // From All, My shifts alone.
  await show.getByRole('button', { name: /^All/ }).click();
  await show.getByRole('button', { name: /My shifts/ }).click();
  const ninth = day(frankie, '2027-03-09').getByTestId('my-shift');
  await ninth.waitFor({ timeout: 10000 });
  const label = await ninth.getAttribute('aria-label');
  if (!/Your shift, \d+(:\d+)?(am|pm)–\d+(:\d+)?(am|pm) · NB/.test(label ?? '')) throw new Error(`the shift reads ${label}`);
  if ((await ninth.getByTestId('lunch-icon').getAttribute('data-lunch')) !== 'rep') throw new Error('no rep lunch icon on the 9th');
  await day(frankie, '2027-03-10').getByTestId('my-shift').waitFor();
  const off = await day(frankie, '2027-03-11').getByTestId('my-time-off').innerText();
  if (!off.includes('Off · PTO')) throw new Error(`the day off reads ${off}`);
  if (await day(frankie, '2027-03-09').getByTestId('rep_lunch-chip').count()) throw new Error('rep lunches shown with only My shifts picked');
  if (await day(frankie, '2027-03-12').getByTestId('payday-chip').count()) throw new Error('pay days shown with only My shifts picked');
  // With pay days too.
  await show.getByRole('button', { name: /Pay days/ }).click();
  await day(frankie, '2027-03-12').getByTestId('payday-chip').waitFor();
  await day(frankie, '2027-03-09').getByTestId('my-shift').waitFor();
  // The list too.
  await frankie.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  await frankie.getByTestId('calendar-list-2027-03-10').getByTestId('my-shift').waitFor({ timeout: 10000 });
  await frankie.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Month' }).click();
  await frankie.screenshot({ path: `${OUT}/practice-calendar-my-shifts.png`, fullPage: true });
  // Tapping a shift opens its week on the Schedule.
  await day(frankie, '2027-03-09').getByTestId('my-shift').click();
  await frankie.waitForURL(/\/schedule\?week=2027-03-09/, { timeout: 10000 });
  // Printed only when picked: All is the practice's, for the wall.
  await frankie.goto(`${BASE}/schedule/calendar/print?month=2027-03-01`, { waitUntil: 'networkidle' });
  await frankie.getByTestId('print-month').waitFor({ timeout: 10000 });
  if ((await frankie.getByTestId('print-day-2027-03-09').innerText()).includes('🕘')) throw new Error('your shifts printed under All');
  await frankie.goto(`${BASE}/schedule/calendar/print?month=2027-03-01&kinds=MY_SHIFT`, { waitUntil: 'networkidle' });
  await frankie.getByTestId('print-day-2027-03-09').getByText('· NB').waitFor({ timeout: 10000 });
  // Back to All for whatever comes next.
  await calendar(frankie);
  await frankie.getByRole('group', { name: 'Show on the calendar' }).getByRole('button', { name: /^All/ }).click();
});

await step('Home says whether there is a rep lunch today', async () => {
  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const line = frankie.getByTestId('todays-lunch');
  await line.waitFor({ timeout: 10000 });
  if (!(await line.innerText()).includes('bring your own lunch')) throw new Error(`Home reads ${await line.innerText()}`);
});

await step('nothing on the page takes a file', async () => {
  await calendar(manager);
  if (await manager.locator('input[type=file]').count()) throw new Error('a file input on the calendar');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL PRACTICE CALENDAR CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
