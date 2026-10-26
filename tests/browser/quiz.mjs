import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { goToManage } from './nav.mjs';

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
 * Quizzes (Dominguez, October 2026: "i want to send all staff a 'quiz' to
 * make sure they are uptodate on these procedures"). A manager writes one,
 * sends it through Required reading, staff take it by name until they pass
 * (a pass confirms it), and the manager sees the scores. The downtime quiz
 * is loaded by migration.
 *
 * run-all.sh clears `requirements`, the attempts and every quiz but the
 * downtime one.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // The MA is seeded with a temporary password, to be changed on first sign-in.
  const unlocked = page.getByText('Not clocked in');
  const mustChange = page.getByText('Choose a new password');
  await unlocked.or(mustChange).first().waitFor({ timeout: 20000 });
  if (await mustChange.isVisible()) {
    await page.getByLabel('Temporary password').fill('shift-change-2026');
    await page.getByLabel('New password', { exact: true }).fill('harbour lantern 7');
    await page.getByLabel('Confirm new password').fill('harbour lantern 7');
    await page.getByRole('button', { name: 'Change password' }).click();
    await unlocked.waitFor({ timeout: 15000 });
  }
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


const manager = await signIn('manager@domihealthcare.com');
const desk = await signIn('frontdesk@domihealthcare.com');
const ma = await signIn('ma@domihealthcare.com');

const QUESTIONS = [
  { prompt: 'Where do we meet after leaving the building?', right: 'The parking lot across the street', wrong: ['The lobby', 'The basement'] },
  { prompt: 'Which extinguisher is for an electrical fire?', right: 'CO2', wrong: ['Water', 'Foam'] },
  { prompt: 'Who calls 911 from the front desk?', right: 'Whoever is at the desk first', wrong: ['Only a manager', 'Nobody'] },
];
let quizId;
let requirementId;

/// Picks an answer on the quiz screen by its words; the order changes each go.
async function answer(page, index, words) {
  await page.getByTestId(`quiz-question-${index}`).getByLabel(words, { exact: true }).check();
}

await step('the downtime quiz is ready, with questions for everyone and for managers', async () => {
  const list = await call(manager, '/quizzes');
  const downtime = list.body.find((quiz) => quiz.title === 'Downtime procedures');
  if (!downtime) throw new Error('no downtime quiz');
  if (downtime.questionCount < 12) throw new Error(`only ${downtime.questionCount} questions`);
  const full = await call(manager, `/quizzes/${downtime.id}`);
  if (full.body.studyHref !== '/downtime?tab=procedures') throw new Error('it does not point at the procedures');
  if (!full.body.questions.some((q) => q.forManagers)) throw new Error('no managers questions');
  const staff = await call(ma, '/quizzes');
  if (staff.status !== 403) throw new Error(`staff listing quizzes got ${staff.status}`);
});

await step('a manager writes a quiz, one question for the front desk only', async () => {
  await goToManage(manager, 'Quizzes');
  await manager.getByTestId('quiz-Downtime procedures').waitFor();
  await manager.getByRole('button', { name: '+ New quiz' }).click();
  const form = manager.getByRole('form', { name: 'New quiz' });
  await form.getByLabel('Title').fill('Fire safety');
  await form.getByLabel('Pass mark (%)').fill('100');
  for (let i = 0; i < QUESTIONS.length; i++) {
    if (i > 0) await form.getByRole('button', { name: '+ Add a question' }).click();
    const box = form.getByTestId(`edit-question-${i + 1}`);
    const q = QUESTIONS[i];
    await box.getByLabel('Question', { exact: true }).fill(q.prompt);
    await box.getByLabel('Answer 1', { exact: true }).fill(q.wrong[0]);
    await box.getByLabel('Answer 2', { exact: true }).fill(q.right);
    await box.getByLabel('Answer 3', { exact: true }).fill(q.wrong[1]);
    await box.getByLabel('Answer 2 is the right one').check();
    await box.getByLabel('Why (shown once they answer)').fill(`Because: ${q.right}.`);
  }
  // The third is for the front desk only: the MA is not asked it.
  await form.getByTestId('edit-question-3').getByLabel('Front Desk', { exact: true }).check();
  const saved = manager.waitForResponse((r) => r.url().endsWith('/api/quizzes') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Save the quiz' }).click();
  const response = await saved;
  if (response.status() !== 201) throw new Error(`saving answered ${response.status()}`);
  quizId = (await response.json()).id;
  const card = manager.getByTestId('quiz-Fire safety');
  await card.getByText('3 questions').waitFor();
  await card.getByText('Not sent').waitFor();
});

await step('“Send it” opens Required reading with the quiz chosen, for everyone', async () => {
  await manager.getByTestId('quiz-Fire safety').getByRole('link', { name: 'Send it' }).click();
  const form = manager.getByRole('form', { name: 'Ask people to read or do something' });
  await form.waitFor();
  if (!(await form.getByLabel('A quiz - passing it confirms it').isChecked())) throw new Error('not a quiz');
  if ((await form.getByLabel('Which quiz?').inputValue()) !== quizId) throw new Error('the quiz was not chosen');
  if ((await form.getByLabel('Title').inputValue()) !== 'Fire safety') throw new Error('the title was not the quiz’s');
  const saved = manager.waitForResponse((r) => r.url().endsWith('/api/requirements') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Ask them' }).click();
  const response = await saved;
  if (response.status() !== 201) throw new Error(`sending answered ${response.status()}`);
  requirementId = (await response.json()).id;
  const card = manager.getByTestId('asked-Fire safety');
  await card.getByText('Quiz', { exact: true }).waitFor();
  await card.getByText(/^0 of \d+$/).waitFor();
  await card.getByText('passed', { exact: false }).first().waitFor();
});

await step('the MA is told, and cannot just press a button to confirm it', async () => {
  const bell = await call(ma, '/notifications');
  if (!bell.body.items.some((n) => n.kind === 'REQUIRED' && n.title === 'Please take the quiz: “Fire safety”')) {
    throw new Error('no bell notice');
  }
  const confirmed = await call(ma, `/requirements/${requirementId}/done`, { method: 'POST' });
  if (confirmed.status !== 400) throw new Error(`confirming without passing got ${confirmed.status}`);
});

await step('the MA takes it from Home, gets one wrong, sees why, then passes on a second go', async () => {
  await ma.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const item = ma.getByTestId('home-required').getByTestId('required-Fire safety');
  await item.getByText('Quiz', { exact: true }).waitFor();
  await item.getByRole('link', { name: 'Take the quiz' }).click();
  await ma.getByRole('heading', { name: 'Fire safety' }).waitFor();
  await ma.getByTestId('quiz-status').getByText('2 questions').waitFor();
  if (await ma.getByText(QUESTIONS[2].prompt).count()) throw new Error('the MA was asked the front desk question');
  const send = ma.getByRole('button', { name: 'Send my answers' });
  if (await send.isEnabled()) throw new Error('could send with nothing answered');
  await answer(ma, 1, QUESTIONS[0].right);
  await answer(ma, 2, QUESTIONS[1].wrong[0]);
  await ma.getByTestId('quiz-answered').getByText('2 of 2 answered').waitFor();
  await send.click();
  const result = ma.getByTestId('quiz-result');
  await result.getByText('Not yet').waitFor();
  await result.getByText('1 of 2 right (50%).').waitFor();
  await ma.getByTestId('quiz-question-2').getByText('✓ Right answer').waitFor();
  await ma.getByTestId('quiz-question-2').getByText(`Because: ${QUESTIONS[1].right}.`).waitFor();
  await ma.screenshot({ path: `${OUT}/quiz-not-yet.png`, fullPage: true });

  await result.getByRole('button', { name: 'Take it again' }).click();
  await answer(ma, 1, QUESTIONS[0].right);
  await answer(ma, 2, QUESTIONS[1].right);
  await ma.getByRole('button', { name: 'Send my answers' }).click();
  await ma.getByTestId('quiz-result').getByText('You passed!').waitFor();
  await ma.getByTestId('quiz-result').getByText('It is marked done in Required reading.').waitFor();
  await ma.getByTestId('quiz-status').getByText(/You passed/).waitFor();
  await ma.screenshot({ path: `${OUT}/quiz-passed.png`, fullPage: true });

  await ma.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await ma.getByTestId('home-news').waitFor();
  if (await ma.getByTestId('home-required').getByTestId('required-Fire safety').count()) {
    throw new Error('still waiting on Home after passing');
  }
});

await step('the front desk, also holding the role, is asked all three', async () => {
  const take = await call(desk, `/quizzes/${quizId}/take`);
  if (take.body.questions.length !== 3) throw new Error(`front desk had ${take.body.questions.length}`);
  if (take.body.questions.some((q) => 'correct' in q)) throw new Error('the right answers were sent');
  if (!take.body.asked) throw new Error('not shown as asked');
  const short = await call(desk, `/quizzes/${quizId}/answers`, {
    method: 'POST',
    body: JSON.stringify({ answers: { [take.body.questions[0].id]: 0 } }),
  });
  if (short.status !== 400) throw new Error(`an unfinished go got ${short.status}`);
});

await step('the manager sees the scores by name, who has not started and what was missed', async () => {
  await manager.goto(`${BASE}/required`, { waitUntil: 'networkidle' });
  await manager.getByTestId('asked-Fire safety').getByText(/^1 of \d+$/).waitFor();
  await manager.getByTestId('asked-Fire safety').getByRole('link', { name: 'Scores for “Fire safety” →' }).click();
  await manager.getByRole('heading', { name: 'Scores: Fire safety' }).waitFor();
  // Only the MA has taken it.
  const row = manager.getByTestId('quiz-scores').locator('li').first();
  if ((await manager.getByTestId('quiz-scores').locator('li').count()) !== 1) throw new Error('more than one score');
  await row.getByText(/Passed/).waitFor();
  await row.getByText(/Best 100% · last 100% · 2 goes/).waitFor();
  await manager.getByTestId('quiz-missed').getByText(QUESTIONS[1].prompt).waitFor();
  if ((await manager.getByTestId('quiz-not-started').locator('li').count()) < 1) throw new Error('nobody not started');
  await manager.screenshot({ path: `${OUT}/quiz-scores.png`, fullPage: true });
});

await step('a quiz that has been sent cannot be removed; changing it keeps what was missed', async () => {
  const gone = await call(manager, `/quizzes/${quizId}`, { method: 'DELETE' });
  if (gone.status !== 400) throw new Error(`removing a sent quiz got ${gone.status}`);
  const full = await call(manager, `/quizzes/${quizId}`);
  const body = {
    title: full.body.title,
    passPercent: 80,
    questions: full.body.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices,
      correct: q.correct,
      jobRoleIds: q.jobRoleIds,
      forManagers: q.forManagers,
    })),
  };
  const changed = await call(manager, `/quizzes/${quizId}`, { method: 'PUT', body: JSON.stringify(body) });
  if (changed.status !== 200) throw new Error(`changing answered ${changed.status}`);
  const results = await call(manager, `/quizzes/${quizId}/results`);
  if (!results.body.missed.some((row) => row.prompt === QUESTIONS[1].prompt && row.missed === 1)) {
    throw new Error('what was missed was lost');
  }
  await manager.goto(`${BASE}/quizzes`, { waitUntil: 'networkidle' });
  if (await manager.getByTestId('quiz-Fire safety').getByRole('button', { name: 'Remove' }).count()) {
    throw new Error('Remove offered on a sent quiz');
  }
});

await browser.close();
if (errors.length) {
  console.log(`\nPROBLEMS (${errors.length}):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('\nALL QUIZ CHECKS PASSED');
