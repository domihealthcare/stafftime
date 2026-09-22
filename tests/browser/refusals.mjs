import { chromium } from 'playwright';
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

// Real login replaced the dev employee picker.
const signInAs = async (page, email, password = 'shift-change-2026') => {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

async function signedInPage(contextOpts) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, ...contextOpts });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await signInAs(page, 'frontdesk@domihealthcare.com');
  await page.getByText('Not clocked in').waitFor({ timeout: 10000 });
  return page;
}

// 1. On the right continent, wrong place: at home, 2km away.
await step('clocking in from home is refused, and says how far away you are', async () => {
  const page = await signedInPage({
    permissions: ['geolocation'],
    geolocation: { latitude: 40.7878, longitude: -74.0143, accuracy: 20 },
  });
  await page.getByRole('button', { name: 'Clock in' }).click();
  const alert = page.getByRole('alert');
  await alert.waitFor({ timeout: 15000 });
  const text = await alert.innerText();
  if (!/outside the \d+ foot clock-in area/i.test(text)) throw new Error(`unhelpful: "${text}"`);
  if (!/front-desk kiosk/i.test(text)) throw new Error(`did not offer the kiosk: "${text}"`);
  await page.screenshot({ path: `${OUT}/08-refused-offsite.png`, fullPage: true });
  // And they must still be clocked out, not half-punched.
  await page.getByText('Not clocked in').waitFor({ timeout: 5000 });
});

// 2. Location permission blocked entirely.
await step('blocked location permission explains what to do', async () => {
  const page = await signedInPage({ permissions: [] });
  await page.getByRole('button', { name: 'Clock in' }).click();
  const alert = page.getByRole('alert');
  await alert.waitFor({ timeout: 20000 });
  const text = await alert.innerText();
  if (!/location/i.test(text)) throw new Error(`unhelpful: "${text}"`);
  if (!/kiosk/i.test(text)) throw new Error(`did not offer the kiosk: "${text}"`);
  await page.screenshot({ path: `${OUT}/09-refused-blocked.png`, fullPage: true });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL REFUSAL CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
