// The nightly round-up, shown on the screens instead of only in an email.
//
// The per-check logic is unit tested with the clock pinned — several of the
// checks only speak on certain days, which is not something a browser suite can
// honestly arrange. What is tested here is the plumbing: that the endpoint is
// manager-only, that a banner appears on the screen where the thing would be
// fixed, and that turning the email off actually sticks.
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
  // Every line in it names somebody. A colleague's lapsed licence is not theirs.
  const response = await employee.request.get(`${BASE}/api/attention`);
  if (response.status() !== 403) throw new Error(`employee got ${response.status()}, not 403`);
});

await step('an employee is not offered the notification settings', async () => {
  if ((await employee.getByRole('link', { name: 'Notifications' }).count()) > 0)
    throw new Error('an employee was shown the notifications link');
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
  await admin.getByRole('link', { name: /^Kiosks/ }).first().click();
  await admin.getByText(/Kiosks/).first().waitFor({ timeout: 15000 });
  await admin.waitForTimeout(1000);

  if ((await admin.getByTestId('needs-attention').count()) > 0)
    throw new Error('the schedule’s warning also appeared on the kiosks screen');
});

await step('the nightly email can be turned off, and stays off', async () => {
  await admin.getByRole('link', { name: 'Notifications' }).first().click();
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

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL ATTENTION CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
