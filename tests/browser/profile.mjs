import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pickFromAccountMenu } from './account-menu.mjs';

// Your profile: the name you go by, pronouns, phone, a line about you, and a
// photo — and colleagues seeing all of it in the Directory.
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

async function openDirectory(page) {
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Directory', exact: true }).click();
  await page.getByRole('heading', { name: 'Directory' }).waitFor({ timeout: 15000 });
}

// Frankie, on a phone.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const frankie = await ctx.newPage();
frankie.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await signIn(frankie, 'frontdesk@domihealthcare.com');

await step('Your profile is in the account menu', async () => {
  await pickFromAccountMenu(frankie, 'Your profile');
  await frankie.getByRole('heading', { name: 'Your profile' }).waitFor({ timeout: 15000 });
  await frankie.getByText('Set by the practice').waitFor({ timeout: 5000 });
});

await step('a phone number with letters in it is refused, saying why', async () => {
  await frankie.getByLabel('Phone number').fill('call the desk');
  const saved = frankie.waitForResponse((r) => r.url().endsWith('/api/profile') && r.request().method() === 'PATCH');
  await frankie.getByRole('button', { name: 'Save profile' }).click();
  if ((await saved).status() !== 400) throw new Error('letters were accepted as a phone number');
  await frankie.getByText(/A phone number is digits/).waitFor({ timeout: 5000 });
});

await step('name, pronouns, phone and a line about you are saved', async () => {
  await frankie.getByLabel('Name you go by').fill('Frankie J');
  await frankie.getByLabel('Pronouns').fill('they/them');
  await frankie.getByLabel('Phone number').fill('(201) 555-0199');
  await frankie.getByLabel('About you').fill('Spanish speaker · covers MA on Fridays');
  const saved = frankie.waitForResponse((r) => r.url().endsWith('/api/profile') && r.request().method() === 'PATCH');
  await frankie.getByRole('button', { name: 'Save profile' }).click();
  if (!(await saved).ok()) throw new Error('the profile was refused');
  await frankie.getByText('Profile saved.', { exact: true }).waitFor({ timeout: 5000 });
});

await step('the only file input anywhere takes images, and nothing else', async () => {
  const inputs = frankie.locator('input[type=file]');
  if ((await inputs.count()) !== 1) throw new Error(`expected one file input, found ${await inputs.count()}`);
  if ((await inputs.getAttribute('accept')) !== 'image/*') throw new Error('the photo picker accepts more than images');
});

await step('a large photo is cropped square and shrunk before it is sent', async () => {
  // A 1600×1000 picture, drawn in the page — no fixture file needed.
  const png = await frankie.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1000;
    const c = canvas.getContext('2d');
    c.fillStyle = '#3a6888';
    c.fillRect(0, 0, 1600, 1000);
    c.fillStyle = '#ffd166';
    c.beginPath();
    c.arc(800, 500, 350, 0, Math.PI * 2);
    c.fill();
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const sent = frankie.waitForRequest((r) => r.url().endsWith('/api/profile/photo') && r.method() === 'PUT');
  const saved = frankie.waitForResponse((r) => r.url().endsWith('/api/profile/photo') && r.request().method() === 'PUT');
  await frankie.locator('#profilePhoto').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const body = JSON.parse((await sent).postData());
  if (!body.image.startsWith('data:image/jpeg;base64,')) throw new Error('the photo was not re-encoded as a JPEG');
  if (!(await saved).ok()) throw new Error('the photo was refused');
  await frankie.getByText('Photo updated.', { exact: true }).waitFor({ timeout: 10000 });

  const stored = await frankie.evaluate(async () => {
    const me = await fetch('/api/profile').then((r) => r.json());
    const response = await fetch(`/api/profile/photo/${me.id}`);
    const bitmap = await createImageBitmap(await response.blob());
    return { type: response.headers.get('content-type'), bytes: Number(response.headers.get('content-length')), w: bitmap.width, h: bitmap.height };
  });
  if (stored.type !== 'image/jpeg') throw new Error(`stored as ${stored.type}`);
  if (stored.w !== 256 || stored.h !== 256) throw new Error(`stored at ${stored.w}×${stored.h}, not 256×256`);
  if (stored.bytes > 150 * 1024) throw new Error(`stored photo is ${stored.bytes} bytes`);
});

await step('the header shows the photo, loaded under the deployed security headers', async () => {
  const photo = frankie.getByRole('button', { name: /Your account/ }).getByTestId('avatar-photo');
  await photo.waitFor({ timeout: 10000 });
  if (!(await photo.evaluate((img) => img.complete && img.naturalWidth > 0)))
    throw new Error('the header photo did not load');
});
await frankie.screenshot({ path: `${OUT}/100-profile.png`, fullPage: true });

await step('the server refuses anything that is not a small JPEG', async () => {
  const status = await frankie.evaluate(async () => {
    const response = await fetch('/api/profile/photo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: btoa('<svg xmlns="http://www.w3.org/2000/svg"/>') }),
    });
    return response.status;
  });
  if (status !== 400) throw new Error(`an SVG answered ${status}`);
});

// The tablet PIN: chosen by the person, never shown to anybody.
await step('the profile says a PIN is set, and when, without showing it', async () => {
  const status = frankie.getByTestId('pin-status');
  await status.getByText(/^Set on /).waitFor({ timeout: 5000 });
  if ((await status.textContent()).includes('4817')) throw new Error('the PIN is on the screen');
  const me = await frankie.evaluate(() => fetch('/api/profile').then((r) => r.json()));
  if ('pinHash' in me || 'pin' in me) throw new Error('the profile answer carries the PIN');
  if (me.hasPin !== true) throw new Error('the profile does not know a PIN is set');
});

await step('two PINs that differ are caught before anything is sent', async () => {
  const card = frankie.getByTestId('pin-card');
  await card.getByLabel('New PIN').fill('3719');
  await card.getByLabel('Same again').fill('3718');
  await card.getByText('Those PINs do not match.').waitFor({ timeout: 5000 });
  if (await card.getByRole('button', { name: 'Change PIN' }).isEnabled())
    throw new Error('mismatched PINs could be saved');
});

await step('the wrong password is refused, saying so', async () => {
  const card = frankie.getByTestId('pin-card');
  await card.getByLabel('Same again').fill('3719');
  await card.getByLabel('Your password').fill('not-my-password-1');
  const saved = frankie.waitForResponse((r) => r.url().endsWith('/api/profile/pin'));
  await card.getByRole('button', { name: 'Change PIN' }).click();
  if ((await saved).status() < 400) throw new Error('a PIN was changed with the wrong password');
  await card.getByText(/password/i).first().waitFor({ timeout: 5000 });
});

await step('an easy PIN is refused, saying why', async () => {
  const card = frankie.getByTestId('pin-card');
  await card.getByLabel('New PIN').fill('1234');
  await card.getByLabel('Same again').fill('1234');
  await card.getByLabel('Your password').fill('shift-change-2026');
  const saved = frankie.waitForResponse((r) => r.url().endsWith('/api/profile/pin'));
  await card.getByRole('button', { name: 'Change PIN' }).click();
  if ((await saved).status() !== 400) throw new Error('1234 was accepted as a PIN');
});

await step('with your password, you choose your own PIN', async () => {
  const card = frankie.getByTestId('pin-card');
  await card.getByLabel('New PIN').fill('3719');
  await card.getByLabel('Same again').fill('3719');
  await card.getByLabel('Your password').fill('shift-change-2026');
  const saved = frankie.waitForResponse((r) => r.url().endsWith('/api/profile/pin'));
  await card.getByRole('button', { name: 'Change PIN' }).click();
  const answer = await saved;
  if (!answer.ok()) throw new Error(`the PIN was refused: ${await answer.text()}`);
  await frankie.getByText('Tablet PIN saved.', { exact: true }).waitFor({ timeout: 5000 });
  if ((await card.getByLabel('New PIN').inputValue()) !== '') throw new Error('the PIN stayed on the screen');
});

await step('somebody who is not a manager cannot set a colleague’s PIN', async () => {
  const status = await frankie.evaluate(async () => {
    const people = await fetch('/api/directory').then((r) => r.json());
    const other = people.find((p) => p.lastName !== 'Front-Desk');
    return (
      await fetch(`/api/kiosk/employees/${other.id}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '4826' }),
      })
    ).status;
  });
  if (status !== 403) throw new Error(`expected 403, got ${status}`);
});
await frankie.screenshot({ path: `${OUT}/102-profile-pin.png`, fullPage: true });

// A colleague sees all of it.
const mgrCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const mgr = await mgrCtx.newPage();
mgr.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

await step('the Directory shows the name, pronouns, photo, line and phone', async () => {
  await openDirectory(mgr);
  const card = mgr.getByTestId('person-Frankie J Front-Desk');
  await card.waitFor({ timeout: 10000 });
  await card.getByText('(they/them)').waitFor({ timeout: 5000 });
  await card.getByText('Spanish speaker · covers MA on Fridays').waitFor({ timeout: 5000 });
  await card.getByRole('link', { name: '(201) 555-0199' }).waitFor({ timeout: 5000 });
  const photo = card.getByTestId('avatar-photo');
  await photo.waitFor({ timeout: 5000 });
  if (!(await photo.evaluate((img) => img.complete && img.naturalWidth > 0)))
    throw new Error('the photo did not load in the Directory');
});
await mgr.screenshot({ path: `${OUT}/101-directory-profile.png`, fullPage: true });

await step('a manager can give somebody a new PIN from the Directory, but not read one', async () => {
  const card = mgr.getByTestId('person-Frankie J Front-Desk');
  await card.getByRole('button', { name: 'Set a new tablet PIN' }).click();
  await card.getByLabel('New tablet PIN for Frankie').fill('7391');
  const saved = mgr.waitForResponse((r) => r.url().includes('/api/kiosk/employees/') && r.request().method() === 'PUT');
  await card.getByRole('button', { name: 'Set PIN', exact: true }).click();
  if (!(await saved).ok()) throw new Error('the manager could not set the PIN');
  await card.getByText(/New PIN set\. Tell Frankie J in person/).waitFor({ timeout: 5000 });
  const people = await mgr.evaluate(() => fetch('/api/directory').then((r) => r.text()));
  if (people.includes('7391') || people.includes('pinHash')) throw new Error('the Directory carries a PIN');
});

await step('a manager cannot take down somebody else’s photo; that is an admin’s call', async () => {
  const status = await mgr.evaluate(async () => {
    const people = await fetch('/api/directory').then((r) => r.json());
    const frankie = people.find((p) => p.lastName === 'Front-Desk');
    return (await fetch(`/api/profile/photo/${frankie.id}`, { method: 'DELETE' })).status;
  });
  if (status !== 403) throw new Error(`expected 403, got ${status}`);
});

await step('removing your photo goes back to initials', async () => {
  await frankie.getByRole('button', { name: 'Remove photo' }).click();
  await frankie.getByText('Photo removed.', { exact: true }).waitFor({ timeout: 10000 });
  await frankie.getByRole('button', { name: /Your account/ }).getByTestId('avatar-initials').waitFor({ timeout: 5000 });
  const status = await frankie.evaluate(async () => {
    const me = await fetch('/api/profile').then((r) => r.json());
    return (await fetch(`/api/profile/photo/${me.id}`, { cache: 'no-store' })).status;
  });
  if (status !== 404) throw new Error(`the removed photo still answered ${status}`);
});

await step('it fits a phone', async () => {
  const wide = await frankie.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (wide) throw new Error('the profile page scrolls sideways on a phone');
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL PROFILE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
