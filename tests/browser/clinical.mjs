import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// The 99483 cognitive assessment (September 2026): a provider-only form that
// makes two PDFs entirely in the browser — the clinical note and the patient's
// care plan, in English or Spanish. What matters most is what does NOT happen —
// the patient's details never reach the server and are never kept in the
// browser — so this suite watches every request and every kind of browser
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
const HISTORIAN = 'John Testhistorian, son';
const SECRETS = [PATIENT, 'Testpatient', MRN, 'Testhistorian', 'oxybutynin-fake'];

// New Jersey's day, as the provider's device has it.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
// Downloads are named "MM-DD-YYYY Title.pdf", with nothing about the patient.
const fileDate = (iso) => usDate(iso).replace(/\//g, '-');

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

await step('somebody who is not a Provider sees no link to it, and the page says so', async () => {
  const nav = await page.getByRole('navigation').getByRole('link').allInnerTexts();
  if (nav.some((t) => /cognitive|braincheck/i.test(t))) throw new Error(`navigation: ${nav.join(', ')}`);
  await page.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  // Frankie is a Medical Assistant too, so Forms holds the wellness form — and only that.
  const forms = page.getByTestId('clinical-tools');
  await forms.getByRole('link', { name: /^Annual Wellness Visit/ }).waitFor({ timeout: 10000 });
  if ((await forms.getByRole('link', { name: /BrainCheck/ }).count()) > 0) throw new Error('the link is on Resources');
  await page.goto(`${BASE}/clinical/99483`, { waitUntil: 'networkidle' });
  await page.getByText('This form is for providers.').waitFor({ timeout: 10000 });
  if ((await page.getByLabel(/Patient name/).count()) > 0) throw new Error('the form is shown');
});

await step('Provider starts with the clinical forms switched on, and nobody else', async () => {
  const roles = (await call(admin, '/job-roles')).body;
  const on = roles.filter((r) => r.usesClinicalForms).map((r) => r.name);
  if (on.join() !== 'Provider') throw new Error(`on for: ${on.join(', ')}`);
});

await step('in the Provider job role, it is under Resources → Forms as the BrainCheck care plan', async () => {
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
  const nav = await page.getByRole('navigation').getByRole('link').allInnerTexts();
  if (nav.some((t) => /cognitive|braincheck/i.test(t))) throw new Error(`in the navigation: ${nav.join(', ')}`);
  await page.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  const tools = page.getByTestId('forms-section').getByTestId('clinical-tools');
  await tools.getByRole('link', { name: /^BrainCheck Care Plan/ }).click();
  await page.getByTestId('cognitive-assessment').waitFor({ timeout: 15000 });
});

// From here on, every request the page makes is kept, to be searched for the
// fake patient's details at the end.
const requests = [];
page.on('request', (request) => {
  requests.push({ url: request.url(), body: request.postData() ?? '' });
});

const section = (key) => page.getByTestId(`section-${key}`);

await step('the provider is the person signed in, with their letters, and cannot be typed over', async () => {
  const line = await page.getByTestId('provider-line').innerText();
  if (!/Frankie .*, APN-C/.test(line)) throw new Error(`provider line: "${line}"`);
  if ((await section('visit').getByLabel(/Provider/).count()) > 0) throw new Error('there is a provider field');
  const dos = await section('visit').getByLabel(/Date of service/).inputValue();
  if (dos !== today) throw new Error(`date of service ${dos}, expected ${today}`);
});

await step('the requirements come first, before the patient', async () => {
  const order = await page.locator('[data-testid^="section-"]').evaluateAll((all) =>
    all.map((el) => el.getAttribute('data-testid')),
  );
  if (order[0] !== 'section-requirements' || order[1] !== 'section-visit') throw new Error(order.join(', '));
  const text = await section('requirements').innerText();
  for (const piece of ['documented in the eCW record', 'independent historian', '180 days', 'conflicting same-day'])
    if (!text.includes(piece)) throw new Error(`requirements lack "${piece}"`);
  // The codes are behind an info button, not spelled out on the form.
  if (text.includes('99497')) throw new Error('the codes are printed on the form');
  await section('requirements').getByRole('button', { name: 'Which codes conflict' }).hover();
  await page.getByRole('tooltip').getByText(/99497/).waitFor({ timeout: 5000 });
  if (await section('requirements').getByLabel(/conflicting same-day service/).isChecked())
    throw new Error('hovering the info button ticked the box');
});

await step('a section turns amber only once the provider has moved on past it', async () => {
  // Nothing touched yet: unfinished, but plain — no amber anywhere.
  const amber = () =>
    page.locator('[data-testid^="section-"][data-flagged="true"]').evaluateAll((all) =>
      all.map((el) => el.getAttribute('data-testid')),
    );
  if ((await amber()).length > 0) throw new Error(`amber from the start: ${await amber()}`);
  if ((await page.getByTestId('pending-here').count()) > 0) throw new Error('the amber list shows from the start');
  await section('requirements').getByText(/to fill in/).waitFor({ timeout: 5000 });
  // Required answers keep their star.
  const name = await section('visit').locator('label', { hasText: 'Patient name' }).innerText();
  if (!name.includes('*')) throw new Error(`no star: "${name}"`);
  // Working in the patient's details leaves the requirements behind, unticked.
  await section('visit').getByLabel(/Patient name/).click();
  await page.waitForTimeout(200);
  const now = await amber();
  if (now.join() !== 'section-requirements') throw new Error(`amber: ${now.join(', ')}`);
  await section('requirements').getByText(/still needed/).first().waitFor({ timeout: 5000 });
  const pill = page.getByRole('navigation', { name: 'Sections' }).locator('[data-flagged="true"]');
  if ((await pill.count()) !== 1) throw new Error(`${await pill.count()} pills in amber`);
});

await step('an empty form makes no PDF, and lists what is missing', async () => {
  let downloaded = false;
  page.once('download', () => (downloaded = true));
  await page.getByRole('button', { name: 'Download the note' }).click();
  const list = page.getByTestId('missing-checklist');
  await list.waitFor({ timeout: 5000 });
  await list.getByText('Enter the patient’s name.').waitFor({ timeout: 5000 });
  await list.getByText(/Confirm: An independent historian/).waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  if (downloaded) throw new Error('a PDF was downloaded');
});

await step('a missing item jumps to its field', async () => {
  await page.getByTestId('missing-checklist').getByRole('button', { name: /Enter the MRN\./ }).click();
  await page.waitForTimeout(300);
  const focused = await page.evaluate(() => document.activeElement?.id ?? '');
  if (!focused.endsWith('visit-mrn')) throw new Error(`focus went to "${focused}"`);
});

await step('the history and exam start as done at a prior visit, with a tick to confirm it', async () => {
  const a = section('A');
  const tick = a.getByLabel(/Completed at a prior visit; reviewed today and still valid or updated/);
  if (await tick.isChecked()) throw new Error('ticked for the provider');
  await page
    .getByTestId('missing-checklist')
    .getByText('Tick to confirm it was completed at a prior visit and reviewed today.')
    .waitFor({ timeout: 5000 });
  await tick.check();
  if ((await a.getByLabel(/Collateral history/).count()) > 0) throw new Error('details shown without asking');
  if ((await a.getByLabel(/Prior visit date|Performed by/).count()) > 0) throw new Error('asks for a date or a name');
  await a.getByRole('button', { name: 'Add details' }).click();
  await a.getByLabel(/Collateral history/).waitFor({ timeout: 5000 });
  if ((await page.getByTestId('missing-checklist').getByText('Enter the collateral history.').count()) > 0)
    throw new Error('prior-visit history still required');
});

await step('FAST is done on screen, with no “no impairment” stage', async () => {
  const d = section('D');
  await d.getByText(/Needs help with complex tasks/).waitFor({ timeout: 5000 });
  const stages = await d.getByRole('radio').count();
  if (stages !== 2 + 15) throw new Error(`${stages} radios`); // Today/Prior + FAST 2–7f
  if ((await d.getByText(/^Stage 1\b/).count()) > 0) throw new Error('FAST 1 offered');
  await d.getByRole('button', { name: /Used another instrument/ }).click();
  await d.getByLabel(/Staging instrument/).waitFor({ timeout: 5000 });
  await d.getByRole('button', { name: /Stage with FAST here instead/ }).click();
  await d.getByLabel(/Stage 4/).check();
});

await step('telehealth reminds about modifier 95, and there is no AWV question', async () => {
  const v = section('visit');
  await v.getByLabel('Telehealth').check();
  await v.getByText(/telehealth modifier \(95\)/).waitFor({ timeout: 5000 });
  // The billing notes came off the form (Dominguez, October 2026).
  if ((await page.getByText(/Coronis|confirm threshold|if unsure/).count()) > 0)
    throw new Error('a "confirm with billing" note is still shown');
  if ((await page.getByText(/annual wellness visit|AWV/).count()) > 0) throw new Error('the AWV is still asked about');
});

await step('BrainCheck Assess is the cognitive test to start with', async () => {
  const a = section('A');
  const chosen = await a.getByLabel(/Cognitive test/).evaluate((el) => el.selectedOptions[0]?.textContent);
  if (chosen !== 'BrainCheck Assess') throw new Error(`starts on ${chosen}`);
});

await step('the options are compact, and the two downloads sit side by side', async () => {
  // Rows stretch to their tallest neighbour, so check what an option asks for.
  const option = await section('G').getByText('Fall risk', { exact: true }).evaluate((el) =>
    getComputedStyle(el.closest('label')).minHeight,
  );
  if (option !== '38px') throw new Error(`an option is at least ${option} tall`);
  const note = await page.getByRole('button', { name: 'Download the note' }).boundingBox();
  const handout = await page.getByRole('button', { name: 'Download the handout' }).boundingBox();
  if (Math.abs(note.y - handout.y) > 2 || handout.x <= note.x) throw new Error('not side by side');
});

await step('a safety concern makes the care plan suggest what to do about it', async () => {
  await section('G').getByLabel('Fall risk').check();
  const safety = page.getByTestId('care-plan-safety');
  const tick = safety.getByLabel(/Remove tripping hazards/);
  const label = await tick.evaluate((el) => el.closest('label')?.textContent ?? '');
  if (!/Suggested/.test(label)) throw new Error(`not suggested: "${label}"`);
  if (await tick.isChecked()) throw new Error('ticked for the provider');
  const problem = await safety.innerText();
  if (!/Home: fall risk/.test(problem)) throw new Error(`problem not built from G: ${problem.slice(0, 120)}`);
});

await step('"Tick the suggested ones" is in every area, and ticks the goals as well as the actions', async () => {
  // Every area says where it stands; one with suggestions has the button.
  for (const area of ['cognition', 'function', 'behavior', 'medications', 'safety', 'caregiver']) {
    const status = await page.getByTestId(`care-plan-${area}`).getByTestId('suggested-status').innerText();
    if (!/Tick the suggested ones|Nothing suggested here/.test(status)) throw new Error(`${area}: "${status}"`);
  }
  for (const area of ['cognition', 'safety', 'caregiver']) {
    if ((await page.getByTestId(`care-plan-${area}`).getByRole('button', { name: 'Tick the suggested ones' }).count()) !== 1)
      throw new Error(`no button in ${area}`);
  }
  const safety = page.getByTestId('care-plan-safety');
  await safety.getByRole('button', { name: 'Tick the suggested ones' }).click();
  if (!(await safety.getByLabel(/Prevent falls and injuries at home/).isChecked())) throw new Error('the goal was not ticked');
  if (!(await safety.getByLabel(/Remove tripping hazards/).isChecked())) throw new Error('the action was not ticked');
  await safety.getByText('✓ The suggested ones are ticked').waitFor({ timeout: 5000 });
  // One press for every area.
  await section('J').getByRole('button', { name: 'Tick all the suggested ones' }).click();
  for (const area of ['cognition', 'behavior', 'medications', 'caregiver']) {
    await page.getByTestId(`care-plan-${area}`).getByText('✓ The suggested ones are ticked').waitFor({ timeout: 5000 });
  }
  if (!(await page.getByTestId('care-plan-cognition').getByLabel(/Keep memory and thinking skills/).isChecked()))
    throw new Error('a goal elsewhere was not ticked');
  if ((await section('J').getByRole('button', { name: 'Tick all the suggested ones' }).count()) > 0)
    throw new Error('the button stays once everything suggested is ticked');
});

await step('the whole form, filled in with a fake patient, makes the note', async () => {
  const r = section('requirements');
  await r.getByLabel(/documented in the eCW record/).check();
  await r.getByLabel(/independent historian/).check();
  await r.getByLabel(/Who \(name and relationship\)/).fill(HISTORIAN);
  await r.getByLabel(/No 99483 has been billed/).check();
  await r.getByLabel(/conflicting same-day service/).check();

  const v = section('visit');
  await v.getByLabel(/Patient name/).fill(PATIENT);
  await v.getByLabel(/MRN/).fill(MRN);
  await v.getByLabel(/Date of birth/).fill('1940-01-01');
  await v.getByLabel(/Total time today/).fill('65');
  await v.getByLabel('High', { exact: true }).check();

  const b = section('B');
  await b.getByRole('group', { name: /^ADL impairments/ }).getByLabel('None', { exact: true }).check();
  await b.getByLabel('Managing finances').check();
  await section('C').getByLabel('Intact').check();
  const e = section('E');
  await e.getByLabel(/Medication reconciliation completed/).check();
  await e.getByLabel(/High-risk and cognition-affecting medications reviewed/).check();
  await e.getByLabel(/Changes made/).fill('Stopped oxybutynin-fake.');
  const f = section('F');
  await f.getByLabel('Anxiety').check();
  await f.getByLabel(/Depression screen/).selectOption({ label: 'PHQ-9' });
  await f.getByLabel(/^Score/).fill('6');
  const g = section('G');
  await g.getByLabel('Driving evaluation recommended').check();
  await section('H').getByLabel(/Willingness/).selectOption({ label: 'Willing and able' });
  const i = section('I');
  await i.getByLabel('Developed').check();
  await i.getByRole('group', { name: /^Health care proxy/ }).getByLabel('Done').check();
  await i.getByRole('group', { name: /^Financial power of attorney/ }).getByLabel('Not yet').check();

  const plan = {
    cognition: ['Keep memory and thinking skills', 'Recheck memory and thinking'],
    function: ['Stay as independent as is safe', 'Family or caregiver to take over paying bills'],
    behavior: ['Ease distressing mood', 'Keep a calm, regular daily routine'],
    medications: ['Take medicines safely', 'Keep an up-to-date list of all medicines'],
    safety: ['Prevent falls and injuries at home', 'Remove tripping hazards'],
    caregiver: ['Support the caregiver', 'Respite care so the caregiver'],
  };
  for (const [area, [goal, action]] of Object.entries(plan)) {
    const box = page.getByTestId(`care-plan-${area}`);
    await box.getByLabel(new RegExp(goal)).check();
    await box.getByLabel(new RegExp(action)).check();
  }
  const j = section('J');
  await j.getByRole('group', { name: /^Community resource referrals/ }).getByLabel('Support group', { exact: true }).check();
  await j.getByLabel('Patient and caregiver').check();
  await j.getByRole('group', { name: /^Education and support provided/ }).getByLabel('The diagnosis and what to expect').check();
  await j.getByLabel(/Follow-up in/).selectOption({ label: '3 months' });

  await page.getByText('Everything required is filled in.').waitFor({ timeout: 5000 });
  await page.screenshot({ path: `${OUT}/clinical-filled.png`, fullPage: false });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: 'Download the note' }).click(),
  ]);
  const expected = `${fileDate(today)} BrainCheck Note.pdf`;
  if (download.suggestedFilename() !== expected) throw new Error(`file ${download.suggestedFilename()}`);
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
    'Frankie',
    'APN-C',
    'Visit Telehealth',
    'Requirements confirmed',
    'Historian: John Testhistorian, son',
    'At a prior visit; reviewed today and still valid or updated.',
    'Stage 4 — Needs help with complex tasks',
    'Home: fall risk',
    'Remove tripping hazards',
    'Financial power of attorney Not yet',
    'Health care proxy',
    `Total time on the date of service (${usDate(today)}): 65 minutes`,
    'Electronically signed by Frankie',
  ]) {
    if (!all.includes(piece)) throw new Error(`the note lacks "${piece}"`);
  }
});

await step('the handout is in plain English, with the plan and nothing clinical', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: 'Download the handout' }).click(),
  ]);
  const expected = `${fileDate(today)} Your Memory Care Plan.pdf`;
  if (download.suggestedFilename() !== expected) throw new Error(`file ${download.suggestedFilename()}`);
  const path = `${OUT}/en-${expected}`;
  await download.saveAs(path);
  const pages = await pdfPages(path);
  const all = pages.join(' ');
  for (const piece of ['Your memory care plan', 'Prepared by', 'Care partner John Testhistorian, son', 'Our goals', 'Things to try', 'Small changes at home make a big difference', 'Remove tripping hazards', 'Planning ahead', 'Financial power of attorney Not yet', 'Support group', '1-800-272-3900', 'Safety tips', 'Your next visit', 'In 3 months', 'Confidential', '201-528-3664', 'Signature', 'Electronically signed by Frankie', 'APN-C on']) {
    if (!all.includes(piece)) throw new Error(`the handout lacks "${piece}"`);
  }
  for (const clinical of ['FAST', 'PHQ-9', 'MRN', 'modifier', 'Stage 4']) {
    if (all.includes(clinical)) throw new Error(`the handout shows "${clinical}"`);
  }
  pages.forEach((text, i) => {
    if (!text.includes(`Page ${i + 1} of ${pages.length}`) || !text.includes(PATIENT))
      throw new Error(`page ${i + 1} lacks its header`);
  });
});

await step('and in English and Spanish, with no "not yet checked" note now the Spanish is approved', async () => {
  // Only two choices: English, or English and Spanish.
  const choices = await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio').count();
  if (choices !== 2) throw new Error(`${choices} language choices`);
  await page.getByRole('radiogroup', { name: 'Language' }).getByLabel('English and Spanish').check();
  await page.getByText(/English first, then the same in Spanish/).waitFor({ timeout: 5000 });
  if ((await page.getByText(/not yet been checked by a native speaker/).count()) > 0)
    throw new Error('the review note is still shown');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: 'Download the handout' }).click(),
  ]);
  if (download.suggestedFilename() !== `${fileDate(today)} Your Memory Care Plan.pdf`) throw new Error(download.suggestedFilename());
  const path = `${OUT}/es-${download.suggestedFilename()}`;
  await download.saveAs(path);
  const pages = await pdfPages(path);
  const all = pages.join(' ');
  // English first, then the Spanish starting on a page of its own.
  const spanishStarts = pages.findIndex((text) => text.includes('Su plan de cuidado de la memoria'));
  if (spanishStarts < 1 || !pages[0].includes('Your memory care plan')) throw new Error(`Spanish starts on page ${spanishStarts + 1}`);
  for (const piece of ['Your memory care plan', 'Our goals', 'Su plan de cuidado de la memoria', 'Preparado por', 'Nuestras metas', 'Qué puede hacer', 'Planificar con anticipación', 'Consejos de seguridad', 'En 3 meses', 'Confidencial', 'al 201-528-3664', 'Electronically signed by Frankie', 'Firmado electrónicamente por Frankie']) {
    if (!all.includes(piece)) throw new Error(`the Spanish handout lacks "${piece}"`);
  }
  if (all.includes('native speaker') || all.includes('not yet been checked')) throw new Error('the review note is on the handout');
});

await step('leaving by a link asks first, and staying keeps the form', async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click();
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

await step('saying both downloaded clears the form', async () => {
  await page.getByTestId('download-check').getByRole('button', { name: /Yes, both downloaded/ }).click();
  await page.getByText('The form is cleared.').waitFor({ timeout: 5000 });
  if ((await section('visit').getByLabel(/Patient name/).inputValue()) !== '') throw new Error('patient name still there');
  if ((await section('requirements').getByLabel(/Who \(name and relationship\)/).count()) > 0) throw new Error('historian still there');
  // Nothing left to lose, so leaving no longer asks.
  await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click();
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

await step('Help has a section for providers', async () => {
  await page.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /For providers: BrainCheck Care Plan/ }).waitFor({ timeout: 10000 });
  await page.getByText('Is anything saved? (patient privacy)').waitFor({ timeout: 5000 });
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
