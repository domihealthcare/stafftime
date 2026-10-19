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
 * A manager can correct the kind of somebody else's time off (October 2026,
 * Angelica Dominguez: an hourly person put a sick day down as PTO).
 */
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
const call = (page, path, init) =>
  page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );

const manager = await signIn('manager@domihealthcare.com');
const desk = await signIn('frontdesk@domihealthcare.com');
let id;

await step('staff ask for PTO', async () => {
  const made = await call(desk, '/pto', {
    method: 'POST',
    body: JSON.stringify({ type: 'VACATION', startDate: '2027-04-13', endDate: '2027-04-13' }),
  });
  if (made.status !== 201) throw new Error(`asking answered ${made.status} ${JSON.stringify(made.body)}`);
  id = made.body.id;
});

await step('they cannot change the kind themselves', async () => {
  const r = await call(desk, `/pto/${id}/type`, { method: 'PATCH', body: JSON.stringify({ type: 'SICK' }) });
  if (r.status !== 403) throw new Error(`answered ${r.status}`);
});

await step('a manager changes PTO to Sick on the Time off screen', async () => {
  await manager.goto(`${BASE}/time-off`, { waitUntil: 'networkidle' });
  const select = manager.getByLabel('Change the kind of time off').first();
  await select.selectOption({ label: 'Sick' });
  await manager.getByRole('button', { name: 'Yes, change it' }).click();
  await manager.waitForTimeout(800);
  const after = await call(manager, `/pto/${id}`);
  if (after.body.type !== 'SICK') throw new Error(`still ${after.body.type}`);
});

await step('and it is refused for a request that is not theirs to change', async () => {
  const r = await call(manager, `/pto/${id}/type`, { method: 'PATCH', body: JSON.stringify({ type: 'SICK' }) });
  if (r.status !== 400) throw new Error(`same kind answered ${r.status}`);
  await call(desk, `/pto/${id}/cancel`, { method: 'PATCH' });
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL TIME-OFF-TYPE CHECKS PASSED');
