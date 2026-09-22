import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
// Screenshots go wherever the caller says, or into ./shots (gitignored).
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  // Fall back to whatever Playwright downloaded when CHROMIUM_PATH is unset.
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

// --- admin: create a kiosk and read the pairing code off the screen ---
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const admin = await adminCtx.newPage();
admin.on('pageerror', (e) => errors.push(`admin pageerror: ${e.message}`));
await admin.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await admin.getByLabel('Email').fill('admin@domihealthcare.com');
await admin.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await admin.getByRole('button', { name: 'Sign in' }).click();
await admin.getByText('Not clocked in').waitFor({ timeout: 15000 });

let pairingCode;
await step('admin sees a Kiosks tab and can add a device', async () => {
  await admin.getByRole('link', { name: 'Kiosks' }).click();
  await admin.getByRole('button', { name: '+ Add kiosk' }).waitFor({ timeout: 10000 });
  await admin.getByRole('button', { name: '+ Add kiosk' }).click();
  await admin.getByLabel('Name').fill('Front desk tablet');
  await admin.getByLabel('Location').selectOption({ label: 'North Bergen' });
  await admin.getByRole('button', { name: 'Add kiosk' }).click();
  const code = admin.locator('.font-mono.text-3xl');
  await code.waitFor({ timeout: 10000 });
  pairingCode = (await code.innerText()).trim();
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(pairingCode))
    throw new Error(`unexpected code format: ${pairingCode}`);
});
await admin.screenshot({ path: `${OUT}/16-admin-kiosks.png`, fullPage: true });

// --- the tablet ---
const tabletCtx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const tablet = await tabletCtx.newPage();
tablet.on('pageerror', (e) => errors.push(`tablet pageerror: ${e.message}`));

await step('an unpaired tablet shows the setup screen, not the keypad', async () => {
  await tablet.goto('http://127.0.0.1:5173/kiosk', { waitUntil: 'networkidle' });
  await tablet.getByText('Set up this kiosk').waitFor({ timeout: 10000 });
});
await tablet.screenshot({ path: `${OUT}/17-kiosk-pairing.png`, fullPage: true });

await step('a wrong pairing code is refused', async () => {
  await tablet.getByLabel('Pairing code').fill('AAAA-BBBB-CC');
  await tablet.getByRole('button', { name: 'Set up kiosk' }).click();
  await tablet.getByRole('alert').waitFor({ timeout: 10000 });
});

await step('the real code pairs the tablet to its location', async () => {
  await tablet.getByLabel('Pairing code').fill(pairingCode);
  await tablet.getByRole('button', { name: 'Set up kiosk' }).click();
  await tablet.getByText('Tap your name to clock in or out').waitFor({ timeout: 15000 });
  await tablet.getByText('North Bergen').first().waitFor({ timeout: 5000 });
});

await step('the tablet shows only staff at its own location', async () => {
  const names = await tablet.locator('main button').allInnerTexts();
  const joined = names.join(' ');
  if (!joined.includes('Frankie')) throw new Error(`expected Frankie at North Bergen: ${joined}`);
  if (joined.includes('Max')) throw new Error(`Max is West New York only, but appeared: ${joined}`);
});
await tablet.screenshot({ path: `${OUT}/18-kiosk-staff.png`, fullPage: true });

await step('the device cookie is not readable by page scripts', async () => {
  const visible = await tablet.evaluate(() => document.cookie);
  if (visible.includes('stafftime_kiosk')) throw new Error(`device token readable from JS: ${visible}`);
  const cookie = (await tabletCtx.cookies()).find((c) => c.name === 'stafftime_kiosk');
  if (!cookie?.httpOnly) throw new Error('kiosk cookie is not httpOnly');
});

const typePin = async (pin) => {
  for (const digit of pin) await tablet.getByRole('button', { name: digit, exact: true }).click();
  await tablet.getByRole('button', { name: 'Confirm PIN' }).click();
};

await step('a wrong PIN is refused and the entry is cleared', async () => {
  await tablet.getByRole('button', { name: /Frankie/ }).click();
  await tablet.getByText('Enter your PIN').waitFor({ timeout: 5000 });
  await typePin('9999');
  await tablet.getByRole('alert').waitFor({ timeout: 10000 });
  // All the dots must be empty again — no half-typed PIN left on a shared screen.
  const filled = await tablet.locator('.bg-brand-600.rounded-full').count();
  if (filled > 0) throw new Error(`${filled} PIN digits left on screen after failure`);
});
await tablet.screenshot({ path: `${OUT}/19-kiosk-wrong-pin.png`, fullPage: true });

await step('the correct PIN clocks in and confirms', async () => {
  await typePin('4817');
  await tablet.getByText('Clocked in').waitFor({ timeout: 15000 });
  await tablet.getByText('Frankie').first().waitFor({ timeout: 5000 });
});
await tablet.screenshot({ path: `${OUT}/20-kiosk-clocked-in.png`, fullPage: true });

await step('the confirmation returns to the staff list by itself', async () => {
  await tablet.getByText('Tap your name to clock in or out').waitFor({ timeout: 10000 });
});

await step('the same PIN again clocks out and reports time worked', async () => {
  await tablet.getByRole('button', { name: /Frankie/ }).click();
  await typePin('4817');
  await tablet.getByText('Clocked out').waitFor({ timeout: 15000 });
  await tablet.getByText(/on the clock/).waitFor({ timeout: 5000 });
});
await tablet.screenshot({ path: `${OUT}/21-kiosk-clocked-out.png`, fullPage: true });

await step('the kiosk offers no way into the rest of the app', async () => {
  for (const name of ['Timesheet', 'Schedule', 'Kiosks', 'Sign out']) {
    if (await tablet.getByRole('link', { name }).count() > 0)
      throw new Error(`kiosk exposed a link to ${name}`);
    if (await tablet.getByRole('button', { name }).count() > 0)
      throw new Error(`kiosk exposed a button for ${name}`);
  }
});

await step('revoking the device stops the tablet working', async () => {
  admin.once('dialog', (d) => d.accept());
  await admin.getByRole('button', { name: 'Revoke' }).first().click();
  await admin.getByText('No kiosks yet').waitFor({ timeout: 10000 });

  await tablet.reload({ waitUntil: 'networkidle' });
  await tablet.getByText('Set up this kiosk').waitFor({ timeout: 15000 });
});

// The punches above must still be on the timesheet, marked as kiosk-verified.
await step('kiosk punches appear on the manager timesheet as Kiosk-verified', async () => {
  await admin.getByRole('link', { name: 'Timesheet' }).click();
  await admin.getByRole('table').waitFor({ timeout: 10000 });
  await admin.getByText('Kiosk').first().waitFor({ timeout: 10000 });
});
await admin.screenshot({ path: `${OUT}/22-timesheet-kiosk.png`, fullPage: true });

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL KIOSK CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
