import { chromium } from 'playwright';
import { goTo } from './nav.mjs';
import { mkdirSync } from 'node:fs';
// License types (Dominguez, September 2026): what the practice asks for, which
// job roles need each one — required or optional — and how often it renews.
// Managers keep the list; each person is shown against it.
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

/// A date n days from New Jersey's today.
const dayOffset = (n) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};

const signIn = async (page, email) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('navigation').getByRole('link', { name: /^Schedule/ }).waitFor({ timeout: 20000 });
};

const mgr = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
mgr.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');
const openLicenses = async () => {
  await mgr.goto(`${BASE}/credentials`, { waitUntil: 'networkidle' });
  await mgr.getByText('Licenses and Certifications').waitFor({ timeout: 15000 });
};
await openLicenses();

await step('the starting list is there: providers need their license, CDS, DEA and malpractice', async () => {
  await mgr.getByRole('button', { name: 'License types' }).click();
  const dea = mgr.getByTestId('credential-type-DEA registration');
  await dea.getByText('Provider: required').waitFor({ timeout: 10000 });
  await dea.getByText('Renewed every 36 months').waitFor({ timeout: 5000 });
  await mgr.getByTestId('credential-type-BLS').getByText('Provider: optional').waitFor({ timeout: 5000 });
  for (const name of ['Medical license', 'CDS registration', 'Medical malpractice insurance', 'ACLS', 'Student-Athlete Cardiac Assessment Certificate', 'Flu vaccine', 'TB test']) {
    await mgr.getByTestId(`credential-type-${name}`).waitFor({ timeout: 5000 });
  }
});

await step('a manager adds one: renewed yearly, required for Medical Assistants', async () => {
  await mgr.getByRole('button', { name: '+ New license type' }).click();
  await mgr.getByLabel('Name').fill('Hep B vaccine');
  await mgr.getByLabel('Kind').selectOption({ label: 'Immunization' });
  await mgr.getByLabel('Renewed every (months)').fill('12');
  await mgr.getByLabel('Medical Assistant needs it').selectOption('required');
  await mgr.getByLabel('Front Desk needs it').selectOption('optional');
  const saved = mgr.waitForResponse((r) => r.url().endsWith('/api/credential-types') && r.request().method() === 'POST');
  await mgr.getByRole('button', { name: 'Save license type' }).click();
  if ((await saved).status() !== 201) throw new Error('the new type was refused');
  const card = mgr.getByTestId('credential-type-Hep B vaccine');
  await card.getByText('Front Desk: optional · Medical Assistant: required').waitFor({ timeout: 10000 });
});
await mgr.screenshot({ path: `${OUT}/credential-types.png`, fullPage: true });

await step('by person: a Medical Assistant without it is flagged, a Front Desk one only listed', async () => {
  await mgr.getByRole('button', { name: 'By person' }).click();
  const max = mgr.getByTestId('standing-Max Assistant');
  await max.getByText('1 required one not on file').waitFor({ timeout: 10000 });
  await max.getByText('Required for Medical Assistant').waitFor({ timeout: 5000 });
  // Frankie is Front Desk and a Medical Assistant, so required wins.
  await mgr.getByTestId('standing-Frankie Front-Desk').getByText('Required for Front Desk, Medical Assistant').waitFor({ timeout: 5000 });
});

await step('the banner and the nightly round-up say so', async () => {
  await openLicenses();
  const banner = mgr.getByTestId('needs-attention');
  await banner.getByText('Required licenses not on file').waitFor({ timeout: 10000 });
  await banner.getByText('Max Assistant — Hep B vaccine, required for Medical Assistant, not on file').waitFor({ timeout: 5000 });
});

await step('Record it starts the form on that person and license; the date it was done is enough', async () => {
  await mgr.getByRole('button', { name: 'By person' }).click();
  await mgr.getByRole('button', { name: 'Record Hep B vaccine for Max Assistant' }).click();
  if ((await mgr.getByLabel('Which').inputValue()) === '') throw new Error('the license was not chosen');
  await mgr.getByText('Renewed every 12 months — the date it was done is enough.').waitFor({ timeout: 5000 });
  await mgr.getByLabel('Done on').fill(dayOffset(-10));
  await mgr.getByText('Worked out: 12 months after the date it was done.').waitFor({ timeout: 5000 });
  const saved = mgr.waitForResponse((r) => r.url().endsWith('/api/credentials') && r.request().method() === 'POST');
  await mgr.getByRole('button', { name: 'Record it', exact: true }).click();
  const response = await saved;
  if (response.status() !== 201) throw new Error(`answered ${response.status()}: ${await response.text()}`);
  const body = await response.json();
  const expected = new Date(`${dayOffset(-10)}T00:00:00Z`);
  expected.setUTCMonth(expected.getUTCMonth() + 12);
  if (body.expiresOn.slice(0, 10) !== expected.toISOString().slice(0, 10)) {
    throw new Error(`expires ${body.expiresOn.slice(0, 10)}, expected ${expected.toISOString().slice(0, 10)}`);
  }
  await mgr.getByRole('button', { name: 'By person' }).click();
  const max = mgr.getByTestId('standing-Max Assistant');
  await max.getByText('current').waitFor({ timeout: 10000 });
  if (await max.getByText('required one not on file').count()) throw new Error('still flagged');
});

await step('it is on their card in the Staff editor', async () => {
  await mgr.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: /^Edit Max Assistant/ }).click();
  const licenses = mgr.getByTestId('staff-licenses');
  await licenses.getByText('Hep B vaccine').waitFor({ timeout: 10000 });
  await licenses.getByText(/current ·/).waitFor({ timeout: 5000 });
});

await step('removing it asks first, and then nobody is expected to have it', async () => {
  await openLicenses();
  await mgr.getByRole('button', { name: 'License types' }).click();
  await mgr.getByTestId('credential-type-Hep B vaccine').getByRole('button', { name: 'Remove' }).click();
  const ask = mgr.getByRole('alertdialog', { name: 'Stop asking for Hep B vaccine?' });
  await ask.waitFor({ timeout: 5000 });
  await ask.getByRole('button', { name: 'Stop asking for it' }).click();
  await mgr.getByTestId('credential-type-Hep B vaccine').waitFor({ state: 'detached', timeout: 10000 });
  await mgr.getByRole('button', { name: 'By person' }).click();
  await mgr.waitForTimeout(500);
  if (await mgr.getByTestId('standing-Max Assistant').count()) throw new Error('Max is still expected to have it');
});

await step('staff see their own list, and cannot change the types', async () => {
  // Put it back, required for Front Desk, so Frankie has something to see.
  await openLicenses();
  await mgr.getByRole('button', { name: 'License types' }).click();
  await mgr.getByRole('button', { name: '+ New license type' }).click();
  await mgr.getByLabel('Name').fill('Hep B vaccine');
  await mgr.getByLabel('Kind').selectOption({ label: 'Immunization' });
  await mgr.getByLabel('Front Desk needs it').selectOption('required');
  await mgr.getByRole('button', { name: 'Save license type' }).click();
  await mgr.getByTestId('credential-type-Hep B vaccine').getByText('Front Desk: required').waitFor({ timeout: 10000 });

  const frankie = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await signIn(frankie, 'frontdesk@domihealthcare.com');
  await frankie.goto(`${BASE}/credentials`, { waitUntil: 'networkidle' });
  await frankie.getByText('What your job role asks for').waitFor({ timeout: 10000 });
  await frankie.getByText('Hep B vaccine').first().waitFor({ timeout: 5000 });
  if (await frankie.getByRole('button', { name: 'License types' }).count()) throw new Error('staff offered License types');
  const refused = await frankie.evaluate(async () =>
    (await fetch('/api/credential-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Mine', kind: 'OTHER' }) })).status,
  );
  if (refused !== 403) throw new Error(`staff making a type answered ${refused}`);
});

// Leave the starting list as it was.
await mgr.evaluate(async () => {
  const types = await (await fetch('/api/credential-types')).json();
  const hepB = types.find((t) => t.name === 'Hep B vaccine');
  if (hepB) await fetch(`/api/credential-types/${hepB.id}`, { method: 'DELETE' });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL LICENSE-TYPE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
