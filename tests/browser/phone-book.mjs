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
 * The referral phone book (October 2026, Dominguez: "a searchable phone book
 * for referrals for staff to use and edit"): everybody signed in searches it,
 * presses a number to call, and adds, fixes and removes entries. Loaded from
 * the practice's Word phone book by migration.
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

const count = async (page) => (await page.getByTestId('phone-book-count').innerText()).trim();
const search = async (page, text) => {
  await page.getByLabel('Search', { exact: true }).fill(text);
};

const staff = await signIn('frontdesk@domihealthcare.com');

await step('front desk staff open the Phone book from Home and see the loaded book', async () => {
  await staff.getByTestId('quick-actions').getByRole('link', { name: 'Phone book' }).click();
  await staff.getByRole('heading', { name: 'Phone book', level: 1 }).waitFor({ timeout: 10000 });
  await staff.getByTestId('phone-book-entry').first().waitFor({ timeout: 10000 });
  const text = await count(staff);
  const total = Number(text.match(/(\d+) entries/)?.[1]);
  if (!(total > 300)) throw new Error(`the book looks short: ${text}`);
  await staff.screenshot({ path: `${OUT}/phone-book.png`, fullPage: false });
});

await step('searching a name narrows the list as it is typed', async () => {
  await search(staff, 'quest');
  await staff.getByRole('heading', { name: 'Quest Diagnostic Lab' }).waitFor({ timeout: 5000 });
  if (/^\d+ entries\.$/.test(await count(staff))) throw new Error('nothing was narrowed');
  await search(staff, 'quest zzzz-no-such');
  await staff.getByText(/Nothing matches/).waitFor({ timeout: 5000 });
});

await step('a number finds its entry however it is written', async () => {
  for (const typed of ['8002295227', '(800) 229-5227', '800-229-5227']) {
    await search(staff, typed);
    await staff.getByRole('heading', { name: 'BioReference Laboratories' }).waitFor({ timeout: 5000 });
  }
});

await step('an insurance or a specialty in the notes is searchable too', async () => {
  await search(staff, 'hnjh cardiology');
  const cards = staff.getByTestId('phone-book-entry');
  await cards.first().waitFor({ timeout: 5000 });
  if ((await cards.count()) < 1) throw new Error('no cardiology entry mentions HNJH');
});

await step('a phone number is a call link, a fax number is not', async () => {
  await search(staff, 'LabCorp');
  const card = staff.getByTestId('phone-book-entry').filter({ hasText: 'Fax for bw results' }).first();
  await card.waitFor({ timeout: 5000 });
  const dial = card.locator('a[href^="tel:"]').first();
  if ((await dial.getAttribute('href')) !== 'tel:+18006315250') {
    throw new Error(`LabCorp dials ${await dial.getAttribute('href')}`);
  }
  const hrefs = await card.locator('a[href^="tel:"]').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  if (hrefs.includes('tel:+18552274491')) throw new Error('the fax number can be dialled');
});

await step('Listed under shows one heading at a time', async () => {
  await search(staff, '');
  await staff.getByLabel('Listed under').first().selectOption('Cardiology');
  const headings = await staff.locator('main h2').allInnerTexts();
  const sections = headings.filter((h) => /\(\d+\)/.test(h));
  if (sections.length !== 1 || !/^Cardiology/i.test(sections[0])) throw new Error(JSON.stringify(sections));
  await staff.getByLabel('Listed under').first().selectOption('');
});

await step('anybody adds and fixes an entry; only a manager removes it', async () => {
  await staff.getByRole('button', { name: '+ Add an entry' }).click();
  let dialog = staff.getByRole('dialog', { name: 'New phone book entry' });
  await dialog.getByLabel('Name').fill('Phone-book suite sleep lab');
  await dialog.getByLabel('Listed under').fill('Sleep studies');
  await dialog.getByLabel('Phone').fill('(201) 555-0142');
  await dialog.getByLabel('Notes').fill('Fax the order first.');
  await dialog.getByRole('button', { name: 'Add entry' }).click();
  await search(staff, 'phone-book suite');
  let card = staff.getByTestId('phone-book-entry').filter({ hasText: 'Phone-book suite sleep lab' });
  await card.getByText('Fax the order first.').waitFor({ timeout: 10000 });
  await staff.getByRole('heading', { name: /^Sleep studies/ }).waitFor();

  await card.getByRole('button', { name: /^Edit/ }).click();
  dialog = staff.getByRole('dialog', { name: /Change Phone-book suite sleep lab/ });
  await dialog.getByLabel('Notes').fill('Fax the order first. Takes Wellcare.');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  card = staff.getByTestId('phone-book-entry').filter({ hasText: 'Phone-book suite sleep lab' });
  await card.getByText('Takes Wellcare.', { exact: false }).waitFor({ timeout: 10000 });

  await card.getByRole('button', { name: /^Edit/ }).click();
  dialog = staff.getByRole('dialog', { name: /Change Phone-book suite sleep lab/ });
  if (await dialog.getByRole('button', { name: 'Remove' }).count()) throw new Error('staff are offered Remove');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  const id = await staff.evaluate(async () => {
    const all = await (await fetch('/api/phone-book')).json();
    return all.find((c) => c.name === 'Phone-book suite sleep lab').id;
  });
  const refused = await staff.evaluate(async (id) => (await fetch(`/api/phone-book/${id}`, { method: 'DELETE' })).status, id);
  if (refused !== 403) throw new Error(`staff removed an entry: ${refused}`);

  const manager = await signIn('manager@domihealthcare.com');
  await manager.goto(`${BASE}/phone-book`, { waitUntil: 'networkidle' });
  await manager.getByLabel('Search', { exact: true }).fill('phone-book suite');
  await manager.getByTestId('phone-book-entry').getByRole('button', { name: /^Edit/ }).click();
  await manager.getByRole('dialog', { name: /Change Phone-book suite sleep lab/ }).getByRole('button', { name: 'Remove' }).click();
  await manager.getByRole('button', { name: 'Yes, remove it' }).click();
  await manager.getByText(/Nothing matches/).waitFor({ timeout: 10000 });
  await manager.context().close();
});

await step('the form asks for places, not patients, and there is no file upload', async () => {
  await staff.getByRole('button', { name: '+ Add an entry' }).click();
  await staff.getByText('About the place only — never a patient’s name or details.').waitFor();
  if ((await staff.locator('input[type=file]').count()) !== 0) throw new Error('a file input is on the page');
  await staff.getByRole('button', { name: 'Cancel' }).click();
});

await step('the book is also on Resources, and staff can read, add and fix it', async () => {
  await staff.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  await staff.getByTestId('reference-section').getByRole('link', { name: /Phone book/ }).waitFor({ timeout: 10000 });
  const rows = await staff.evaluate(async () => (await fetch('/api/phone-book')).status);
  if (rows !== 200) throw new Error(`staff read it: ${rows}`);
});

await step('it fits a phone without scrolling sideways', async () => {
  const phone = await signIn('manager@domihealthcare.com', { width: 390, height: 800 });
  await phone.goto(`${BASE}/phone-book`, { waitUntil: 'networkidle' });
  await phone.getByTestId('phone-book-entry').first().waitFor({ timeout: 10000 });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (wide) throw new Error('the page scrolls sideways');
  await phone.context().close();
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL PHONE BOOK CHECKS PASSED');
