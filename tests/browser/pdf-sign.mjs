import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { unlockPay } from './nav.mjs';

/**
 * Fill and sign a PDF (November 2026, Dominguez: "upload pdf's and write text
 * and put signature stamps and then download it (it would have PHI)"; "it
 * should be a saved signature, which primarily is for providers to have and
 * for staff (who we select) should be able to use"; chosen: staff stamp a
 * provider's).
 *
 * Casey (ma@) is made a provider and saves a signature. Frankie (front desk)
 * is chosen by the admin to stamp a provider's, opens a PDF with a fake
 * patient on it, types, ticks, dates and stamps Casey's signature, and
 * downloads it. What matters most is what does not happen: the PDF and the
 * patient's details never reach the server, so every request is watched.
 * run-all.sh clears the signatures and the stamp switch.
 */
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

async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const unlocked = page.getByText(/Not clocked in|On the clock/).first();
  const mustChange = page.getByText('Choose a new password');
  await unlocked.or(mustChange).first().waitFor({ timeout: 20000 });
  passwords.set(page, 'shift-change-2026');
  if (await mustChange.isVisible()) {
    // Casey (ma@) starts on a temporary password.
    await page.getByLabel('Temporary password').fill('shift-change-2026');
    await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
    await page.getByLabel('Confirm new password').fill('harbour lantern 7');
    await page.getByRole('button', { name: 'Change password' }).click();
    await unlocked.waitFor({ timeout: 15000 });
    passwords.set(page, 'harbour lantern 7');
  }
  return page;
}

const passwords = new Map();
/// Opens the PIN in front of signatures, as "Use your password instead" does.
const unlock = (page) => unlockPay(page, passwords.get(page));

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

// The fake patient. Nothing about them may ever appear in a request.
const PATIENT = 'Jane Testpatient';
const SECRETS = ['Testpatient', 'testpatient', 'TESTPATIENT', 'MRN 99-1234'];

/// A two-page PDF like a form someone sent: an upright page with the
/// patient's name printed on it, and a second page stored on its side.
async function testPdf(path) {
  const document = await PDFDocument.create();
  const first = document.addPage([612, 792]);
  first.drawText(`Patient: ${PATIENT}  MRN 99-1234`, { x: 72, y: 720, size: 12 });
  first.drawText('Provider signature: ____________________', { x: 72, y: 120, size: 12 });
  const second = document.addPage([612, 792]);
  second.setRotation(degrees(90));
  second.drawText('Page two, stored sideways', { x: 72, y: 500, size: 12 });
  writeFileSync(path, await document.save());
}

async function pdfInfo(path) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList();
    pages.push({
      rotate: page.rotate,
      items: content.items.map((item) => ({
        str: item.str,
        // Where the text starts, as the page is shown.
        at: viewport.convertToViewportPoint(item.transform[4], item.transform[5]),
      })),
      text: content.items.map((item) => item.str).join(' '),
      images: ops.fnArray.filter((fn) => fn === OPS.paintImageXObject).length,
    });
  }
  return pages;
}

const admin = await signIn('admin@domihealthcare.com');
const provider = await signIn('ma@domihealthcare.com');
const staff = await signIn('frontdesk@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const me = async (page) => (await call(page, '/auth/me')).body;
const casey = await me(provider);
const frankie = await me(staff);
const providerRole = (await call(admin, '/job-roles')).body.find((role) => role.name === 'Provider');

await step('staff not chosen are told it is not for them, and cannot stamp', async () => {
  await staff.goto(`${BASE}/pdf-sign`, { waitUntil: 'networkidle' });
  await staff.getByText(/This is for providers, and for the staff an admin has chosen/).waitFor({ timeout: 10000 });
  if ((await staff.getByLabel('Choose a PDF').count()) > 0) throw new Error('the PDF chooser is shown');
  await staff.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  if ((await staff.getByTestId('quick-actions').getByRole('link', { name: 'Fill and sign a PDF' }).count()) > 0) {
    throw new Error('the shortcut is on Home');
  }
  await unlock(staff);
  const stamp = await call(staff, `/signatures/${casey.id}/stamp`, { method: 'POST' });
  if (stamp.status !== 403) throw new Error(`stamping answered ${stamp.status}`);
});

await step('a provider saves a signature, drawn on the screen, behind the PIN', async () => {
  const added = await call(admin, `/job-roles/${providerRole.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ employeeId: casey.id }),
  });
  if (added.status >= 300) throw new Error(`making Casey a provider answered ${added.status}`);
  // The picture is behind the PIN.
  const locked = await call(provider, '/signatures/mine');
  if (locked.status !== 403) throw new Error(`locked read answered ${locked.status}`);

  await provider.goto(`${BASE}/pdf-sign`, { waitUntil: 'networkidle' });
  await provider.getByRole('heading', { name: 'Your signature', exact: true }).waitFor({ timeout: 10000 });
  await provider.screenshot({ path: `${OUT}/pdf-sign-locked.png`, fullPage: true });
  await provider.getByText(/Enter your PIN to see your signature/).waitFor({ timeout: 10000 });
  await unlock(provider);
  await provider.reload({ waitUntil: 'networkidle' });
  const pad = provider.getByLabel('Draw your signature here');
  await pad.waitFor({ timeout: 10000 });
  const box = await pad.boundingBox();
  await provider.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.6);
  await provider.mouse.down();
  for (let i = 1; i <= 30; i++) {
    await provider.mouse.move(
      box.x + box.width * (0.15 + i * 0.022),
      box.y + box.height * (0.6 - 0.25 * Math.sin(i / 3)),
    );
  }
  await provider.mouse.up();
  const [saved] = await Promise.all([
    provider.waitForResponse((r) => r.url().endsWith('/api/signatures/mine') && r.request().method() === 'PUT'),
    provider.getByRole('button', { name: 'Save this signature' }).click(),
  ]);
  if (saved.status() !== 200) throw new Error(`saving answered ${saved.status()}: ${await saved.text()}`);
  await provider.getByAltText('Your saved signature').waitFor({ timeout: 10000 });
  await provider.screenshot({ path: `${OUT}/pdf-sign-provider.png`, fullPage: true });
});

await step('the server takes only a PNG of a signature, and only from a provider', async () => {
  const jpeg = await call(provider, '/signatures/mine', {
    method: 'PUT',
    body: JSON.stringify({ image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ' }),
  });
  if (jpeg.status !== 400) throw new Error(`a JPEG answered ${jpeg.status}`);
  const notProvider = await call(staff, '/signatures/mine', {
    method: 'PUT',
    body: JSON.stringify({ image: 'iVBORw0KGgo=' }),
  });
  if (notProvider.status !== 403) throw new Error(`staff saving answered ${notProvider.status}`);
});

await step('an admin chooses who may stamp a provider’s, on the Staff editor', async () => {
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: /^Edit/ }).first().click();
  await admin.getByText('Can stamp a provider’s signature').first().waitFor({ timeout: 10000 });
  await admin.keyboard.press('Escape');
  const chosen = await call(admin, `/employees/${frankie.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ canStampSignatures: true }),
  });
  if (chosen.status >= 300) throw new Error(`choosing Frankie answered ${chosen.status}`);
  const overview = (await call(provider, '/signatures')).body;
  if (!overview.stampers.some((person) => person.id === frankie.id)) {
    throw new Error(`the provider does not see Frankie as a stamper: ${JSON.stringify(overview.stampers)}`);
  }
});

// From here on, every request Frankie's page makes is kept, to be searched for
// the fake patient's details and the PDF itself.
const requests = [];
staff.on('request', (request) => {
  requests.push({ url: request.url(), body: request.postDataBuffer()?.toString('latin1') ?? '' });
});
const pdfPath = `${OUT}/pdf-sign-input.pdf`;
await testPdf(pdfPath);
let pageBox = null;

await step('the chosen member of staff finds it on Home and Resources, and opens a PDF', async () => {
  await staff.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await staff.getByTestId('quick-actions').getByRole('link', { name: 'Fill and sign a PDF' }).waitFor({ timeout: 10000 });
  await staff.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  await staff.getByTestId('tool-pdf-sign').getByRole('link', { name: /Fill and sign a PDF/ }).click();
  await staff.getByLabel('Choose a PDF').waitFor({ state: 'attached', timeout: 10000 });
  // Unlocked first, so the stamp list is there without a prompt.
  await unlock(staff);
  await staff.reload({ waitUntil: 'networkidle' });
  await staff.getByLabel('Choose a PDF').setInputFiles(pdfPath);
  await staff.getByText('pdf-sign-input.pdf').waitFor({ timeout: 15000 });
  await staff.getByText('2 pages').waitFor();
  // pdf.js has drawn the first page.
  await staff.waitForFunction(() => {
    const canvas = document.querySelector('canvas[aria-label="Page 1"]');
    if (!canvas || !canvas.width) return false;
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 128) return true;
    return false;
  }, null, { timeout: 15000 });
  pageBox = await staff.locator('[data-page="1"]').boundingBox();
});

await step('typing, a tick, the date and a provider’s signature go where they are put', async () => {
  const scale = pageBox.width / 612;
  /// Clicks a spot on a page, in points from its top-left as shown,
  /// scrolling to it first.
  const at = (number, x, y, pageScale = scale) =>
    staff.locator(`[data-page="${number}"]`).click({
      position: { x: x * pageScale, y: y * pageScale },
    });
  // Text next to "Patient:" near the top.
  await staff.getByRole('button', { name: 'Add text' }).click();
  await at(1, 300, 100);
  await staff.keyboard.type(`Seen for ${PATIENT}`);
  await staff.keyboard.press('Enter');
  await staff.keyboard.type('No changes');
  await staff.getByRole('button', { name: '✓ Tick' }).click();
  await at(1, 80, 200);
  await staff.getByRole('button', { name: 'Today’s date' }).click();
  await at(1, 400, 700);

  const picker = staff.getByLabel('Stamp a signature');
  await picker.waitFor({ timeout: 10000 });
  const [stamped] = await Promise.all([
    staff.waitForResponse((r) => r.url().includes(`/api/signatures/${casey.id}/stamp`)),
    picker.selectOption(casey.id),
  ]);
  if (stamped.status() !== 201 && stamped.status() !== 200) throw new Error(`stamp answered ${stamped.status()}`);
  await staff.getByText(/Click on the page where .* signature goes/).waitFor({ timeout: 10000 });
  await at(1, 200, 660);
  await staff.getByRole('img', { name: /signature$/ }).waitFor({ timeout: 10000 });

  // Text on the sideways page too.
  const second = await staff.locator('[data-page="2"]').boundingBox();
  const scale2 = second.width / 792;
  await staff.getByRole('button', { name: 'Add text' }).click();
  await at(2, 100, 300, scale2);
  await staff.keyboard.type('Sideways note');
  await at(2, 600, 50, scale2);
  await staff.screenshot({ path: `${OUT}/pdf-sign-editor.png`, fullPage: true });
});

const outPath = `${OUT}/pdf-sign-output.pdf`;
await step('the download keeps its name and pages, with the writing and signature in them', async () => {
  const [download] = await Promise.all([
    staff.waitForEvent('download', { timeout: 20000 }),
    staff.getByRole('button', { name: 'Download PDF' }).first().click(),
  ]);
  if (download.suggestedFilename() !== 'pdf-sign-input (signed).pdf') {
    throw new Error(`named ${download.suggestedFilename()}`);
  }
  await download.saveAs(outPath);
  const pages = await pdfInfo(outPath);
  if (pages.length !== 2) throw new Error(`${pages.length} pages`);
  if (!pages[0].text.includes(`Seen for ${PATIENT}`) || !pages[0].text.includes('No changes')) {
    throw new Error(`page 1 reads: ${pages[0].text}`);
  }
  const today = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date());
  if (!pages[0].text.includes(today)) throw new Error(`no date ${today} on page 1: ${pages[0].text}`);
  if (pages[0].images !== 1) throw new Error(`${pages[0].images} images on page 1`);
  // The typed text starts where it was clicked, as the page is shown.
  const seen = pages[0].items.find((item) => item.str.startsWith('Seen for'));
  if (Math.abs(seen.at[0] - 300) > 6 || Math.abs(seen.at[1] - 100) > 12) {
    throw new Error(`typed text lands at ${seen.at.map(Math.round)}, clicked at 300,100`);
  }
  if (pages[1].rotate !== 90) throw new Error(`page 2 turned ${pages[1].rotate}`);
  const sideways = pages[1].items.find((item) => item.str === 'Sideways note');
  if (!sideways) throw new Error(`page 2 reads: ${pages[1].text}`);
  if (Math.abs(sideways.at[0] - 100) > 6 || Math.abs(sideways.at[1] - 300) > 12) {
    throw new Error(`sideways text lands at ${sideways.at.map(Math.round)}, clicked at 100,300`);
  }
});

await step('nothing about the PDF or the patient was sent anywhere, or kept in the browser', async () => {
  const leaked = requests.filter(
    (request) =>
      SECRETS.some((secret) => request.url.includes(secret) || request.body.includes(secret)) ||
      request.body.includes('%PDF'),
  );
  if (leaked.length) throw new Error(`sent: ${leaked.map((r) => r.url).join(', ')}`);
  const stored = await staff.evaluate(() =>
    JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
  );
  if (SECRETS.some((secret) => stored.includes(secret))) throw new Error('kept in browser storage');
});

await step('leaving with a PDF open asks first', async () => {
  await staff.getByRole('link', { name: 'Home' }).first().click();
  await staff.getByText('Leave and lose what you have entered?').waitFor({ timeout: 10000 });
  await staff.getByRole('button', { name: 'Stay on the form' }).click();
  await staff.getByText('pdf-sign-input.pdf').waitFor();
});

await step('the provider sees who stamped their signature, and the admin sees every stamp', async () => {
  await provider.goto(`${BASE}/pdf-sign`, { waitUntil: 'networkidle' });
  await provider.getByRole('heading', { name: 'Stamps of your signature' }).waitFor({ timeout: 10000 });
  await provider.getByText(/stamped by Frankie/).first().waitFor({ timeout: 10000 });
  const overview = (await call(admin, '/signatures')).body;
  if (overview.uses.length !== 1 || overview.uses[0].usedBy?.id !== frankie.id) {
    throw new Error(`admin sees ${JSON.stringify(overview.uses)}`);
  }
});

await step('a manager not chosen opens it but has no signature to stamp', async () => {
  await unlock(manager);
  await manager.goto(`${BASE}/pdf-sign`, { waitUntil: 'networkidle' });
  await manager.getByLabel('Choose a PDF').setInputFiles(pdfPath);
  await manager.getByText('2 pages').waitFor({ timeout: 15000 });
  if ((await manager.getByLabel('Stamp a signature').count()) > 0) throw new Error('a stamp list is shown');
  const stamp = await call(manager, `/signatures/${casey.id}/stamp`, { method: 'POST' });
  if (stamp.status !== 403) throw new Error(`stamping answered ${stamp.status}`);
});

await step('nobody else can stamp once the provider is no longer a provider', async () => {
  const removed = await call(admin, `/job-roles/${providerRole.id}/members/${casey.id}`, {
    method: 'DELETE',
  });
  if (removed.status >= 300) throw new Error(`removing answered ${removed.status}`);
  const stamp = await call(staff, `/signatures/${casey.id}/stamp`, { method: 'POST' });
  if (stamp.status !== 403) throw new Error(`stamping answered ${stamp.status}`);
});

await browser.close();
if (errors.length) {
  console.log(`\n${errors.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
