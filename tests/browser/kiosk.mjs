import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo, openMenu } from './nav.mjs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Defaults to the dev server; point at `vite preview` to test the built bundle
// with the deployed security headers applied.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  // Fall back to whatever Playwright downloaded when CHROMIUM_PATH is unset.
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

// --- admin: create a kiosk and read the pairing code off the screen ---
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const admin = await adminCtx.newPage();
admin.on('pageerror', (e) => errors.push(`admin pageerror: ${e.message}`));
await admin.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await admin.getByLabel('Email').fill('admin@domihealthcare.com');
await admin.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await admin.getByRole('button', { name: 'Sign in' }).click();
await admin.getByText('Not clocked in').waitFor({ timeout: 15000 });

let pairingCode;
await step('admin sees a Kiosks tab and can add a device', async () => {
  await openMenu(admin, 'Manage');
  await admin.getByRole('link', { name: 'Kiosks' }).click();
  await admin.getByRole('button', { name: '+ Add kiosk' }).waitFor({ timeout: 10000 });
  await admin.getByRole('button', { name: '+ Add kiosk' }).click();
  await admin.getByLabel('Name').fill('Front desk tablet');
  await admin.getByLabel('Location').selectOption({ label: 'North Bergen' });
  await admin.getByRole('button', { name: 'Add kiosk' }).click();
  const code = admin.locator('.font-mono.text-3xl');
  await code.waitFor({ timeout: 10000 });
  pairingCode = (await code.innerText()).trim();
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(pairingCode))
    throw new Error(`unexpected code format: ${pairingCode}`);
});
await admin.screenshot({ path: `${OUT}/16-admin-kiosks.png`, fullPage: true });

// --- the tablet ---
const tabletCtx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const tablet = await tabletCtx.newPage();
tablet.on('pageerror', (e) => errors.push(`tablet pageerror: ${e.message}`));

await step('an unpaired tablet shows the setup screen, not the keypad', async () => {
  await tablet.goto(`${BASE}/kiosk`, { waitUntil: 'networkidle' });
  await tablet.getByText('Set up this kiosk').waitFor({ timeout: 10000 });
});
await tablet.screenshot({ path: `${OUT}/17-kiosk-pairing.png`, fullPage: true });

await step('a wrong pairing code is refused', async () => {
  await tablet.getByLabel('Pairing code').fill('AAAA-BBBB-CC');
  await tablet.getByRole('button', { name: 'Set up kiosk' }).click();
  await tablet.getByRole('alert').waitFor({ timeout: 10000 });
});

const clockButton = () => tablet.getByRole('button', { name: 'Clock in or out' });
const staffList = () => tablet.getByRole('list', { name: 'Staff' });
/// The names are behind "Clock in or out" (Dominguez, October 2026), not on
/// the main screen: open the list, if it is not open already.
const openList = async () => {
  if (!(await staffList().isVisible())) await clockButton().click();
  await staffList().waitFor({ timeout: 5000 });
};
const pick = async (name) => {
  await openList();
  await staffList().getByRole('button', { name }).click();
};

await step('the real code pairs the tablet to its location', async () => {
  await tablet.getByLabel('Pairing code').fill(pairingCode);
  await tablet.getByRole('button', { name: 'Set up kiosk' }).click();
  await clockButton().waitFor({ timeout: 15000 });
  await tablet.getByText('North Bergen').first().waitFor({ timeout: 5000 });
});

await step('the main screen shows no names, only the button', async () => {
  if (await tablet.getByText('Frankie').count()) throw new Error('a name is on the main screen');
  if (await staffList().count()) throw new Error('the staff list is open before anybody asked');
});

await step('the list behind the button shows only staff at its own location', async () => {
  await openList();
  const joined = (await staffList().getByRole('button').allInnerTexts()).join(' ');
  if (!joined.includes('Frankie')) throw new Error(`expected Frankie at North Bergen: ${joined}`);
  if (joined.includes('Max')) throw new Error(`Max is West New York only, but appeared: ${joined}`);
});
await tablet.screenshot({ path: `${OUT}/18-kiosk-staff.png`, fullPage: true });

await step('typing the first letters narrows the list, and Back returns to the main screen', async () => {
  await tablet.getByLabel('Search for your name').fill('fra');
  const shown = await staffList().getByRole('button').allInnerTexts();
  if (shown.length !== 1 || !shown[0].includes('Frankie'))
    throw new Error(`"fra" left ${JSON.stringify(shown)}`);
  await tablet.getByLabel('Search for your name').fill('zzz');
  await staffList().getByText(/Nobody here by that name/).waitFor({ timeout: 5000 });
  await tablet.getByRole('button', { name: 'Back' }).click();
  await clockButton().waitFor({ timeout: 5000 });
  await clockButton().click();
  if ((await tablet.getByLabel('Search for your name').inputValue()) !== '')
    throw new Error('the search was still filled in for the next person');
  await tablet.getByRole('button', { name: 'Back' }).click();
});

// --- News posts chosen for the time clock (Dominguez, October 2026) ---
await step('a News post ticked for the time clock is on its main screen; others are not', async () => {
  const post = async (title, showOnTimeClock) =>
    admin.request.post(`${BASE}/api/announcements`, {
      data: { title, body: `${title}, in full.`, showOnTimeClock },
    });
  await post('Staff only: rota reminder', false);
  await post('Flu shots are here', true);
  await tablet.reload({ waitUntil: 'networkidle' });
  const posts = tablet.getByTestId('kiosk-post');
  await posts.first().waitFor({ timeout: 10000 });
  const text = (await posts.allInnerTexts()).join(' ');
  if (!text.includes('Flu shots are here') || !text.includes('Flu shots are here, in full.'))
    throw new Error(`the ticked post is missing: ${text}`);
  if (text.includes('rota reminder')) throw new Error('a post not ticked for the time clock showed');
  for (const name of [/like/i, /comment/i]) {
    if (await tablet.getByRole('button', { name }).count())
      throw new Error(`the time clock offers ${name}`);
  }
});
await tablet.screenshot({ path: `${OUT}/18a-kiosk-main.png`, fullPage: true });

// One tick covers the time clock and the sign-in page (Dominguez: "they are
// both public").
await step('the same post is under the sign-in form, for anybody, and nothing else of News is', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const visitor = await ctx.newPage();
  await visitor.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const posts = visitor.getByTestId('public-post');
  await posts.first().waitFor({ timeout: 10000 });
  const text = (await posts.allInnerTexts()).join(' ');
  if (!text.includes('Flu shots are here')) throw new Error(`the public post is missing: ${text}`);
  if (text.includes('rota reminder')) throw new Error('a post not ticked showed on the sign-in page');
  // News at the top, the sign-in form under it (Dominguez, October 2026).
  const postTop = (await posts.first().boundingBox()).y;
  const formTop = (await visitor.getByLabel('Email').boundingBox()).y;
  if (postTop > formTop) throw new Error('the news is under the sign-in form, not above it');
  // The rest of News still needs a session.
  const list = await visitor.request.get(`${BASE}/api/announcements`);
  if (list.status() !== 401) throw new Error(`News answered ${list.status()} with nobody signed in`);
  const open = await (await visitor.request.get(`${BASE}/api/announcements/public`)).json();
  for (const key of ['author', 'likes', 'comments', 'poll']) {
    if (open.some((post) => key in post)) throw new Error(`the public posts carry ${key}`);
  }
  await visitor.screenshot({ path: `${OUT}/18b-login-public-post.png`, fullPage: true });
  await ctx.close();
});

await step('the News editor has the one tick box, and marks posts that are public', async () => {
  await admin.goto(`${BASE}/news`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId(/^post-[0-9a-f-]{36}$/).filter({ hasText: 'Flu shots are here' });
  await card.getByText('Public', { exact: true }).waitFor({ timeout: 10000 });
  await card.getByRole('button', { name: 'Edit' }).click();
  const box = admin.getByLabel(/Show publicly/);
  if (!(await box.isChecked())) throw new Error('the tick box does not show the post is on');
  await box.uncheck();
  const saved = admin.waitForResponse((r) => r.url().includes('/api/announcements/') && r.request().method() === 'PATCH');
  await admin.getByRole('button', { name: 'Save changes' }).click();
  const body = (await saved).request().postDataJSON();
  if (body.showOnTimeClock !== false) throw new Error(`sent ${JSON.stringify(body)}`);
  await tablet.reload({ waitUntil: 'networkidle' });
  await clockButton().waitFor({ timeout: 10000 });
  if (await tablet.getByTestId('kiosk-post').count()) throw new Error('the unticked post stayed on the time clock');
  const open = await (await tablet.request.get(`${BASE}/api/announcements/public`)).json();
  if (open.length) throw new Error('the unticked post stayed public for the sign-in page');
});
// Back to Kiosks, where the steps below expect the admin to be.
await admin.goto(`${BASE}/kiosks`, { waitUntil: 'networkidle' });

await step('the device cookie is not readable by page scripts', async () => {
  const visible = await tablet.evaluate(() => document.cookie);
  if (visible.includes('stafftime_kiosk')) throw new Error(`device token readable from JS: ${visible}`);
  const cookie = (await tabletCtx.cookies()).find((c) => c.name === 'stafftime_kiosk');
  if (!cookie?.httpOnly) throw new Error('kiosk cookie is not httpOnly');
});

// --- somebody with no PIN yet (Dominguez, October 2026): listed on the tablet
// with a tag and told how to choose one, and reminded on Home until they do ---
const everybody = await (await admin.request.get(`${BASE}/api/employees`)).json();
const morgan = everybody.find((person) => person.email === 'manager@domihealthcare.com');
await admin.request.delete(`${BASE}/api/kiosk/employees/${morgan.id}/pin`);
const morganCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const morganPage = await morganCtx.newPage();
morganPage.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));

await step('somebody with no PIN is listed on the tablet, tagged "No PIN yet"', async () => {
  await tablet.reload({ waitUntil: 'networkidle' });
  await openList();
  const card = staffList().getByRole('button', { name: /Morgan/ });
  await card.waitFor({ timeout: 10000 });
  if (!(await card.innerText()).includes('No PIN yet')) throw new Error('Morgan has no "No PIN yet" tag');
  if ((await staffList().getByRole('button', { name: /Frankie/ }).innerText()).includes('No PIN yet'))
    throw new Error('Frankie has a PIN but was tagged as having none');
});

await step('tapping them explains how to choose a PIN, with no keypad, and OK goes back', async () => {
  await pick(/Morgan/);
  await tablet.getByText('You have not chosen a PIN yet.').waitFor({ timeout: 5000 });
  await tablet.getByText(/Your profile/).waitFor({ timeout: 5000 });
  if (await tablet.getByRole('button', { name: 'Confirm PIN' }).count())
    throw new Error('the keypad was offered to somebody with no PIN');
  await tablet.getByRole('button', { name: 'OK' }).click();
  await clockButton().waitFor({ timeout: 5000 });
});
await tablet.screenshot({ path: `${OUT}/18b-kiosk-no-pin.png`, fullPage: true });

await step('the tablet still refuses a punch for them, the same as a wrong PIN', async () => {
  const answer = await tablet.evaluate(async (id) => {
    const response = await fetch('/api/kiosk/punch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: id, pin: '4817' }),
    });
    return response.status;
  }, morgan.id);
  if (answer < 400) throw new Error(`a punch with no PIN set answered ${answer}`);
});

await step('Home reminds them to choose a PIN, naming the office with the time clock', async () => {
  await morganPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await morganPage.getByLabel('Email').fill('manager@domihealthcare.com');
  await morganPage.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await morganPage.getByRole('button', { name: 'Sign in' }).click();
  const reminder = morganPage.getByTestId('tablet-pin-reminder');
  await reminder.waitFor({ timeout: 15000 });
  if (!(await reminder.innerText()).includes('North Bergen'))
    throw new Error(`the reminder does not name North Bergen: ${await reminder.innerText()}`);
});
await morganPage.screenshot({ path: `${OUT}/18c-home-pin-reminder.png`, fullPage: true });

await step('the reminder opens the PIN box, and goes once a PIN is chosen', async () => {
  await morganPage.getByTestId('tablet-pin-reminder').getByRole('link', { name: 'Choose a PIN' }).click();
  await morganPage.getByTestId('pin-card').waitFor({ timeout: 10000 });
  await morganPage.waitForFunction(() => document.activeElement?.id === 'newPin', null, { timeout: 5000 });
  const box = morganPage.getByTestId('pin-card');
  await box.getByLabel('New PIN').fill('7394');
  await box.getByLabel('Same again').fill('7394');
  await box.getByLabel('Your password').fill('shift-change-2026');
  await box.getByRole('button', { name: 'Set PIN' }).click();
  await morganPage.getByText('Tablet PIN saved.').waitFor({ timeout: 10000 });
  await morganPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await morganPage.getByText('Not clocked in').waitFor({ timeout: 15000 });
  if (await morganPage.getByTestId('tablet-pin-reminder').count())
    throw new Error('the reminder stayed after the PIN was chosen');
});

await step('with a PIN chosen, the tablet drops the tag', async () => {
  await tablet.reload({ waitUntil: 'networkidle' });
  await openList();
  const card = staffList().getByRole('button', { name: /Morgan/ });
  await card.waitFor({ timeout: 10000 });
  if ((await card.innerText()).includes('No PIN yet')) throw new Error('the tag stayed after the PIN was set');
  await tablet.getByRole('button', { name: 'Back' }).click();
});

await step('somebody who has a PIN is not reminded', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 15000 });
  if (await page.getByTestId('tablet-pin-reminder').count()) throw new Error('Frankie, who has a PIN, was reminded');
  await ctx.close();
});
await morganCtx.close();

const typePin = async (pin) => {
  for (const digit of pin) await tablet.getByRole('button', { name: digit, exact: true }).click();
  await tablet.getByRole('button', { name: 'Confirm PIN' }).click();
};

await step('a wrong PIN is refused and the entry is cleared', async () => {
  await pick(/Frankie/);
  await tablet.getByText('Enter your PIN').waitFor({ timeout: 5000 });
  await typePin('9999');
  await tablet.getByRole('alert').waitFor({ timeout: 10000 });
  // All the dots must be empty again — no half-typed PIN left on a shared screen.
  const filled = await tablet.locator('.bg-brand-600.rounded-full').count();
  if (filled > 0) throw new Error(`${filled} PIN digits left on screen after failure`);
});
await tablet.screenshot({ path: `${OUT}/19-kiosk-wrong-pin.png`, fullPage: true });

await step('the correct PIN, typed on a keyboard, clocks in and confirms', async () => {
  // The time clock is often the front-desk computer: digits and Enter work.
  await tablet.keyboard.type('4817');
  await tablet.keyboard.press('Enter');
  await tablet.getByText('Clocked in').waitFor({ timeout: 15000 });
  await tablet.getByText('Frankie').first().waitFor({ timeout: 5000 });
});
await tablet.screenshot({ path: `${OUT}/20-kiosk-clocked-in.png`, fullPage: true });

await step('the confirmation returns to the main screen by itself', async () => {
  await clockButton().waitFor({ timeout: 10000 });
});

// Frankie works Front Desk and MA, so clocking out starts with the closing
// checklist — shown after the PIN, with nothing punched until the PIN is given
// again.
await step('the same PIN again shows the closing checklist first, and punches nothing yet', async () => {
  await pick(/Frankie/);
  const answered = tablet.waitForResponse((r) => r.url().endsWith('/api/kiosk/punch'));
  await typePin('4817');
  const body = await (await answered).json();
  if (body.action !== 'CHECKLIST') throw new Error(`the tablet answered ${body.action}`);
  const form = tablet.getByTestId('closing-form');
  await form.waitFor({ timeout: 10000 });
  await form.getByRole('button', { name: 'Check In Desk' }).click();
  await form.getByTestId('closing-section-Check In Desk').waitFor({ timeout: 5000 });
  await form.getByLabel('Calls answered').fill('22');
  await form.getByLabel('Calls placed').fill('5');
  await form.getByText('TVs and scanners powered off').click();
});
await tablet.screenshot({ path: `${OUT}/21a-kiosk-checklist.png`, fullPage: true });

await step('Clock out asks for the PIN again, then clocks out and reports time worked', async () => {
  await tablet.getByTestId('closing-form').getByRole('button', { name: 'Clock out', exact: true }).click();
  await tablet.getByText('Enter your PIN again to clock out').waitFor({ timeout: 5000 });
  const sent = tablet.waitForRequest((r) => r.url().endsWith('/api/kiosk/punch'));
  await typePin('4817');
  const payload = JSON.parse((await sent).postData() ?? '{}');
  if (!payload.closing?.done?.length) throw new Error('the checklist was not sent with the PIN');
  if (payload.closing.counts?.find((c) => c.value === 22) === undefined)
    throw new Error('the call count was not sent');
  await tablet.getByText('Clocked out').waitFor({ timeout: 15000 });
  await tablet.getByText(/on the clock/).waitFor({ timeout: 5000 });
});
await tablet.screenshot({ path: `${OUT}/21-kiosk-clocked-out.png`, fullPage: true });

await step('the kiosk offers no way into the rest of the app', async () => {
  for (const name of ['Timesheet', 'Schedule', 'Kiosks', 'Sign out']) {
    if (await tablet.getByRole('link', { name }).count() > 0)
      throw new Error(`kiosk exposed a link to ${name}`);
    if (await tablet.getByRole('button', { name }).count() > 0)
      throw new Error(`kiosk exposed a button for ${name}`);
  }
});

await step('revoking the device stops the tablet working', async () => {
  await admin.getByRole('button', { name: 'Revoke' }).first().click();
  await admin.getByRole('alertdialog', { name: /^Revoke / }).getByRole('button', { name: 'Yes, revoke it' }).click();
  await admin.getByText('No kiosks yet').waitFor({ timeout: 10000 });

  await tablet.reload({ waitUntil: 'networkidle' });
  await tablet.getByText('Set up this kiosk').waitFor({ timeout: 15000 });
});

// The punches above must still be on the timesheet, marked as kiosk-verified.
await step('kiosk punches appear on the manager timesheet as Kiosk-verified', async () => {
  await goTo(admin, 'Timesheet');
  await admin.getByRole('table').waitFor({ timeout: 10000 });
  await admin.getByText('Kiosk').first().waitFor({ timeout: 10000 });
});
await admin.screenshot({ path: `${OUT}/22-timesheet-kiosk.png`, fullPage: true });

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL KIOSK CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
