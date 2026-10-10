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
 * "Staff who never signed in" (Dominguez, October 2026 — a "smarter" idea):
 * on the Staff screen, everybody still here who has never signed in, why
 * that may be, and the welcome email to send (or send again). Admins only.
 * Two people are added for it, Nora and Tess (`@example.com`; run-all.sh
 * removes them).
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
      const r = await fetch(`/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );

const ada = await signIn('admin@domihealthcare.com');
const mgr = await signIn('manager@domihealthcare.com');
let nora;
let tess;

await step('set-up: Nora, never invited, and Tess, given a temporary password', async () => {
  for (const [first, email] of [
    ['Nora', 'nora.signin@example.com'],
    ['Tess', 'tess.signin@example.com'],
  ]) {
    const made = await call(ada, '/employees', {
      method: 'POST',
      body: JSON.stringify({ firstName: first, lastName: 'Signinsuite', email }),
    });
    if (made.status !== 201) throw new Error(`adding ${first} answered ${made.status}: ${JSON.stringify(made.body)}`);
    if (first === 'Nora') nora = made.body;
    else tess = made.body;
  }
  const set = await call(ada, `/auth/employees/${tess.id}/password`, {
    method: 'PUT',
    body: JSON.stringify({ temporaryPassword: 'Temporary-Pass-2026!' }),
  });
  if (set.status >= 300) throw new Error(`the temporary password answered ${set.status}: ${JSON.stringify(set.body)}`);
});

await step('the Staff screen lists them, what holds each up, and Nora’s welcome email', async () => {
  await ada.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  const card = ada.getByTestId('not-signed-in');
  await card.locator('summary').click();
  const noraLine = card.locator('li', { hasText: 'Nora Signinsuite' });
  await noraLine.getByText('Never sent a welcome email').waitFor({ timeout: 10000 });
  const tessLine = card.locator('li', { hasText: 'Tess Signinsuite' });
  await tessLine.getByText(/temporary password/).waitFor();
  if (await tessLine.getByRole('button').count()) throw new Error('a welcome email is offered to somebody with a password');
  // The people signed in for this suite are not on it.
  if (await card.getByText('Ada Admin').count()) throw new Error('somebody who signed in is listed');
  await ada.screenshot({ path: `${OUT}/not-signed-in.png` });

  await noraLine.getByRole('button', { name: 'Send welcome email' }).click();
  await noraLine.getByText(/Welcome link sent, still good/).waitFor({ timeout: 10000 });
  await noraLine.getByRole('button', { name: 'Send it again' }).waitFor();
});

await step('only admins can read the list', async () => {
  const peek = await call(mgr, '/employees/welcome/pending');
  if (peek.status !== 403) throw new Error(`a manager answered ${peek.status}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL NOT-SIGNED-IN CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
