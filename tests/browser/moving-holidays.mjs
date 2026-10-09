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
 * Moving holidays, copied right (Dominguez, October 2026 — making the app
 * smarter): "Copy these into next year" puts Thanksgiving and the other
 * holidays that move on their own day next year, and says which moved and
 * which fixed ones land on a weekend. Done in 2031, which nothing else uses;
 * run-all.sh's reset removes practice events.
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
const call = (page, method, path, body) =>
  page.evaluate(
    async ({ method, path, body }) => {
      const r = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { method, path, body },
  );

const mgr = await signIn('manager@domihealthcare.com');

await step('set-up: Thanksgiving, Memorial Day and Christmas 2031 as closures', async () => {
  for (const [title, date] of [
    ['Thanksgiving', '2031-11-27'],
    ['Memorial Day', '2031-05-26'],
    ['Christmas Day', '2031-12-25'],
  ]) {
    const made = await call(mgr, 'POST', '/api/events', {
      kind: 'CLOSURE',
      title,
      allDay: true,
      startDate: date,
      endDate: date,
      audience: 'EVERYONE',
    });
    if (made.status !== 201) throw new Error(`${title}: ${made.status} ${JSON.stringify(made.body)}`);
  }
});

let copied;
await step('copying into 2032 moves the moving ones to their day, and says so', async () => {
  copied = await call(mgr, 'POST', '/api/events/closures/copy', { fromYear: 2031 });
  if (copied.status !== 201 && copied.status !== 200) throw new Error(`copy answered ${copied.status}`);
  const { moved, onWeekend } = copied.body;
  if (
    JSON.stringify(moved) !==
    JSON.stringify([
      'Memorial Day — Mon, May 26, 2031 → Mon, May 31, 2032',
      'Thanksgiving — Thu, Nov 27, 2031 → Thu, Nov 25, 2032',
    ])
  )
    throw new Error(`moved: ${JSON.stringify(moved)}`);
  if (JSON.stringify(onWeekend) !== JSON.stringify(['Christmas Day — Sat, Dec 25, 2032 is a Saturday']))
    throw new Error(`weekend: ${JSON.stringify(onWeekend)}`);
});

await step('they are on the 2032 calendar on those days', async () => {
  const events = await call(
    mgr,
    'GET',
    `/api/events?from=${encodeURIComponent('2032-01-01T05:00:00Z')}&to=${encodeURIComponent('2033-01-01T05:00:00Z')}`,
  );
  const day = (title) => events.body.find((e) => e.title === title)?.startDate;
  if (day('Thanksgiving') !== '2032-11-25') throw new Error(`Thanksgiving on ${day('Thanksgiving')}`);
  if (day('Memorial Day') !== '2032-05-31') throw new Error(`Memorial Day on ${day('Memorial Day')}`);
  if (day('Christmas Day') !== '2032-12-25') throw new Error(`Christmas on ${day('Christmas Day')}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL MOVING-HOLIDAY CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
