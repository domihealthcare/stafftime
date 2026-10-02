import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// The Annual Wellness Visit form (October 2026): the practice's Annual
// Wellness Supplement Form, a page at a time — the Medical Assistant does page
// 2 (preventive services), the provider page 1 (the questionnaire and SPMSQ)
// in the patient's language. Each page makes its own PDF for eCW, entirely in
// the browser. As with the other clinical forms, what matters most is what
// does NOT happen — the patient's details never reach the server and are never
// kept in the browser — so this suite watches every request and every kind of
// storage while a fake patient is entered. Fake data only.
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`);
    errors.push(`${name}: ${e.message}`);
  }
};

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page
    .getByText(/Not clocked in|On the clock/)
    .first()
    .waitFor({ timeout: 20000 });
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

async function pdfPages(path) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(
      content.items
        .map((item) => item.str)
        .join(' ')
        .replace(/\s+/g, ' '),
    );
  }
  return pages;
}

// The fake patient. Nothing about them may ever appear in a request.
const FIRST = 'Rosa';
const LAST = 'Testpatient';
const SECRETS = [LAST, 'Testfamily'];

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const fileDate = `${today.slice(5, 7)}-${today.slice(8, 10)}-${today.slice(0, 4)}`;

// Frankie works the front desk and as a Medical Assistant.
const ctx = await browser.newContext({
  viewport: { width: 1024, height: 1366 },
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
const roles = (await call(admin, '/job-roles')).body;
const ma = roles.find((r) => r.name === 'Medical Assistant');
const provider = roles.find((r) => r.name === 'Provider');

const section = (key) => page.getByTestId(`section-${key}`);
const group = (scope, name) => scope.getByRole('group', { name });
const pick = (scope, question, answer) =>
  group(scope, question).getByLabel(answer, { exact: true }).check();

await step(
  'Provider and Medical Assistant start with the wellness form, and nobody else',
  async () => {
    const on = roles
      .filter((r) => r.usesWellnessForm)
      .map((r) => r.name)
      .sort();
    if (on.join() !== 'Medical Assistant,Provider') throw new Error(`on for: ${on.join(', ')}`);
  },
);

await step(
  'it comes with the job role: switched off for MAs, Frankie has no link and the page says so',
  async () => {
    const off = await call(admin, `/job-roles/${ma.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ usesWellnessForm: false }),
    });
    if (off.status >= 300) throw new Error(`switching off answered ${off.status}`);
    try {
      await page.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
      if ((await page.getByTestId('clinical-tools').count()) > 0)
        throw new Error('Forms is on Resources');
      await page.goto(`${BASE}/clinical/wellness`, { waitUntil: 'networkidle' });
      await page
        .getByText(/This form is for providers, medical assistants/)
        .waitFor({ timeout: 10000 });
      if ((await page.getByLabel(/First name/).count()) > 0) throw new Error('the form is shown');
    } finally {
      await call(admin, `/job-roles/${ma.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ usesWellnessForm: true }),
      });
    }
  },
);

await step('an MA finds it under Resources → Forms, and it opens on page 2', async () => {
  await page.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  const tools = page.getByTestId('forms-section').getByTestId('clinical-tools');
  await tools.getByRole('link', { name: /^Annual Wellness Visit/ }).click();
  await page.getByTestId('wellness-visit').waitFor({ timeout: 15000 });
  const pages = page.getByTestId('awv-pages');
  if ((await pages.getByRole('button', { name: /Page 2/ }).getAttribute('aria-pressed')) !== 'true')
    throw new Error('not on page 2');
  await section('services').waitFor({ timeout: 5000 });
  if ((await section('history').count()) > 0) throw new Error('page 1 is shown too');
  // Page 2 is in English; nobody asks the patient's language there.
  if (
    (await section('patient')
      .getByText(/preferred language/)
      .count()) > 0
  )
    throw new Error('page 2 asks for a language');
});

const requests = [];
page.on('request', (request) =>
  requests.push({ url: request.url(), body: request.postData() ?? '' }),
);

await step('an empty page 2 makes no PDF, and lists what it needs', async () => {
  let downloaded = false;
  page.once('download', () => (downloaded = true));
  await page.getByRole('button', { name: 'Download page 2' }).click();
  const list = page.getByTestId('missing-checklist');
  await list
    .getByText('Abdominal aortic aneurysm screening: completed')
    .first()
    .waitFor({ timeout: 5000 });
  await list.getByText('Enter the first name.').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  if (downloaded) throw new Error('a PDF was downloaded');
});

await step('page 2, filled in, downloads as "AWV Preventive Services" in English', async () => {
  const p = section('patient');
  await p.getByLabel(/First name/).fill(FIRST);
  await p.getByLabel(/Last name/).fill(LAST);
  await p.getByLabel(/Date of birth/).fill('1943-01-12');

  const service = (key) => page.getByTestId(`service-${key}`);
  for (const key of [
    'aaa',
    'alcohol',
    'dexa',
    'pap',
    'colon',
    'a1c',
    'glaucoma',
    'hepc',
    'hiv',
    'obesity',
    'ldct',
    'nutrition',
    'prevnar',
    'psa',
    'shingrix',
    'tdap',
    'tobacco',
  ]) {
    await service(key).getByLabel('No', { exact: true }).check();
  }
  await service('flu').getByLabel('Offered/Refused', { exact: true }).check();
  await service('mammogram').getByLabel('Yes', { exact: true }).check();
  await service('mammogram').getByLabel('Neg', { exact: true }).check();
  // A date it cannot read is caught.
  await service('mammogram')
    .getByLabel(/Date completed/)
    .fill('March 2025');
  await page
    .getByTestId('missing-checklist')
    .getByText(/Breast cancer screening \(Mammogram\): enter the date/)
    .waitFor({ timeout: 5000 });
  await service('mammogram')
    .getByLabel(/Date completed/)
    .fill('03/14/2025');
  await service('phq9').getByLabel('Yes', { exact: true }).check();
  await service('phq9')
    .getByLabel(/Date completed/)
    .fill('2026');

  await page.getByText('Everything required is filled in.').waitFor({ timeout: 5000 });
  await page.getByTestId('progress-ready').waitFor({ timeout: 5000 });
  await page.screenshot({ path: `${OUT}/wellness-page2.png`, fullPage: false });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: 'Download page 2' }).click(),
  ]);
  const expected = `${fileDate} AWV Preventive Services.pdf`;
  if (download.suggestedFilename() !== expected)
    throw new Error(`file ${download.suggestedFilename()}`);
  const path = `${OUT}/${expected}`;
  await download.saveAs(path);
  const pages = await pdfPages(path);
  pages.forEach((text, i) => {
    for (const piece of [
      `${FIRST} ${LAST}`,
      'DOB: 01/12/1943',
      `Page ${i + 1} of ${pages.length}`,
      '7919 Kennedy Blvd.',
      'Confidential',
    ])
      if (!text.includes(piece)) throw new Error(`page ${i + 1} lacks "${piece}"`);
  });
  const all = pages.join(' ');
  for (const piece of [
    'Annual Wellness Visit — Preventive Services',
    'Abdominal aortic aneurysm screening',
    'Breast cancer screening (Mammogram) - 1x/ yr',
    'Result: Neg',
    'Completed 03/14/2025',
    'Result: not recorded',
    'Completed 2026',
    'Offered/Refused',
    'Tobacco cessation counseling',
    'Electronically signed by',
  ]) {
    if (!all.includes(piece)) throw new Error(`page 2 lacks "${piece}"`);
  }
  for (const spanish of ['Firmado', 'Confidencial'])
    if (all.includes(spanish)) throw new Error(`Spanish on page 2: ${spanish}`);
});

await step(
  'saying page 2 arrived clears it — and the patient, since page 1 is untouched',
  async () => {
    await page
      .getByTestId('download-check')
      .getByRole('button', { name: /clear page 2/ })
      .click();
    await page.getByText('Page 2 is cleared.').waitFor({ timeout: 5000 });
    if (
      (await section('patient')
        .getByLabel(/Last name/)
        .inputValue()) !== ''
    )
      throw new Error('name still there');
    if (await page.getByTestId('service-mammogram').getByLabel('Yes', { exact: true }).isChecked())
      throw new Error('answers still there');
  },
);

await step('a provider opens on page 1', async () => {
  const added = await call(admin, `/job-roles/${provider.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ employeeId: me.id }),
  });
  if (added.status >= 300) throw new Error(`adding answered ${added.status}`);
  await page.goto(`${BASE}/clinical/wellness`, { waitUntil: 'networkidle' });
  await page.getByTestId('wellness-visit').waitFor({ timeout: 15000 });
  if (
    (await page
      .getByTestId('awv-pages')
      .getByRole('button', { name: /Page 1/ })
      .getAttribute('aria-pressed')) !== 'true'
  )
    throw new Error('not on page 1');
  await section('history').waitFor({ timeout: 5000 });
});

await step(
  'in Spanish, the questions are shown in Spanish with the English under them, and print in both',
  async () => {
    await pick(section('patient'), /preferred language/, 'Spanish');
    const health = group(section('history'), /describiría su salud/);
    await health.getByText('compared to others your age').waitFor({ timeout: 5000 });
    await health.getByLabel('Buena', { exact: true }).waitFor({ timeout: 5000 });
    const choice = page.getByRole('radiogroup', { name: 'Language' });
    if (!(await choice.getByLabel('English and Spanish').isChecked()))
      throw new Error('not switched to both');
  },
);

await step(
  'page 1, filled in, scores the SPMSQ and downloads as "AWV Questionnaire" in both languages',
  async () => {
    const p = section('patient');
    await p.getByLabel(/First name/).fill(FIRST);
    await p.getByLabel(/Last name/).fill(LAST);
    await p.getByLabel(/Date of birth/).fill('1943-01-12');

    const h = section('history');
    await pick(h, /describiría su salud/, 'Buena');
    await pick(h, /Usa drogas/, 'Nunca');
    await pick(h, /Vive solo/, 'No');
    await h.getByLabel(/Con quién vive/).fill('Hija Testfamily');
    await pick(h, /apoyo emocional/, 'Siempre');
    await pick(h, /abuso emocional/, 'No');
    await pick(h, /problema con la vista/, 'Sí');
    await pick(h, /Usa lentes/, 'Sí');
    await pick(h, /problema de audición/, 'No');
    await pick(h, /Tiene algún dolor/, 'Sí');
    await pick(h, /Escala de dolor/, '6');
    await pick(h, /testamento vital/, 'No');
    await pick(h, /Le interesa hablar/, 'Sí');
    await pick(h, /Hace ejercicio/, 'Sí');
    await h.getByLabel(/Días por semana/).fill('3');
    await h.getByLabel(/Minutos por día/).fill('30');
    await pick(h, /miedo de caerse/, 'No');
    await pick(h, /últimos 12 meses/, 'Sí');
    await h.getByLabel(/Cuántas veces/).fill('2');
    await pick(h, /últimos 6 meses/, 'No');
    await pick(h, /escapa la orina/, 'Sí');
    await pick(h, /Cuál\(es\)\?/, 'Al toser o estornudar');
    await pick(h, /vida diaria/, 'Sí');
    await pick(h, /Actividades instrumentales/, 'No');
    await pick(h, /Tiene ayuda/, 'Sí');
    await pick(h, /detectores de humo/, 'No');
    await pick(h, /no tiene/, 'Buena iluminación');
    await pick(h, /capacidad para concentrarse/, 'No');

    const s = section('spmsq');
    for (let i = 0; i < 10; i++) {
      // By number: the folded "still needed" list is a group too.
      await group(s, new RegExp(`^${i + 1}\\.`))
        .getByLabel(i < 3 ? 'Incorrecto' : 'Correcto', { exact: true })
        .check();
    }
    await pick(s, /^Education/, 'Beyond high school');
    // 3 incorrect, one more counted for education beyond high school: 4 — mild.
    await page
      .getByTestId('spmsq-score')
      .getByText('Mild cognitive impairment')
      .waitFor({ timeout: 5000 });

    await page.getByText('Everything required is filled in.').waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${OUT}/wellness-page1.png`, fullPage: false });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.getByRole('button', { name: 'Download page 1' }).click(),
    ]);
    const expected = `${fileDate} AWV Questionnaire.pdf`;
    if (download.suggestedFilename() !== expected)
      throw new Error(`file ${download.suggestedFilename()}`);
    const path = `${OUT}/${expected}`;
    await download.saveAs(path);
    const pages = await pdfPages(path);
    pages.forEach((text, i) => {
      for (const piece of [
        `${FIRST} ${LAST}`,
        'DOB: 01/12/1943',
        `Page ${i + 1} of ${pages.length}`,
      ])
        if (!text.includes(piece)) throw new Error(`page ${i + 1} lacks "${piece}"`);
    });
    const all = pages.join(' ');
    for (const piece of [
      'Annual Wellness Visit — Questionnaire',
      'Social History / Functional Ability Assessment',
      'Asked in Spanish',
      'Hija Testfamily',
      'pain scale (0-10): 6',
      '3 days a week',
      '30 minutes a day',
      '2 times',
      'which: cough or sneeze',
      'does not have: good lighting',
      'Short Portable Mental Status Questionnaire (SPMSQ)',
      '3 of 10 incorrect',
      'Mild cognitive impairment',
      'Beyond high school',
      'Electronically signed by',
      // And again in Spanish.
      'Visita Anual de Bienestar — Cuestionario',
      '¿con quién vive? Hija',
      'escala de dolor (0-10): 6',
      '3 días por semana',
      'no tiene: buena iluminación',
      'Deterioro cognitivo leve',
      'Firmado electrónicamente por',
    ]) {
      if (!all.includes(piece)) throw new Error(`page 1 lacks "${piece}"`);
    }
    const spanishStarts = pages.findIndex((text) =>
      text.includes('Visita Anual de Bienestar — Cuestionario'),
    );
    if (spanishStarts < 1) throw new Error(`Spanish starts on page ${spanishStarts + 1}`);
    if (pages[spanishStarts].includes('Social History'))
      throw new Error('the Spanish page carries English');
    if (all.includes('native speaker')) throw new Error('the review note is on the PDF');
  },
);

await step('leaving by a link asks first, and staying keeps the form', async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByText('Leave and lose what you have entered?').waitFor({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Stay on the form' }).click();
  await page.waitForTimeout(300);
  if (!page.url().endsWith('/clinical/wellness')) throw new Error(`moved to ${page.url()}`);
  if (
    (await section('patient')
      .getByLabel(/Last name/)
      .inputValue()) !== LAST
  )
    throw new Error('the form was cleared');
});

await step('saying page 1 arrived clears it, and leaving no longer asks', async () => {
  await page
    .getByTestId('download-check')
    .getByRole('button', { name: /clear page 1/ })
    .click();
  await page.getByText('Page 1 is cleared.').waitFor({ timeout: 5000 });
  if (
    (await section('patient')
      .getByLabel(/Last name/)
      .inputValue()) !== ''
  )
    throw new Error('name still there');
  await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click();
  await page
    .getByText(/Not clocked in|On the clock/)
    .first()
    .waitFor({ timeout: 10000 });
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
  if (writes.length > 0)
    throw new Error(`requests with a body: ${writes.map((w) => w.url).join(', ')}`);
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
  await page.goto(`${BASE}/clinical/wellness`, { waitUntil: 'networkidle' });
  await page.getByTestId('wellness-visit').waitFor({ timeout: 10000 });
  for (const which of [/Page 1/, /Page 2/]) {
    await page.getByTestId('awv-pages').getByRole('button', { name: which }).click();
    if ((await page.locator('input[type=file]').count()) > 0)
      throw new Error('a file input appeared');
  }
});

await step('Help has a section on it', async () => {
  await page.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Annual Wellness Visit' }).waitFor({ timeout: 10000 });
});

await call(admin, `/job-roles/${provider.id}/members/${me.id}`, { method: 'DELETE' });
await browser.close();
console.log(
  `\n${errors.length === 0 ? 'ALL WELLNESS FORM CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`,
);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
