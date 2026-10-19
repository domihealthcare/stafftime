import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
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

function sql(statement) {
  return execFileSync(
    'psql',
    [
      '-h', process.env.PGHOST_LOCAL || '127.0.0.1',
      '-p', process.env.PGPORT_LOCAL || '5433',
      '-U', process.env.PGUSER_LOCAL || 'postgres',
      '-d', process.env.PGDATABASE_LOCAL || 'stafftime',
      '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', statement,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  ).toString().trim();
}

/**
 * 360 feedback (October 2026, Dominguez): everybody rates everybody, and
 * themselves, anonymously; reports are for managers and admins only, once it
 * is closed and at least three colleagues rated the person; from a report, a
 * manager offers times to talk it through and the person picks one, which
 * goes on both calendars.
 *
 * Rita and Sam (`*.r360@example.com`) are made here so Frankie has enough
 * colleagues; run-all.sh removes them, the 360s and the meeting's event.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Not clocked in|On the clock/).first().waitFor({ timeout: 20000 });
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

const ada = await signIn('admin@domihealthcare.com');
const nb = (await call(ada, '/locations')).body.find((l) => l.name === 'North Bergen').id;
for (const [first, email] of [['Rita', 'rita.r360@example.com'], ['Sam', 'sam.r360@example.com']]) {
  await call(ada, '/employees', {
    method: 'POST',
    body: JSON.stringify({ firstName: first, lastName: 'Rater', email, role: 'EMPLOYEE', payType: 'HOURLY', locationIds: [nb], primaryLocationId: nb }),
  });
}
// The same password as the seeded accounts, already chosen.
sql(`update employees set "passwordHash" = (select "passwordHash" from employees where email = 'admin@domihealthcare.com'), "mustChangePassword" = false where email like '%.r360@example.com'`);

const morgan = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
const rita = await signIn('rita.r360@example.com');
const sam = await signIn('sam.r360@example.com');
const staff = (await call(ada, '/employees')).body;
const idOf = (email) => staff.find((p) => p.email === email).id;
const frankieId = idOf('frontdesk@domihealthcare.com');
const adaId = idOf('admin@domihealthcare.com');

let reviewId;
let detail;

await step('a manager starts a 360 from Surveys, with the starter questions', async () => {
  await morgan.goto(`${BASE}/surveys`, { waitUntil: 'networkidle' });
  const manage = morgan.getByTestId('reviews360-manage');
  await manage.getByRole('button', { name: 'Start a 360' }).click();
  const form = morgan.getByTestId('start-360');
  await form.getByLabel('Question 1: about a colleague').waitFor({ timeout: 10000 });
  if ((await form.getByLabel('Question 1: about a colleague').inputValue()) !== 'Works well with the team and pitches in')
    throw new Error('not the starter questions');
  await form.getByLabel('Title').fill('Fall 360 (suite)');
  await form.getByRole('button', { name: 'Start it' }).click();
  await manage.getByText('Fall 360 (suite)').waitFor({ timeout: 10000 });
  reviewId = (await call(morgan, '/reviews360')).body.find((r) => r.title === 'Fall 360 (suite)').id;
});

await step('everybody is told on the bell, and only one can be open at a time', async () => {
  const note = (await call(frankie, '/notifications')).body.items.find((n) => n.title === '360 feedback: Fall 360 (suite)');
  if (!note || note.link !== `/surveys/360/${reviewId}`) throw new Error(`Frankie's bell: ${JSON.stringify(note)}`);
  const second = await call(morgan, '/reviews360', { method: 'POST', body: JSON.stringify({ title: 'Another' }) });
  if (second.status !== 409) throw new Error(`a second one answered ${second.status}`);
});

await step('Frankie rates herself first, in her own words, and it is marked done', async () => {
  await frankie.goto(`${BASE}/surveys/360/${reviewId}`, { waitUntil: 'networkidle' });
  const people = frankie.getByTestId('review360-people');
  await people.getByRole('button', { name: /^You/ }).first().click();
  const dialog = frankie.getByTestId('review360-rate');
  await dialog.getByText('I work well with the team and pitch in').waitFor({ timeout: 10000 });
  if (await dialog.getByRole('button', { name: /Skip/ }).count()) throw new Error('her own part can be skipped');
  await dialog.getByRole('button', { name: 'I work well with the team and pitch in: 4' }).click();
  await dialog.getByLabel('What do you do well?').fill('Keeping the front desk calm');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await people.getByRole('button', { name: /^You/ }).getByText('Done').waitFor({ timeout: 10000 });
  await frankie.screenshot({ path: `${OUT}/review360-answer.png` });
});

await step('colleagues rate Frankie once each; a skip saves nothing; nothing is kept that says who', async () => {
  detail = (await call(rita, `/reviews360/${reviewId}`)).body;
  const rating = detail.questions.find((q) => q.kind === 'RATING');
  const text = detail.questions.find((q) => q.kind === 'TEXT');
  const about = (score, words) => ({
    subjectId: frankieId,
    answers: [
      { questionId: rating.id, rating: score },
      { questionId: text.id, text: words },
    ],
  });
  for (const [page, score, words] of [[rita, 5, 'Always helpful'], [sam, 4, 'Calm with patients'], [ada, 3, 'Great with the phones']]) {
    const saved = await call(page, `/reviews360/${reviewId}/answers`, { method: 'POST', body: JSON.stringify(about(score, words)) });
    if (saved.status !== 200) throw new Error(`answer answered ${saved.status}: ${JSON.stringify(saved.body)}`);
  }
  const again = await call(rita, `/reviews360/${reviewId}/answers`, { method: 'POST', body: JSON.stringify(about(1, 'again')) });
  if (again.status !== 409) throw new Error(`a second go answered ${again.status}`);
  await call(sam, `/reviews360/${reviewId}/answers`, { method: 'POST', body: JSON.stringify({ subjectId: adaId, skip: true }) });
  // The answers themselves: who they are about, and nothing about who said them.
  const columns = sql(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name in ('review_360_responses', 'review_360_answers')`);
  if (/rater|employee|created|answeredAt/i.test(columns)) throw new Error(`columns: ${columns}`);
  const responsesAboutAda = sql(`select count(*) from review_360_responses where "reviewId" = '${reviewId}' and "subjectId" = '${adaId}'`);
  if (responsesAboutAda !== '0') throw new Error('a skip saved answers');
});

await step('no reports while it is open, and never for staff', async () => {
  const early = await call(morgan, `/reviews360/${reviewId}/reports`);
  if (early.status !== 400) throw new Error(`reports while open answered ${early.status}`);
  const staffAsk = await call(frankie, `/reviews360/${reviewId}/reports`);
  if (staffAsk.status !== 403) throw new Error(`staff asking answered ${staffAsk.status}`);
});

await step('the manager closes it; the reports list everybody but themselves', async () => {
  await morgan.goto(`${BASE}/surveys`, { waitUntil: 'networkidle' });
  const manage = morgan.getByTestId('reviews360-manage');
  await manage.getByRole('button', { name: 'Close' }).click();
  await morgan.getByRole('alertdialog').getByRole('button', { name: 'Close it' }).click();
  await manage.getByRole('link', { name: 'Reports' }).click();
  const list = morgan.getByTestId('review360-reports');
  await list.getByText('Frankie Front-Desk').waitFor({ timeout: 10000 });
  if (await list.getByText(/^Morgan /).count()) throw new Error('Morgan sees their own');
  await list.getByRole('link', { name: /Frankie Front-Desk/ }).getByText('Report').waitFor();
});

await step('Frankie’s report: colleagues beside her own, written answers, enough to show', async () => {
  await morgan.getByTestId('review360-reports').getByRole('link', { name: /Frankie Front-Desk/ }).click();
  const report = morgan.getByTestId('review360-report');
  await report.getByText('Great with the phones').waitFor({ timeout: 10000 });
  await report.getByText('They wrote:').waitFor();
  await report.getByText('Keeping the front desk calm').waitFor();
  const body = (await call(morgan, `/reviews360/${reviewId}/reports/${frankieId}`)).body;
  const teamwork = body.questions.find((q) => q.kind === 'RATING');
  if (teamwork.average !== 4 || teamwork.self !== 4 || teamwork.answered !== 3) throw new Error(JSON.stringify(teamwork));
  await morgan.screenshot({ path: `${OUT}/review360-report.png`, fullPage: true });
});

await step('somebody fewer than three colleagues rated shows no report', async () => {
  const body = (await call(morgan, `/reviews360/${reviewId}/reports/${adaId}`)).body;
  if (body.available !== false || !body.reason.includes('fewer than 3')) throw new Error(JSON.stringify(body));
});

await step('the manager offers two times; Frankie is told, picks one, and it is on both calendars', async () => {
  const card = morgan.getByTestId('review360-meeting');
  await card.getByRole('button', { name: 'Offer times to meet' }).click();
  await card.getByTestId('offer-times').getByRole('button', { name: 'Send 2 times' }).click();
  await card.getByText(/Times offered - waiting for Frankie/).waitFor({ timeout: 10000 });

  const note = (await call(frankie, '/notifications')).body.items.find((n) =>
    n.title.endsWith('would like to meet about your 360 feedback'),
  );
  if (!note) throw new Error('Frankie was not told');
  await frankie.goto(`${BASE}${note.link}`, { waitUntil: 'networkidle' });
  const meeting = frankie.getByTestId('review-meeting');
  await meeting.getByText('Pick a time that suits you:').waitFor({ timeout: 10000 });
  await meeting.getByRole('button').first().click();
  await meeting.getByTestId('review-meeting-chosen').waitFor({ timeout: 10000 });

  const from = new Date().toISOString();
  const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
  for (const page of [frankie, morgan]) {
    const events = (await call(page, `/events?from=${from}&to=${to}`)).body;
    if (!events.some((e) => e.title === 'Feedback conversation: Frankie and Morgan')) throw new Error('not on a calendar');
  }
  const report = (await call(morgan, `/reviews360/${reviewId}/reports/${frankieId}`)).body;
  if (!report.meeting?.chosenAt) throw new Error('the report does not show it agreed');
});

await step('nobody else can open Frankie’s meeting, and staff not in the 360 see nothing', async () => {
  const meetingId = (await call(frankie, '/review-meetings/mine')).body[0].id;
  const peek = await call(rita, `/review-meetings/${meetingId}`);
  if (peek.status !== 404) throw new Error(`Rita opening it answered ${peek.status}`);
  const pick = await call(morgan, `/review-meetings/${meetingId}/choose`, {
    method: 'POST',
    body: JSON.stringify({ slotId: '00000000-0000-4000-8000-000000000000' }),
  });
  if (pick.status !== 404) throw new Error(`a manager picking answered ${pick.status}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL 360 CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
