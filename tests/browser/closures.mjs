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
 * Holidays and closures (September 2026, asked for by Dominguez): Christmas,
 * Christmas Eve from 1pm, one office shut. For both offices or one. A shift
 * inside one is warned about everywhere and never refused; pay is untouched.
 * "Copy these into next year" puts a year's closures a year on.
 *
 * Seeded people: Frankie is at North Bergen, Max at West New York.
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
const monday = (d) => {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};
const nextWeek = new Date(monday(new Date()).getTime() + 7 * 86_400_000);
const thursday = new Date(nextWeek);
thursday.setDate(thursday.getDate() + 3);
const friday = new Date(nextWeek);
friday.setDate(friday.getDate() + 4);
const year = friday.getFullYear();

async function bellTitles(page) {
  return page.evaluate(async () => {
    const list = await fetch('/api/notifications').then((r) => r.json());
    return list.items.map((item) => item.title);
  });
}
async function feedOf(page) {
  return page.evaluate(async () => {
    const { token } = await fetch('/api/calendar/link', { method: 'POST' }).then((r) => r.json());
    return fetch(`/api/calendar/${token}/domi.ics`, { cache: 'no-store' }).then((r) => r.text());
  });
}

const manager = await signIn('manager@domihealthcare.com');
const week = async (page) => {
  await page.goto(`${BASE}/schedule?week=${key(nextWeek)}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Week', exact: true }).click();
};

await step('a manager closes both offices for a whole day', async () => {
  await week(manager);
  await manager.getByRole('button', { name: '+ Add', exact: true }).click();
  await manager.getByRole('menuitem', { name: 'Event', exact: true }).click();
  const form = manager.getByRole('form', { name: 'New event' });
  await form.getByRole('button', { name: /The office is closed/ }).click();
  const closure = manager.getByRole('form', { name: 'New closure' });
  await closure.getByLabel('Which holiday or closure?').fill('Christmas Day');
  // A closure starts as all day.
  if (!(await closure.getByLabel('Closed all day').isChecked())) throw new Error('not all day by default');
  await closure.getByLabel('First day').fill(key(friday));
  await closure.getByLabel('Last day').fill(key(friday));
  if (await closure.getByLabel('Where (optional)').count()) throw new Error('a closure asks where');
  const options = await closure.getByLabel('Which offices are closed?').locator('option').allInnerTexts();
  if (options.join('|') !== 'Both offices|One office') throw new Error(`offered: ${options.join(', ')}`);
  await closure.getByRole('button', { name: 'Add closure' }).click();
  await manager.getByTestId('rota-events-row').getByTestId('closure-chip').getByText('Christmas Day').waitFor({ timeout: 10000 });
  const header = await manager.getByTestId(`day-cover-${key(friday)}`).innerText();
  if (!header.includes('Closed')) throw new Error(`the day heading reads "${header}"`);
});

await step('and North Bergen alone from 1pm the day before', async () => {
  await manager.getByTestId('closures-card').getByRole('button', { name: '+ Add closure' }).click();
  const closure = manager.getByRole('form', { name: 'New closure' });
  await closure.getByLabel('Which holiday or closure?').fill('Christmas Eve');
  await closure.getByLabel('Closed all day').uncheck();
  await closure.getByLabel('Closed from').fill(`${key(thursday)}T13:00`);
  await closure.getByLabel('Open again at').fill(`${key(friday)}T00:00`);
  await closure.getByLabel('Which offices are closed?').selectOption('LOCATION');
  await closure.getByLabel('Office', { exact: true }).selectOption({ label: 'North Bergen' });
  await closure.getByRole('button', { name: 'Add closure' }).click();
  const chip = manager.getByTestId('rota-events-row').getByTestId('closure-chip').filter({ hasText: 'Christmas Eve' });
  await chip.waitFor({ timeout: 10000 });
  const text = await chip.innerText();
  if (!text.includes('Closed from 1pm') || !text.includes('North Bergen')) throw new Error(`the chip reads "${text}"`);
  await manager.screenshot({ path: `${OUT}/closures-week.png`, fullPage: true });
});

await step('a closure cannot be for a job role', async () => {
  const answer = await manager.evaluate(async () => {
    const roles = await fetch('/api/job-roles').then((r) => r.json());
    const r = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'CLOSURE',
        title: 'Providers off',
        allDay: true,
        startDate: '2030-01-02',
        endDate: '2030-01-02',
        audience: 'JOB_ROLE',
        jobRoleId: roles[0].id,
      }),
    });
    return { status: r.status, body: await r.text() };
  });
  if (answer.status !== 400 || !answer.body.includes('not a job role')) throw new Error(JSON.stringify(answer));
});

let shiftId = null;
await step('scheduling somebody while the office is closed warns, asks, and then allows it', async () => {
  const row = manager.getByTestId('rota-row-Frankie Front-Desk');
  await row.getByRole('button', { name: /^Add a shift for Frankie Front-Desk on Friday/ }).click();
  const dialog = manager.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
  await dialog.getByTestId('closure-warning').getByText(/Both offices are closed — Christmas Day/).waitFor({ timeout: 10000 });
  await manager.screenshot({ path: `${OUT}/closures-warning.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'Add shift' }).click();
  const asked = manager.getByRole('alertdialog', { name: 'The office is closed then' });
  await asked.waitFor({ timeout: 10000 });
  const created = manager.waitForResponse((r) => /\/api\/shifts$/.test(r.url()) && r.request().method() === 'POST');
  await asked.getByRole('button', { name: 'Yes, add it anyway' }).click();
  const response = await created;
  if (response.status() !== 201) throw new Error(`answered ${response.status()}`);
  shiftId = (await response.json()).id;
  await row.getByRole('button', { name: /warning: Office closed: Christmas Day/ }).waitFor({ timeout: 10000 });
});

await step('the Schedule banner lists the shift inside the closure', async () => {
  await manager.reload({ waitUntil: 'networkidle' });
  const banner = manager.getByTestId('needs-attention');
  await banner.getByText('Shifts while an office is closed').waitFor({ timeout: 10000 });
  const text = await banner.innerText();
  if (!text.includes('Christmas Day') || !text.includes('Frankie Front-Desk at North Bergen')) {
    throw new Error(`the banner reads: ${text}`);
  }
});

const frankie = await signIn('frontdesk@domihealthcare.com');
const max = await signIn('ma@domihealthcare.com');

await step('North Bergen staff see both closures; West New York only the one that shuts them', async () => {
  await week(frankie);
  const nb = await frankie.getByTestId('rota-events-row').innerText();
  if (!nb.includes('Christmas Day') || !nb.includes('Christmas Eve')) throw new Error(`Frankie sees: ${nb}`);
  await week(max);
  const wny = await max.getByTestId('rota-events-row').innerText();
  if (!wny.includes('Christmas Day')) throw new Error(`Max sees: ${wny}`);
  if (wny.includes('Christmas Eve')) throw new Error('West New York sees North Bergen’s early close');
});

await step('they are told, in words that say the office is closed', async () => {
  const f = await bellTitles(frankie);
  if (!f.includes('Closed: Christmas Day') || !f.includes('North Bergen closed: Christmas Eve')) {
    throw new Error(`Frankie's bell: ${f.join(' | ')}`);
  }
  const m = await bellTitles(max);
  if (!m.includes('Closed: Christmas Day') || m.some((t) => t.includes('Christmas Eve'))) {
    throw new Error(`Max's bell: ${m.join(' | ')}`);
  }
});

await step('and it is on their phone', async () => {
  const feed = await feedOf(frankie);
  if (!feed.includes('SUMMARY:Closed: Christmas Day')) throw new Error('Christmas Day not in the feed');
  if (!feed.includes('SUMMARY:North Bergen closed: Christmas Eve')) throw new Error('the early close is not in the feed');
});

await step('the year’s list shows them, for staff too', async () => {
  const card = frankie.getByTestId('closures-card');
  await card.getByText('Christmas Day').waitFor({ timeout: 10000 });
  if (await card.getByRole('button', { name: '+ Add closure' }).count()) throw new Error('staff can add closures');
});

await step('the printed rota says the office is closed', async () => {
  await manager.goto(`${BASE}/schedule/print?week=${key(nextWeek)}`, { waitUntil: 'networkidle' });
  const page = manager.getByTestId('print-page-North Bergen');
  // The heading is set in capitals, so compare without case.
  const closed = (await page.getByTestId('print-closure').allInnerTexts()).map((t) => t.toLowerCase());
  if (!closed.some((t) => t.includes('closed all day') && t.includes('christmas day'))) {
    throw new Error(`North Bergen's page: ${closed.join(' | ')}`);
  }
  if (!closed.some((t) => t.includes('closed from 1pm'))) throw new Error('the early close is missing');
  const wny = await manager.getByTestId('print-page-West New York').getByTestId('print-closure').allInnerTexts();
  if (wny.some((t) => t.includes('Christmas Eve'))) throw new Error('West New York prints North Bergen’s early close');
});

await step('copying the year puts both a year on, and a second copy adds nothing', async () => {
  await week(manager);
  const card = manager.getByTestId('closures-card');
  // The card starts on the year on screen.
  await card.getByText(String(year), { exact: true }).waitFor({ timeout: 10000 });
  await card.getByRole('button', { name: `Copy these into ${year + 1}` }).click();
  await manager.getByRole('alertdialog').getByRole('button', { name: `Yes, copy into ${year + 1}` }).click();
  await card.getByRole('status').getByText(`2 closures copied into ${year + 1}.`).waitFor({ timeout: 10000 });
  const copied = await manager.evaluate(async (y) => {
    const events = await fetch(`/api/events?from=${new Date(y, 0, 1).toISOString()}&to=${new Date(y + 1, 0, 1).toISOString()}`).then((r) => r.json());
    return events.filter((e) => e.kind === 'CLOSURE');
  }, year + 1);
  const christmas = copied.find((c) => c.title === 'Christmas Day');
  const expected = `${year + 1}-${key(friday).slice(5)}`;
  if (!christmas || christmas.startDate !== expected) throw new Error(`Christmas Day copied to ${christmas?.startDate}, not ${expected}`);
  const eve = copied.find((c) => c.title === 'Christmas Eve');
  if (!eve || eve.audience !== 'LOCATION' || new Date(eve.startsAt).getHours() !== 13) {
    throw new Error(`Christmas Eve copied as ${JSON.stringify(eve)}`);
  }
  await manager.screenshot({ path: `${OUT}/closures-copied.png`, fullPage: true });

  await card.getByRole('button', { name: '←' }).or(card.getByRole('button', { name: 'Previous year' })).first().click();
  await card.getByRole('button', { name: `Copy these into ${year + 1}` }).click();
  await manager.getByRole('alertdialog').getByRole('button', { name: `Yes, copy into ${year + 1}` }).click();
  await card.getByRole('status').getByText(/0 closures copied .* already on/).waitFor({ timeout: 10000 });
});

await step('calling a closure off tells staff the office is open as usual', async () => {
  await week(manager);
  await manager.getByTestId('rota-events-row').getByText('Christmas Day').click();
  const dialog = manager.getByRole('dialog', { name: 'Christmas Day' });
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await manager.getByRole('button', { name: 'Yes, remove it' }).click();
  await manager.getByTestId('rota-events-row').getByText('Christmas Day').waitFor({ state: 'detached', timeout: 10000 });
  const f = await bellTitles(frankie);
  if (!f.includes('Open as usual: Christmas Day')) throw new Error(`Frankie's bell: ${f.join(' | ')}`);
  // And the shift is no longer flagged.
  await manager.getByTestId('rota-row-Frankie Front-Desk').getByRole('button', { name: /warning: Office closed/ }).waitFor({ state: 'detached', timeout: 10000 });
});

// Leave the rota as it was found.
if (shiftId) {
  await manager.evaluate((id) => fetch(`/api/shifts/${id}`, { method: 'DELETE' }), shiftId);
}

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CLOSURE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
