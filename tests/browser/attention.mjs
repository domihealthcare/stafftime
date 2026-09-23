// The nightly round-up, shown on the screens instead of only in an email.
//
// The per-check logic is unit tested with the clock pinned — several of the
// checks only speak on certain days, which is not something a browser suite can
// honestly arrange. What is tested here is the plumbing: that the endpoint is
// manager-only, that a banner appears on the screen where the thing would be
// fixed, and that turning the email off actually sticks.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { accountMenuHas, pickFromAccountMenu } from './account-menu.mjs';

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

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

const admin = await signIn('admin@domihealthcare.com');
const employee = await signIn('frontdesk@domihealthcare.com');

await step('the round-up is not an employee’s to read', async () => {
  // Every line in it names somebody. A colleague's lapsed license is not theirs.
  const response = await employee.request.get(`${BASE}/api/attention`);
  if (response.status() !== 403) throw new Error(`employee got ${response.status()}, not 403`);
});

await step('an employee is not offered the notification settings', async () => {
  if (await accountMenuHas(employee, 'Notifications'))
    throw new Error('an employee was offered the notification settings');
});

await step('a quiet practice shows no banner at all', async () => {
  // Worth asserting: a banner that is always there is wallpaper within a week.
  await admin.getByRole('link', { name: /^Schedule/ }).first().click();
  await admin.getByText('Coverage this week').waitFor({ timeout: 15000 });
  await admin.waitForTimeout(1000);

  if ((await admin.getByTestId('needs-attention').count()) > 0)
    throw new Error('a banner appeared with nothing to say');
});

await step('marking somebody as left raises it on the schedule', async () => {
  // Frankie has a shift on the seeded rota. Marking them as gone should not
  // silently leave that shift sitting there.
  //
  // The card is addressed by test id rather than by matching text: "the element
  // containing Frankie Front-Desk" matched a wrapper holding every card, and
  // the first attempt at this confidently marked the wrong person as having
  // left. On a screen with one card per person that is not a risk worth taking.
  await admin.getByRole('button', { name: 'Manage', exact: true }).click();
  await admin.getByRole('link', { name: /^Staff/ }).first().click();
  const card = admin.getByTestId('staff-frontdesk@domihealthcare.com');
  await card.waitFor({ timeout: 15000 });

  admin.once('dialog', (dialog) => void dialog.accept());
  await card.getByRole('button', { name: 'No longer employed' }).click();

  // The screen hides former staff by default, so the card going away is what
  // success looks like here — not a badge appearing on it.
  await card.waitFor({ state: 'detached', timeout: 15000 });

  await admin.getByRole('link', { name: /^Schedule/ }).first().click();
  const banner = admin.getByTestId('needs-attention');
  await banner.waitFor({ timeout: 20000 });

  const text = await banner.innerText();
  if (!/Shifts for people who have left/i.test(text))
    throw new Error(`the banner said something else: ${text}`);
  if (!/Frankie Front-Desk/.test(text))
    throw new Error('the banner did not name who it is about');
  if (!/no longer employed/.test(text))
    throw new Error('the banner did not say why');
});
await admin.screenshot({ path: `${OUT}/72-attention-banner.png`, fullPage: true });

await step('the banner goes to the screen where it would be fixed', async () => {
  // Not one banner listing everything everywhere. The leaver's shifts belong on
  // the schedule; the kiosks page has nothing to say about them.
  await admin.getByRole('button', { name: 'Manage', exact: true }).click();
  await admin.getByRole('link', { name: /^Kiosks/ }).first().click();
  await admin.getByText(/Kiosks/).first().waitFor({ timeout: 15000 });
  await admin.waitForTimeout(1000);

  if ((await admin.getByTestId('needs-attention').count()) > 0)
    throw new Error('the schedule’s warning also appeared on the kiosks screen');
});

await step('the nightly email can be turned off, and stays off', async () => {
  await pickFromAccountMenu(admin, 'Notifications');
  const toggle = admin.getByRole('switch', { name: 'The nightly round-up' });
  await toggle.waitFor({ timeout: 15000 });

  if ((await toggle.getAttribute('aria-checked')) !== 'true')
    throw new Error('the digest was not on to begin with');

  await toggle.click();
  await admin.waitForTimeout(1500);
  if ((await toggle.getAttribute('aria-checked')) !== 'false')
    throw new Error('the toggle did not switch off');

  // The real question is whether it saved, not whether the switch moved.
  await admin.reload({ waitUntil: 'networkidle' });
  const after = admin.getByRole('switch', { name: 'The nightly round-up' });
  await after.waitFor({ timeout: 15000 });
  if ((await after.getAttribute('aria-checked')) !== 'false')
    throw new Error('the setting did not survive a reload');
});

await step('it says what you stop hearing about', async () => {
  // Turning notifications off is much easier to regret when nobody said what
  // they covered.
  const text = await admin.locator('main').innerText();
  for (const phrase of ['tablets', 'rota', 'lapse', 'approved']) {
    if (!new RegExp(phrase, 'i').test(text))
      throw new Error(`the page does not mention ${phrase}`);
  }
});
await admin.screenshot({ path: `${OUT}/73-notifications.png`, fullPage: true });

await step('turning it back on works too', async () => {
  const toggle = admin.getByRole('switch', { name: 'The nightly round-up' });
  await toggle.click();
  await admin.waitForTimeout(1500);
  if ((await toggle.getAttribute('aria-checked')) !== 'true')
    throw new Error('the toggle did not switch back on');
});

// --- practice settings ---

await step('the numbers behind the warnings are the practice’s to set', async () => {
  await pickFromAccountMenu(admin, 'Practice settings');
  await admin.getByLabel('Overtime starts after').waitFor({ timeout: 15000 });

  const threshold = admin.getByLabel('Overtime starts after');
  if ((await threshold.inputValue()) !== '40')
    throw new Error(`the default threshold is ${await threshold.inputValue()}, not 40`);

  const window = admin.getByLabel('Chase an unpublished rota');
  if ((await window.inputValue()) !== '4')
    throw new Error(`the default warning window is ${await window.inputValue()}, not 4`);
});

await step('a manager can read them but not change them', async () => {
  const mgrCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const manager = await mgrCtx.newPage();
  await manager.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await manager.getByLabel('Email').fill('manager@domihealthcare.com');
  await manager.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await manager.getByRole('button', { name: 'Sign in' }).click();
  await manager.getByText('Not clocked in').waitFor({ timeout: 20000 });

  await pickFromAccountMenu(manager, 'Practice settings');
  const field = manager.getByLabel('Overtime starts after');
  await field.waitFor({ timeout: 15000 });

  // Readable, because the numbers explain what their screens are telling them.
  if (!(await field.isDisabled())) throw new Error('a manager could edit the settings');
  if ((await manager.getByRole('button', { name: 'Save' }).count()) > 0)
    throw new Error('a manager was offered Save');

  // And the server says so too, not just the screen.
  const response = await manager.request.fetch(`${BASE}/api/settings`, {
    method: 'PATCH',
    data: { overtimeThresholdHours: 20 },
  });
  if (response.status() !== 403)
    throw new Error(`a manager's PATCH got ${response.status()}, not 403`);

  await mgrCtx.close();
});

await step('changing the threshold changes what the rota warns about', async () => {
  // The real test of a setting is whether anything downstream notices.
  const threshold = admin.getByLabel('Overtime starts after');
  await threshold.fill('20');
  // Wait for the save itself, then for the confirmation by its exact words:
  // the Schedule check below is only meaningful once the new line is stored,
  // and a loose "Saved." matches any sentence that happens to end in "saved."
  const saving = admin.waitForResponse(
    (r) => r.url().includes('/api/settings') && r.request().method() !== 'GET',
  );
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  const saveResponse = await saving;
  if (!saveResponse.ok()) throw new Error(`the save answered ${saveResponse.status()}`);
  await admin.getByText('Saved.', { exact: true }).waitFor({ timeout: 15000 });

  // The seeded rota is a single 8-hour shift today, which is over 20 for
  // nobody — so build a week that clears the new line but not the old one.
  await admin.getByRole('link', { name: /^Schedule/ }).first().click();
  await admin.getByRole('button', { name: 'Repeating shifts' }).click();
  // Not Frankie: an earlier step in this suite marks them as no longer
  // employed, which takes them out of the dropdown.
  await admin.getByLabel('Employee').selectOption({ label: 'Max Assistant' });
  await admin.getByLabel('Starts').fill('09:00');
  await admin.getByLabel('Ends').fill('15:00');
  await admin.getByLabel('From').fill('2027-03-01');
  await admin.getByLabel('Until').fill('2027-03-05');
  await admin.getByLabel(/Publish straight away/).check();
  await admin.getByRole('button', { name: 'Create the shifts' }).click();
  await admin.getByText(/shifts created/).waitFor({ timeout: 20000 });

  // 5 × 6 hours = 30: nothing at all under the default 40, ten hours of
  // overtime under the 20 just set.
  //
  // Navigated by month rather than by week — the week label reads
  // "Mar 1 – Mar 7, 2027", so matching on the month name means stepping through
  // twenty-odd weeks and hoping the loop bound is generous enough.
  await admin.getByRole('button', { name: 'Month', exact: true }).click();
  await admin.getByTestId('month-grid').waitFor({ timeout: 15000 });
  for (let i = 0; i < 12; i += 1) {
    if (/March 2027/.test(await admin.locator('main').innerText())) break;
    await admin.getByRole('button', { name: 'Next →' }).click();
    await admin.waitForTimeout(250);
  }
  await admin.getByText('March 2027').waitFor({ timeout: 10000 });
  await admin.getByText(/scheduled past 20 hours/).waitFor({ timeout: 20000 });

  const text = await admin.locator('main').innerText();
  if (!/30 hours in the week of/.test(text))
    throw new Error(`the warning did not use the new line: ${text.slice(0, 300)}`);
});
await admin.screenshot({ path: `${OUT}/74-settings.png`, fullPage: true });

await step('putting it back makes the warning go away again', async () => {
  await pickFromAccountMenu(admin, 'Practice settings');
  await admin.getByLabel('Overtime starts after').fill('40');
  // Wait for the save itself, then for the confirmation by its exact words:
  // the Schedule check below is only meaningful once the new line is stored,
  // and a loose "Saved." matches any sentence that happens to end in "saved."
  const saving = admin.waitForResponse(
    (r) => r.url().includes('/api/settings') && r.request().method() !== 'GET',
  );
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  const saveResponse = await saving;
  if (!saveResponse.ok()) throw new Error(`the save answered ${saveResponse.status()}`);
  await admin.getByText('Saved.', { exact: true }).waitFor({ timeout: 15000 });

  await admin.getByRole('link', { name: /^Schedule/ }).first().click();
  await admin.getByTestId('month-grid').waitFor({ timeout: 15000 });
  for (let i = 0; i < 12; i += 1) {
    if (/March 2027/.test(await admin.locator('main').innerText())) break;
    await admin.getByRole('button', { name: 'Next →' }).click();
    await admin.waitForTimeout(250);
  }
  await admin.waitForTimeout(1200);
  if ((await admin.getByText(/scheduled past \d+ hours/).count()) > 0)
    throw new Error('30 hours was still reported as overtime at a threshold of 40');
});

// --- demo data ---

await step('demo data is admin-only, and says what it will replace', async () => {
  await pickFromAccountMenu(admin, 'Practice settings');
  await admin.getByRole('heading', { name: 'Demo data' }).waitFor({ timeout: 15000 });

  const text = await admin.locator('main').innerText();
  if (!/replaces/i.test(text))
    throw new Error('the card does not warn that it replaces existing data');

  // A manager should not be offered it, and should be refused if they ask.
  const mgrCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const manager = await mgrCtx.newPage();
  await manager.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await manager.getByLabel('Email').fill('manager@domihealthcare.com');
  await manager.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await manager.getByRole('button', { name: 'Sign in' }).click();
  await manager.getByText('Not clocked in').waitFor({ timeout: 20000 });

  await pickFromAccountMenu(manager, 'Practice settings');
  await manager.getByLabel('Overtime starts after').waitFor({ timeout: 15000 });
  if ((await manager.getByRole('heading', { name: 'Demo data' }).count()) > 0)
    throw new Error('a manager was offered the demo data loader');

  const refused = await manager.request.post(`${BASE}/api/demo/load`);
  if (refused.status() !== 403)
    throw new Error(`a manager's demo load got ${refused.status()}, not 403`);

  await mgrCtx.close();
});

await step('it asks before replacing anything', async () => {
  // A destructive button that fires on the first click is one somebody presses
  // while reading the sentence next to it.
  await admin.getByRole('button', { name: 'Load demo data' }).click();
  await admin.getByText(/Replace the shifts and punches/).waitFor({ timeout: 10000 });
  await admin.getByRole('button', { name: 'Cancel' }).click();
  await admin.getByRole('button', { name: 'Load demo data' }).waitFor({ timeout: 10000 });
});

await step('loading it fills the app with something to look at', async () => {
  await admin.getByRole('button', { name: 'Load demo data' }).click();
  await admin.getByRole('button', { name: 'Yes, load it' }).click();
  await admin.getByText('Demo data loaded.').waitFor({ timeout: 120000 });

  const text = await admin.locator('main').innerText();
  if (!/\d+ staff added/.test(text)) throw new Error(`no staff reported: ${text.slice(0, 200)}`);

  // And it is really there, not just reported.
  const rows = await (await admin.request.get(`${BASE}/api/time-entries`)).json();
  if (rows.length < 20)
    throw new Error(`only ${rows.length} time entries reached the timesheet`);
});
await admin.screenshot({ path: `${OUT}/75-demo-data.png`, fullPage: true });

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL ATTENTION CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
