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
 * "Ask Domi Staff" (Dominguez, October 2026 — the AI half of making the app
 * smarter). It needs an Anthropic API key, which neither CI nor a test
 * deployment has, so these checks are about it being properly off: nothing
 * offered, nothing sent, and the screen pointing to where the answers are.
 * The question loop and what each person may look up are unit-tested
 * (`apps/api/src/assistant/*.spec.ts`).
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

const frankie = await signIn('frontdesk@domihealthcare.com');

await step('with no API key the server says it is off, and never the key', async () => {
  const config = await frankie.evaluate(() => fetch('/api/config').then((r) => r.json()));
  if (config.assistant !== false) throw new Error(`config said ${JSON.stringify(config.assistant)}`);
  const status = await frankie.evaluate(async () => {
    const r = await fetch('/api/assistant/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'When am I next on?' }),
    });
    return r.status;
  });
  if (status !== 503) throw new Error(`asking answered ${status}`);
});

await step('Home does not offer it', async () => {
  const quick = frankie.getByTestId('quick-actions');
  await quick.waitFor({ timeout: 10000 });
  await frankie.waitForTimeout(500);
  if (await quick.getByRole('link', { name: 'Ask Domi Staff' }).count())
    throw new Error('offered while switched off');
});

await step('the screen says it is not switched on, and where the answers are', async () => {
  await frankie.goto(`${BASE}/ask`, { waitUntil: 'networkidle' });
  await frankie.getByRole('heading', { name: 'Ask Domi Staff' }).waitFor({ timeout: 10000 });
  await frankie.getByText('Ask Domi Staff is not switched on yet.').waitFor({ timeout: 5000 });
  if (await frankie.getByLabel('Your question').count()) throw new Error('a question box while off');
});

await step('switched on (answers stood in for in the browser), it asks and shows the conversation', async () => {
  const ctx = frankie.context();
  await ctx.route('**/api/config', async (route) => {
    const real = await route.fetch();
    await route.fulfill({ response: real, json: { ...(await real.json()), assistant: true } });
  });
  const sent = [];
  await ctx.route('**/api/assistant/ask', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: { answer: 'You are on Tuesday, 9:00 AM–5:00 PM at North Bergen.', left: 39 } });
  });
  await frankie.goto(`${BASE}/ask`, { waitUntil: 'networkidle' });
  await frankie.getByRole('button', { name: 'When am I next on?' }).click();
  await frankie.getByTestId('ask-answer').getByText('You are on Tuesday, 9:00 AM–5:00 PM at North Bergen.').waitFor({ timeout: 10000 });
  await frankie.getByText('39 uses of the AI helpers left today.').waitFor({ timeout: 5000 });
  await frankie.getByLabel('Your question').fill('And the week after?');
  await frankie.getByRole('button', { name: 'Ask', exact: true }).click();
  await frankie.getByTestId('ask-answer').nth(1).waitFor({ timeout: 10000 });
  if (sent.length !== 2 || sent[1].history.length !== 2 || sent[1].question !== 'And the week after?')
    throw new Error(`sent: ${JSON.stringify(sent)}`);
  // A "how do I…?" question goes with the Help topics likely to answer it.
  await frankie.getByLabel('Your question').fill('How do I put Domi Staff on my phone?');
  await frankie.getByRole('button', { name: 'Ask', exact: true }).click();
  await frankie.getByTestId('ask-answer').nth(2).waitFor({ timeout: 10000 });
  const help = sent[2].help ?? [];
  if (!help.some((topic) => topic.question === 'Put Domi Staff on your phone'))
    throw new Error(`Help topics sent: ${help.map((topic) => topic.question).join(' | ')}`);
  if (!help.find((topic) => topic.question === 'Put Domi Staff on your phone').answer.includes('Add to Home Screen'))
    throw new Error('the topic was sent without its words');
  if (help.length > 4) throw new Error(`${help.length} topics sent`);
  const privacy = await frankie.getByTestId('ask-privacy').innerText();
  if (!/Anthropic/.test(privacy) || !/Never type patient details/.test(privacy))
    throw new Error(`privacy note: ${privacy}`);
  await frankie.screenshot({ path: `${OUT}/ask.png` });
  await frankie.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await frankie.getByTestId('quick-actions').getByRole('link', { name: 'Ask Domi Staff' }).waitFor({ timeout: 10000 });
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });
});

await step('nobody signed out can ask', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const status = await page.evaluate(async () => {
    const r = await fetch('/api/assistant/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Who works here?' }),
    });
    return r.status;
  });
  if (status !== 401) throw new Error(`signed out answered ${status}`);
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL ASK CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
