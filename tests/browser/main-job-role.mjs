import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { clockOut } from './clock-out.mjs';
import { goTo } from './nav.mjs';

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
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`);
    errors.push(`${name}: ${e.message}`);
  }
};

/**
 * Somebody's main job role, and staff photos put up by an admin (Dominguez,
 * October 2026: "Angelica Notario should be listed as administrator rather
 * than front desk in directory … it should be how they are scheduled … i
 * think everyone should have a 'primary' role" and "i should be able to
 * upload pictures for staff avatars").
 *
 * The seed makes Frankie Front Desk (main) and Medical Assistant, and Max
 * Medical Assistant only, at West New York. run-all.sh re-seeds the job roles
 * and removes this suite's shift.
 */
async function signIn(email, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ...options });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Max is seeded with a temporary password, to be changed on first sign-in.
  const unlocked = page.getByText('Not clocked in');
  const mustChange = page.getByText('Choose a new password');
  await unlocked.or(mustChange).first().waitFor({ timeout: 20000 });
  if (await mustChange.isVisible()) {
    await page.getByLabel('Temporary password').fill('shift-change-2026');
    await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
    await page.getByLabel('Confirm new password').fill('harbour lantern 7');
    await page.getByRole('button', { name: 'Change password' }).click();
    await unlocked.waitFor({ timeout: 15000 });
  }
  return page;
}

async function openDirectory(page) {
  await goTo(page, 'Directory');
  await page.getByRole('heading', { name: 'Directory' }).waitFor({ timeout: 15000 });
}

const inNow = (page, place) => page.getByTestId(`in-now-${place}`);

// The Staff editor saves as an admin; a manager keeps job roles and the rota.
const admin = await signIn('admin@domihealthcare.com');
const editor = admin.getByTestId('staff-editor');
const mgr = await signIn('manager@domihealthcare.com');

async function openEditor(page, name) {
  await page.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: `Edit ${name}` }).click();
  await page.getByTestId('staff-editor').getByRole('heading', { name }).waitFor({ timeout: 10000 });
}

await step(
  'somebody in two job roles starts on the first in the practice’s order as their main',
  async () => {
    await openEditor(admin, 'Frankie Front-Desk');
    const main = editor.getByLabel('Main job role');
    await main.waitFor({ timeout: 5000 });
    if ((await main.inputValue()) === '') throw new Error('no main job role chosen');
    const label = await main.locator('option:checked').textContent();
    if (label !== 'Front Desk') throw new Error(`main job role starts as ${label}`);
    const options = await main.locator('option').allTextContents();
    if (options.join() !== 'Front Desk,Medical Assistant')
      throw new Error(`offers ${options.join(', ')} — only the roles they hold`);
  },
);

await step('an admin makes Medical Assistant Frankie’s main job role', async () => {
  await editor.getByLabel('Main job role').selectOption({ label: 'Medical Assistant' });
  const saved = admin.waitForResponse(
    (r) => r.url().includes('/main') && r.request().method() === 'PUT',
  );
  await editor.getByRole('button', { name: 'Save changes' }).click();
  if (!(await saved).ok()) throw new Error('the main job role was refused');
  await editor.waitFor({ state: 'detached', timeout: 10000 });

  // The Staff card lists it first, marked main.
  const tags = admin
    .getByTestId('staff-frontdesk@domihealthcare.com')
    .getByTestId('staff-job-roles');
  const text = (await tags.textContent()) ?? '';
  if (!/^Medical Assistant· main\s*Front Desk$/.test(text.trim()))
    throw new Error(`the card's job roles read "${text}"`);
});

await step('one person in one job role has nothing to choose', async () => {
  await openEditor(admin, 'Max Assistant');
  if (await editor.getByLabel('Main job role').count())
    throw new Error('a main job role was offered with only one role ticked');
  await editor.getByRole('button', { name: 'Close' }).click();
});

await step('a new shift for Frankie starts on their main job role', async () => {
  const roleOf = await mgr.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const frankie = staff.find((p) => p.email === 'frontdesk@domihealthcare.com');
    const roles = await fetch('/api/job-roles').then((r) => r.json());
    const ma = roles.find((role) => role.name === 'Medical Assistant');
    const member = ma.members.find((m) => m.id === frankie.id);
    return { isPrimary: member?.isPrimary };
  });
  if (roleOf.isPrimary !== true) throw new Error('Medical Assistant is not stored as the main one');

  await mgr.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: 'Week', exact: true }).click();
  await mgr.getByRole('button', { name: 'Next →' }).click();
  await mgr.getByText('Coverage this week').waitFor({ timeout: 15000 });
  await mgr
    .getByTestId('rota-row-Frankie Front-Desk')
    .getByRole('button', { name: /^Add a shift for Frankie Front-Desk on Tuesday/ })
    .click();
  const dialog = mgr.getByRole('dialog', { name: 'Shift for Frankie Front-Desk' });
  const role = dialog.getByLabel('Job role');
  await mgr.waitForFunction(
    (el) => el.options[el.selectedIndex]?.text === 'Medical Assistant',
    await role.elementHandle(),
    { timeout: 5000 },
  );
  const first = await role.locator('option').first().textContent();
  if (first !== 'Medical Assistant') throw new Error(`the list starts with ${first}`);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

// Frankie, at the front desk in North Bergen. The seed's shift for them has
// no job role, so their main one decides.
const frankie = await signIn('frontdesk@domihealthcare.com', {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  permissions: ['geolocation'],
  geolocation: { latitude: 40.8045, longitude: -74.012, accuracy: 25 },
});

await step(
  'in now, somebody with no job role on their shift is listed under their main one',
  async () => {
    await frankie.getByRole('button', { name: 'Clock in' }).click();
    await frankie.getByText('On the clock').waitFor({ timeout: 20000 });
    await openDirectory(frankie);
    const office = inNow(frankie, 'North Bergen');
    await office
      .getByTestId('in-now-group-Medical Assistant')
      .getByText('Frankie Front-Desk')
      .waitFor({ timeout: 10000 });
    if (await office.getByTestId('in-now-group-Front Desk').count())
      throw new Error('Frankie is still under Front Desk');
    // Their card lists the main one first too.
    const card = frankie.getByTestId('person-Frankie Front-Desk');
    const dots = await card.getByText(/^(Medical Assistant|Front Desk)$/).allTextContents();
    if (dots[0] !== 'Medical Assistant') throw new Error(`the card lists ${dots.join(', ')}`);
  },
);
await frankie.screenshot({ path: `${OUT}/main-role-directory.png`, fullPage: true });

await step('clocking out', async () => {
  await goTo(frankie, 'Home');
  await clockOut(frankie);
  await frankie.getByText('Not clocked in').waitFor({ timeout: 20000 });
});

// Max, a Medical Assistant, is also put in Administrative and scheduled as
// that today: in now, they are under Administrative, not their main role.
await step('in now, somebody is listed under the job role their shift is for', async () => {
  await mgr.evaluate(async () => {
    const ok = async (r) => {
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      return r.json();
    };
    const staff = await fetch('/api/employees').then((r) => r.json());
    const max = staff.find((p) => p.email === 'ma@domihealthcare.com');
    const roles = await fetch('/api/job-roles').then((r) => r.json());
    const admin = roles.find((role) => role.name === 'Administrative');
    await fetch(`/api/job-roles/${admin.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: max.id }),
    }).then(ok);
    const locations = await fetch('/api/locations').then((r) => r.json());
    const now = Date.now();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 0, 0);
    await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: max.id,
        locationId: locations.find((l) => l.name === 'West New York').id,
        jobRoleId: admin.id,
        startsAt: new Date(Math.max(now - 15 * 60_000, dayStart.getTime())).toISOString(),
        endsAt: new Date(Math.min(now + 3 * 3_600_000, dayEnd.getTime())).toISOString(),
        status: 'PUBLISHED',
        // The runner clears these between suites.
        notes: 'main-role-suite',
      }),
    }).then(ok);
  });

  const max = await signIn('ma@domihealthcare.com', {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    permissions: ['geolocation'],
    geolocation: { latitude: 40.7878, longitude: -74.0143, accuracy: 25 },
  });
  await max.getByRole('button', { name: 'Clock in' }).click();
  await max.getByText('On the clock').waitFor({ timeout: 20000 });
  await openDirectory(max);
  const office = inNow(max, 'West New York');
  await office
    .getByTestId('in-now-group-Administrative')
    .getByText('Max Assistant')
    .waitFor({ timeout: 10000 });
  if (await office.getByTestId('in-now-group-Medical Assistant').count())
    throw new Error('Max was listed under their main role, not the shift’s');
  await goTo(max, 'Home');
  await clockOut(max);
  await max.getByText('Not clocked in').waitFor({ timeout: 20000 });
  await max.context().close();
});

await step('a main job role has to be one they hold', async () => {
  const status = await mgr.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const frankie = staff.find((p) => p.email === 'frontdesk@domihealthcare.com');
    const roles = await fetch('/api/job-roles').then((r) => r.json());
    const provider = roles.find((role) => role.name === 'Provider');
    return (
      await fetch(`/api/job-roles/${provider.id}/members/${frankie.id}/main`, { method: 'PUT' })
    ).status;
  });
  if (status !== 400) throw new Error(`expected 400, got ${status}`);
});

await step('taking away somebody’s main job role hands it to their other one', async () => {
  await openEditor(admin, 'Frankie Front-Desk');
  await editor.getByRole('checkbox', { name: 'Medical Assistant' }).uncheck();
  if (await editor.getByLabel('Main job role').count())
    throw new Error('a main job role was still offered with one role ticked');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await editor.waitFor({ state: 'detached', timeout: 10000 });
  const main = await admin.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const frankie = staff.find((p) => p.email === 'frontdesk@domihealthcare.com');
    const roles = await fetch('/api/job-roles').then((r) => r.json());
    return roles
      .filter((role) => role.members.some((m) => m.id === frankie.id && m.isPrimary))
      .map((role) => role.name);
  });
  if (main.join() !== 'Front Desk')
    throw new Error(`main job role is now ${main.join(', ') || 'none'}`);
});

// --- photos ---

await step('a manager is not offered somebody else’s photo, and cannot send one', async () => {
  await openEditor(mgr, 'Frankie Front-Desk');
  const mgrEditor = mgr.getByTestId('staff-editor');
  if (await mgrEditor.getByRole('heading', { name: 'Photo' }).count())
    throw new Error('a manager was offered the Photo section');
  if (await mgrEditor.locator('input[type=file]').count()) throw new Error('a file input appeared');
  await mgrEditor.getByRole('button', { name: 'Close' }).click();
  const status = await mgr.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const frankie = staff.find((p) => p.email === 'frontdesk@domihealthcare.com');
    return (
      await fetch(`/api/profile/photo/${frankie.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: 'data:image/jpeg;base64,/9j/' }),
      })
    ).status;
  });
  if (status !== 403) throw new Error(`expected 403, got ${status}`);
});

const adminEditor = editor;

await step('an admin puts up a photo for somebody, fitted and shrunk like their own', async () => {
  await openEditor(admin, 'Frankie Front-Desk');
  await adminEditor.getByRole('heading', { name: 'Photo' }).waitFor({ timeout: 5000 });
  const input = adminEditor.locator('input[type=file]');
  if ((await input.count()) !== 1) throw new Error('expected one file input in the Photo section');
  if ((await input.getAttribute('accept')) !== 'image/*')
    throw new Error('it accepts more than images');

  const png = await admin.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    const c = canvas.getContext('2d');
    c.fillStyle = '#3a6888';
    c.fillRect(0, 0, 1200, 900);
    c.fillStyle = '#ffd166';
    c.beginPath();
    c.arc(600, 450, 300, 0, Math.PI * 2);
    c.fill();
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const sent = admin.waitForRequest(
    (r) => /\/api\/profile\/photo\/[0-9a-f-]+$/.test(r.url()) && r.method() === 'PUT',
  );
  await input.setInputFiles({
    name: 'frankie.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  const crop = admin.getByTestId('photo-crop');
  await crop.waitFor({ timeout: 10000 });
  await crop.getByRole('button', { name: 'Use this photo' }).click();
  const body = JSON.parse((await sent).postData());
  if (!body.image.startsWith('data:image/jpeg;base64,'))
    throw new Error('the photo was not re-encoded as a JPEG');
  await adminEditor.getByText(/Photo saved\. Frankie has been told/).waitFor({ timeout: 10000 });

  const stored = await admin.evaluate(async () => {
    const staff = await fetch('/api/employees').then((r) => r.json());
    const frankie = staff.find((p) => p.email === 'frontdesk@domihealthcare.com');
    const response = await fetch(`/api/profile/photo/${frankie.id}`, { cache: 'no-store' });
    const bitmap = await createImageBitmap(await response.blob());
    return { type: response.headers.get('content-type'), w: bitmap.width, h: bitmap.height };
  });
  if (stored.type !== 'image/jpeg' || stored.w !== 256 || stored.h !== 256)
    throw new Error(`stored as ${stored.type} ${stored.w}×${stored.h}`);
  await adminEditor.getByRole('button', { name: 'Remove photo' }).waitFor({ timeout: 5000 });
});
await admin.screenshot({ path: `${OUT}/staff-photo-admin.png`, fullPage: true });

await step(
  'an admin is not offered the Photo section for themselves — that is on Your profile',
  async () => {
    await adminEditor.getByRole('button', { name: 'Close' }).click();
    await admin.getByRole('button', { name: 'Edit Ada Admin' }).click();
    await adminEditor.getByRole('heading', { name: 'Ada Admin' }).waitFor({ timeout: 10000 });
    if (await adminEditor.getByRole('heading', { name: 'Photo' }).count())
      throw new Error('an admin was offered the Photo section for themselves');
    await adminEditor.getByRole('button', { name: 'Close' }).click();
  },
);

await step('the person is told under the bell, and their photo shows', async () => {
  await frankie.reload({ waitUntil: 'networkidle' });
  await frankie.getByRole('button', { name: /^Notifications/ }).click();
  await frankie
    .getByRole('dialog', { name: 'Notifications' })
    .getByText('Your profile photo was added for you')
    .waitFor({ timeout: 10000 });
  await frankie.keyboard.press('Escape');
  const photo = frankie.getByRole('button', { name: /Your account/ }).getByTestId('avatar-photo');
  await photo.waitFor({ timeout: 10000 });
});

await step('an admin takes it down again, asking first', async () => {
  await openEditor(admin, 'Frankie Front-Desk');
  await adminEditor.getByRole('button', { name: 'Remove photo' }).click();
  await admin
    .getByRole('alertdialog', { name: 'Remove Frankie’s photo?' })
    .getByRole('button', { name: 'Yes, remove it' })
    .click();
  await adminEditor.getByText('Photo removed.', { exact: true }).waitFor({ timeout: 10000 });
  await adminEditor.getByRole('button', { name: 'Add a photo' }).waitFor({ timeout: 5000 });
});

await browser.close();
console.log(
  `\n${errors.length === 0 ? 'ALL MAIN JOB ROLE AND PHOTO CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`,
);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
