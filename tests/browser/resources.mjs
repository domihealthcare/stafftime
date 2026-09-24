import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Defaults to the dev server; point at `vite preview` to test the built bundle
// with the deployed security headers applied.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  // Fall back to whatever Playwright downloaded when CHROMIUM_PATH is unset.
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
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
}

async function go(page, menu, link) {
  await page.getByRole('button', { name: menu, exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: link, exact: true }).click();
}

const role = (page, name) => page.getByTestId(`job-role-${name}`);
const section = (page, name) => page.getByTestId(`section-${name}`);

async function addResource(page, sectionName, { kind = 'link', title, url, body }) {
  await section(page, sectionName).getByRole('button', { name: `+ Add to ${sectionName}` }).click();
  const form = section(page, sectionName);
  if (kind === 'page') await form.getByRole('button', { name: 'A written page' }).click();
  await form.getByLabel('Title').fill(title);
  if (url !== undefined) await form.getByLabel('Web address').fill(url);
  if (body !== undefined) await form.getByLabel(kind === 'page' ? 'The page' : 'A line about it').fill(body);
  await form.getByRole('button', { name: 'Add it' }).click();
}

// A manager — not an admin — keeps job roles. That is the point of the step.
const mgr = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
mgr.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

await step('a manager finds Job roles under Manage, with the starting list', async () => {
  await go(mgr, 'Manage', 'Job roles');
  for (const name of ['Front Desk', 'Medical Assistant', 'Provider', 'Administrative', 'Manager']) {
    await role(mgr, name).waitFor({ timeout: 15000 });
  }
  const names = await mgr.locator('[data-testid^="job-role-"] h2').allInnerTexts();
  if (names.join('|') !== 'Front Desk|Medical Assistant|Provider|Administrative|Manager')
    throw new Error(`unexpected order: ${names.join(', ')}`);
});

await step('the screen says a job role grants no access', async () => {
  await mgr.getByText(/does not let anyone approve hours or change settings/).waitFor({ timeout: 5000 });
});

await step('somebody can hold more than one role', async () => {
  // The seed puts Frankie in both Front Desk and Medical Assistant.
  await role(mgr, 'Front Desk').getByText('Frankie Front-Desk').waitFor({ timeout: 5000 });
  await role(mgr, 'Medical Assistant').getByText('Frankie Front-Desk').waitFor({ timeout: 5000 });
});

await step('a manager creates a role, and a near-duplicate is refused', async () => {
  await mgr.getByRole('button', { name: '+ New job role' }).click();
  await mgr.getByLabel('Name').fill('Billing');
  await mgr.getByRole('button', { name: 'Create it' }).click();
  await role(mgr, 'Billing').waitFor({ timeout: 10000 });

  await mgr.getByRole('button', { name: '+ New job role' }).click();
  await mgr.getByLabel('Name').fill('front desk');
  await mgr.getByRole('button', { name: 'Create it' }).click();
  await mgr.getByText('There is already a job role called front desk.').waitFor({ timeout: 10000 });
  await mgr.getByRole('button', { name: 'Cancel' }).click();
});

/// The colour a role card wears, read from its dot.
const dotColour = (card) =>
  card.getByTestId('job-role-dot').first().evaluate((el) => getComputedStyle(el).backgroundColor);

await step('each starting role wears its own colour, and a new one gets a free colour', async () => {
  const colours = [];
  for (const name of ['Front Desk', 'Medical Assistant', 'Provider', 'Administrative', 'Manager', 'Billing']) {
    colours.push(await dotColour(role(mgr, name)));
  }
  if (new Set(colours).size !== colours.length)
    throw new Error(`two roles share a colour: ${colours.join(', ')}`);
});

await step('a manager renames a role and changes its colour', async () => {
  await role(mgr, 'Billing').getByRole('button', { name: 'Edit', exact: true }).click();
  await mgr.getByLabel('Name').fill('Billing & Coding');
  await mgr.getByText('Violet', { exact: true }).click();
  const saved = mgr.waitForResponse((r) => r.url().includes('/api/job-roles/') && r.request().method() === 'PATCH');
  await mgr.getByRole('button', { name: 'Save', exact: true }).click();
  if (!(await saved).ok()) throw new Error('the save was refused');
  await role(mgr, 'Billing & Coding').waitFor({ timeout: 10000 });
  // #4a3aa7, the palette's violet.
  const colour = await dotColour(role(mgr, 'Billing & Coding'));
  if (colour !== 'rgb(74, 58, 167)') throw new Error(`the role is ${colour}, not violet`);
});

await step('a colour outside the palette is refused by the server', async () => {
  const status = await mgr.evaluate(async () => {
    const roles = await fetch('/api/job-roles').then((r) => r.json());
    const target = roles.find((r) => r.name === 'Billing & Coding');
    const res = await fetch(`/api/job-roles/${target.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colour: '#ff00ff' }),
    });
    return res.status;
  });
  if (status !== 400) throw new Error(`expected 400, got ${status}`);
});

await step('a manager puts somebody in a role and takes them out again', async () => {
  const card = role(mgr, 'Billing & Coding');
  await card.getByLabel('Add someone to Billing & Coding').selectOption({ label: 'Max Assistant' });
  await card.getByRole('button', { name: 'Add', exact: true }).click();
  await card.getByText('Max Assistant').waitFor({ timeout: 10000 });
  await card.getByText('1 person').waitFor({ timeout: 5000 });

  await card.getByRole('button', { name: 'Take Max Assistant out of Billing & Coding' }).click();
  await mgr.getByRole('alertdialog', { name: 'Take Max Assistant out of Billing & Coding?' }).getByRole('button', { name: 'Take them out' }).click();
  await card.getByText('Nobody is in this role yet.').waitFor({ timeout: 10000 });
});
await mgr.screenshot({ path: `${OUT}/80-job-roles.png`, fullPage: true });

await step('Resources opens with a section for everyone and one per role', async () => {
  await go(mgr, 'Team', 'Resources');
  for (const name of ['Everyone', 'Front Desk', 'Medical Assistant', 'Provider', 'Billing & Coding']) {
    await section(mgr, name).waitFor({ timeout: 15000 });
  }
  // The manager is in Manager, and is told which of these is theirs.
  await section(mgr, 'Manager').getByText('Yours').waitFor({ timeout: 5000 });
});

await step('a manager adds a written page for everyone', async () => {
  await addResource(mgr, 'Everyone', {
    kind: 'page',
    title: 'Opening the office',
    body: 'Lights and alarm.\nPhones off night mode.\nCheck the fridge log.',
  });
  await section(mgr, 'Everyone').getByRole('link', { name: 'Opening the office' }).waitFor({ timeout: 10000 });
});

await step('a pasted address without https is taken as a web link', async () => {
  await addResource(mgr, 'Front Desk', {
    title: 'Phone scripts',
    url: 'drive.google.com/drive/folders/front-desk',
    body: 'What to say when a patient calls to reschedule.',
  });
  const link = section(mgr, 'Front Desk').getByRole('link', { name: /Phone scripts/ });
  await link.waitFor({ timeout: 10000 });
  const href = await link.getAttribute('href');
  if (href !== 'https://drive.google.com/drive/folders/front-desk')
    throw new Error(`stored as ${href}`);
  if ((await link.getAttribute('rel')) !== 'noopener noreferrer') throw new Error('link can reach back');
  await section(mgr, 'Front Desk').getByText('drive.google.com', { exact: true }).waitFor({ timeout: 5000 });
});

await step('a javascript: link is refused', async () => {
  await addResource(mgr, 'Provider', { title: 'Trick', url: 'javascript:alert(1)' });
  await section(mgr, 'Provider').getByText('Links have to be web addresses, starting https://.').waitFor({ timeout: 10000 });
  await section(mgr, 'Provider').getByRole('button', { name: 'Cancel' }).click();
});

await step('a manager adds one for Medical Assistant and one for Provider', async () => {
  await addResource(mgr, 'Medical Assistant', {
    kind: 'page',
    title: 'Rooming a patient',
    body: 'Vitals, allergies, reason for visit.',
  });
  await section(mgr, 'Medical Assistant').getByRole('link', { name: 'Rooming a patient' }).waitFor({ timeout: 10000 });

  await addResource(mgr, 'Provider', {
    kind: 'page',
    title: 'On-call rota rules',
    body: 'Only for providers.',
  });
  await section(mgr, 'Provider').getByRole('link', { name: 'On-call rota rules' }).waitFor({ timeout: 10000 });
});

await step('a resource can be moved to another role', async () => {
  await section(mgr, 'Medical Assistant').getByRole('button', { name: 'Edit' }).click();
  await section(mgr, 'Medical Assistant').getByLabel('Who sees it').selectOption({ label: 'Billing & Coding' });
  await section(mgr, 'Medical Assistant').getByRole('button', { name: 'Save changes' }).click();
  await section(mgr, 'Billing & Coding').getByRole('link', { name: 'Rooming a patient' }).waitFor({ timeout: 10000 });

  // And back, where it belongs.
  await section(mgr, 'Billing & Coding').getByRole('button', { name: 'Edit' }).click();
  await section(mgr, 'Billing & Coding').getByLabel('Who sees it').selectOption({ label: 'Medical Assistant' });
  await section(mgr, 'Billing & Coding').getByRole('button', { name: 'Save changes' }).click();
  await section(mgr, 'Medical Assistant').getByRole('link', { name: 'Rooming a patient' }).waitFor({ timeout: 10000 });
});

await step('nothing on the screen takes a file', async () => {
  await section(mgr, 'Everyone').getByRole('button', { name: '+ Add to Everyone' }).click();
  if ((await mgr.locator('input[type=file]').count()) > 0) throw new Error('a file input appeared');
  await section(mgr, 'Everyone').getByRole('button', { name: 'Cancel' }).click();
});
await mgr.screenshot({ path: `${OUT}/81-resources-manager.png`, fullPage: true });

await step('a role with resources cannot be deleted; an empty one can', async () => {
  await go(mgr, 'Manage', 'Job roles');
  await role(mgr, 'Provider').getByRole('button', { name: 'Delete', exact: true }).click();
  await mgr.getByRole('alertdialog', { name: 'Delete the Provider job role?' }).getByRole('button', { name: 'Delete it' }).click();
  await mgr.getByText('Provider still has 1 resource. Move or delete it first.').waitFor({ timeout: 10000 });

  await role(mgr, 'Billing & Coding').getByRole('button', { name: 'Delete', exact: true }).click();
  await mgr.getByRole('alertdialog', { name: 'Delete the Billing & Coding job role?' }).getByRole('button', { name: 'Delete it' }).click();
  await role(mgr, 'Billing & Coding').waitFor({ state: 'detached', timeout: 10000 });
});

let providerPage = '';
await step('find the provider-only page address', async () => {
  providerPage = await mgr.evaluate(async () => {
    const { sections } = await fetch('/api/resources').then((r) => r.json());
    const provider = sections.find((s) => s.jobRole?.name === 'Provider');
    return provider.resources[0].id;
  });
});

await step('someone in two roles sees both, and nothing else', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const emp = await ctx.newPage();
  emp.on('pageerror', (e) => errors.push(`employee pageerror: ${e.message}`));
  await signIn(emp, 'frontdesk@domihealthcare.com');
  await go(emp, 'Team', 'Resources');

  await section(emp, 'Everyone').waitFor({ timeout: 15000 });
  await section(emp, 'Front Desk').getByRole('link', { name: /Phone scripts/ }).waitFor({ timeout: 5000 });
  await section(emp, 'Medical Assistant').getByRole('link', { name: 'Rooming a patient' }).waitFor({ timeout: 5000 });
  if ((await section(emp, 'Provider').count()) > 0) throw new Error('Frankie saw the Provider section');
  if ((await emp.getByRole('button', { name: /^\+ Add to/ }).count()) > 0)
    throw new Error('an employee was offered Add');
  if ((await emp.getByRole('button', { name: 'Manage', exact: true }).count()) > 0)
    throw new Error('an employee was shown the Manage menu');

  const overflow = await emp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Resources scrolls sideways on a phone');
  await emp.screenshot({ path: `${OUT}/82-resources-phone.png`, fullPage: true });

  await section(emp, 'Everyone').getByRole('link', { name: 'Opening the office' }).click();
  await emp.getByRole('heading', { name: 'Opening the office' }).waitFor({ timeout: 10000 });
  const text = await emp.locator('article').innerText();
  if (!/Lights and alarm.\nPhones off night mode./.test(text)) throw new Error(`line breaks lost: ${text}`);

  // Typing the address of another role's page does not get round it.
  await emp.goto(`${BASE}/resources/${providerPage}`, { waitUntil: 'networkidle' });
  await emp.getByText('That is for a job role you are not in.').waitFor({ timeout: 10000 });
  if ((await emp.getByText('Only for providers.').count()) > 0) throw new Error('the page showed anyway');

  const status = await emp.evaluate(() =>
    fetch('/api/job-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Mine now' }),
    }).then((r) => r.status),
  );
  if (status !== 403) throw new Error(`an employee creating a job role got ${status}`);
  await ctx.close();
});

await step('the admin top bar fits in three rows on a phone', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const adm = await ctx.newPage();
  await signIn(adm, 'admin@domihealthcare.com');
  await adm.screenshot({ path: `${OUT}/83-top-bar-phone.png` });
  const height = await adm.locator('header').evaluate((el) => el.getBoundingClientRect().height);
  // Padding, the name, and three rows of links at about 40px each. Laid out
  // flat, an admin's fifteen screens took five.
  if (height > 24 + 28 + 3 * 42) throw new Error(`the header is ${height}px tall`);

  await adm.getByRole('button', { name: 'Manage', exact: true }).click();
  for (const name of ['Job roles', 'Export', 'Staff', 'Kiosks', 'Locations']) {
    const link = adm.getByRole('link', { name, exact: true });
    await link.waitFor({ timeout: 5000 });
    const box = await link.boundingBox();
    if (!box || box.x < 0 || box.x + box.width > 390) throw new Error(`${name} is off the screen`);
  }
  await adm.screenshot({ path: `${OUT}/83-manage-menu-phone.png` });

  // Escape closes it.
  await adm.keyboard.press('Escape');
  await adm.getByRole('link', { name: 'Kiosks', exact: true }).waitFor({ state: 'detached', timeout: 5000 });
  await ctx.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL RESOURCE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
