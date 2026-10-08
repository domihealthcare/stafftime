import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Defaults to the dev server; point at `vite preview` to test the built bundle
// with the deployed security headers applied.
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
 * "Who can cover this?" (Dominguez, October 2026 — making the app smarter):
 * the shift's pop-up ranks who could work it, best first, with the reason.
 *
 * An open shift at North Bergen, Tuesday 9 February 2027, 9am–5pm, no job
 * role. Frankie is free; Ada has 32 hours that week already, so this takes
 * her to 40 — close to overtime; Morgan is already on at West New York then.
 * February 2027, which run-all.sh clears between suites.
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

const mgr = await signIn('manager@domihealthcare.com');
const api = (path, init) => call(mgr, path, init);
const staff = (await api('/employees')).body;
const idOf = (email) => staff.find((p) => p.email === email).id;
const places = (await api('/locations')).body;
const placeId = (name) => places.find((l) => l.name === name).id;

// New Jersey is on EST in February: UTC-5.
const at = (day, hour) => `2027-02-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00-05:00`;
async function shift(employeeId, place, day, from, to) {
  const made = await api('/shifts', {
    method: 'POST',
    body: JSON.stringify({
      employeeId,
      locationId: placeId(place),
      startsAt: at(day, from),
      endsAt: at(day, to),
    }),
  });
  if (made.status !== 201) throw new Error(`making a shift answered ${made.status}: ${JSON.stringify(made.body)}`);
  return made.body;
}

let open;
await step('set-up: an open shift, Ada near overtime and Morgan already on', async () => {
  open = await shift(null, 'North Bergen', 9, 9, 17);
  for (const day of [8, 10, 11, 12]) await shift(idOf('admin@domihealthcare.com'), 'North Bergen', day, 9, 17);
  await shift(idOf('manager@domihealthcare.com'), 'West New York', 9, 8, 16);
});

const dialog = mgr.getByRole('dialog', { name: 'Open shift' });
const picker = dialog.getByLabel('Put somebody in it');

await step('the pop-up suggests the free person first, with the week’s hours', async () => {
  await mgr.goto(`${BASE}/schedule?week=2027-02-09`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: 'Week', exact: true }).click();
  await mgr.getByTestId('open-shift').first().click();
  const suggestions = dialog.getByTestId('cover-suggestion');
  await suggestions.first().waitFor({ timeout: 10000 });
  const listed = await suggestions.allTextContents();
  if (listed.length !== 1 || !/^Frankie Front-Desk8 hrs that week with this$/.test(listed[0]))
    throw new Error(`suggested: ${listed.join(' | ')}`);
});

await step('the full list is ranked: free, then with a catch, then those already on', async () => {
  const groups = await picker.locator('optgroup').evaluateAll((all) =>
    all.map((group) => ({
      label: group.label,
      options: [...group.querySelectorAll('option')].map((o) => ({ text: o.textContent, disabled: o.disabled })),
    })),
  );
  const expected = [
    { label: 'Free — best first', options: [{ text: 'Frankie Front-Desk — free · 8 hrs that week', disabled: false }] },
    {
      label: 'Could, but check first',
      options: [{ text: 'Ada Admin — Close to overtime: 40 hrs that week', disabled: false }],
    },
    {
      label: 'Already on, or off that day',
      options: [{ text: 'Morgan Manager — Already on 8:00 AM–4:00 PM (West New York)', disabled: true }],
    },
  ];
  if (JSON.stringify(groups) !== JSON.stringify(expected)) throw new Error(`listed: ${JSON.stringify(groups)}`);
});

await step('picking Ada says why to think twice — the overtime warning, not twice over', async () => {
  await picker.selectOption(idOf('admin@domihealthcare.com'));
  await dialog.getByTestId('overtime-preview').waitFor({ timeout: 10000 });
  if (await dialog.getByTestId('cover-notes').count()) throw new Error('overtime was said twice');
});
await mgr.screenshot({ path: `${OUT}/cover-ranked.png`, fullPage: true });

await step('pressing a suggestion picks them, and Assign puts them in it', async () => {
  const frankie = dialog.getByTestId('cover-suggestion').first();
  await frankie.click();
  if ((await frankie.getAttribute('aria-pressed')) !== 'true') throw new Error('the suggestion is not marked picked');
  if ((await picker.inputValue()) !== idOf('frontdesk@domihealthcare.com'))
    throw new Error('the list did not follow the suggestion');
  const saved = mgr.waitForResponse((r) => r.url().includes(`/api/shifts/${open.id}`) && r.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Assign' }).click();
  if (!(await saved).ok()) throw new Error('the assignment was refused');
  await mgr.getByTestId('rota-row-Frankie Front-Desk').getByTestId('shift-chip').waitFor({ timeout: 10000 });
});

await step('on her shift now, the list says so — and only her job role is offered', async () => {
  await mgr.getByTestId('rota-row-Frankie Front-Desk').getByTestId('shift-chip').click();
  const own = mgr.getByRole('dialog', { name: 'Frankie Front-Desk' });
  const line = own.getByLabel('Who works it').locator('option:checked');
  await own.getByLabel('Who works it').locator('optgroup').first().waitFor({ state: 'attached', timeout: 10000 });
  const text = await line.textContent();
  if (text !== 'Frankie Front-Desk — on it now') throw new Error(`her line reads "${text}"`);
  // Assigned, the shift took her main job role, Front Desk — and nobody else
  // at North Bergen is in it, so there is nobody to suggest.
  if (await own.getByTestId('cover-suggestions').count()) throw new Error('suggested somebody outside Front Desk');
  await own.getByRole('button', { name: 'Close' }).click();
});

await step('staff cannot ask who could cover a shift', async () => {
  const frankie = await signIn('frontdesk@domihealthcare.com');
  const asked = await call(frankie, `/shifts/${open.id}/cover-options`);
  if (asked.status !== 403) throw new Error(`staff were answered ${asked.status}`);
});

await step('a first draft: three open shifts on Wednesday, two people free, nobody for the third', async () => {
  for (let i = 0; i < 3; i++) await shift(null, 'North Bergen', 10, 9, 17);
  await mgr.goto(`${BASE}/schedule?week=2027-02-09`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: 'Week', exact: true }).click();
  await mgr.getByTestId('open-shift-flag').getByText(/3 open shifts/).waitFor({ timeout: 10000 });
  await mgr.getByRole('button', { name: /Suggest people for them/ }).click();
  const draft = mgr.getByRole('dialog', { name: 'Suggested for the open shifts' });
  await draft.getByTestId('cover-proposal').nth(2).waitFor({ timeout: 10000 });
  const lines = await draft.getByTestId('cover-proposal').allTextContents();
  // Frankie and Morgan have 8 hours that week each; Ada would reach 40 — a
  // catch, so never suggested.
  const named = lines.filter((line) => /Frankie Front-Desk|Morgan Manager/.test(line));
  if (named.length !== 2 || !lines.some((line) => /Nobody is free then/.test(line)))
    throw new Error(`proposed: ${lines.join(' | ')}`);
  if (lines.some((line) => /Ada Admin/.test(line))) throw new Error('Ada was suggested into overtime');
  if (lines.filter((line) => /Frankie/.test(line)).length !== 1)
    throw new Error('Frankie was suggested for two shifts at once');
  await mgr.screenshot({ path: `${OUT}/cover-draft.png`, fullPage: true });
});

await step('unticking one and assigning the rest leaves it, and the one nobody could do, open', async () => {
  const draft = mgr.getByRole('dialog', { name: 'Suggested for the open shifts' });
  await draft.getByTestId('cover-proposal').filter({ hasText: 'Morgan Manager' }).getByRole('checkbox').uncheck();
  await draft.getByRole('button', { name: 'Assign 1' }).click();
  await draft.waitFor({ state: 'detached', timeout: 10000 });
  await mgr.getByTestId('open-shift-flag').getByText(/2 open shifts/).waitFor({ timeout: 10000 });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL COVER CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
