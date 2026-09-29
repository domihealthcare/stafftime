import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// The 99483 cognitive assessment (September 2026): a provider-only form that
// makes a PDF entirely in the browser. What matters most is what does NOT
// happen — the patient's details never reach the server and are never kept in
// the browser — so this suite watches every request and every kind of browser
// storage while a fake patient is entered. Fake data only, here and anywhere.
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

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
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

const menuItems = async (page, label) => {
  await page.getByRole('button', { name: label, exact: true }).click();
  const names = await page.getByRole('navigation').getByRole('link').allInnerTexts();
  await page.keyboard.press('Escape');
  return names.map((n) => n.trim());
};

/// Each page's text, as a PDF reader would find it — which only works if the
/// PDF holds real text rather than a picture of some.
async function pdfPages(path) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((item) => item.str).join(' ').replace(/\s+/g, ' '));
  }
  return pages;
}

// The fake patient. Nothing about them may ever appear in a request.
const PATIENT = 'Jane Testpatient';
const MRN = 'TEST-0001';
const HISTORIAN = 'John Testhistorian';
const SECRETS = [PATIENT, 'Testpatient', MRN, HISTORIAN, 'Testhistorian', 'oxybutynin-fake'];

// New Jersey's day, as the provider's device has it.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const daysBefore = (n) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

// Frankie works the front desk; for this suite they are also a Provider.
const ctx = await browser.newContext({
  viewport: { width: 1024, height: 1366 }, // an iPad, upright
  timezoneId: 'America/New_York',
  acceptDownloads: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(page, 'frontdesk@domihealthcare.com');

const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const admin = await adminCtx.newPage();
await signIn(admin, 'admin@domihealthcare.com');
const me = (await call(page, '/profile')).body;
const provider = (await call(admin, '/job-roles')).body.find((r) => r.name === 'Provider');

await step('somebody who is not a Provider has no such menu item, and the page says so', async () => {
  const team = await menuItems(page, 'Team');
  if (team.some((t) => /cognitive/i.test(t))) throw new Error(`Team menu: ${team.join(', ')}`);
  await page.goto(`${BASE}/clinical/99483`, { waitUntil: 'networkidle' });
  await page.getByText('This form is for providers.').waitFor({ timeout: 10000 });
  if ((await page.getByLabel(/Patient name/).count()) > 0) throw new Error('the form is shown');
});

await step('Provider starts with the clinical forms switched on, and nobody else', async () => {
  const roles = (await call(admin, '/job-roles')).body;
  const on = roles.filter((r) => r.usesClinicalForms).map((r) => r.name);
  if (on.join() !== 'Provider') throw new Error(`on for: ${on.join(', ')}`);
});

await step('in the Provider job role, it is under Team', async () => {
  const added = await call(admin, `/job-roles/${provider.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ employeeId: me.id }),
  });
  if (added.status >= 300) throw new Error(`adding answered ${added.status}`);
  const titled = await call(admin, `/employees/${me.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ postNominals: 'APN-C' }),
  });
  if (titled.status >= 300) throw new Error(`setting letters answered ${titled.status}`);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const team = await menuItems(page, 'Team');
  if (!team.includes('Cognitive assessment (99483)')) throw new Error(`Team menu: ${team.join(', ')}`);
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByRole('link', { name: 'Cognitive assessment (99483)' }).click();
  await page.getByTestId('cognitive-assessment').waitFor({ timeout: 15000 });
});

// From here on, every request the page makes is kept, to be searched for the
// fake patient's details at the end.
const requests = [];
page.on('request', (request) => {
  requests.push({ url: request.url(), body: request.postData() ?? '' });
});

const section = (key) => page.getByTestId(`section-${key}`);

await step('the provider’s name and letters are filled in from their staff record', async () => {
  const name = await section('visit').getByLabel(/Provider name/).inputValue();
  const letters = await section('visit').getByLabel(/Credentials/).inputValue();
  if (!name.trim()) throw new Error('no provider name');
  if (letters !== 'APN-C') throw new Error(`credentials: "${letters}"`);
  const dos = await section('visit').getByLabel(/Date of service/).inputValue();
  if (dos !== today) throw new Error(`date of service ${dos}, expected ${today}`);
});

await step('an empty form makes no PDF, and lists what is missing', async () => {
  let downloaded = false;
  page.once('download', () => (downloaded = true));
  await page.getByRole('button', { name: 'Make the PDF' }).click();
  const list = page.getByTestId('missing-checklist');
  await list.waitFor({ timeout: 5000 });
  await list.getByText('Enter the patient’s name.').waitFor({ timeout: 5000 });
  await list.getByText('Enter the collateral history.').waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  if (downloaded) throw new Error('a PDF was downloaded');
  // Shown under the field too, now they have tried.
  await section('visit').getByText('Enter the patient’s name.').waitFor({ timeout: 5000 });
});

await step('a missing item jumps to its field', async () => {
  await page
    .getByTestId('missing-checklist')
    .getByRole('button', { name: /Enter the MRN\./ })
    .click();
  const focused = await page.evaluate(() => document.activeElement?.id ?? '');
  if (!focused.endsWith('visit-mrn')) throw new Error(`focus went to "${focused}"`);
});

await step('there is no “no impairment” choice anywhere', async () => {
  const impairments = await section('billing').getByLabel(/Documented cognitive impairment/).locator('option').allInnerTexts();
  if (impairments.some((t) => /no\b.*impairment|normal|none/i.test(t))) throw new Error(impairments.join(', '));
  const staging = section('D').getByLabel(/Staging instrument/);
  for (const [instrument, none] of [['FAST', 'Stage 1'], ['CDR', '0'], ['GDS-Reisberg', 'Stage 1']]) {
    await staging.selectOption({ label: instrument });
    const stages = (await section('D').getByLabel(/Stage \/ score/).locator('option').allInnerTexts()).map((t) => t.trim());
    if (stages.some((t) => t === none || t.startsWith(`${none} `) || t.startsWith(`${none} —`)))
      throw new Error(`${instrument} offers ${none}: ${stages.join(', ')}`);
  }
  const acp = await section('I').getByRole('group', { name: /^Advance care planning/ }).getByRole('radio').allInnerTexts();
  const acpLabels = await section('I').getByRole('group', { name: /^Advance care planning/ }).innerText();
  if (!/Developed[\s\S]*Updated[\s\S]*Reviewed/.test(acpLabels) || acp.length !== 3)
    throw new Error(`advance care planning offers: ${acpLabels}`);
  if ((await section('I').getByText(/not addressed/i).count()) > 0) throw new Error('"not addressed" offered');
});

await step('a 99483 less than 180 days ago blocks the PDF', async () => {
  const last = daysBefore(100);
  await section('visit').getByLabel(/Date of service/).fill(today);
  await section('billing').getByLabel(/Date of the last 99483/).fill(last);
  await section('billing').getByRole('alert').getByText('Payable once per 180 days.').waitFor({ timeout: 5000 });
  await page.getByTestId('missing-checklist').getByText(/payable once per 180 days/).waitFor({ timeout: 5000 });
  // Exactly 180 days is allowed.
  await section('billing').getByLabel(/Date of the last 99483/).fill(daysBefore(180));
  await page.waitForTimeout(200);
  if ((await section('billing').getByRole('alert').getByText('Payable once per 180 days.').count()) > 0)
    throw new Error('180 days still blocked');
});

await step('ticking a safety concern asks for a safety plan; ticking None takes it away', async () => {
  const g = section('G');
  if ((await g.getByLabel(/Safety plan/).count()) > 0) throw new Error('safety plan shown with no concern');
  await g.getByLabel('Fall risk').check();
  await g.getByLabel(/Safety plan/).waitFor({ timeout: 5000 });
  await g.getByLabel('None', { exact: true }).check();
  if (await g.getByLabel('Fall risk').isChecked()) throw new Error('None left Fall risk ticked');
  await page.waitForTimeout(200);
  if ((await g.getByLabel(/Safety plan/).count()) > 0) throw new Error('safety plan still shown');
  // A worrying driving answer is a concern too.
  await g.getByLabel('Driving evaluation recommended').check();
  await g.getByLabel(/Safety plan/).waitFor({ timeout: 5000 });
});

await step('completed at a prior visit asks who and when, and to confirm it was reviewed', async () => {
  const c = section('C');
  await c.getByLabel('Completed at prior visit').check();
  await c.getByLabel(/Prior visit date/).waitFor({ timeout: 5000 });
  await c.getByLabel(/Performed by/).waitFor({ timeout: 5000 });
  await c.getByLabel(/Reviewed today; still valid or updated/).waitFor({ timeout: 5000 });
  const list = page.getByTestId('missing-checklist');
  await list.getByText('Confirm it was reviewed today and is still valid or updated.').waitFor({ timeout: 5000 });
  if ((await list.getByText('Choose the decision-making capacity.').count()) > 0)
    throw new Error('capacity still required for a prior-visit element');
});

await step('the whole form, filled in with a fake patient, makes the note', async () => {
  const v = section('visit');
  await v.getByLabel(/Patient name/).fill(PATIENT);
  await v.getByLabel(/MRN/).fill(MRN);
  await v.getByLabel(/Date of birth/).fill('1940-01-01');
  await v.getByLabel('North Bergen, NJ').check();
  await v.getByLabel('In person').check();

  const b = section('billing');
  await b.getByLabel(/Documented cognitive impairment/).selectOption({ label: 'Dementia, mild' });
  await b.getByLabel(/I confirm this cognitive impairment is documented/).check();
  await b.getByLabel(/None — no earlier 99483/).check();
  await b.getByLabel('Add a common code').selectOption('G30.9');
  if ((await b.getByLabel(/Primary code/).inputValue()) !== 'G30.9') throw new Error('quick pick did not fill the code');
  await b.getByLabel(/Independent historian present/).fill(HISTORIAN);
  await b.getByLabel(/Relationship to the patient/).selectOption({ label: 'Adult child' });
  await b.getByLabel(/No conflicting same-day services/).check();
  await b.getByRole('radio', { name: 'Yes' }).check();
  await b.getByText('Bill the AWV separately and append modifier 25.').waitFor({ timeout: 5000 });
  await b.getByLabel(/Total time on the date of service/).fill('65');
  await b.getByText('Typical time 60 minutes.').waitFor({ timeout: 5000 });
  await b.getByText(/confirm threshold with billing \(Coronis\)/).waitFor({ timeout: 5000 });
  await b.getByLabel('High', { exact: true }).check();

  const a = section('A');
  await a.getByLabel('Concerns raised by family or caregiver').check();
  await a.getByLabel(/Collateral history/).fill('Son reports two years of forgetfulness and missed bills.');
  await a.getByLabel(/Focused exam findings/).fill('Alert, word-finding pauses, no focal deficits.');
  await a.getByLabel('Memory', { exact: true }).check();
  await a.getByLabel(/Cognitive test/).selectOption({ label: 'MoCA' });
  await a.getByLabel(/Score/).fill('18');

  const bb = section('B');
  await bb.getByRole('group', { name: /^ADL impairments/ }).getByLabel('None', { exact: true }).check();
  await bb.getByLabel('Managing finances').check();
  await bb.getByLabel(/Details/).waitFor({ timeout: 5000 });

  const c = section('C');
  await c.getByLabel(/Prior visit date/).fill(daysBefore(30));
  await c.getByLabel(/Performed by/).fill('Casey Testprovider, MD');
  await c.getByLabel(/Reviewed today; still valid or updated/).check();

  const d = section('D');
  await d.getByLabel(/Staging instrument/).selectOption({ label: 'FAST' });
  await d.getByLabel(/Stage \/ score/).selectOption({ label: 'Stage 4' });

  const e = section('E');
  await e.getByLabel(/Medication reconciliation completed/).check();
  await e.getByLabel(/High-risk and cognition-affecting medications reviewed/).check();
  await e.getByLabel('Anticholinergics').check();
  await e.getByLabel(/Changes made/).fill('Stopped oxybutynin-fake.');

  const f = section('F');
  await f.getByLabel('Anxiety').check();
  await f.getByLabel(/Depression screen/).selectOption({ label: 'PHQ-9' });
  await f.getByLabel(/^Score/).fill('6');

  const g = section('G');
  await g.getByLabel(/Safety plan/).fill('Driving evaluation referral; son holds the car keys meanwhile.');
  await g.getByLabel('No', { exact: true }).check();

  const h = section('H');
  await h.getByLabel('Caregiver identified', { exact: true }).check();
  await h.getByRole('button', { name: 'Same as the independent historian' }).click();
  if ((await h.getByLabel(/Caregiver name/).inputValue()) !== HISTORIAN) throw new Error('caregiver not copied');
  await h.getByLabel(/Willingness \/ ability/).selectOption({ label: 'Willing and able' });

  await section('I').getByLabel('Developed').check();

  const j = section('J');
  for (const area of ['Cognition', 'Function', 'Neuropsychiatric / behavioral', 'Medications', 'Safety', 'Caregiver']) {
    for (const part of ['problem', 'goal', 'plan']) {
      await j.getByLabel(`${area}: ${part}`).fill(`${area} ${part} — fake`);
    }
  }
  await j.getByLabel('Support group').check();
  await j.getByLabel('Patient and caregiver').check();
  await j.getByLabel('The diagnosis and what to expect').check();
  await j.getByLabel(/Follow-up interval/).selectOption({ label: '3 months' });

  await page.getByText('Everything required is filled in.').waitFor({ timeout: 5000 });
  await page.screenshot({ path: `${OUT}/clinical-filled.png`, fullPage: false });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: 'Make the PDF' }).click(),
  ]);
  const expected = `99483_Note_${MRN}_${today}.pdf`;
  if (download.suggestedFilename() !== expected) throw new Error(`file ${download.suggestedFilename()}, expected ${expected}`);
  const path = `${OUT}/${expected}`;
  await download.saveAs(path);

  const pages = await pdfPages(path);
  if (pages.length < 2) throw new Error(`only ${pages.length} page(s)`);
  pages.forEach((text, i) => {
    for (const piece of [
      `Patient: ${PATIENT}`,
      'DOB: 01/01/1940',
      `MRN: ${MRN}`,
      `DOS: ${usDate(today)}`,
      `Page ${i + 1} of ${pages.length}`,
      'upload to eCW Documents and reference in the DOS progress note',
    ]) {
      if (!text.includes(piece)) throw new Error(`page ${i + 1} lacks "${piece}"`);
    }
  });
  const all = pages.join(' ');
  for (const piece of [
    'G30.9',
    'MoCA 18/30',
    'At a prior visit on',
    'Casey Testprovider, MD',
    'AWV billed separately, with modifier 25',
    `Total time on the date of service (${usDate(today)}): 65 minutes`,
    'Signature:',
  ]) {
    if (!all.includes(piece)) throw new Error(`the note lacks "${piece}"`);
  }
});

await step('leaving by a link asks first, and staying keeps the form', async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Clock', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByText('Leave and lose what you have entered?').waitFor({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Stay on the form' }).click();
  await page.waitForTimeout(300);
  if (!page.url().endsWith('/clinical/99483')) throw new Error(`moved to ${page.url()}`);
  if ((await section('visit').getByLabel(/Patient name/).inputValue()) !== PATIENT) throw new Error('the form was cleared');
});

await step('the Back button asks too', async () => {
  await page.goBack();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByText('Leave and lose what you have entered?').waitFor({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Stay on the form' }).click();
  await page.waitForTimeout(300);
  if (!page.url().endsWith('/clinical/99483')) throw new Error(`moved to ${page.url()}`);
});

await step('signing out asks first', async () => {
  await page.getByRole('button', { name: /^Your account/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByText('Sign out and lose what you have entered?').waitFor({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Stay signed in' }).click();
  await page.getByTestId('cognitive-assessment').waitFor({ timeout: 5000 });
  if ((await section('visit').getByLabel(/Patient name/).inputValue()) !== PATIENT) throw new Error('the form was cleared');
});

await step('saying the download worked clears the form', async () => {
  await page.getByTestId('download-check').getByRole('button', { name: /Yes, it downloaded/ }).click();
  await page.getByText('The form is cleared.').waitFor({ timeout: 5000 });
  if ((await section('visit').getByLabel(/Patient name/).inputValue()) !== '') throw new Error('patient name still there');
  if ((await section('A').getByLabel(/Collateral history/).inputValue()) !== '') throw new Error('history still there');
  // Nothing left to lose, so leaving no longer asks.
  await page.getByRole('navigation').getByRole('link', { name: 'Clock', exact: true }).click();
  await page.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 10000 });
});

await step('the patient’s details never reached the server', async () => {
  if (requests.length === 0) throw new Error('no requests seen at all — is the listener working?');
  const leaks = requests.filter(({ url, body }) =>
    SECRETS.some((secret) => decodeURIComponent(url).includes(secret) || body.includes(secret)),
  );
  if (leaks.length > 0) throw new Error(`sent: ${leaks.map((l) => l.url).join(', ')}`);
  // And nothing at all was written while the form was open.
  const writes = requests.filter(
    ({ url, body }) => body && !url.includes('/auth/logout') && !url.includes('/notifications'),
  );
  if (writes.length > 0) throw new Error(`requests with a body: ${writes.map((w) => w.url).join(', ')}`);
});

await step('nothing about the patient was kept in the browser', async () => {
  const stored = await page.evaluate(async () => ({
    local: JSON.stringify({ ...localStorage }),
    session: JSON.stringify({ ...sessionStorage }),
    cookie: document.cookie,
    databases: (await indexedDB.databases()).map((db) => db.name),
    caches: 'caches' in window ? await caches.keys() : [],
  }));
  const text = JSON.stringify(stored);
  for (const secret of SECRETS) if (text.includes(secret)) throw new Error(`"${secret}" kept: ${text}`);
  if (stored.databases.length > 0) throw new Error(`IndexedDB: ${stored.databases.join(', ')}`);
  const cookies = JSON.stringify(await ctx.cookies());
  for (const secret of SECRETS) if (cookies.includes(secret)) throw new Error(`"${secret}" in a cookie`);
});

await step('closing the tab with something typed asks first', async () => {
  const second = await ctx.newPage();
  await second.goto(`${BASE}/clinical/99483`, { waitUntil: 'networkidle' });
  await second.getByTestId('section-visit').getByLabel(/Patient name/).fill('Another Fakepatient');
  let asked = false;
  second.on('dialog', async (dialog) => {
    asked = dialog.type() === 'beforeunload';
    await dialog.accept();
  });
  await second.close({ runBeforeUnload: true });
  await page.waitForTimeout(1000);
  if (!asked) throw new Error('no beforeunload prompt');
});

await step('there is no file input on the form', async () => {
  await page.goto(`${BASE}/clinical/99483`, { waitUntil: 'networkidle' });
  await page.getByTestId('cognitive-assessment').waitFor({ timeout: 10000 });
  if ((await page.locator('input[type=file]').count()) > 0) throw new Error('a file input appeared');
});

await step('the letters after a name are kept on the staff record, and can be cleared', async () => {
  const staff = (await call(admin, `/employees/${me.id}`)).body;
  if (staff.postNominals !== 'APN-C') throw new Error(`postNominals: ${staff.postNominals}`);
  await call(admin, `/employees/${me.id}`, { method: 'PATCH', body: JSON.stringify({ postNominals: '' }) });
  const cleared = (await call(admin, `/employees/${me.id}`)).body;
  if (cleared.postNominals !== null) throw new Error(`not cleared: ${cleared.postNominals}`);
  await call(admin, `/job-roles/${provider.id}/members/${me.id}`, { method: 'DELETE' });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CLINICAL CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
