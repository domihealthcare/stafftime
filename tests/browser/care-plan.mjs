import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// The CCM care plan (October 2026): the general care plan and two or more
// chronic conditions, made into one PDF in English, Spanish or both, entirely
// in the browser. For providers, managers and admins. As with the 99483 form,
// what matters most is what does NOT happen — the patient's details never
// reach the server and are never kept in the browser — so this suite watches
// every request and every kind of storage while a fake patient is entered.
// Fake data only.
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
const FIRST = 'Rosa';
const LAST = 'Testpatient';
const PATIENT_ID = 'TEST-0002';
const SECRETS = [LAST, PATIENT_ID, 'Testsupport', 'Testcardio', 'penicillin-fake', 'walk-fake'];

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

const ctx = await browser.newContext({
  viewport: { width: 1024, height: 1366 },
  timezoneId: 'America/New_York',
  acceptDownloads: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const section = (key) => page.getByTestId(`section-${key}`);
const group = (scope, name) => scope.getByRole('group', { name });
const pick = (scope, question, answer) =>
  group(scope, question).getByLabel(answer, { exact: true }).check();

await step('somebody who is not a provider, manager or admin has no link, and the page says so', async () => {
  const desk = await ctx.newPage();
  await signIn(desk, 'frontdesk@domihealthcare.com');
  await desk.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  if ((await desk.getByTestId('clinical-tools').count()) > 0) throw new Error('the link is on Resources');
  await desk.goto(`${BASE}/clinical/care-plan`, { waitUntil: 'networkidle' });
  await desk.getByText('This form is for providers, managers and admins.').waitFor({ timeout: 10000 });
  if ((await desk.getByLabel(/First name/).count()) > 0) throw new Error('the form is shown');
  await desk.getByRole('button', { name: /^Your account/ }).click();
  await desk.getByRole('menuitem', { name: 'Sign out' }).click();
  await desk.close();
});

await signIn(page, 'manager@domihealthcare.com');

await step('a manager finds it under Resources → Provider, without the 99483 form', async () => {
  await page.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  const tools = page.getByTestId('section-Provider').getByTestId('clinical-tools');
  if ((await tools.getByRole('link', { name: /Cognitive assessment/ }).count()) > 0)
    throw new Error('a manager who is not a provider is offered the 99483 form');
  await tools.getByRole('link', { name: /CCM care plan/ }).click();
  await page.getByTestId('ccm-care-plan').waitFor({ timeout: 15000 });
});

const requests = [];
page.on('request', (request) => requests.push({ url: request.url(), body: request.postData() ?? '' }));

await step('it is prepared by the person signed in, and starts on today', async () => {
  const line = await page.getByTestId('preparer-line').innerText();
  if (!/Prepared by .+/.test(line)) throw new Error(`preparer line: "${line}"`);
  const date = await section('patient').getByLabel(/Conducted on/).inputValue();
  if (date !== today) throw new Error(`starts on ${date}`);
});

await step('an empty form makes no PDF, and asks for two conditions', async () => {
  let downloaded = false;
  page.once('download', () => (downloaded = true));
  await page.getByRole('button', { name: 'Download the care plan' }).click();
  const list = page.getByTestId('missing-checklist');
  await list.getByText('Choose at least 2 chronic conditions.').waitFor({ timeout: 5000 });
  await list.getByText('Enter the patient ID.').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  if (downloaded) throw new Error('a PDF was downloaded');
});

await step('each condition chosen adds its own form’s questions', async () => {
  const conditions = section('conditions');
  await conditions.getByLabel('Find a condition').fill('htn');
  await conditions.getByLabel('HTN · I10').check();
  await conditions.getByLabel('Find a condition').fill('');
  await conditions.getByLabel('DM · E11.8').check();
  await conditions.getByLabel('COPD · J44.9').check();
  await page.getByTestId('chosen-conditions').getByText('HTN, DM, COPD').waitFor({ timeout: 5000 });
  // Diabetes has its own Google Form behind it.
  const dm = section('plan:diabetes');
  await dm.getByText(/no form for/).waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  if ((await dm.getByText(/no form for/).count()) > 0) throw new Error('DM says it has no form');
  // COPD has none yet, and says so.
  await section('plan:copd').getByText(/There is no form for COPD/).waitFor({ timeout: 5000 });
  await conditions.getByLabel('COPD · J44.9').uncheck();
  if ((await section('plan:copd').count()) > 0) throw new Error('COPD still has a section');
});

await step('a Spanish speaker’s care plan starts as English and Español', async () => {
  await pick(section('patient'), /^Primary language/, 'Spanish');
  const both = page.getByRole('radiogroup', { name: 'Language' }).getByLabel('English and Español');
  if (!(await both.isChecked())) throw new Error('not switched to both');
  await page.getByText('Spanish not yet checked by a native speaker.').waitFor({ timeout: 5000 });
});

await step('the whole form, filled in with a fake patient, makes one PDF in both languages', async () => {
  const p = section('patient');
  await p.getByLabel(/First name/).fill(FIRST);
  await p.getByLabel(/Last name/).fill(LAST);
  await p.getByLabel(/Patient ID/).fill(PATIENT_ID);
  await p.getByLabel(/Date of birth/).fill('1943-01-12');

  const g = section('general');
  await pick(g, /overall physical health/, 'Fair');
  await pick(g, /activities of daily living \(ADLs\)/, 'N/A');
  await pick(g, /instrumental activities/, 'Transportation');
  await pick(g, /history of falling/, 'No');
  await pick(g, /problems with pain/, 'Yes, my pain is currently adequately managed');
  await pick(g, /good understanding/, 'Yes');
  await pick(g, /life planning documents/, 'Yes');
  await pick(g, /recommended diet/, 'Cardiac diet (low fat, low sodium/salt)');
  await pick(g, /how many days did you exercise/, 'No days');

  const s = section('support');
  await s.getByLabel(/providers they see routinely/).fill('CARD: Testcardio, M.D.');
  await pick(s, /support system adequate/, 'Yes');
  await s.getByLabel(/Who in their support system/).fill('Ana Testsupport (daughter)');
  await pick(s, /difficulty obtaining/, 'Transportation');

  const m = section('medications');
  await pick(m, /any allergies/, 'Has allergies');
  await m.getByLabel(/Allergic to/).fill('penicillin-fake');
  await m.getByLabel(/I reviewed the patient/).check();
  await pick(m, /problems taking medications/, 'No');
  await pick(m, /picking up your medications/, 'No');
  await pick(m, /feel better without/, 'Sometimes I stop taking my medicines when I feel better but only if my doctor approves.');
  await pick(m, /feel worse without/, 'Sometimes I stop taking my medicines when I feel worse but only if my doctor approves.');
  await pick(m, /report side effects/, 'I always report side effects to my doctor.');

  const v = section('vitals');
  await v.getByLabel(/^Height/).fill('63');
  await v.getByLabel(/^Weight/).fill('154');
  await v.getByLabel(/^Blood Pressure/).fill('142/74');
  await v.getByLabel('HgbA1c', { exact: true }).fill('6.9');

  const htn = section('plan:htn');
  await pick(htn, /desired outcomes/, 'Live a longer and healthier life');
  await pick(htn, /any symptoms/, 'No, asymptomatic');
  await pick(htn, /long-term goals/, 'Maintain blood pressure at goal set by provider');
  await htn.getByLabel(/Targeted SMART goal/).fill('walk-fake 20 minutes, 5 days a week');
  await pick(htn, /\(interventions\)/, 'Check and log blood pressure and/or pulse daily to review with my Care Manager and doctor');
  await pick(htn, /care team help/, 'Smoking cessation education');
  await pick(htn, /\(barriers\)/, 'Physical inactivity');

  const dm = section('plan:diabetes');
  await pick(dm, /desired outcomes/, 'Have fewer or no symptoms');
  await dm.getByLabel(/Symptoms, or other/).fill('Tingling in feet');
  await pick(dm, /long-term goals/, 'Follow my recommended diet');
  await dm.getByLabel(/Targeted SMART goal/).fill('A1c under 7 by the next visit');
  await dm.locator('[id$="plans-diabetes-interventions"] input').first().check();
  await dm.locator('[id$="plans-diabetes-careTeam"] input').first().check();
  await pick(dm, /\(barriers\)/, 'Financial constraints');

  await page.getByText('Everything required is filled in.').waitFor({ timeout: 5000 });
  await page.screenshot({ path: `${OUT}/care-plan-filled.png`, fullPage: false });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: 'Download the care plan' }).click(),
  ]);
  const expected = `CarePlan_${PATIENT_ID}_${today}_EN-ES.pdf`;
  if (download.suggestedFilename() !== expected) throw new Error(`file ${download.suggestedFilename()}`);
  const path = `${OUT}/${expected}`;
  await download.saveAs(path);

  const pages = await pdfPages(path);
  pages.forEach((text, i) => {
    for (const piece of [`${FIRST} ${LAST}`, 'DOB: 01/12/1943', `ID: ${PATIENT_ID}`, `Page ${i + 1} of ${pages.length}`, '7919 Kennedy Blvd.', 'Confidential'])
      if (!text.includes(piece)) throw new Error(`page ${i + 1} lacks "${piece}"`);
  });
  const all = pages.join(' ');
  for (const piece of [
    'Care Plan',
    'General Care Plan',
    'Overall physical health is rated as "Fair."',
    'Needs assistance with Instrumental Activities of Daily Living (IADLs): transportation.',
    'Reports pain that is currently adequately managed.',
    'Recommended diet: cardiac diet (low fat, low sodium/salt).',
    'No days of exercise in the past week.',
    'Providers include:',
    'CARD: Testcardio, M.D.',
    'Support person: Ana Testsupport (daughter).',
    'Allergies: penicillin-fake.',
    'Sometimes stops taking medicine when feeling better or worse, but only with doctor approval.',
    '63 inches (5 ft 3 in)',
    '154 lbs',
    '142/74',
    'HTN (I10), DM (E11.8)',
    'Hypertension Care Plan',
    'Live a longer and healthier life',
    'Targeted SMART goal',
    'walk-fake 20 minutes',
    'Diabetes Mellitus Care Plan',
    'Tingling in feet',
    // And again in Spanish.
    'Plan de Atención General',
    'La salud física general se califica como "Regular".',
    'Dieta recomendada: dieta cardíaca (baja en grasas, baja en sodio/sal).',
    'Ningún día de ejercicio en la última semana.',
    'Proveedores incluyen:',
    '160 cm',
    '70 kg',
    'HTA (I10), DM (E11.8)',
    'Plan de Atención para Hipertensión',
    'Vivir una vida más larga y saludable',
    'Objetivo SMART específico',
    'Plan de Atención para Diabetes Mellitus',
  ]) {
    if (!all.includes(piece)) throw new Error(`the care plan lacks "${piece}"`);
  }
  // English first, then Spanish starting on a page of its own.
  const spanishStarts = pages.findIndex((text) => text.includes('Plan de Atención General'));
  if (spanishStarts < 1 || pages[spanishStarts - 1].includes('Plan de Atención General'))
    throw new Error(`Spanish starts on page ${spanishStarts + 1}`);
  if (pages[spanishStarts].includes('General Care Plan')) throw new Error('the Spanish page carries English');
});

await step('and in Spanish alone', async () => {
  await page.getByRole('radiogroup', { name: 'Language' }).getByLabel('Español', { exact: true }).check();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: 'Download the care plan' }).click(),
  ]);
  if (!download.suggestedFilename().endsWith('_ES.pdf')) throw new Error(download.suggestedFilename());
  const path = `${OUT}/es-${download.suggestedFilename()}`;
  await download.saveAs(path);
  const pages = await pdfPages(path);
  const all = pages.join(' ');
  for (const piece of ['Plan de Atención', 'Página 1 de', 'Confidencial', 'Realizado el', 'Fecha de nacimiento 12 de enero de 1943'])
    if (!all.includes(piece)) throw new Error(`the Spanish care plan lacks "${piece}"`);
  for (const english of ['General Care Plan', 'Overall physical health', 'Hypertension Care Plan'])
    if (all.includes(english)) throw new Error(`the Spanish care plan shows "${english}"`);
  if (all.includes('native speaker')) throw new Error('the review note is on the care plan');
});

await step('leaving by a link asks first, and staying keeps the form', async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Clock', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByText('Leave and lose what you have entered?').waitFor({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Stay on the form' }).click();
  await page.waitForTimeout(300);
  if (!page.url().endsWith('/clinical/care-plan')) throw new Error(`moved to ${page.url()}`);
  if ((await section('patient').getByLabel(/Last name/).inputValue()) !== LAST) throw new Error('the form was cleared');
});

await step('saying it downloaded clears the form', async () => {
  await page.getByTestId('download-check').getByRole('button', { name: /Yes, it downloaded/ }).click();
  await page.getByText('The form is cleared.').waitFor({ timeout: 5000 });
  if ((await section('patient').getByLabel(/Last name/).inputValue()) !== '') throw new Error('name still there');
  if ((await page.locator('[data-testid^="section-plan:"]').count()) > 0) throw new Error('condition plans still there');
  await page.getByRole('navigation').getByRole('link', { name: 'Clock', exact: true }).click();
  await page.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 10000 });
});

await step('the patient’s details never reached the server', async () => {
  if (requests.length === 0) throw new Error('no requests seen at all — is the listener working?');
  const leaks = requests.filter(({ url, body }) =>
    SECRETS.some((secret) => decodeURIComponent(url).includes(secret) || body.includes(secret)),
  );
  if (leaks.length > 0) throw new Error(`sent: ${leaks.map((l) => l.url).join(', ')}`);
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
  const text = JSON.stringify(stored) + JSON.stringify(await ctx.cookies());
  for (const secret of SECRETS) if (text.includes(secret)) throw new Error(`"${secret}" kept`);
  if (stored.databases.length > 0) throw new Error(`IndexedDB: ${stored.databases.join(', ')}`);
});

await step('there is no file input on the form', async () => {
  await page.goto(`${BASE}/clinical/care-plan`, { waitUntil: 'networkidle' });
  await page.getByTestId('ccm-care-plan').waitFor({ timeout: 10000 });
  if ((await page.locator('input[type=file]').count()) > 0) throw new Error('a file input appeared');
});

await step('Help has a section on it', async () => {
  await page.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'CCM care plan' }).waitFor({ timeout: 10000 });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL CARE PLAN CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
