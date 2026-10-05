import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// New hours for a shift from its pop-up (Dominguez, October 2026: "Gaby is
// 7-2 but it is changing to 1-8, so instead of Celeste doing 1 by 1, she can
// just edit all"): just this shift, every later one on the same weekday, or
// all of the person's later shifts at those hours — the regular shift behind
// them following, so weeks not written out yet come at the new hours too.
const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

const signIn = async (email) => {
  const page = await (
    await browser.newContext({ viewport: { width: 1400, height: 1000 }, timezoneId: 'America/New_York' })
  ).newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Not clocked in').waitFor({ timeout: 20000 });
  return page;
};

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (d, n) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};
const sunday = new Date();
sunday.setHours(0, 0, 0, 0);
sunday.setDate(sunday.getDate() - sunday.getDay());
// The Monday of the week after next: every shift in it is still ahead.
const monday = plusDays(sunday, 15);

const mgr = await signIn('manager@domihealthcare.com');

/// Frankie's shifts from the Monday on, as "YYYY-MM-DD HH:MM–HH:MM" on the
/// practice's clock (the page runs in New York).
const frankieHours = () =>
  mgr.evaluate(
    async ({ from, to }) => {
      const shifts = await fetch(`/api/shifts?from=${from}&to=${to}`).then((r) => r.json());
      const hhmm = (iso) => {
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      };
      const day = (iso) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      return shifts
        .filter((s) => s.employee?.firstName === 'Frankie' && s.status !== 'CANCELLED')
        .map((s) => ({ day: day(s.startsAt), hours: `${hhmm(s.startsAt)}–${hhmm(s.endsAt)}`, weekday: new Date(s.startsAt).getDay() }))
        .sort((a, b) => a.day.localeCompare(b.day));
    },
    { from: `${key(monday)}T04:00:00Z`, to: `${key(plusDays(monday, 70))}T00:00:00Z` },
  );

const openWeek = async () => {
  await mgr.goto(`${BASE}/schedule?week=${key(monday)}`, { waitUntil: 'networkidle' });
  await mgr.getByRole('button', { name: 'Week', exact: true }).click();
  await mgr.getByTestId('rota-row-Frankie Front-Desk').waitFor({ timeout: 15000 });
};
const chips = () => mgr.getByTestId('rota-row-Frankie Front-Desk').getByTestId('shift-chip');

await step('setting up: Frankie works Mondays, Wednesdays and Fridays, 7 to 2, no end date', async () => {
  const result = await mgr.evaluate(
    async ({ from }) => {
      const people = await fetch('/api/employees').then((r) => r.json());
      const frankie = people.find((p) => p.email === 'frontdesk@domihealthcare.com');
      const response = await fetch('/api/shifts/repeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: frankie.id,
          locationId: frankie.locations[0].locationId,
          startTime: '07:00',
          endTime: '14:00',
          daysOfWeek: [1, 3, 5],
          from,
          status: 'PUBLISHED',
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { from: key(monday) },
  );
  if (result.status !== 201) throw new Error(`answered ${result.status}: ${JSON.stringify(result.body)}`);
  if (!result.body.standing) throw new Error('no regular shift was made');
});

await step('the pop-up shows the hours, and offers the choice only once they change', async () => {
  await openWeek();
  await chips().first().click();
  const dialog = mgr.getByRole('dialog', { name: /Frankie/ });
  const hours = dialog.getByTestId('shift-hours');
  if ((await hours.getByLabel('Starts').inputValue()) !== '07:00') throw new Error('Starts is not 07:00');
  if ((await hours.getByLabel('Ends').inputValue()) !== '14:00') throw new Error('Ends is not 14:00');
  if (await dialog.getByRole('radio').count()) throw new Error('the choice showed before anything changed');
  await hours.getByLabel('Starts').fill('09:00');
  await dialog.getByRole('radio', { name: 'Just this shift' }).waitFor();
  await dialog.getByRole('radio', { name: /every later Monday like it/ }).waitFor();
  await dialog.getByRole('radio', { name: /all of Frankie’s later 7am–2pm shifts/ }).waitFor();
  await mgr.screenshot({ path: `${OUT}/shift-hours-dialog.png` });
});

await step('just this shift changes only the one', async () => {
  const dialog = mgr.getByRole('dialog', { name: /Frankie/ });
  const saved = mgr.waitForResponse((r) => /\/api\/shifts\/[^/]+\/retime$/.test(r.url()));
  await dialog.getByRole('button', { name: 'Change the hours' }).click();
  if (!(await saved).ok()) throw new Error('the change was refused');
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
  const all = await frankieHours();
  if (all[0].day !== key(monday) || all[0].hours !== '09:00–14:00')
    throw new Error(`the Monday reads ${JSON.stringify(all[0])}`);
  const others = all.slice(1).filter((s) => s.hours !== '07:00–14:00');
  if (others.length) throw new Error(`others changed too: ${JSON.stringify(others)}`);
});

await step('every later Wednesday changes, Fridays stay as they were', async () => {
  await chips().filter({ hasText: '7am–2pm' }).first().click(); // the Wednesday
  const dialog = mgr.getByRole('dialog', { name: /Frankie/ });
  await dialog.getByLabel('Starts').fill('13:00');
  await dialog.getByLabel('Ends').fill('20:00');
  await dialog.getByRole('radio', { name: /every later Wednesday like it/ }).check();
  await dialog.getByRole('button', { name: 'Change them all' }).click();
  const confirm = mgr.getByRole('alertdialog').or(mgr.getByRole('dialog', { name: /Change the hours from/ }));
  await confirm.getByText('1pm–8pm').first().waitFor({ timeout: 10000 });
  const saved = mgr.waitForResponse((r) => /\/api\/shifts\/[^/]+\/retime$/.test(r.url()));
  await confirm.getByRole('button', { name: 'Yes, change them' }).click();
  const result = await (await saved).json();
  if (result.created < 8) throw new Error(`only ${result.created} changed`);
  await mgr.getByText(`${result.created} shifts changed.`).waitFor({ timeout: 10000 });
  await mgr.getByTestId('plan-regular').waitFor();
  await mgr.screenshot({ path: `${OUT}/shift-hours-result.png`, fullPage: true });
  const all = await frankieHours();
  const wrongWed = all.filter((s) => s.weekday === 3 && s.hours !== '13:00–20:00');
  const wrongFri = all.filter((s) => s.weekday === 5 && s.hours !== '07:00–14:00');
  if (wrongWed.length) throw new Error(`Wednesdays not moved: ${JSON.stringify(wrongWed)}`);
  if (wrongFri.length) throw new Error(`Fridays moved: ${JSON.stringify(wrongFri)}`);
  const standing = await mgr.evaluate(() => fetch('/api/shifts/standing').then((r) => r.json()));
  const wednesdays = standing.find(
    (s) => s.employee?.firstName === 'Frankie' && s.daysOfWeek.join() === '3' && !s.endsOn,
  );
  if (!wednesdays || wednesdays.startTime !== '13:00')
    throw new Error(`the regular Wednesdays read ${JSON.stringify(wednesdays)}`);
});

await step('all later shifts at those hours change, any day', async () => {
  await chips().filter({ hasText: '7am–2pm' }).first().click(); // the Friday
  const dialog = mgr.getByRole('dialog', { name: /Frankie/ });
  await dialog.getByLabel('Starts').fill('12:00');
  await dialog.getByLabel('Ends').fill('18:00');
  await dialog.getByRole('radio', { name: /all of Frankie’s later 7am–2pm shifts/ }).check();
  await dialog.getByRole('button', { name: 'Change them all' }).click();
  const saved = mgr.waitForResponse((r) => /\/api\/shifts\/[^/]+\/retime$/.test(r.url()));
  await mgr.getByRole('button', { name: 'Yes, change them' }).click();
  if (!(await saved).ok()) throw new Error('the change was refused');
  const all = await frankieHours();
  const left = all.filter((s) => s.hours === '07:00–14:00');
  if (left.length) throw new Error(`still at 7 to 2: ${JSON.stringify(left)}`);
  if (all[0].hours !== '09:00–14:00') throw new Error('the Monday changed on its own was touched');
  const standing = await mgr.evaluate(() => fetch('/api/shifts/standing').then((r) => r.json()));
  const rest = standing.find(
    (s) => s.employee?.firstName === 'Frankie' && s.daysOfWeek.join() === '1,5' && !s.endsOn,
  );
  if (!rest || rest.startTime !== '12:00') throw new Error(`the regular Mon/Fri reads ${JSON.stringify(rest)}`);
});

await step('Frankie is told under the bell', async () => {
  const me = await signIn('frontdesk@domihealthcare.com');
  await me.getByRole('button', { name: /^Notifications/ }).click();
  const panel = me.getByRole('dialog', { name: 'Notifications' });
  await panel.getByText('Your shift times have changed').first().waitFor({ timeout: 10000 });
  await panel.getByText(/Wednesdays from .*: 1pm–8pm, not 7am–2pm\./).waitFor({ timeout: 10000 });
});

await step('an end before the start is refused', async () => {
  const status = await mgr.evaluate(
    async ({ from }) => {
      const shifts = await fetch(`/api/shifts?from=${from}T04:00:00Z&to=${from}T23:59:00Z`).then((r) => r.json());
      const one = shifts.find((s) => s.employee?.firstName === 'Frankie');
      return (await fetch(`/api/shifts/${one.id}/retime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime: '15:00', endTime: '09:00', scope: 'LATER' }),
      })).status;
    },
    { from: key(monday) },
  );
  if (status !== 400) throw new Error(`answered ${status}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL SHIFT-HOURS CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
