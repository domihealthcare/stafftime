import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// Time off on the rota, and the rota on paper for the break-room wall.
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

async function signIn(page, email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
}

// Next week, Monday to Sunday, in the browser's own calendar.
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monday = new Date();
monday.setHours(0, 0, 0, 0);
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7);
const day = (offset) => { const d = new Date(monday); d.setDate(d.getDate() + offset); return d; };
const MON = ymd(day(0));
const WED = ymd(day(2));
const THU = ymd(day(3));

// Frankie asks for Wednesday (approved) and Thursday (still waiting).
const fdCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const frankie = await fdCtx.newPage();
frankie.on('pageerror', (e) => errors.push(`staff pageerror: ${e.message}`));
await signIn(frankie, 'frontdesk@domihealthcare.com');
const [wedId] = await frankie.evaluate(async ([wed, thu]) => {
  const ask = (date) =>
    fetch('/api/pto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'SICK', startDate: date, endDate: date }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`time off refused: ${await r.text()}`);
      return (await r.json()).id;
    });
  return [await ask(wed), await ask(thu)];
}, [WED, THU]);

const mgrCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const mgr = await mgrCtx.newPage();
mgr.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await signIn(mgr, 'manager@domihealthcare.com');

// Approve Wednesday; publish a Monday shift and leave a Tuesday one as a draft.
await mgr.evaluate(async ([id, mon]) => {
  const ok = async (r) => { if (!r.ok) throw new Error(await r.text()); return r.json(); };
  await fetch(`/api/pto/${id}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'APPROVED' }),
  }).then(ok);
  const people = await fetch('/api/employees').then(ok);
  const frankie = people.find((p) => p.email === 'frontdesk@domihealthcare.com');
  const places = await fetch('/api/locations').then(ok);
  const nb = places.find((l) => l.name === 'North Bergen');
  const at = (date, hour) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate()); d.setHours(hour, 0, 0, 0); return d; };
  const tue = new Date(`${mon}T00:00:00`); tue.setDate(tue.getDate() + 1);
  const tueDay = `${tue.getFullYear()}-${String(tue.getMonth() + 1).padStart(2, '0')}-${String(tue.getDate()).padStart(2, '0')}`;
  for (const [date, status] of [[mon, 'PUBLISHED'], [tueDay, 'DRAFT']]) {
    await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: frankie.id,
        locationId: nb.id,
        startsAt: at(date, 9).toISOString(),
        endsAt: at(date, 17).toISOString(),
        status,
        notes: 'print-suite',
      }),
    }).then(ok);
  }
}, [wedId, MON]);

await mgr.getByRole('link', { name: 'Schedule' }).click();
await mgr.getByTestId('week-grid').waitFor({ timeout: 15000 });
await mgr.getByRole('button', { name: 'Next →' }).click();
await mgr.getByText('Coverage this week').waitFor({ timeout: 15000 });
const frankieRow = () => mgr.getByTestId('rota-row-Frankie Front-Desk');

await step('approved time off shows in the person’s row, with its kind for a manager', async () => {
  const chip = frankieRow().locator('[data-testid="time-off"][data-status="APPROVED"]');
  await chip.waitFor({ timeout: 10000 });
  await chip.getByText('Time off', { exact: true }).waitFor({ timeout: 5000 });
  await chip.getByText('Sick', { exact: true }).waitFor({ timeout: 5000 });
});

await step('a request nobody has decided shows as asked off, apart from approved', async () => {
  const chip = frankieRow().locator('[data-testid="time-off"][data-status="PENDING"]');
  await chip.getByText('Asked off', { exact: true }).waitFor({ timeout: 5000 });
});

await step('the day’s heading counts who is off', async () => {
  await mgr.getByTestId(`day-cover-${WED}`).getByText('1 off', { exact: true }).waitFor({ timeout: 5000 });
});

await step('the key explains time off', async () => {
  await mgr.getByTestId('rota-legend').getByText('Time off', { exact: true }).waitFor({ timeout: 5000 });
});
await mgr.screenshot({ path: `${OUT}/120-rota-time-off.png`, fullPage: true });

await step('adding a shift on somebody’s day off says so first', async () => {
  const wedLabel = day(2).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  await mgr.getByRole('button', { name: `Add a shift for Frankie Front-Desk on ${wedLabel}` }).click();
  await mgr.getByTestId('quick-time-off').getByText(/has approved time off this day/).waitFor({ timeout: 5000 });
  await mgr.getByRole('button', { name: 'Close' }).click();
});

await step('staff see their own time off in their row', async () => {
  await frankie.getByRole('link', { name: 'Schedule' }).click();
  await frankie.getByTestId('week-grid').waitFor({ timeout: 15000 });
  await frankie.getByRole('button', { name: 'Next →' }).click();
  await frankie.locator('[data-testid="time-off"][data-status="APPROVED"]').waitFor({ timeout: 10000 });
  await frankie.locator('[data-testid="time-off"][data-status="PENDING"]').waitFor({ timeout: 5000 });
});

// On paper.
await step('Print on the schedule opens the printable week, one page per office', async () => {
  await mgr.getByRole('link', { name: 'Print', exact: true }).click();
  await mgr.getByTestId('print-page-North Bergen').waitFor({ timeout: 15000 });
  await mgr.getByTestId('print-page-West New York').waitFor({ timeout: 5000 });
  if (!new URL(mgr.url()).searchParams.get('week')?.startsWith(MON))
    throw new Error(`printing the wrong week: ${mgr.url()}`);
});

const nbPage = () => mgr.getByTestId('print-page-North Bergen');
await step('published shifts print; drafts are left off and counted', async () => {
  const row = nbPage().getByTestId('print-row-Frankie Front-Desk');
  await row.waitFor({ timeout: 5000 });
  const cells = row.locator('td');
  if (!/9\s?am.*5\s?pm/i.test(await cells.nth(0).innerText()))
    throw new Error(`Monday reads "${await cells.nth(0).innerText()}"`);
  if (/\d/.test(await cells.nth(1).innerText())) throw new Error('the draft Tuesday shift printed');
  await mgr.getByTestId('print-drafts').getByText(/draft shift/).waitFor({ timeout: 5000 });
});

await step('time off prints as Off, never saying what kind', async () => {
  const row = nbPage().getByTestId('print-row-Frankie Front-Desk');
  const wed = row.locator('td').nth(2);
  if ((await wed.innerText()).trim() !== 'Off') throw new Error(`Wednesday reads "${await wed.innerText()}"`);
  const page = await nbPage().innerText();
  if (/sick/i.test(page)) throw new Error('the printout says who is off sick');
  // Not approved yet, so not on the wall.
  const thu = row.locator('td').nth(3);
  if (/off/i.test(await thu.innerText())) throw new Error('an undecided request printed as off');
});

await step('open shifts are never printed', async () => {
  const text = await mgr.locator('main, body').first().innerText();
  if (/open shift/i.test(text)) throw new Error('an open shift is on the printout');
});

await step('on paper: the controls and the test banner are gone, and it is landscape pages', async () => {
  await mgr.emulateMedia({ media: 'print' });
  if (await mgr.getByRole('button', { name: 'Print', exact: true }).isVisible())
    throw new Error('the Print button would print');
  if (await mgr.getByText(/Test environment/).first().isVisible().catch(() => false))
    throw new Error('the test banner would print');
  const pdf = await mgr.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (pages !== 2) throw new Error(`expected a page per office, got ${pages}`);
  await mgr.emulateMedia({ media: 'screen' });
});
await mgr.screenshot({ path: `${OUT}/121-rota-print.png`, fullPage: true });

await step('one office on its own prints just that office', async () => {
  await mgr.getByLabel('Office to print').selectOption({ label: 'West New York' });
  await mgr.getByTestId('print-page-West New York').waitFor({ timeout: 5000 });
  if ((await mgr.getByTestId('print-page-North Bergen').count()) > 0) throw new Error('North Bergen still printing');
});

await step('staff cannot open the printable rota', async () => {
  await frankie.goto(`${BASE}/schedule/print?week=${MON}`, { waitUntil: 'networkidle' });
  await frankie.getByText('Only managers can print the rota.').waitFor({ timeout: 10000 });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL ROTA PRINT CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
