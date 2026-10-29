import { chromium } from 'playwright';

/*
  Search boxes whose text lives in the address (the phone book's ?q=, the
  guides' ?q=) keep every letter typed quickly, and the caret where it was.
  React Router 7 wraps navigation in a React transition unless told not to
  (App.tsx, useTransitions={false}); with it on, these lost letters
  (October 2026, the upgrade from React Router 6).
*/
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

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('frontdesk@domihealthcare.com');
await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByText('Not clocked in').waitFor({ timeout: 20000 });

const typed = 'cardiology associates of hudson';

await step('phone book search keeps every character typed fast', async () => {
  await page.goto(`${BASE}/phone-book`);
  const box = page.getByLabel('Search', { exact: true });
  await box.waitFor();
  await box.click();
  await page.keyboard.type(typed, { delay: 0 });
  await page.waitForTimeout(500);
  const value = await box.inputValue();
  if (value !== typed) throw new Error(`box says "${value}"`);
  const q = new URL(page.url()).searchParams.get('q');
  if (q !== typed) throw new Error(`address says "${q}"`);
});

await step('phone book search: caret stays put when typing in the middle', async () => {
  const box = page.getByLabel('Search', { exact: true });
  await box.fill('cardio');
  await page.waitForTimeout(200);
  await box.press('Home');
  await page.keyboard.type('xy', { delay: 0 });
  await page.waitForTimeout(300);
  const value = await box.inputValue();
  if (value !== 'xycardio') throw new Error(`box says "${value}"`);
});

await step('guide search keeps every character typed fast', async () => {
  await page.goto(`${BASE}/front-desk`);
  const box = page.getByLabel('Search the guide');
  await box.waitFor();
  await box.click();
  await page.keyboard.type(typed, { delay: 0 });
  await page.waitForTimeout(500);
  const value = await box.inputValue();
  if (value !== typed) throw new Error(`box says "${value}"`);
});

await step('back returns to the phone book search', async () => {
  await page.goto(`${BASE}/phone-book?q=lab`);
  await page.getByLabel('Search', { exact: true }).waitFor();
  await page.goto(`${BASE}/directory`);
  await page.goBack();
  const value = await page.getByLabel('Search', { exact: true }).inputValue();
  if (value !== 'lab') throw new Error(`box says "${value}"`);
});

await step('/job-roles is still sent on to /staff#job-roles', async () => {
  await page.goto(`${BASE}/job-roles`);
  await page.waitForURL(/\/staff#job-roles$/);
});

await browser.close();
if (errors.length) {
  console.log('FAILED');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('ALL PASS');
