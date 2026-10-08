import { chromium } from 'playwright';
import { clockOut } from './clock-out.mjs';
import { mkdirSync } from 'node:fs';
import { goTo } from './nav.mjs';

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

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
}

async function openDirectory(page) {
  await goTo(page, 'Directory');
  await page.getByRole('heading', { name: 'Directory' }).waitFor({ timeout: 15000 });
}

const person = (page, name) => page.getByTestId(`person-${name}`);
const inNow = (page, place) => page.getByTestId(`in-now-${place}`);

// Frankie clocks in from the front desk at North Bergen, on a phone.
const frankieCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  permissions: ['geolocation'],
  geolocation: { latitude: 40.8045, longitude: -74.012, accuracy: 25 }, // on site, North Bergen
});
const frankie = await frankieCtx.newPage();
frankie.on('pageerror', (e) => errors.push(`frankie pageerror: ${e.message}`));
await signIn(frankie, 'frontdesk@domihealthcare.com');

await step('nobody is in before anybody clocks in', async () => {
  await openDirectory(frankie);
  await inNow(frankie, 'North Bergen').getByText('Nobody is clocked in.').waitFor({ timeout: 10000 });
  await inNow(frankie, 'West New York').getByText('Nobody is clocked in.').waitFor({ timeout: 10000 });
});

await step('clocking in puts somebody under In now, at the right office', async () => {
  await frankie.getByRole('link', { name: 'Home', exact: true }).click();
  await frankie.getByRole('button', { name: 'Clock in' }).click();
  await frankie.getByText('On the clock').waitFor({ timeout: 20000 });

  await openDirectory(frankie);
  await inNow(frankie, 'North Bergen').getByText('Frankie Front-Desk').waitFor({ timeout: 10000 });
  await inNow(frankie, 'West New York').getByText('Nobody is clocked in.').waitFor({ timeout: 5000 });
});

await step('In now groups people by job role, under their first one', async () => {
  // Frankie is Front Desk and MA: listed once, under Front Desk.
  const office = inNow(frankie, 'North Bergen');
  await office.getByTestId('in-now-group-Front Desk').getByText('Frankie Front-Desk').waitFor({ timeout: 10000 });
  if (await office.getByTestId('in-now-group-Medical Assistant').count())
    throw new Error('Frankie was listed twice, under a second job role too');
});

await step('a colleague sees who is in and where, but not since when', async () => {
  const badge = person(frankie, 'Frankie Front-Desk').getByText(/^In now · North Bergen/);
  await badge.waitFor({ timeout: 5000 });
  if (/since/.test(await badge.innerText())) throw new Error('an employee was shown the clock-in time');
  await person(frankie, 'Frankie Front-Desk').getByText('(you)').waitFor({ timeout: 5000 });
});

await step('work email and phone are there, and tap to call or write', async () => {
  const card = person(frankie, 'Morgan Manager');
  const phone = card.getByRole('link', { name: '(201) 555-0102' });
  if ((await phone.getAttribute('href')) !== 'tel:2015550102') throw new Error('phone link is wrong');
  const email = card.getByRole('link', { name: 'manager@domihealthcare.com' });
  if ((await email.getAttribute('href')) !== 'mailto:manager@domihealthcare.com')
    throw new Error('email link is wrong');
});

await step('nothing from the personnel side shows', async () => {
  const text = await frankie.locator('main').innerText();
  for (const word of ['Hourly', 'Salaried', 'hire', 'Hired', 'PIN', 'Badge']) {
    if (text.includes(word)) throw new Error(`"${word}" appeared in the directory`);
  }
  const body = await frankie.evaluate(() => fetch('/api/directory').then((r) => r.text()));
  for (const field of ['payType', 'hireDate', 'passwordHash', 'pinHash', 'badgeId', 'externalId']) {
    if (body.includes(field)) throw new Error(`the API sent ${field}`);
  }
});

await step('someone in two job roles turns up under either', async () => {
  await frankie.getByLabel('Job role').selectOption({ label: 'Medical Assistant' });
  await person(frankie, 'Frankie Front-Desk').waitFor({ timeout: 5000 });
  await person(frankie, 'Max Assistant').waitFor({ timeout: 5000 });
  if ((await person(frankie, 'Morgan Manager').count()) > 0) throw new Error('the filter let Morgan through');

  await frankie.getByLabel('Job role').selectOption({ label: 'Front Desk' });
  await person(frankie, 'Frankie Front-Desk').waitFor({ timeout: 5000 });
  if ((await person(frankie, 'Max Assistant').count()) > 0) throw new Error('the filter let Max through');
  await frankie.getByLabel('Job role').selectOption({ label: 'Every job role' });
});

await step('each job role is labelled, and wears its own colour', async () => {
  const card = person(frankie, 'Frankie Front-Desk');
  await card.getByText('Front Desk', { exact: true }).waitFor({ timeout: 5000 });
  await card.getByText('Medical Assistant', { exact: true }).waitFor({ timeout: 5000 });
  const dots = await card
    .getByTestId('job-role-dot')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  if (dots.length !== 2) throw new Error(`expected two role colours, saw ${dots.length}`);
  if (dots[0] === dots[1]) throw new Error('two different roles share a colour');
  // The colour is a mark beside the name; the name itself stays dark.
  const text = await card.getByText('Front Desk', { exact: true }).evaluate((el) => getComputedStyle(el).color);
  if (text !== 'rgb(51, 65, 85)') throw new Error(`the role name is coloured ${text}`);
});

await step('search finds people by name', async () => {
  await frankie.getByLabel('Search').fill('ada');
  await person(frankie, 'Ada Admin').waitFor({ timeout: 5000 });
  if ((await frankie.locator('[data-testid^="person-"]').count()) !== 1) throw new Error('search matched more than Ada');
  await frankie.getByLabel('Search').fill('');
});

await step('the directory fits a phone', async () => {
  const overflow = await frankie.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('the directory scrolls sideways on a phone');
});
await frankie.screenshot({ path: `${OUT}/90-directory-phone.png`, fullPage: true });

await step('a manager sees since when', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const mgr = await ctx.newPage();
  await signIn(mgr, 'manager@domihealthcare.com');
  await openDirectory(mgr);
  await person(mgr, 'Frankie Front-Desk').getByText(/In now · North Bergen since/).waitFor({ timeout: 10000 });
  await mgr.screenshot({ path: `${OUT}/91-directory-manager.png`, fullPage: true });
  await ctx.close();
});

await step('clocking out takes them off In now', async () => {
  await frankie.getByRole('link', { name: 'Home', exact: true }).click();
  await clockOut(frankie);
  await frankie.getByText('Not clocked in').waitFor({ timeout: 20000 });
  await openDirectory(frankie);
  await inNow(frankie, 'North Bergen').getByText('Nobody is clocked in.').waitFor({ timeout: 10000 });
});

await step('“Open in Staff” is on an admin’s right-click menu, not a manager’s', async () => {
  // October 2026, Dominguez: the Staff screen is the admins'; managers have
  // the Directory itself, which shows the same person and resets a PIN.
  const items = async (email) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await ctx.newPage();
    await signIn(page, email);
    await openDirectory(page);
    // On the name: the card's top row is what listens for a right-click.
    await person(page, 'Frankie Front-Desk')
      .getByRole('heading', { name: /Frankie Front-Desk/ })
      .click({ button: 'right' });
    const menu = page.getByTestId('person-menu');
    await menu.waitFor({ timeout: 10000 });
    const labels = await menu.getByRole('menuitem').allInnerTexts();
    await ctx.close();
    return labels.map((label) => label.trim());
  };
  const manager = await items('manager@domihealthcare.com');
  if (!manager.includes('See profile')) throw new Error(`the manager's menu reads ${manager.join(', ')}`);
  if (manager.includes('Open in Staff')) throw new Error('a manager was offered Open in Staff');
  const admin = await items('admin@domihealthcare.com');
  if (!admin.includes('Open in Staff')) throw new Error(`the admin's menu reads ${admin.join(', ')}`);
});

await frankieCtx.close();
await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL DIRECTORY CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
