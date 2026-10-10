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
 * Spanish for the staff screens (Dominguez, October 2026). A member of staff
 * chooses Español on Your profile; the app switches at once, stays Spanish
 * on another device (it is saved as theirs), and goes back to English the
 * same way. English is everybody's until they choose. run-all.sh puts
 * everybody back to English.
 */
async function signIn(email, viewport = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Not clocked in|Sin marcar entrada/).first().waitFor({ timeout: 20000 });
  return page;
}

const desk = await signIn('frontdesk@domihealthcare.com');

await step('English until somebody chooses otherwise', async () => {
  await desk.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Schedule' }).waitFor();
  if ((await desk.evaluate(() => document.documentElement.lang)) !== 'en') throw new Error('page is not marked English');
});

await step('Español on Your profile switches the app at once', async () => {
  await desk.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await desk.getByTestId('language-choice').getByRole('button', { name: 'Español' }).click();
  await desk.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Horario' }).waitFor();
  if ((await desk.evaluate(() => document.documentElement.lang)) !== 'es') throw new Error('page is not marked Spanish');
});

await step('Home speaks Spanish: the clock, the button, the dates', async () => {
  await desk.getByRole('link', { name: 'Inicio' }).first().click();
  await desk.getByText('Sin marcar entrada').waitFor();
  await desk.getByRole('button', { name: /Marcar entrada/ }).waitFor();
  await desk.screenshot({ path: `${OUT}/spanish-home.png`, fullPage: true });
});

await step('the Schedule, Timesheet and Directory too', async () => {
  await desk.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await desk.getByText('Tu tiempo libre').first().waitFor();
  await desk.getByRole('link', { name: '+ Pedir tiempo libre' }).first().waitFor();
  // Month and weekday names come from the browser in Spanish.
  const heading = await desk.locator('h2').filter({ hasText: /\d{4}/ }).first().innerText();
  if (!/(ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)/i.test(heading)) {
    throw new Error(`the dates read "${heading}"`);
  }
  await desk.screenshot({ path: `${OUT}/spanish-schedule.png`, fullPage: true });
  await desk.goto(`${BASE}/timesheet`, { waitUntil: 'networkidle' });
  await desk.getByRole('heading', { level: 1 }).getByText('Hoja de horas').waitFor();
  await desk.goto(`${BASE}/directory`, { waitUntil: 'networkidle' });
  await desk.getByRole('heading', { level: 1 }).getByText('Directorio').waitFor();
});

await step('it is saved as theirs: another device opens in Spanish', async () => {
  const other = await signIn('frontdesk@domihealthcare.com', { width: 390, height: 844 });
  await other.getByText('Sin marcar entrada').waitFor();
  // The phone's bottom bar too.
  await other.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Inicio/ }).waitFor();
  await other.screenshot({ path: `${OUT}/spanish-phone.png`, fullPage: true });
  await other.context().close();
});

await step('colleagues are unaffected', async () => {
  const ma = await signIn('manager@domihealthcare.com');
  await ma.getByText('Not clocked in').waitFor();
  await ma.context().close();
});

await step('English on Your profile switches back', async () => {
  await desk.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await desk.getByTestId('language-choice').getByRole('button', { name: 'English' }).click();
  await desk.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Schedule' }).waitFor();
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL SPANISH CHECKS PASSED');
