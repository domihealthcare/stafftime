import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { goToManage, unlockPay } from './nav.mjs';

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
 * The practice's guides and invoices (October 2026, Dominguez): the Front
 * Desk Cheat Sheet, the Domi Playbook and the inpatient note templates as
 * searchable guides with scripts to fill in and copy, and an invoice maker
 * that keeps a copy of each invoice but never a patient's details.
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
  await unlockPay(page);
  return page;
}

const call = (page, path, init = {}) =>
  page.evaluate(
    async ([path, init]) => {
      const response = await fetch(`/api${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    [path, init],
  );

async function pdfText(path) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  return pages.join(' ').replace(/\s+/g, ' ');
}

const staff = await signIn('frontdesk@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const requests = [];
staff.on('request', (request) => requests.push(`${request.url()} ${request.postData() ?? ''}`));
manager.on('request', (request) => requests.push(`${request.url()} ${request.postData() ?? ''}`));

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const yearsAgo = (years) => `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;

// ------------------------------------------------------------ front desk

await step('the front desk guide is on Home and Resources, loaded from the cheat sheet', async () => {
  await staff.getByTestId('quick-actions').getByRole('link', { name: 'Front desk guide' }).click();
  await staff.getByRole('heading', { name: 'Front desk guide' }).waitFor({ timeout: 10000 });
  const titles = await staff.getByTestId('guide-section').locator('h3').allInnerTexts();
  for (const title of ['New patients', 'Action needed', 'Go straight to the ED', 'Controlled medications', 'Which tab a document goes in'])
    if (!titles.includes(title)) throw new Error(`no "${title}" section`);
  await staff.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  await staff.getByTestId('section-Front Desk').getByTestId('tool-front-desk').waitFor({ timeout: 10000 });
  if ((await staff.getByTestId('tool-results-playbook').count()) > 0)
    throw new Error('staff see the results playbook');
});

await step('searching finds a rule in any words, and a heading narrows the page', async () => {
  await staff.goto(`${BASE}/front-desk`, { waitUntil: 'networkidle' });
  await staff.getByLabel('Search the guide').fill('holter friday');
  await staff.getByText(/1 section found/).waitFor({ timeout: 5000 });
  const title = await staff.getByTestId('guide-section').locator('h3').innerText();
  if (!/Holters/.test(title)) throw new Error(`found "${title}"`);
  await staff.getByLabel('Search the guide').fill('');
  await staff.getByRole('group', { name: 'Headings' }).getByRole('button', { name: 'Payments' }).click();
  const shown = await staff.getByTestId('guide-section').locator('h3').allInnerTexts();
  if (shown.some((t) => /New patients/.test(t)) || !shown.some((t) => /copays/i.test(t)))
    throw new Error(`Payments shows: ${shown.join(', ')}`);
  if (!staff.url().includes('group=Payments')) throw new Error('the heading is not in the address');
});

await step('a message script is filled in and copied, and what is typed is never sent', async () => {
  await staff.goto(`${BASE}/front-desk?q=urgent%20appointment%20request`, { waitUntil: 'networkidle' });
  const block = staff.getByTestId('copy-block').first();
  await block.getByLabel('Symptoms').fill('cough-fake-zebra');
  await block.getByLabel('Onset date').fill('10/16');
  await block.getByRole('button', { name: 'Copy' }).click();
  await block.getByText('Copied.').waitFor({ timeout: 5000 });
  const copied = await staff.evaluate(() => navigator.clipboard.readText());
  if (copied !== 'Pt called, c/o: cough-fake-zebra. Onset: 10/16. Patient is requesting urgent appt, please advise. TY')
    throw new Error(`copied: "${copied}"`);
  await staff.waitForTimeout(500);
  if (requests.some((r) => r.includes('cough-fake-zebra'))) throw new Error('the script was sent');
});

await step('a blank left empty stays visible as ____', async () => {
  await staff.goto(`${BASE}/front-desk?q=returned%20call`, { waitUntil: 'networkidle' });
  const text = await staff.getByTestId('copy-text').first().innerText();
  if (!text.startsWith('GM VM ____.')) throw new Error(`"${text}"`);
});

await step('the pill count works out what to dispense', async () => {
  await staff.goto(`${BASE}/front-desk?q=entering%20a%20medication`, { waitUntil: 'networkidle' });
  const tool = staff.getByTestId('guide-tool');
  await tool.getByLabel('Pills each time').fill('2');
  await tool.getByLabel('How often').selectOption('BID');
  await tool.getByLabel('Days supply').fill('90');
  let answer = await tool.getByTestId('tool-answer').innerText();
  if (!/Dispense 360/.test(answer)) throw new Error(answer);
  await tool.getByLabel('Pills each time').fill('1');
  await tool.getByLabel('How often').selectOption('WEEKLY');
  answer = await tool.getByTestId('tool-answer').innerText();
  if (!/Dispense 12\b/.test(answer)) throw new Error(`weekly: ${answer}`);
});

await step('new patient or follow up goes by 3 years to the day', async () => {
  await staff.goto(`${BASE}/front-desk?q=new%20patient%20or%20follow%20up`, { waitUntil: 'networkidle' });
  const tool = staff.getByTestId('guide-tool');
  await tool.getByLabel('Last seen in the office').fill(yearsAgo(1));
  if (!/follow up/.test(await tool.getByTestId('tool-answer').innerText())) throw new Error('1 year is not a follow up');
  await tool.getByLabel('Last seen in the office').fill(yearsAgo(3));
  if (!/new patient/.test(await tool.getByTestId('tool-answer').innerText())) throw new Error('3 years is not new');
});

await step('the guide draws its markup: amber for action, red warnings, tables', async () => {
  await staff.goto(`${BASE}/front-desk?group=Booking`, { waitUntil: 'networkidle' });
  await staff.getByTestId('action').filter({ hasText: 'no patients under 18' }).waitFor({ timeout: 5000 });
  await staff.getByRole('note').filter({ hasText: 'last hour' }).first().waitFor();
  await staff.goto(`${BASE}/front-desk?group=Abbreviations`, { waitUntil: 'networkidle' });
  await staff.getByRole('cell', { name: 'Twice a day', exact: true }).first().waitFor({ timeout: 5000 });
  if ((await staff.locator('input[type=file]').count()) > 0) throw new Error('a file input');
});

await step('staff cannot change a guide', async () => {
  if ((await staff.getByRole('button', { name: '+ Add a section' }).count()) > 0) throw new Error('staff see Add');
  const tried = await call(staff, '/guides/front-desk/sections', {
    method: 'POST',
    body: JSON.stringify({ group: 'X', title: 'X', body: 'X' }),
  });
  if (tried.status !== 403) throw new Error(`answered ${tried.status}`);
});

// ------------------------------------------------- the provider guides

await step('the results playbook and inpatient notes are not for staff', async () => {
  for (const slug of ['results-playbook', 'inpatient-notes']) {
    const tried = await call(staff, `/guides/${slug}`);
    if (tried.status !== 403) throw new Error(`${slug} answered ${tried.status}`);
  }
  await staff.goto(`${BASE}/results-playbook`, { waitUntil: 'networkidle' });
  await staff.getByText(/not set up for your job role/).first().waitFor({ timeout: 10000 });
  if ((await staff.getByTestId('guide-section').count()) > 0) throw new Error('sections shown');
});

await step('a manager reads the playbook, and a search finds a test', async () => {
  await manager.getByTestId('quick-actions').getByRole('link', { name: 'Results playbook' }).click();
  await manager.getByRole('heading', { name: 'Results playbook' }).waitFor({ timeout: 10000 });
  await manager.getByLabel('Search the guide').fill('potassium');
  const text = await manager.getByTestId('guide-section').first().innerText();
  if (!/Under 3.2 or over 5.5/.test(text)) throw new Error(text.slice(0, 200));
});

await step('the inpatient notes fill in and copy, and the code helper reads the table', async () => {
  await manager.goto(`${BASE}/inpatient-notes`, { waitUntil: 'networkidle' });
  const covering = manager.getByTestId('guide-section').filter({ hasText: 'Covering for another provider' });
  await covering.getByLabel('Covering for', { exact: true }).fill('Badia');
  await covering.getByLabel('First day').fill('1/22/27');
  await covering.getByLabel('Last day').fill('1/23/27');
  await covering.getByLabel('Resuming provider').fill('Badia');
  await covering.getByLabel('Resumes on').fill('1/24/27');
  const text = await covering.getByTestId('copy-text').innerText();
  if (text !== 'COVERING FOR DR. Badia ON DOS 1/22/27 - 1/23/27, DR. Badia WILL RESUME CARE ON 1/24/27.')
    throw new Error(text);
  const tool = manager.getByTestId('guide-tool');
  await tool.getByLabel('Visit').selectOption('subsequent');
  await tool.getByLabel('Total time (minutes)').fill('30');
  if (!/99232/.test(await tool.getByTestId('tool-answer').innerText())) throw new Error('30 subsequent is not 99232');
  await tool.getByLabel('Visit').selectOption('initial');
  await tool.getByLabel('Total time (minutes)').fill('20');
  if (!/below 99221/.test(await tool.getByTestId('tool-answer').innerText())) throw new Error('20 initial');
});

await step('a manager adds, edits, moves and removes a section', async () => {
  await manager.goto(`${BASE}/front-desk?group=Payments`, { waitUntil: 'networkidle' });
  await manager.getByRole('button', { name: '+ Add a section' }).click();
  let dialog = manager.getByTestId('guide-editor');
  await dialog.getByLabel('Heading it goes under').fill('Payments');
  await dialog.getByLabel('Title').fill('Test section');
  await dialog.getByLabel('What it says').fill('- **Bold** and ==amber==\n| A | B |\n| 1 | 2 |');
  await dialog.getByRole('button', { name: 'Preview' }).click();
  await dialog.getByTestId('action').filter({ hasText: 'amber' }).waitFor({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Save' }).click();
  const added = manager.getByTestId('guide-section').filter({ hasText: 'Test section' });
  await added.waitFor({ timeout: 10000 });
  const titles = await manager.getByTestId('guide-section').locator('h3').allInnerTexts();
  if (titles[titles.length - 1] !== 'Test section') throw new Error(`order: ${titles.join(', ')}`);
  await added.getByRole('button', { name: 'Move Test section up' }).click();
  await manager.waitForTimeout(600);
  const moved = await manager.getByTestId('guide-section').locator('h3').allInnerTexts();
  if (moved.indexOf('Test section') !== titles.length - 2) throw new Error(`after moving: ${moved.join(', ')}`);
  await added.getByRole('button', { name: 'Edit' }).click();
  dialog = manager.getByTestId('guide-editor');
  await dialog.getByLabel('Title').fill('Test section, changed');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const changed = manager.getByTestId('guide-section').filter({ hasText: 'Test section, changed' });
  await changed.waitFor({ timeout: 10000 });
  await changed.getByRole('button', { name: 'Remove' }).click();
  await manager.getByRole('alertdialog').getByRole('button', { name: 'Yes, remove' }).click();
  await changed.waitFor({ state: 'detached', timeout: 10000 });
});

await step('a manager chooses who uses a guide on Resources, and it takes effect', async () => {
  await manager.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  const card = manager.getByTestId('section-Front Desk').getByTestId('tool-front-desk');
  await card.getByText('For: Front Desk').waitFor({ timeout: 10000 });
  // Narrowed to Provider: the front desk lose it.
  await card.getByRole('button', { name: /Who can use Front desk guide/ }).click();
  let dialog = manager.getByTestId('tool-access-editor');
  await dialog.getByLabel('Front Desk', { exact: true }).uncheck();
  await dialog.getByLabel('Provider', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await manager
    .getByTestId('section-Provider')
    .getByTestId('tool-front-desk')
    .getByText('For: Provider')
    .waitFor({ timeout: 10000 });
  const refused = await call(staff, '/guides/front-desk');
  if (refused.status !== 403) throw new Error(`the front desk still read it: ${refused.status}`);
  await staff.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  if (await staff.getByTestId('quick-actions').getByRole('link', { name: 'Front desk guide' }).count())
    throw new Error('still on Home');
  // Several job roles at once, then back as it was.
  const moved = manager.getByTestId('section-Provider').getByTestId('tool-front-desk');
  await moved.getByRole('button', { name: /Who can use Front desk guide/ }).click();
  dialog = manager.getByTestId('tool-access-editor');
  await dialog.getByLabel('Front Desk', { exact: true }).check();
  await dialog.getByLabel('Medical Assistant', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await manager.getByTestId('section-Medical Assistant').getByTestId('tool-front-desk').waitFor({ timeout: 10000 });
  await manager.getByTestId('section-Front Desk').getByTestId('tool-front-desk').waitFor({ timeout: 10000 });
  const back = await call(manager, '/tool-access/front-desk', {
    method: 'PUT',
    body: JSON.stringify({
      everyone: false,
      jobRoleIds: (await call(manager, '/resources')).body.sections
        .filter((s) => s.jobRole?.name === 'Front Desk')
        .map((s) => s.jobRole.id),
    }),
  });
  if (back.status >= 300) throw new Error(`putting it back answered ${back.status}`);
  if ((await call(staff, '/guides/front-desk')).status !== 200) throw new Error('the front desk did not get it back');
  const tried = await call(staff, '/tool-access/front-desk', {
    method: 'PUT',
    body: JSON.stringify({ everyone: true, jobRoleIds: [] }),
  });
  if (tried.status !== 403) throw new Error(`staff changed it: ${tried.status}`);
});

// ------------------------------------------------------------- invoices

await step('invoices are only for the people on its list (the demo manager; not staff, not an admin off it), under Manage, Finances', async () => {
  const tried = await call(staff, '/invoices');
  if (tried.status !== 403) throw new Error(`staff answered ${tried.status}`);
  const admin = await signIn('admin@domihealthcare.com');
  for (const path of ['/invoices', '/invoices/payees', '/invoices/vendors']) {
    const asAdmin = await call(admin, path);
    if (asAdmin.status !== 403) throw new Error(`an admin read ${path}: ${asAdmin.status}`);
  }
  await admin.goto(`${BASE}/invoices`, { waitUntil: 'networkidle' });
  await admin.getByText('Invoices are only for the people chosen to see them.').waitFor({ timeout: 10000 });
  await admin.context().close();
  await goToManage(manager, 'Invoices');
  await manager.getByRole('heading', { name: 'Invoices' }).waitFor({ timeout: 10000 });
});

await step('the people on the list keep it: an admin added sees invoices, taken off does not, and nobody takes themselves off', async () => {
  await manager.getByRole('button', { name: 'Who sees invoices' }).click();
  const dialog = manager.getByTestId('invoice-access');
  await dialog.getByText('(you)').waitFor({ timeout: 10000 });
  if (await dialog.getByRole('button', { name: /Stop Morgan .* seeing invoices/ }).count())
    throw new Error('the manager was offered taking themselves off');
  const adminId = (await call(manager, '/invoices/access')).body.others.find((p) => p.firstName === 'Ada').id;
  await dialog.getByLabel('Add somebody').selectOption(adminId);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('button', { name: /Stop Ada .* seeing invoices/ }).waitFor({ timeout: 10000 });
  const admin = await signIn('admin@domihealthcare.com');
  const asAdmin = await call(admin, '/invoices');
  if (asAdmin.status !== 200) throw new Error(`the admin added could not read invoices: ${asAdmin.status}`);
  const ownId = (await call(admin, '/invoices/access')).body.holders.find((p) => p.firstName === 'Ada').id;
  const selfRemove = await call(admin, `/invoices/access/${ownId}`, { method: 'DELETE' });
  if (selfRemove.status !== 400) throw new Error(`somebody took themselves off: ${selfRemove.status}`);
  await dialog.getByRole('button', { name: /Stop Ada .* seeing invoices/ }).click();
  await manager.getByRole('button', { name: 'Yes, stop' }).click();
  await dialog.getByRole('button', { name: /Stop Ada .* seeing invoices/ }).waitFor({ state: 'detached', timeout: 10000 });
  const after = await call(admin, '/invoices');
  if (after.status !== 403) throw new Error(`the admin taken off still read invoices: ${after.status}`);
  await admin.context().close();
  await dialog.getByRole('button', { name: 'Close' }).click();
});

let vendorNumber;
await step('a vendor invoice is saved and downloaded as the template had it', async () => {
  await manager.getByRole('button', { name: '+ New invoice' }).click();
  const dialog = manager.getByTestId('invoice-editor');
  await dialog.getByLabel('Name').fill('Acme Testlabs');
  await dialog.getByLabel('Address and email').fill('1 Main St\nNorth Bergen, NJ 07047');
  await dialog.getByLabel('Line 1: description').fill('Lab space rental, October');
  await dialog.getByLabel('Line 1: amount').fill('300');
  await dialog.getByRole('button', { name: '+ Add a line' }).click();
  await dialog.getByLabel('Line 2: description').fill('Supplies');
  await dialog.getByLabel('Line 2: amount').fill('150.50');
  if (!/Total \$450\.50/.test(await dialog.getByTestId('invoice-total').innerText())) throw new Error('total');
  const [download] = await Promise.all([
    manager.waitForEvent('download', { timeout: 20000 }),
    dialog.getByRole('button', { name: 'Save and download PDF' }).click(),
  ]);
  const name = download.suggestedFilename();
  if (!/^Invoice \d{3,}\.pdf$/.test(name)) throw new Error(`file ${name}`);
  vendorNumber = name.match(/\d+/)[0];
  const path = `${OUT}/vendor-${name}`;
  await download.saveAs(path);
  const text = await pdfText(path);
  for (const piece of ['INVOICE', 'Domi Healthcare LLC', 'BILL TO', 'Acme Testlabs', 'North Bergen, NJ 07047', `#${vendorNumber}`, 'Lab space rental, October', '$300.00', '$150.50', '$450.50', 'Balance due', 'DOMI HEALTHCARE LLC', 'THANK YOU FOR YOUR BUSINESS!'])
    if (!text.includes(piece)) throw new Error(`the PDF lacks "${piece}"`);
  await manager.getByTestId('invoice-row').filter({ hasText: 'Acme Testlabs' }).waitFor({ timeout: 10000 });
});

await step("a patient's invoice prints their details once and keeps them blanked out", async () => {
  await manager.getByRole('button', { name: '+ New invoice' }).click();
  const dialog = manager.getByTestId('invoice-editor');
  await dialog.getByLabel('A patient').check();
  await dialog.getByTestId('patient-note').waitFor();
  if ((await dialog.getByRole('button', { name: 'Save', exact: true }).count()) > 0)
    throw new Error('a patient invoice can be saved without its PDF');
  await dialog.getByLabel("Patient's name").fill('Jane Testpatient');
  await dialog.getByLabel('Date of birth (optional)').fill('1994-01-20');
  await dialog.getByLabel('Address').fill('99 Fakepatient Ave');
  await dialog.getByLabel('Line 1: description').fill('USCIS I-693 physical, paid in full');
  await dialog.getByLabel('Line 1: amount').fill('450');
  await dialog.getByLabel('Paid').check();
  const [download] = await Promise.all([
    manager.waitForEvent('download', { timeout: 20000 }),
    dialog.getByRole('button', { name: 'Save and download PDF' }).click(),
  ]);
  const first = `${OUT}/patient-${download.suggestedFilename()}`;
  await download.saveAs(first);
  const text = await pdfText(first);
  for (const piece of ['Jane Testpatient', 'Date of birth: 01/20/1994', '99 Fakepatient Ave', '$450.00', 'Balance PAID'])
    if (!text.includes(piece)) throw new Error(`the first PDF lacks "${piece}"`);
  const row = manager.getByTestId('invoice-row').filter({ hasText: 'Patient (details not kept)' }).first();
  await row.waitFor({ timeout: 10000 });
  const [again] = await Promise.all([
    manager.waitForEvent('download', { timeout: 20000 }),
    row.getByRole('button', { name: 'Download' }).click(),
  ]);
  const copy = `${OUT}/patient-copy-${again.suggestedFilename()}`;
  await again.saveAs(copy);
  const copyText = await pdfText(copy);
  if (copyText.includes('Testpatient') || copyText.includes('1994')) throw new Error('the copy names the patient');
  if (!copyText.includes("A patient's details are not kept in Domi Staff.")) throw new Error('the copy does not say why');
  if (requests.some((r) => /Testpatient|Fakepatient|1994-01-20/.test(r))) throw new Error("the patient's details were sent");
});

await step("the server refuses a patient's name, and a vendor invoice with no name", async () => {
  const body = {
    issuedOn: today,
    dueOn: null,
    billTo: 'PATIENT',
    billToName: 'Somebody',
    status: 'DUE',
    paidOn: null,
    lines: [{ description: 'x', amountCents: 100 }],
  };
  let tried = await call(manager, '/invoices', { method: 'POST', body: JSON.stringify(body) });
  if (tried.status !== 400) throw new Error(`patient name answered ${tried.status}`);
  tried = await call(manager, '/invoices', {
    method: 'POST',
    body: JSON.stringify({ ...body, billTo: 'VENDOR', billToName: '' }),
  });
  if (tried.status !== 400) throw new Error(`no vendor answered ${tried.status}`);
});

await step('a pay-to option is saved, picked, printed, and kept on the invoice when changed', async () => {
  await manager.getByRole('button', { name: '+ New invoice' }).click();
  const dialog = manager.getByTestId('invoice-editor');
  // The practice is the default.
  if (!/Domi Healthcare LLC/.test(await dialog.getByTestId('pay-to-preview').innerText()))
    throw new Error('the practice is not the default pay-to');
  await dialog.getByRole('button', { name: '+ New pay-to' }).click();
  const form = dialog.getByTestId('payee-form');
  await form.getByLabel('Name on the invoice').fill('Testprovider Paydirect, MD');
  await form.getByLabel('Address, email and phone').fill('5 Testprovider Way\nHoboken, NJ 07030');
  await form.getByRole('button', { name: 'Save this pay-to' }).click();
  await form.waitFor({ state: 'detached', timeout: 10000 });
  if (!/Testprovider Paydirect/.test(await dialog.getByLabel('Pay to').locator('option:checked').innerText()))
    throw new Error('the new pay-to was not picked');
  await dialog.getByLabel('Name', { exact: true }).fill('Payto Testhospital');
  await dialog.getByLabel('Line 1: description').fill('Inpatient consults, October');
  await dialog.getByLabel('Line 1: amount').fill('800');
  const [download] = await Promise.all([
    manager.waitForEvent('download', { timeout: 20000 }),
    dialog.getByRole('button', { name: 'Save and download PDF' }).click(),
  ]);
  const path = `${OUT}/payto-${download.suggestedFilename()}`;
  await download.saveAs(path);
  const text = await pdfText(path);
  for (const piece of ['Testprovider Paydirect, MD', '5 Testprovider Way', 'TESTPROVIDER PAYDIRECT, MD', 'Payto Testhospital'])
    if (!text.includes(piece)) throw new Error(`the PDF lacks "${piece}"`);
  if (text.includes('DOMI HEALTHCARE LLC')) throw new Error('checks still payable to the practice');
  const row = manager.getByTestId('invoice-row').filter({ hasText: 'Payto Testhospital' });
  await row.getByTestId('invoice-pay-to').waitFor({ timeout: 10000 });

  // Changing the option leaves the invoice as it went out.
  await manager.getByRole('button', { name: 'Pay-to options' }).click();
  const options = manager.getByTestId('payees-manager');
  const saved = options.getByTestId('payee-row').filter({ hasText: 'Testprovider Paydirect' });
  await saved.getByRole('button', { name: 'Edit' }).click();
  await options.getByLabel('Address, email and phone').fill('9 Moved Testprovider Rd');
  await options.getByRole('button', { name: 'Save changes' }).click();
  await options.getByText('9 Moved Testprovider Rd').waitFor({ timeout: 10000 });
  await options.getByRole('button', { name: 'Done' }).click();
  const [again] = await Promise.all([
    manager.waitForEvent('download', { timeout: 20000 }),
    row.getByRole('button', { name: 'Download' }).click(),
  ]);
  const copy = `${OUT}/payto-copy-${again.suggestedFilename()}`;
  await again.saveAs(copy);
  const copyText = await pdfText(copy);
  if (!copyText.includes('5 Testprovider Way') || copyText.includes('Moved'))
    throw new Error('the copy changed with the option');

  // Tidy.
  const list = (await call(manager, '/invoices')).body.invoices;
  for (const invoice of list.filter((i) => i.billToName === 'Payto Testhospital'))
    await call(manager, `/invoices/${invoice.id}`, { method: 'DELETE' });
  for (const payee of (await call(manager, '/invoices/payees')).body.filter((p) => p.name.startsWith('Testprovider')))
    await call(manager, `/invoices/payees/${payee.id}`, { method: 'DELETE' });
  const tried = await call(staff, '/invoices/payees');
  if (tried.status !== 403) throw new Error(`staff read the pay-to options: ${tried.status}`);
});

await step('a vendor is saved from the editor, picked next time, changed and removed', async () => {
  await manager.getByRole('button', { name: '+ New invoice' }).click();
  let dialog = manager.getByTestId('invoice-editor');
  await dialog.getByLabel('Name', { exact: true }).fill('Savedvendor Testco');
  await dialog.getByLabel('Address and email').fill('12 Vendor Rd\nbilling@testco.example');
  await dialog.getByRole('button', { name: 'Save this vendor for next time' }).click();
  await dialog.getByText('Saved for next time.').waitFor({ timeout: 10000 });
  await dialog.getByRole('button', { name: 'Save this vendor for next time' }).waitFor({ state: 'detached', timeout: 10000 });
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await manager.getByRole('button', { name: '+ New invoice' }).click();
  dialog = manager.getByTestId('invoice-editor');
  await dialog.getByLabel('Saved vendor').selectOption({ label: 'Savedvendor Testco' });
  if ((await dialog.getByLabel('Name', { exact: true }).inputValue()) !== 'Savedvendor Testco') throw new Error('name not filled');
  if (!(await dialog.getByLabel('Address and email').inputValue()).includes('billing@testco.example')) throw new Error('address not filled');
  // A changed address offers to update the saved one, not make a second.
  await dialog.getByLabel('Address and email').fill('14 Vendor Rd');
  await dialog.getByRole('button', { name: /Update the saved Savedvendor Testco/ }).waitFor();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await manager.getByRole('button', { name: 'Saved vendors' }).click();
  const list = manager.getByTestId('vendors-manager');
  const row = list.getByTestId('vendor-row').filter({ hasText: 'Savedvendor Testco' });
  await row.getByRole('button', { name: 'Edit' }).click();
  await list.getByLabel('Vendor address and email').fill('20 Moved Vendor Ave');
  await list.getByRole('button', { name: 'Save changes' }).click();
  await list.getByText('20 Moved Vendor Ave').waitFor({ timeout: 10000 });
  await row.getByRole('button', { name: 'Remove' }).click();
  await manager.getByRole('alertdialog').getByRole('button', { name: 'Yes, remove it' }).click();
  await row.waitFor({ state: 'detached', timeout: 10000 });
  await list.getByRole('button', { name: 'Done' }).click();

  const tried = await call(staff, '/invoices/vendors');
  if (tried.status !== 403) throw new Error(`staff read the saved vendors: ${tried.status}`);
  const empty = await call(manager, '/invoices/vendors', { method: 'POST', body: JSON.stringify({ name: ' ' }) });
  if (empty.status !== 400) throw new Error(`a nameless vendor answered ${empty.status}`);
});

await step('an invoice is marked paid, found by search, and removed', async () => {
  const row = manager.getByTestId('invoice-row').filter({ hasText: 'Acme Testlabs' });
  await row.getByRole('button', { name: 'Edit' }).click();
  const dialog = manager.getByTestId('invoice-editor');
  await dialog.getByLabel('Paid').check();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await row.getByText('Paid', { exact: true }).waitFor({ timeout: 10000 });
  await manager.getByLabel('Search the invoices').fill('acme');
  if ((await manager.getByTestId('invoice-row').count()) !== 1) throw new Error('search did not narrow');
  await row.getByRole('button', { name: 'Remove' }).click();
  await manager.getByRole('alertdialog').getByRole('button', { name: 'Yes, remove it' }).click();
  await row.waitFor({ state: 'detached', timeout: 10000 });
  await manager.getByLabel('Search the invoices').fill('');
  // Tidy: the patient invoice made above.
  const list = (await call(manager, '/invoices')).body.invoices;
  for (const invoice of list.filter((i) => i.billTo === 'PATIENT'))
    await call(manager, `/invoices/${invoice.id}`, { method: 'DELETE' });
});

await step('the guide and invoices fit a phone', async () => {
  const phone = await signIn('manager@domihealthcare.com', { width: 390, height: 844 });
  for (const path of ['/front-desk', '/inpatient-notes', '/invoices']) {
    await phone.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await phone.waitForTimeout(500);
    const wide = await phone.evaluate(() => document.documentElement.scrollWidth);
    if (wide > 392) throw new Error(`${path} is ${wide}px wide`);
  }
  await phone.screenshot({ path: `${OUT}/invoices-phone.png` });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL GUIDE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
