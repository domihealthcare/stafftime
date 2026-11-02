import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

/**
 * Face ID sign-in (November 2026, Dominguez: "staff can use face id through
 * their phone to login to portal"; Face ID opens pay too).
 *
 * Chromium's virtual authenticator stands in for a phone's Face ID: it holds
 * passkeys and says yes to the "is it you?" check. A passkey is tied to a
 * domain name, never an IP address, so this suite opens the app on
 * `localhost` rather than 127.0.0.1.
 *
 * run-all.sh clears passkeys and their challenges.
 */
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:5173').replace('127.0.0.1', 'localhost');
const PASSWORD = 'shift-change-2026';
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

function sql(statement) {
  return execFileSync(
    'psql',
    [
      '-h',
      process.env.PGHOST_LOCAL || '127.0.0.1',
      '-p',
      process.env.PGPORT_LOCAL || '5433',
      '-U',
      process.env.PGUSER_LOCAL || 'postgres',
      '-d',
      process.env.PGDATABASE_LOCAL || 'stafftime',
      '-q',
      '-t',
      '-A',
      '-c',
      statement,
    ],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'postgres' } },
  ).trim();
}

const call = (page, path, init = {}) =>
  page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      const text = await r.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: r.status, body };
    },
    { path, init },
  );

/// A browser with a phone's Face ID in it.
async function deviceWithFaceId(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { page, cdp, authenticatorId };
}

async function signInWithPassword(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
}

async function signOut(page) {
  await call(page, '/auth/logout', { method: 'POST' });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').waitFor({ timeout: 15000 });
}

const phone = await deviceWithFaceId({ width: 390, height: 844 });
const frankiePage = phone.page;
await signInWithPassword(frankiePage, 'frontdesk@domihealthcare.com');
const frankie = (await call(frankiePage, '/auth/me')).body;

await step('after a password sign-in, Home offers Face ID; one press sets it up', async () => {
  const offer = frankiePage.getByTestId('passkey-offer');
  await offer.waitFor({ timeout: 15000 });
  await frankiePage.screenshot({ path: `${OUT}/passkey-offer.png`, fullPage: true });
  // Just signed in: no password asked again.
  await offer.getByTestId('set-up-passkey').click();
  await offer.getByText(/is set up\. Next time, sign in with it\./).waitFor({ timeout: 15000 });
  const { credentials } = await phone.cdp.send('WebAuthn.getCredentials', {
    authenticatorId: phone.authenticatorId,
  });
  if (credentials.length !== 1) throw new Error(`${credentials.length} passkeys on the phone`);
  if (!credentials[0].isResidentCredential) throw new Error('not kept on the phone');
  const kept = (await call(frankiePage, '/passkeys')).body;
  if (kept.length !== 1) throw new Error(`${kept.length} passkeys kept`);
});

await step('only the public key is kept, and the person is told on the bell', async () => {
  const columns = sql(
    `select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name = 'passkeys'`,
  );
  if (/face|finger|biometric|image|template/i.test(columns)) throw new Error(`columns: ${columns}`);
  const inbox = (await call(frankiePage, '/notifications')).body;
  if (!inbox.items.some((item) => item.title === 'Face ID was set up on your account'))
    throw new Error('not told');
});

await step('the offer does not come back on this device', async () => {
  await frankiePage.reload({ waitUntil: 'networkidle' });
  await frankiePage.getByText('Not clocked in').waitFor({ timeout: 15000 });
  if (await frankiePage.getByTestId('passkey-offer').count()) throw new Error('offered again');
});

await step('signing in with Face ID, no email or password typed', async () => {
  await signOut(frankiePage);
  await frankiePage.getByTestId('passkey-sign-in').click();
  await frankiePage.getByText('Not clocked in').waitFor({ timeout: 20000 });
  const me = (await call(frankiePage, '/auth/me')).body;
  if (me.id !== frankie.id) throw new Error(`signed in as ${me.email}`);
  if (!me.viaPasskey) throw new Error('session not marked as Face ID');
  if (await frankiePage.getByTestId('passkey-offer').count()) throw new Error('offered after Face ID');
});

await step('Your profile lists it; a browser signed in a while ago asks for the password first', async () => {
  // As if signed in twenty minutes ago.
  sql(
    `update sessions set "createdAt" = now() - interval '20 minutes' where "employeeId" = '${frankie.id}' and "revokedAt" is null`,
  );
  await frankiePage.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  const card = frankiePage.getByTestId('passkeys');
  const listed = card.getByTestId('passkey');
  await listed.waitFor({ timeout: 15000 });
  if (!/Last used/.test(await listed.textContent())) throw new Error('no "Last used" after signing in');
  await card.getByTestId('set-up-passkey').click();
  await card.getByLabel('Your password').fill('not the password');
  await card.getByRole('button', { name: 'Continue' }).click();
  await card.getByText('That password is not right.').waitFor({ timeout: 10000 });
  await card.getByLabel('Your password').fill(PASSWORD);
  await card.getByRole('button', { name: 'Continue' }).click();
  // The phone already holds one for Frankie, so it refuses a second.
  await card.getByText(/is already set up on this device\./).waitFor({ timeout: 15000 });
  if (await card.getByLabel('Your password').count()) throw new Error('password box left open');
  await frankiePage.screenshot({ path: `${OUT}/passkey-profile.png`, fullPage: true });
});

await step('an admin removes it from the Staff editor (a lost phone)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const admin = await ctx.newPage();
  admin.on('pageerror', (e) => errors.push(`admin pageerror: ${e.message}`));
  await signInWithPassword(admin, 'admin@domihealthcare.com');
  await admin.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId('staff-frontdesk@domihealthcare.com');
  await card.getByRole('button', { name: /^Edit / }).click();
  const line = admin.getByTestId('staff-passkeys');
  await line.getByText('Face ID set up (1 passkey)').waitFor({ timeout: 15000 });
  await line.getByRole('button', { name: 'Remove Face ID' }).click();
  await admin.getByRole('button', { name: 'Yes, remove it' }).click();
  await line.getByText('No Face ID set up').waitFor({ timeout: 10000 });
  await ctx.close();
  const kept = (await call(frankiePage, '/passkeys')).body;
  if (kept.length !== 0) throw new Error(`${kept.length} still kept`);
});

await step('a removed passkey no longer signs in, and says to use the password', async () => {
  await signOut(frankiePage);
  await frankiePage.getByTestId('passkey-sign-in').click();
  await frankiePage
    .getByText('That passkey is not set up for Domi Staff any more. Sign in with your password.')
    .waitFor({ timeout: 15000 });
  await signInWithPassword(frankiePage, 'frontdesk@domihealthcare.com');
});

await step('setting one up needs a session', async () => {
  const anon = await browser.newContext();
  const page = await anon.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const nobody = await call(page, '/passkeys/register/options', { method: 'POST', body: '{}' });
  if (nobody.status !== 401) throw new Error(`without a session: ${nobody.status}`);
  await anon.close();
});

// The manager: Face ID opens what asks for the PIN.
const laptop = await deviceWithFaceId({ width: 1280, height: 1000 });
const manager = laptop.page;
await signInWithPassword(manager, 'manager@domihealthcare.com');

await step('Face ID opens the PIN in front of staff notes and pay', async () => {
  await manager.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await manager.getByTestId('passkeys').getByTestId('set-up-passkey').click();
  await manager.getByText(/is set up\. Next time, sign in with it\./).waitFor({ timeout: 15000 });
  await call(manager, '/pay-lock/lock', { method: 'POST' });
  await manager.goto(`${BASE}/staff-notes`, { waitUntil: 'networkidle' });
  const gate = manager.getByTestId('pin-gate');
  await gate.waitFor({ timeout: 15000 });
  await gate.getByTestId('pay-passkey').click();
  // Exact: the prompt's own heading says "... to see staff notes".
  await manager
    .getByRole('heading', { name: 'Staff notes', exact: true })
    .waitFor({ timeout: 15000 });
  await gate.waitFor({ state: 'detached', timeout: 5000 });
  const status = (await call(manager, '/pay-lock')).body;
  if (!status.unlocked) throw new Error(`not unlocked on the server: ${JSON.stringify(status)}`);
});

await step('a new password takes Face ID away', async () => {
  const changed = await call(manager, '/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'lantern harbour passkey 7' }),
  });
  if (changed.status >= 400) throw new Error(`change: ${JSON.stringify(changed.body)}`);
  const kept = (await call(manager, '/passkeys')).body;
  // Back as it was for the other suites.
  const back = await call(manager, '/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'lantern harbour passkey 7', newPassword: PASSWORD }),
  });
  if (back.status >= 400) throw new Error(`change back: ${JSON.stringify(back.body)}`);
  if (kept.length !== 0) throw new Error(`${kept.length} passkeys outlived the password`);
});

await browser.close();
if (errors.length) {
  console.log('\nPROBLEMS');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL FACE ID CHECKS PASSED');
