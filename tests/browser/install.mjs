import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
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

/**
 * Domi Staff on a phone's home screen: an installable web app, with a manifest
 * and the practice's roof logo as its icon, and a one-time tip on the sign-in
 * screen of a phone. No service worker, on purpose — see docs/architecture.md.
 *
 * Chromium stands in for both phones here: the tip decides by user agent, and
 * `beforeinstallprompt` (Android's own install prompt) is dispatched by hand,
 * because a headless browser never offers one.
 */
const IPHONE = devices['iPhone 13'];
const ANDROID = devices['Pixel 7'];
const DESKTOP = { viewport: { width: 1280, height: 800 } };

/** Width and height from a PNG's header. */
function pngSize(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47];
  if (!signature.every((byte, i) => bytes[i] === byte)) throw new Error('not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function context(options, init) {
  const ctx = await browser.newContext(options);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (message) => {
    if (/Content Security Policy|manifest/i.test(message.text())) {
      errors.push(`console: ${message.text()}`);
    }
  });
  return { ctx, page };
}

const tip = (page) => page.getByTestId('install-tip');

await step('the manifest is served, names the app and opens full screen', async () => {
  const { ctx, page } = await context(DESKTOP);
  const response = await page.request.get(`${BASE}/manifest.webmanifest`);
  if (!response.ok()) throw new Error(`manifest answered ${response.status()}`);
  const manifest = await response.json();
  const expect = {
    name: 'Domi Staff',
    short_name: 'Domi Staff',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#3a6888',
  };
  for (const [key, value] of Object.entries(expect)) {
    if (manifest[key] !== value) throw new Error(`${key} is ${manifest[key]}, expected ${value}`);
  }

  for (const icon of manifest.icons) {
    const image = await page.request.get(`${BASE}${icon.src}`);
    if (!image.ok()) throw new Error(`${icon.src} answered ${image.status()}`);
    const { width, height } = pngSize(await image.body());
    if (`${width}x${height}` !== icon.sizes) {
      throw new Error(`${icon.src} is ${width}x${height}, the manifest says ${icon.sizes}`);
    }
  }
  const purposes = manifest.icons.map((icon) => icon.purpose);
  if (!purposes.includes('maskable')) throw new Error('no maskable icon for Android');
  const sizes = manifest.icons.map((icon) => icon.sizes);
  if (!sizes.includes('192x192') || !sizes.includes('512x512')) {
    throw new Error(`icons are ${sizes.join(', ')}; Android wants 192 and 512`);
  }
  await ctx.close();
});

await step('the page links the manifest and an iPhone icon', async () => {
  const { ctx, page } = await context(DESKTOP);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  if (manifest !== '/manifest.webmanifest') throw new Error(`manifest link is ${manifest}`);
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const image = await page.request.get(`${BASE}${touch}`);
  const { width, height } = pngSize(await image.body());
  if (width !== 180 || height !== 180) throw new Error(`apple-touch-icon is ${width}x${height}`);
  const title = await page
    .locator('meta[name="apple-mobile-web-app-title"]')
    .getAttribute('content');
  if (title !== 'Domi Staff') throw new Error(`home-screen title is ${title}`);
  await ctx.close();
});

await step('the app registers no service worker, so nothing pretends to work offline', async () => {
  const { ctx, page } = await context(DESKTOP);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const registrations = await page.evaluate(async () =>
    'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  );
  if (registrations !== 0) throw new Error(`${registrations} service worker(s) registered`);
  await ctx.close();
});

await step('a computer gets no tip', async () => {
  const { ctx, page } = await context(DESKTOP);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).waitFor();
  if (await tip(page).count()) throw new Error('the install tip showed on a desktop');
  await ctx.close();
});

await step('an iPhone is told Share, then Add to Home Screen — and once closed it stays closed', async () => {
  const { ctx, page } = await context(IPHONE);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await tip(page).waitFor({ timeout: 10000 });
  const text = await tip(page).innerText();
  for (const words of ['Add Domi Staff to your home screen', 'Share', 'Add to Home Screen']) {
    if (!text.includes(words)) throw new Error(`the tip does not say "${words}": ${text}`);
  }
  if (await tip(page).getByRole('button', { name: 'Install' }).count()) {
    throw new Error('an iPhone was offered an Install button it cannot use');
  }
  await page.screenshot({ path: `${OUT}/install-iphone.png`, fullPage: true });

  await tip(page).getByRole('button', { name: 'Not now' }).click();
  await tip(page).waitFor({ state: 'detached' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).waitFor();
  if (await tip(page).count()) throw new Error('the tip came back after "Not now"');
  await ctx.close();
});

await step('an iPhone already opened from the home screen gets no tip', async () => {
  const { ctx, page } = await context(IPHONE, () => {
    Object.defineProperty(navigator, 'standalone', { get: () => true });
  });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).waitFor();
  if (await tip(page).count()) throw new Error('the tip showed inside the installed app');
  await ctx.close();
});

await step('an Android phone gets the menu route until Chrome offers to install', async () => {
  const { ctx, page } = await context(ANDROID);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await tip(page).waitFor({ timeout: 10000 });
  const text = await tip(page).innerText();
  if (!text.includes('Add to Home screen')) throw new Error(`no menu route: ${text}`);
  if (await tip(page).getByRole('button', { name: 'Install' }).count()) {
    throw new Error('Install offered before the browser made it possible');
  }
  await ctx.close();
});

await step("Android's Install button uses the browser's own prompt", async () => {
  const { ctx, page } = await context(ANDROID);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await tip(page).waitFor({ timeout: 10000 });
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => {
      window.__prompted = true;
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  await tip(page).getByRole('button', { name: 'Install', exact: true }).click();
  await tip(page).waitFor({ state: 'detached' });
  if (!(await page.evaluate(() => window.__prompted))) throw new Error('prompt() was not called');
  await page.screenshot({ path: `${OUT}/install-android.png`, fullPage: true });
  await ctx.close();
});

await step('an Android phone running it installed gets no tip', async () => {
  const { ctx, page } = await context(ANDROID, () => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) =>
      query.includes('display-mode: standalone')
        ? { matches: true, media: query, addEventListener() {}, removeEventListener() {} }
        : original(query);
  });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).waitFor();
  if (await tip(page).count()) throw new Error('the tip showed inside the installed app');
  await ctx.close();
});

await step('Help explains how to put it on a phone', async () => {
  const { ctx, page } = await context(IPHONE);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('frontdesk@domihealthcare.com');
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  await page.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
  await page.getByText('Put Domi Staff on your phone').click();
  await page.getByText('Add to Home Screen', { exact: false }).first().waitFor();
  await page.getByText(/nothing is saved on the phone/).waitFor();
  await ctx.close();
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL INSTALL CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
