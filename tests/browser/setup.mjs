import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  // Fall back to whatever Playwright downloaded when CHROMIUM_PATH is unset.
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle' });

await step('a brand-new deployment shows the setup screen, not sign-in', async () => {
  await page.getByText('Set up Domi Time').waitFor({ timeout: 15000 });
  if (await page.getByRole('button', { name: 'Sign in' }).count() > 0)
    throw new Error('the sign-in form was shown on an empty database');
});
await page.screenshot({ path: `${OUT}/32-setup.png`, fullPage: true });

await step('a wrong token is refused with a clear message', async () => {
  await page.getByLabel('Setup token').fill('definitely-wrong-token');
  await page.getByLabel('First name').fill('Anthony');
  await page.getByLabel('Last name').fill('Dominguez');
  await page.getByLabel('Email').fill('dominguez@domihealthcare.com');
  await page.getByLabel('Password', { exact: true }).fill('harbour lantern tuesday');
  await page.getByLabel('Confirm password').fill('harbour lantern tuesday');
  await page.getByRole('button', { name: 'Create administrator' }).click();
  await page.getByText(/setup token is not correct/).waitFor({ timeout: 15000 });
});

await step('mismatched passwords block submission before any request', async () => {
  await page.getByLabel('Confirm password').fill('harbour lantern wednesday');
  await page.getByText('Those passwords do not match').waitFor({ timeout: 5000 });
  if (await page.getByRole('button', { name: 'Create administrator' }).isEnabled())
    throw new Error('submit was enabled with mismatched passwords');
  await page.getByLabel('Confirm password').fill('harbour lantern tuesday');
});

await step('the right token creates the account and signs you straight in', async () => {
  await page.getByLabel('Setup token').fill('demo-setup-token-1234');
  await page.getByRole('button', { name: 'Create administrator' }).click();
  // Straight into the app — no second sign-in, no forced password change.
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  await page.getByRole('link', { name: 'Locations' }).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/33-setup-done.png`, fullPage: true });

// From here on: the journey an administrator actually takes on day one.
await step('a fresh practice is told it has no locations yet', async () => {
  await page.getByRole('link', { name: 'Locations' }).click();
  await page.getByText(/No locations yet/).waitFor({ timeout: 10000 });
});

await step('an admin can add the first office', async () => {
  await page.getByRole('button', { name: '+ Add a location' }).click();
  await page.getByLabel('Name').fill('North Bergen');
  await page.getByLabel('Street address').fill('7650 Bergenline Ave');
  await page.getByLabel('City').fill('North Bergen');
  await page.getByLabel('ZIP').fill('07047');
  await page.getByLabel('Latitude').fill('40.804');
  await page.getByLabel('Longitude').fill('-74.012');
  await page.getByRole('button', { name: 'Add location' }).click();
  await page.getByRole('heading', { name: 'North Bergen' }).waitFor({ timeout: 15000 });
});

await step('an admin can add their first manager', async () => {
  await page.getByRole('link', { name: 'Staff' }).click();
  await page.getByRole('button', { name: '+ Add someone' }).click();
  await page.getByLabel('First name').fill('Morgan');
  await page.getByLabel('Last name').fill('Manager');
  await page.getByLabel('Email').fill('morgan@domihealthcare.com');
  await page.getByLabel('Role').selectOption('MANAGER');
  // Assign them to the office we just created, or they cannot clock in anywhere.
  await page.getByRole('checkbox', { name: 'North Bergen' }).check();
  await page.getByRole('button', { name: 'Add to staff' }).click();
  await page.getByText('morgan@domihealthcare.com').waitFor({ timeout: 15000 });
});

let tempPassword;
await step('a temporary password can be issued and is shown once', async () => {
  const card = page.locator('main div.space-y-3 > div').filter({ hasText: 'Morgan Manager' }).first();
  await card.getByRole('button', { name: 'Set a temporary password' }).click();
  await card.getByRole('button', { name: 'Suggest one' }).click();

  const input = card.getByLabel('Temporary password');
  tempPassword = await input.inputValue();
  if (tempPassword.length < 12) throw new Error(`suggested password too short: ${tempPassword}`);

  await card.getByRole('button', { name: 'Set it' }).click();
  await card.getByText(/Temporary password for Morgan/).waitFor({ timeout: 15000 });
});
await page.screenshot({ path: `${OUT}/34-staff.png`, fullPage: true });

await step('the new manager can sign in, and must change that password', async () => {
  const mgrCtx = await browser.newContext();
  const mgr = await mgrCtx.newPage();
  await mgr.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle' });
  await mgr.getByLabel('Email').fill('morgan@domihealthcare.com');
  await mgr.getByLabel('Password', { exact: true }).fill(tempPassword);
  await mgr.getByRole('button', { name: 'Sign in' }).click();
  await mgr.getByText('Choose a new password').waitFor({ timeout: 20000 });

  await mgr.getByLabel('Temporary password').fill(tempPassword);
  await mgr.getByLabel('New password', { exact: true }).fill('meadow anchor tuesday');
  await mgr.getByLabel('Confirm new password').fill('meadow anchor tuesday');
  await mgr.getByRole('button', { name: 'Change password' }).click();
  await mgr.getByText('Not clocked in').waitFor({ timeout: 20000 });

  // A manager, not an admin: no Staff or Kiosks tabs.
  for (const name of ['Staff', 'Kiosks', 'Locations']) {
    if (await mgr.getByRole('link', { name }).count() > 0)
      throw new Error(`a manager was shown the ${name} tab`);
  }
  await mgrCtx.close();
});

await step('the setup screen does not come back', async () => {
  const fresh = await browser.newContext();
  const visitor = await fresh.newPage();
  await visitor.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle' });
  await visitor.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 15000 });
  if (await visitor.getByText('Set up Domi Time').count() > 0)
    throw new Error('setup was still offered after an admin existed');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL SETUP CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
