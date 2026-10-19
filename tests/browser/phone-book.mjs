import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goTo } from './nav.mjs';

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
 * for referrals for staff to use and edit"; then "it has to be able to be
 * printed", "the highlighted ones should be starred/preferred", "multiple
 * addresses/phone and fax numbers for the same person/group", and "used
 * multiple times on a daily basis for staff so should be easily accessible").
 * Everybody signed in searches it, presses a number to call and adds and fixes
 * entries; only managers remove one. Loaded from the practice's Word phone
 * book by migration.
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
const card = (page, name) =>
  page.getByTestId('phone-book-entry').filter({ has: page.getByRole('heading', { name }) });

const staff = await signIn('frontdesk@domihealthcare.com');

await step('it has a tab of its own in the header, one press from anywhere', async () => {
  await goTo(staff, 'Phone book');
  await staff.getByRole('heading', { name: 'Phone book', level: 1 }).waitFor({ timeout: 10000 });
  await staff.getByTestId('phone-book-entry').first().waitFor({ timeout: 10000 });
  const text = await count(staff);
  const total = Number(text.match(/(\d+) entries/)?.[1]);
  if (!(total > 300)) throw new Error(`the book looks short: ${text}`);
  await staff.screenshot({ path: `${OUT}/phone-book.png`, fullPage: false });
});

await step('on a laptop the search box is ready to type in', async () => {
  const focused = await staff.evaluate(() => document.activeElement?.id);
  if (focused !== 'phone-book-search') throw new Error(`focus is on ${focused}`);
});

await step('the search stays in view while the list scrolls', async () => {
  await staff.evaluate(() => window.scrollTo(0, 2500));
  const box = await staff.locator('#phone-book-search').boundingBox();
  if (!box || box.y < 0 || box.y > 200) throw new Error(`search is at ${box?.y}`);
  await staff.evaluate(() => window.scrollTo(0, 0));
});

await step('searching a name narrows the list as it is typed, and the address remembers it', async () => {
  await search(staff, 'quest');
  await staff.getByRole('heading', { name: 'Quest Diagnostic Lab' }).waitFor({ timeout: 5000 });
  if (/^\d+ entries\.$/.test(await count(staff))) throw new Error('nothing was narrowed');
  if (!/[?&]q=quest/.test(staff.url())) throw new Error(`the search is not in the address: ${staff.url()}`);
  await staff.reload({ waitUntil: 'networkidle' });
  await staff.getByRole('heading', { name: 'Quest Diagnostic Lab' }).waitFor({ timeout: 10000 });
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
  await staff.getByTestId('phone-book-entry').first().waitFor({ timeout: 5000 });
});

await step('a phone number is a call link, a fax number is not', async () => {
  await search(staff, 'LabCorp');
  const labcorp = staff.getByTestId('phone-book-entry').filter({ hasText: 'Fax for bw results' }).first();
  await labcorp.waitFor({ timeout: 5000 });
  const hrefs = await labcorp.locator('a[href^="tel:"]').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  if (hrefs[0] !== 'tel:+18006315250') throw new Error(`LabCorp dials ${hrefs[0]}`);
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

await step('the practice’s highlighted entries are starred, and Preferred only shows just those', async () => {
  await search(staff, 'sarti');
  const sarti = card(staff, /Dr\. Evan Sarti/);
  await sarti.getByText('Preferred', { exact: true }).waitFor({ timeout: 5000 });
  await search(staff, '');
  const all = Number((await count(staff)).match(/(\d+) entries/)[1]);
  await staff.getByRole('button', { name: /Preferred only/ }).click();
  await staff.waitForFunction(() => /of \d+ entries/.test(document.querySelector('[data-testid=phone-book-count]').textContent));
  const starred = Number((await count(staff)).match(/^(\d+) of/)[1]);
  if (!(starred > 20 && starred < all / 2)) throw new Error(`${starred} starred of ${all}`);
  const cards = await staff.getByTestId('phone-book-entry').count();
  const stars = await staff.getByTestId('phone-book-entry').filter({ hasText: 'Preferred' }).count();
  if (cards !== stars) throw new Error(`${cards} cards, ${stars} starred`);
  await staff.getByRole('button', { name: /Preferred only/ }).click();
});

await step('within a heading the starred come first', async () => {
  await staff.getByLabel('Listed under').first().selectOption('ENT');
  const names = await staff.getByTestId('phone-book-entry').evaluateAll((cards) =>
    cards.map((c) => ({ name: c.querySelector('h3').innerText.replace(/Preferred/, '').trim(), starred: /Preferred/.test(c.querySelector('h3').textContent) })));
  const firstUnstarred = names.findIndex((n) => !n.starred);
  if (firstUnstarred !== -1 && names.slice(firstUnstarred).some((n) => n.starred)) throw new Error(JSON.stringify(names));
  await staff.getByLabel('Listed under').first().selectOption('');
});

await step('one entry can have several offices, each with its own phone and fax', async () => {
  await search(staff, 'De La Torre hepatology');
  const hepatology = card(staff, /^Dr\. Andrew De La Torre$/);
  await hepatology.waitFor({ timeout: 5000 });
  if ((await hepatology.getByTestId('phone-book-office').count()) !== 3) throw new Error('not three offices');
  await search(staff, '169 York Street');
  await card(staff, /^Dr\. Andrew De La Torre$/).waitFor({ timeout: 5000 });
});

await step('a group lists its doctors one to a line, and any one of them finds it', async () => {
  await search(staff, 'Benoff');
  const group = card(staff, /Gomez Marquez/);
  await group.waitFor({ timeout: 5000 });
  const lines = await group.getByTestId('phone-book-name').locator('span.block').allInnerTexts();
  if (lines.length < 2 || !lines.some((l) => /Gomez Marquez/.test(l)) || !lines.some((l) => /Benoff/.test(l)))
    throw new Error(`the doctors are not one to a line: ${JSON.stringify(lines)}`);
  // A specialty that belongs to the whole group is a note, not stuck to the last doctor.
  await search(staff, 'Mulkay Cohen');
  const shared = card(staff, /Angel Mulkay/);
  await shared.getByText('Interventional Cardiology', { exact: true }).waitFor({ timeout: 5000 });
});

await step('an office is under Location, not Where', async () => {
  await search(staff, 'Quest');
  const quest = card(staff, 'Quest Diagnostic Lab');
  await quest.waitFor({ timeout: 5000 });
  const labels = await staff.getByTestId('phone-book-entry').first().locator('dt').allInnerTexts();
  if (labels.some((l) => /where/i.test(l))) throw new Error(`still says Where: ${labels.join(', ')}`);
  await search(staff, 'Verghese');
  await card(staff, /Verghese/).getByText('Location', { exact: true }).waitFor({ timeout: 5000 });
});

await step('no em dashes anywhere on the phone book', async () => {
  await search(staff, '');
  const text = await staff.locator('body').innerText();
  if (/\u2014/.test(text)) throw new Error('an em dash is on the page');
});

await step('anybody adds an entry with two offices and a star, and fixes it', async () => {
  await search(staff, '');
  await staff.getByRole('button', { name: '+ Add an entry' }).click();
  let dialog = staff.getByRole('dialog', { name: 'New phone book entry' });
  await dialog.getByLabel('Name', { exact: true }).fill('Phone-book suite sleep lab');
  await dialog.getByLabel('Listed under').fill('Sleep studies');
  await dialog.getByLabel(/Preferred/).check();
  const first = dialog.getByTestId('phone-book-office-form').nth(0);
  await first.getByLabel('Office name').fill('Hoboken');
  await first.getByLabel('Address').fill('1 Main St, Hoboken, NJ');
  await first.getByLabel('Phone').fill('(201) 555-0142, (201) 555-0143');
  await first.getByLabel('Fax').fill('(201) 555-0144');
  await dialog.getByRole('button', { name: '+ Add another address' }).click();
  const second = dialog.getByTestId('phone-book-office-form').nth(1);
  await second.getByLabel('Address').fill('9 Broad St, Newark, NJ');
  await second.getByLabel('Phone').fill('(973) 555-0100');
  await dialog.getByLabel('Notes').fill('Fax the order first.');
  await dialog.getByRole('button', { name: 'Add entry' }).click();
  await search(staff, 'phone-book suite');
  let entry = card(staff, /Phone-book suite sleep lab/);
  await entry.getByText('Fax the order first.').waitFor({ timeout: 10000 });
  if ((await entry.getByTestId('phone-book-office').count()) !== 2) throw new Error('not two offices');
  await entry.getByText('Preferred', { exact: true }).waitFor();
  const hrefs = await entry.locator('a[href^="tel:"]').evaluateAll((l) => l.map((a) => a.getAttribute('href')));
  if (hrefs.length !== 3) throw new Error(`call links: ${JSON.stringify(hrefs)}`);

  await entry.getByRole('button', { name: /^Edit/ }).click();
  dialog = staff.getByRole('dialog', { name: /Change Phone-book suite sleep lab/ });
  await dialog.getByTestId('phone-book-office-form').nth(1).getByRole('button', { name: 'Remove this office' }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  entry = card(staff, /Phone-book suite sleep lab/);
  await staff.waitForFunction(() => document.querySelectorAll('[data-testid=phone-book-office]').length === 1);
});

await step('only a manager removes an entry', async () => {
  const entry = card(staff, /Phone-book suite sleep lab/);
  await entry.getByRole('button', { name: /^Edit/ }).click();
  const dialog = staff.getByRole('dialog', { name: /Change Phone-book suite sleep lab/ });
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

await step('a heading prints as a patient-ready list of everybody in it, starred first; the staff copy adds fax numbers and notes', async () => {
  await staff.goto(`${BASE}/phone-book?category=Cardiology`, { waitUntil: 'networkidle' });
  await staff.getByTestId('phone-book-entry').first().waitFor({ timeout: 10000 });
  const onScreen = await staff.getByTestId('phone-book-entry').count();
  await staff.getByRole('link', { name: 'Print' }).click();
  await staff.getByTestId('print-title').waitFor({ timeout: 10000 });
  if (!/Cardiology/.test(await staff.getByTestId('print-title').innerText())) throw new Error('title');
  const printed = await staff.getByTestId('print-entry').count();
  if (printed !== onScreen) throw new Error(`${printed} printed, ${onScreen} on screen`);
  if ((await staff.getByTestId('print-category').count()) !== 1) throw new Error('more than one heading');
  // What was searched for is not on the paper, the star is explained on a line of its own,
  // and the starred are a block above the rest.
  await staff.goto(`${BASE}/phone-book/print?q=pulm`, { waitUntil: 'networkidle' });
  await staff.getByTestId('print-title').waitFor({ timeout: 10000 });
  if (/pulm/i.test(await staff.getByTestId('print-title').innerText())) throw new Error('the search words are in the title');
  if (/\u2014/.test(await staff.locator('body').innerText())) throw new Error('an em dash on the printout');
  const legend = staff.locator('p', { hasText: 'marks the places we recommend first' });
  if (await legend.filter({ hasText: 'Please call the office' }).count()) throw new Error('the star is explained on the same line');
  await legend.first().waitFor({ timeout: 5000 });
  const blocks = await staff.locator('[data-testid=print-category] .entries').evaluateAll((els) =>
    els.map((e) => [...e.querySelectorAll('[data-testid=print-entry]')].map((a) => /★/.test(a.querySelector('h3').textContent))));
  if (!(blocks[0].length > 0 && blocks[0].every(Boolean) && blocks.slice(1).every((b) => b.every((x) => !x))))
    throw new Error(`starred are not a block at the top: ${JSON.stringify(blocks)}`);
  await staff.goto(`${BASE}/phone-book?category=Cardiology`, { waitUntil: 'networkidle' });
  await staff.getByRole('link', { name: 'Print' }).click();
  await staff.getByTestId('print-title').waitFor({ timeout: 10000 });
  // Handed to patients: names, addresses and phone numbers, with nothing of the staff's.
  await staff.getByTestId('print-patient-copy').waitFor();
  const paper = await staff.getByTestId('print-patient-copy').innerText();
  if (/\bFax\b/i.test(paper)) throw new Error('a fax number is on the patient copy');
  if (/HNNJ|HNJH|NPI|Does not accept/i.test(paper)) throw new Error('staff notes are on the patient copy');
  if (!/Please call the office/.test(paper)) throw new Error('no line telling patients to call');
  if (!/Phone \(?\d{3}/.test(paper)) throw new Error('no phone numbers');
  const size = await staff.getByTestId('print-entry').first().locator('h3').evaluate((h) => getComputedStyle(h).fontSize);
  // The staff copy has them, and says it is not for patients.
  await staff.getByLabel(/Staff copy/).check();
  await staff.getByTestId('print-staff-copy').waitFor();
  const inside = await staff.getByTestId('print-staff-copy').innerText();
  if (!/Fax/.test(inside) || !/TAKES HNNJ FOR STRESS TEST/.test(inside)) throw new Error('the staff copy lacks fax numbers or notes');
  if (!/not for patients/i.test(inside)) throw new Error('the staff copy does not say so');
  await staff.getByLabel(/Staff copy/).uncheck();
  await staff.getByTestId('print-patient-copy').waitFor();
  if (Number.parseFloat(size) < 16) throw new Error(`names print at ${size}`);
  // On paper the toolbar goes and no menu is in the way.
  await staff.emulateMedia({ media: 'print' });
  if (await staff.getByRole('button', { name: 'Print' }).isVisible()) throw new Error('Print shows on paper');
  if (await staff.getByRole('navigation').count()) throw new Error('a menu is on the page');
  await staff.emulateMedia({ media: 'screen' });
  const pdf = await staff.pdf({ path: `${OUT}/phone-book-cardiology.pdf`, format: 'Letter', preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (pages < 1 || pages > 2) throw new Error(`Cardiology prints on ${pages} pages`);
  await staff.getByRole('link', { name: /Back to the phone book/ }).click();
  await staff.getByLabel('Listed under').first().waitFor();
  if ((await staff.getByLabel('Listed under').first().inputValue()) !== 'Cardiology') throw new Error('back lost the heading');
});

await step('printing everything is a short run of pages, headings running on; the starred alone prints together', async () => {
  await staff.goto(`${BASE}/phone-book/print`, { waitUntil: 'networkidle' });
  await staff.getByTestId('print-entry').first().waitFor({ timeout: 10000 });
  if ((await staff.getByTestId('print-category').count()) < 40) throw new Error('headings missing');
  const book = await staff.pdf({ format: 'Letter', preferCSSPageSize: true });
  const bookPages = (book.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (bookPages > 30) throw new Error(`the whole book prints on ${bookPages} pages`);
  await staff.goto(`${BASE}/phone-book/print?starred=1`, { waitUntil: 'networkidle' });
  await staff.getByTestId('print-entry').first().waitFor({ timeout: 10000 });
  const entries = await staff.getByTestId('print-entry').count();
  const stars = await staff.getByTestId('print-entry').filter({ hasText: '★' }).count();
  if (entries !== stars || entries < 20) throw new Error(`${entries} printed, ${stars} starred`);
});

await step('the form asks for places, not patients, and there is no file upload', async () => {
  await staff.goto(`${BASE}/phone-book`, { waitUntil: 'networkidle' });
  await staff.getByRole('button', { name: '+ Add an entry' }).click();
  await staff.getByText('About the place only - never a patient’s name or details.').waitFor();
  if ((await staff.locator('input[type=file]').count()) !== 0) throw new Error('a file input is on the page');
  await staff.getByRole('button', { name: 'Cancel' }).click();
});

await step('it is also on Home’s Quick card and Resources', async () => {
  await staff.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await staff.getByTestId('quick-actions').getByRole('link', { name: 'Phone book' }).waitFor({ timeout: 10000 });
  await staff.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  await staff.getByTestId('reference-section').getByRole('link', { name: /Phone book/ }).waitFor({ timeout: 10000 });
});

await step('on a phone it is a tab on the bottom bar and fits without scrolling sideways', async () => {
  const phone = await signIn('manager@domihealthcare.com', { width: 390, height: 800 });
  await phone.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Phone book' }).click();
  await phone.getByTestId('phone-book-entry').first().waitFor({ timeout: 10000 });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (wide) throw new Error('the page scrolls sideways');
  const focused = await phone.evaluate(() => document.activeElement?.id);
  if (focused === 'phone-book-search') throw new Error('the keyboard would cover the list');
  await phone.context().close();
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL PHONE BOOK CHECKS PASSED');
