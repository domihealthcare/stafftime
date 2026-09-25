import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pickFromAccountMenu } from './account-menu.mjs';

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
 * Birthdays, asked for by Dominguez (September 2026) so colleagues can wish
 * each other a happy birthday: month and day only, set by an admin, shown on
 * the home screen that week, on the Schedule and in the Directory.
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date();
const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const admin = await signIn('admin@domihealthcare.com');

await step('an admin sets a birthday on the Staff screen — a month and a day, no year', async () => {
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId('staff-frontdesk@domihealthcare.com');
  await card.getByRole('button', { name: 'Role, locations, birthday and ADP' }).click();
  await card.getByLabel('Birthday month').selectOption(String(today.getMonth() + 1));
  await card.getByLabel('Birthday day').fill(String(today.getDate()));
  await card.getByRole('button', { name: /^Save/ }).click();
  await card.getByRole('button', { name: 'Role, locations, birthday and ADP' }).waitFor({ timeout: 10000 });

  // Morgan's is in two days, set straight through the API.
  const saved = await admin.evaluate(async ([month, day]) => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const morgan = staff.find((p) => p.email === 'manager@domihealthcare.com');
    const r = await fetch(`/api/employees/${morgan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ birthdayMonth: month, birthdayDay: day }),
    });
    if (!r.ok) throw new Error(await r.text());
    return fetch('/api/employees').then((res) => res.json());
  }, [inTwoDays.getMonth() + 1, inTwoDays.getDate()]);
  const frankie = saved.find((p) => p.email === 'frontdesk@domihealthcare.com');
  if (frankie.birthdayMonth !== today.getMonth() + 1 || frankie.birthdayDay !== today.getDate()) {
    throw new Error(`saved as ${frankie.birthdayMonth}/${frankie.birthdayDay}`);
  }
  const fields = Object.keys(frankie).filter((field) => /birth/i.test(field)).sort();
  if (fields.join() !== 'birthdayDay,birthdayMonth') throw new Error(`birthday fields: ${fields}`);
});

await step('a day the month does not have is refused', async () => {
  const status = await admin.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const r = await fetch(`/api/employees/${staff[0].id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ birthdayMonth: 4, birthdayDay: 31 }),
    });
    return r.status;
  });
  if (status !== 400) throw new Error(`answered ${status}`);
});

const colleague = await signIn('manager@domihealthcare.com', { width: 390, height: 844 });

await step('colleagues see this week’s birthdays on the home screen', async () => {
  const card = colleague.getByTestId('birthdays-this-week');
  await card.waitFor({ timeout: 10000 });
  const text = await card.innerText();
  if (!text.includes('Frankie') || !text.includes('Today') || !text.includes('Happy birthday!')) {
    throw new Error(`the card reads: ${text}`);
  }
  if (!text.includes('Morgan')) throw new Error(`the birthday in two days is missing: ${text}`);
  await colleague.screenshot({ path: `${OUT}/birthdays-home.png`, fullPage: true });
});

await step('the Directory shows it, as a month and a day', async () => {
  await colleague.goto(`${BASE}/directory`, { waitUntil: 'networkidle' });
  const line = colleague.getByTestId('directory-birthday').filter({ hasText: `${MONTHS[today.getMonth()].slice(0, 3)} ${today.getDate()}` });
  await line.first().waitFor({ timeout: 10000 });
});

await step('the Schedule has a cake on the day, for everybody, and on the person’s own row', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  await frankie.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await frankie.getByRole('button', { name: 'Week' }).click().catch(() => undefined);
  const header = frankie.getByTestId(`birthday-${key(today)}`);
  await header.first().waitFor({ timeout: 10000 });
  if (!(await header.first().innerText()).includes('Frankie')) throw new Error('no name under the day');
  // Their own row carries it only on their own birthday — and Frankie's is today.
  const sameWeek = key(inTwoDays) <= key(new Date(today.getTime() + ((7 - ((today.getDay() + 6) % 7)) - 1) * 86_400_000));
  await frankie.getByTestId('birthday-chip').first().waitFor({ timeout: 5000 });
  if (sameWeek) await frankie.getByTestId(`birthday-${key(inTwoDays)}`).first().waitFor({ timeout: 5000 });

  await frankie.getByRole('button', { name: 'Month' }).click();
  const month = frankie.getByTestId(`month-birthday-${key(today)}`);
  await month.waitFor({ timeout: 10000 });
  await frankie.screenshot({ path: `${OUT}/birthdays-month.png`, fullPage: true });
  await frankie.getByRole('button', { name: 'Week' }).click();
  await frankie.context().close();
});

await step('your profile shows your birthday, set by the practice', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  await pickFromAccountMenu(frankie, 'Your profile');
  const shown = await frankie.getByTestId('profile-birthday').innerText();
  if (!shown.includes(`${MONTHS[today.getMonth()].slice(0, 3)} ${today.getDate()}`)) {
    throw new Error(`profile shows: ${shown}`);
  }
  await frankie.context().close();
});

await step('a pasted staff list brings birthdays in, keeping only the month and day', async () => {
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: 'Add several people' }).click();
  const panel = admin.getByTestId('import-staff');
  await panel.getByLabel('Staff list').fill(
    [
      ['First name', 'Last name', 'Email', 'Birthday', 'Office', 'Employment Start Date'].join('\t'),
      ['Bea', 'Day', 'imp-bea@example.com', '11/09/1997', 'Both', '7/2026'].join('\t'),
      // No hire date: optional since September 2026.
      ['Cal', 'Day', 'imp-cal@example.com', '', 'Both', ''].join('\t'),
    ].join('\n'),
  );
  const columns = await panel.getByTestId('import-columns').innerText();
  if (!columns.includes('the year is dropped')) throw new Error(`columns: ${columns}`);
  if (!(await panel.getByTestId('import-row-2').innerText()).includes('Nov 9')) {
    throw new Error(`the preview does not show the birthday: ${await panel.getByTestId('import-row-2').innerText()}`);
  }
  const request = admin.waitForRequest((r) => r.url().endsWith('/api/employees/import'));
  await panel.getByRole('button', { name: 'Add 2 people' }).click();
  const sent = (await request).postData();
  if (sent.includes('1997')) throw new Error('the year of birth was sent to the server');
  await admin.getByText('2 people added.').waitFor({ timeout: 15000 });
  const [bea, cal] = await admin.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    return ['imp-bea@example.com', 'imp-cal@example.com'].map((email) => staff.find((p) => p.email === email));
  });
  if (bea.birthdayMonth !== 11 || bea.birthdayDay !== 9) {
    throw new Error(`Bea: ${bea.birthdayMonth}/${bea.birthdayDay}`);
  }
  if (bea.hireDate?.slice(0, 10) !== '2026-07-01') throw new Error(`"7/2026" became ${bea.hireDate}`);
  if (cal.hireDate !== null) throw new Error(`a blank hire date became ${cal.hireDate}`);
});

await step('clearing a birthday takes it off everywhere', async () => {
  const card = admin.getByTestId('staff-manager@domihealthcare.com');
  await card.getByRole('button', { name: 'Role, locations, birthday and ADP' }).click();
  await card.getByLabel('Birthday month').selectOption('');
  await card.getByRole('button', { name: /^Save/ }).click();
  await card.getByRole('button', { name: 'Role, locations, birthday and ADP' }).waitFor({ timeout: 10000 });
  const found = await admin.evaluate(async ([from, to]) =>
    fetch(`/api/directory/birthdays?from=${from}&to=${to}`).then((r) => r.json()),
  [key(today), key(inTwoDays)]);
  if (found.some((entry) => entry.firstName === 'Morgan')) throw new Error('still listed');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL BIRTHDAY CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
