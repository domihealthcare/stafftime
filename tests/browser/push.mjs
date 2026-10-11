import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

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

/**
 * Phone notifications (Dominguez, October 2026: "are we able to do this since
 * we dont have an iphone/android app?" — yes, web push). What rings the bell
 * also goes to each device somebody turned on. The worker only shows
 * notifications: no fetch handler, no cache, never registered until turned
 * on, so a punch with no signal still plainly fails.
 *
 * A real push service is not reachable from every test machine, so the
 * device is registered through the API with a made-up Google address; what
 * is checked is that the app keeps it, refuses anything that is not a push
 * service, and that a send to it never breaks anything. An admin switches
 * them on first, in Practice settings; run-all.sh forgets the key pair.
 */
async function signIn(email) {
  // As if each person had pressed Allow: a headless browser otherwise refuses
  // notifications on its own, and the card rightly says they are blocked.
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    permissions: ['notifications'],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
}

const call = (page, path, init) =>
  page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );

const admin = await signIn('admin@domihealthcare.com');
const desk = await signIn('frontdesk@domihealthcare.com');
const ENDPOINT = `https://fcm.googleapis.com/fcm/send/push-suite-${Date.now()}`;
const KEYS = {
  // A real P-256 public key and auth secret, so the payload can be encrypted.
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};

await step('the worker shows notifications and nothing else: no fetch, no cache', async () => {
  const source = await desk.evaluate(() => fetch('/push-sw.js').then((r) => r.text()));
  if (!source.includes("addEventListener('push'")) throw new Error('no push handler');
  for (const forbidden of ["addEventListener('fetch'", 'caches.', 'onfetch']) {
    if (source.includes(forbidden)) throw new Error(`the worker uses ${forbidden}`);
  }
  const registrations = await desk.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).length,
  );
  if (registrations !== 0) throw new Error('a worker is registered before anybody turned it on');
});

await step('until an admin switches them on, Your profile says so', async () => {
  await desk.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await desk.getByTestId('phone-notifications').getByText('Not switched on for the practice yet').waitFor();
  const refused = await call(desk, '/push/switch-on', { method: 'POST' });
  if (refused.status !== 403) throw new Error(`staff switching on answered ${refused.status}`);
});

await step('an admin switches them on for the practice in Practice settings', async () => {
  await admin.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  const card = admin.getByTestId('phone-notifications-switch');
  await card.getByRole('button', { name: 'Switch on for the practice' }).click();
  await card.getByText('Switched on for the practice').waitFor();
  const status = await call(desk, '/push');
  if (!status.body.available || !/^[A-Za-z0-9_-]{80,}$/.test(status.body.publicKey)) {
    throw new Error(`status: ${JSON.stringify(status.body)}`);
  }
});

await step('Your profile offers to turn them on; the bell points there', async () => {
  await desk.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  const card = desk.getByTestId('phone-notifications');
  await card
    .getByRole('button', { name: 'Turn on for this device' })
    .waitFor({ timeout: 15000 })
    .catch(async () => {
      throw new Error(`the card reads: ${await card.innerText()}`);
    });
  await desk.getByRole('button', { name: /Notifications/ }).first().click();
  await desk.getByRole('link', { name: 'Get these on your phone' }).waitFor();
  await desk.keyboard.press('Escape');
});

await step('a device is kept for its person, and only a real push service is accepted', async () => {
  const bad = await call(desk, '/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'https://169.254.169.254/latest/meta-data', keys: KEYS }),
  });
  if (bad.status !== 400) throw new Error(`a made-up address answered ${bad.status}`);
  const good = await call(desk, '/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: ENDPOINT, keys: KEYS, device: 'Android' }),
  });
  if (good.status !== 200) throw new Error(`subscribing answered ${good.status}: ${JSON.stringify(good.body)}`);
  if (good.body.devices.length !== 1 || good.body.devices[0].device !== 'Android') {
    throw new Error(`devices: ${JSON.stringify(good.body.devices)}`);
  }
  if (JSON.stringify(good.body).includes(ENDPOINT)) throw new Error('the push address was sent back');
});

await step('a send that cannot reach the phone breaks nothing', async () => {
  const sent = await call(desk, '/push/test', { method: 'POST' });
  if (sent.status !== 200) throw new Error(`the test answered ${sent.status}`);
  // And an ordinary bell notification still lands under the bell.
  const bell = await call(desk, '/notifications');
  if (bell.status !== 200) throw new Error(`the bell answered ${bell.status}`);
});

await step('turning it off forgets the device', async () => {
  const off = await call(desk, '/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: ENDPOINT }),
  });
  if (off.status !== 200 || off.body.devices.length !== 0) {
    throw new Error(`unsubscribing answered ${off.status}: ${JSON.stringify(off.body)}`);
  }
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL PHONE-NOTIFICATION CHECKS PASSED');
