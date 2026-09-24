import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

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

async function openSurveys(page) {
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Surveys', exact: true }).click();
  await page.getByRole('heading', { name: 'Surveys and feedback' }).waitFor({ timeout: 15000 });
}

const json = (page, path, init = {}) =>
  page.evaluate(
    async ([path, init]) => {
      const response = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    [path, init],
  );

async function newPage(email, phone = false) {
  const ctx = await browser.newContext(
    phone ? { viewport: { width: 390, height: 844 }, isMobile: true } : { viewport: { width: 1280, height: 1100 } },
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await signIn(page, email);
  return page;
}

const mgr = await newPage('manager@domihealthcare.com');
const frankie = await newPage('frontdesk@domihealthcare.com', true);
const ada = await newPage('admin@domihealthcare.com');

async function buildSurvey(title) {
  await mgr.getByRole('button', { name: '+ New survey' }).click();
  await mgr.getByLabel('Title', { exact: true }).fill(title);
  await mgr.getByLabel('Question 1', { exact: true }).fill('How supported did you feel this month?');
  await mgr.getByRole('button', { name: '+ Add a question' }).click();
  await mgr.getByLabel('Question 2 kind').selectOption({ label: 'Pick one' });
  await mgr.getByLabel('Question 2', { exact: true }).fill('Which shift suits you best?');
  await mgr.getByLabel('Question 2 choices').fill('Mornings\nAfternoons');
  await mgr.getByRole('button', { name: '+ Add a question' }).click();
  await mgr.getByLabel('Question 3', { exact: true }).fill('Anything else?');
  await mgr.getByRole('button', { name: 'Save as draft' }).click();
  await mgr.getByTestId(`survey-${title}`).waitFor({ timeout: 10000 });
}

await step('a manager drafts a survey, and staff cannot see a draft', async () => {
  await openSurveys(mgr);
  await buildSurvey('September pulse');
  await mgr.getByTestId('survey-September pulse').getByText('Draft').waitFor({ timeout: 5000 });

  await openSurveys(frankie);
  await frankie.getByText('No surveys open right now.').waitFor({ timeout: 10000 });
});

await step('sending it puts it in front of staff, with the anonymity promise', async () => {
  await mgr.getByTestId('survey-September pulse').getByRole('button', { name: 'Send it' }).click();
  await mgr.getByTestId('survey-September pulse').getByText('Open').waitFor({ timeout: 10000 });

  await frankie.reload({ waitUntil: 'networkidle' });
  const form = frankie.getByTestId('answer-September pulse');
  await form.waitFor({ timeout: 15000 });
  await form.getByText(/your name is never stored with what you say/).waitFor({ timeout: 5000 });
});

await step('staff answer on a phone', async () => {
  const form = frankie.getByTestId('answer-September pulse');
  await form.getByRole('button', { name: '4', exact: true }).click();
  await form.getByLabel('Afternoons').check();
  await form.getByLabel('Anything else?').fill('More water in the break room.');
  await form.getByRole('button', { name: 'Send anonymously' }).click();
  await frankie.getByText('Thank you — sent anonymously.').waitFor({ timeout: 10000 });
  const overflow = await frankie.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('the surveys screen scrolls sideways on a phone');
});
await frankie.screenshot({ path: `${OUT}/97-surveys-phone.png`, fullPage: true });

let surveyId = '';
await step('nobody can answer twice', async () => {
  surveyId = (await json(mgr, '/surveys')).body.find((s) => s.title === 'September pulse').id;
  const again = await json(frankie, `/surveys/${surveyId}/responses`, {
    method: 'POST',
    body: JSON.stringify({ answers: [{ questionId: 'x', rating: 1 }] }),
  });
  // Refused either way: the answer is invalid, and Frankie has answered.
  const survey = (await json(frankie, `/surveys/${surveyId}`)).body;
  const q = survey.questions[0].id;
  const second = await json(frankie, `/surveys/${surveyId}/responses`, {
    method: 'POST',
    body: JSON.stringify({ answers: [{ questionId: q, rating: 1 }] }),
  });
  if (again.status < 400 || second.status !== 409) throw new Error(`answered twice: ${second.status}`);
});

await step('a manager sees how many answered, but not who, and no results while it is open', async () => {
  await mgr.reload({ waitUntil: 'networkidle' });
  await mgr.getByTestId('survey-September pulse').getByText(/1 of \d+ answered/).waitFor({ timeout: 10000 });
  if ((await mgr.getByTestId('survey-September pulse').getByRole('button', { name: 'Results' }).count()) > 0)
    throw new Error('results were offered while open');

  const results = (await json(mgr, `/surveys/${surveyId}/results`)).body;
  if (results.available !== false) throw new Error('the API gave results for an open survey');

  const everything = JSON.stringify((await json(mgr, '/surveys')).body);
  if (/Frankie|frontdesk|emp-|participants/.test(everything)) throw new Error('the survey list names who answered');
});

await step('closed with one answer, results stay hidden', async () => {
  await mgr.getByTestId('survey-September pulse').getByRole('button', { name: 'Close it' }).click();
  await mgr.getByTestId('survey-September pulse').getByText('Closed').waitFor({ timeout: 10000 });
  await mgr.getByTestId('survey-September pulse').getByRole('button', { name: 'Results' }).click();
  await mgr.getByText(/Only 1 answered. With fewer than 3/).waitFor({ timeout: 10000 });
  if ((await mgr.getByText('More water in the break room.').count()) > 0) throw new Error('the lone answer showed');
});

await step('with three answers and closed, the results show', async () => {
  await buildSurvey('October pulse');
  await mgr.getByTestId('survey-October pulse').getByRole('button', { name: 'Send it' }).click();
  await mgr.getByTestId('survey-October pulse').getByText('Open').waitFor({ timeout: 10000 });
  const id = (await json(mgr, '/surveys')).body.find((s) => s.title === 'October pulse').id;
  const [rate, pick, text] = (await json(mgr, `/surveys/${id}`)).body.questions.map((q) => q.id);

  const answer = (page, rating, choice, words) =>
    json(page, `/surveys/${id}/responses`, {
      method: 'POST',
      body: JSON.stringify({
        answers: [
          { questionId: rate, rating },
          { questionId: pick, choice },
          ...(words ? [{ questionId: text, text: words }] : []),
        ],
      }),
    });
  for (const [page, rating, choice, words] of [
    [frankie, 5, 'Mornings', 'Great month.'],
    [mgr, 4, 'Mornings', null],
    [ada, 3, 'Afternoons', 'Parking is hard.'],
  ]) {
    const result = await answer(page, rating, choice, words);
    if (result.status !== 201) throw new Error(`answer refused: ${JSON.stringify(result.body)}`);
  }

  await mgr.reload({ waitUntil: 'networkidle' });
  const card = mgr.getByTestId('survey-October pulse');
  await card.getByRole('button', { name: 'Close it' }).click();
  await card.getByText('Closed').waitFor({ timeout: 10000 });
  await card.getByRole('button', { name: 'Results' }).click();
  const results = card.getByTestId('survey-results');
  await results.waitFor({ timeout: 10000 });
  await results.getByText('3 people answered.').waitFor({ timeout: 5000 });
  await results.getByText('Average').waitFor({ timeout: 5000 });
  await results.getByText('4', { exact: true }).first().waitFor({ timeout: 5000 });
  await results.getByText('Parking is hard.').waitFor({ timeout: 5000 });
  await results.getByText('Great month.').waitFor({ timeout: 5000 });
});
await mgr.screenshot({ path: `${OUT}/98-survey-results.png`, fullPage: true });

await step('an open survey cannot be deleted; a closed one can', async () => {
  await buildSurvey('Short-lived');
  const card = mgr.getByTestId('survey-Short-lived');
  await card.getByRole('button', { name: 'Send it' }).click();
  await card.getByText('Open').waitFor({ timeout: 10000 });
  if ((await card.getByRole('button', { name: 'Delete' }).count()) > 0) throw new Error('an open survey offered Delete');
  const id = (await json(mgr, '/surveys')).body.find((s) => s.title === 'Short-lived').id;
  const answer = await json(mgr, `/surveys/${id}`, { method: 'DELETE' });
  if (answer.status !== 400) throw new Error(`deleting an open survey answered ${answer.status}`);
  await card.getByRole('button', { name: 'Close it' }).click();
  await card.getByRole('button', { name: 'Delete' }).click();
  await mgr.getByRole('alertdialog', { name: 'Delete “Short-lived”?' }).getByRole('button', { name: 'Delete it' }).click();
  await card.waitFor({ state: 'detached', timeout: 10000 });
});

await step('a survey for a job role with fewer than three people says results will never show', async () => {
  await mgr.getByRole('button', { name: '+ New survey' }).click();
  await mgr.getByLabel('Who it is for').selectOption({ label: 'One job role' });
  await mgr.getByLabel('Job role', { exact: true }).selectOption({ label: 'Front Desk (1)' });
  await mgr.getByText('Fewer than 3 people are in that role, so no results would ever be shown.').waitFor({ timeout: 5000 });
  await mgr.getByRole('button', { name: 'Cancel' }).click();
});

await step('the suggestion box keeps the message and the day, nothing else', async () => {
  await frankie.reload({ waitUntil: 'networkidle' });
  await frankie.getByLabel('Your suggestion').fill('Could we have a second printer at West New York?');
  await frankie.getByRole('button', { name: 'Send anonymously' }).click();
  await frankie.getByText('Sent anonymously. Thank you.').waitFor({ timeout: 10000 });

  const inbox = (await json(mgr, '/feedback')).body;
  const message = inbox.find((m) => m.message.startsWith('Could we have a second printer'));
  if (!message) throw new Error('the manager did not receive it');
  if (Object.keys(message).sort().join(',') !== 'archivedAt,id,message,receivedOn')
    throw new Error(`the message carries ${Object.keys(message).join(', ')}`);
  if (!/T00:00:00(\.000)?Z$/.test(message.receivedOn)) throw new Error(`receivedOn has a time: ${message.receivedOn}`);

  const staffRead = await json(frankie, '/feedback');
  if (staffRead.status !== 403) throw new Error(`staff reading the box answered ${staffRead.status}`);
});

await step('a manager reads the box and marks a message dealt with', async () => {
  await mgr.reload({ waitUntil: 'networkidle' });
  const card = mgr.getByTestId('feedback-message').filter({ hasText: 'second printer' });
  await card.waitFor({ timeout: 10000 });
  await card.getByRole('button', { name: 'Mark as dealt with' }).click();
  await card.waitFor({ state: 'detached', timeout: 10000 });
  await mgr.getByRole('button', { name: 'Show dealt with' }).click();
  await mgr.getByTestId('feedback-message').filter({ hasText: 'second printer' }).waitFor({ timeout: 10000 });
});

await step('nothing here takes a file', async () => {
  for (const page of [mgr, frankie]) {
    if ((await page.locator('input[type=file]').count()) > 0) throw new Error('a file input appeared');
  }
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL SURVEY CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
