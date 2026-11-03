import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Resources → Add several links (November 2026, Dominguez: "i have a bunch of
 * links from bookmarked sites that staff use, where can i put these?"). A
 * manager reads a browser's exported bookmarks file, or a pasted list, checks
 * and renames the links, puts each in a section and adds them in one go. The
 * file is read in the browser: only the names and addresses ticked are sent.
 * run-all.sh clears the resources.
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

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

const BOOKMARKS = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://workforcenow.adp.com/" ICON="data:image/png;base64,AAAA">ADP Workforce</A>
        <DT><H3>Insurance portals</H3>
        <DL><p>
            <DT><A HREF="https://www.availity.com/">Availity &amp; claims</A>
            <DT><A HREF="javascript:alert('x')">A bookmarklet</A>
        </DL><p>
    </DL><p>
</DL><p>`;

const manager = await signIn('manager@domihealthcare.com');
const staff = await signIn('frontdesk@domihealthcare.com');
const file = `${OUT}/bookmarks_import_test.html`;
writeFileSync(file, BOOKMARKS);

const sent = [];
manager.on('request', (request) => {
  if (request.method() !== 'GET') sent.push(request.postData() ?? '');
});

await step('staff have no way to add links', async () => {
  await staff.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  if ((await staff.getByRole('button', { name: 'Add several links' }).count()) > 0) {
    throw new Error('staff see Add several links');
  }
  const refused = await staff.evaluate(async () => {
    const r = await fetch('/api/resources/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links: [{ title: 'ADP', url: 'https://adp.com', jobRoleId: null }] }),
    });
    return r.status;
  });
  if (refused !== 403) throw new Error(`staff importing answered ${refused}`);
});

await step('a bookmarks file is read on the screen, folders and all, leaving out a bookmarklet', async () => {
  await manager.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  // Nothing on the screen takes a file until the pop-up is opened.
  if ((await manager.locator('input[type=file]').count()) > 0) throw new Error('a file input is on the page');
  await manager.getByRole('button', { name: 'Add several links' }).click();
  const dialog = manager.getByTestId('import-links');
  await dialog.getByLabel('Choose the bookmarks file').setInputFiles(file);
  await dialog.getByText(/2 links found, and 1 left out/).waitFor({ timeout: 10000 });
  await dialog.getByText('Insurance portals').waitFor();
  // Nothing has been sent yet: the file was read here.
  if (sent.some((body) => body.includes('availity'))) throw new Error('sent before Add');
});

await step('each link can be renamed and put in a section, and only those ticked are added', async () => {
  const dialog = manager.getByTestId('import-links');
  await dialog.getByLabel('Name for https://workforcenow.adp.com/').fill('ADP (payroll and pay stubs)');
  await dialog.getByLabel('Section for Availity & claims').selectOption({ label: 'Front Desk' });
  await manager.screenshot({ path: `${OUT}/import-links.png` });
  await dialog.getByRole('button', { name: 'Add 2 links' }).click();
  await manager.getByText('Added 2 links.').waitFor({ timeout: 10000 });
  await manager
    .getByTestId('section-Everyone')
    .getByTestId('resource-ADP (payroll and pay stubs)')
    .waitFor({ timeout: 10000 });
  await manager.getByTestId('section-Front Desk').getByTestId('resource-Availity & claims').waitFor();
  const body = sent.find((entry) => entry.includes('"links"')) ?? '';
  if (body.includes('ICON') || body.includes('Bookmarks bar') || body.includes('javascript')) {
    throw new Error(`sent more than names and addresses: ${body}`);
  }
});

await step('a pasted list works too, and a link already in its section is left out and named', async () => {
  await manager.getByRole('button', { name: 'Add several links' }).click();
  const dialog = manager.getByTestId('import-links');
  await dialog
    .getByLabel('Links to add, one to a line')
    .fill('Quest https://quest.com\nADP again, workforcenow.adp.com');
  await dialog.getByRole('button', { name: 'Read these' }).click();
  await dialog.getByText('Already in that section.').waitFor({ timeout: 10000 });
  // It starts unticked; tick it anyway to see the server leave it out.
  await dialog.getByLabel('Add ADP again').check();
  await dialog.getByRole('button', { name: 'Add 2 links' }).click();
  await manager.getByText(/Added 1 link; 1 already there, so left out \(ADP again\)/).waitFor({ timeout: 10000 });
  await manager.getByTestId('section-Everyone').getByTestId('resource-Quest').waitFor();
});

await step('staff see the links in their sections', async () => {
  await staff.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
  await staff.getByTestId('section-Front Desk').getByTestId('resource-Availity & claims').waitFor({ timeout: 10000 });
  await staff.getByTestId('section-Everyone').getByTestId('resource-ADP (payroll and pay stubs)').waitFor();
});

await browser.close();
if (errors.length) {
  console.log(`\n${errors.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
