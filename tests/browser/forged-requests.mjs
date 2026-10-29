// Forged requests (October 2026, a security review). A browser counts every
// *.domihealthcare.com address as the same "site", the practice's Wix website
// included, so a hidden form on a page there would carry a staff member's
// session cookie to the API. The API now refuses a change that did not come
// from the app itself (403) and a body that is not JSON (415). This suite
// checks both, and that the app's own requests still go through. The forged
// requests are sent with the signed-in page's own cookies
// (page.context().request) and the headers a browser would put on them.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(
  // Fall back to whatever Playwright downloaded when CHROMIUM_PATH is unset.
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

const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('frontdesk@domihealthcare.com');
await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByText('Not clocked in').waitFor({ timeout: 10000 });

// The cookie-carrying request context of the signed-in page.
const api = page.context().request;
const WEBSITE = 'https://www.domihealthcare.com';

const readAbout = () =>
  page.evaluate(async () => (await fetch('/api/profile').then((r) => r.json())).about ?? null);
const original = await readAbout();

await step('the app itself still saves a change, sent as JSON', async () => {
  const answer = await page.evaluate(async () => {
    const r = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ about: 'Checking forged requests' }),
    });
    return { status: r.status, body: await r.json() };
  });
  if (answer.status !== 200)
    throw new Error(`answered ${answer.status}: ${JSON.stringify(answer.body)}`);
  if ((await readAbout()) !== 'Checking forged requests')
    throw new Error('the change was not saved');
  // And a change with no body at all, like the bell's "mark all read".
  const bell = await page.evaluate(
    async () =>
      (
        await fetch('/api/notifications/read-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      ).status,
  );
  if (bell >= 400) throw new Error(`mark all read answered ${bell}`);
});

await step('a form on the practice website cannot sign somebody out (403)', async () => {
  const response = await api.post(`${BASE}/api/auth/logout`, {
    headers: { 'Sec-Fetch-Site': 'same-site', Origin: WEBSITE },
    form: { x: '1' },
  });
  if (response.status() !== 403) throw new Error(`answered ${response.status()}`);
  const body = await response.json();
  if (
    body.statusCode !== 403 ||
    body.error !== 'Forbidden' ||
    !/did not come from Domi Staff/.test(body.message)
  ) {
    throw new Error(`unexpected body ${JSON.stringify(body)}`);
  }
});

await step('nor change their profile, even sent as JSON (403)', async () => {
  const response = await api.patch(`${BASE}/api/profile`, {
    headers: { 'Sec-Fetch-Site': 'same-site', Origin: WEBSITE },
    data: { about: 'Forged' },
  });
  if (response.status() !== 403) throw new Error(`answered ${response.status()}`);
  if ((await readAbout()) !== 'Checking forged requests')
    throw new Error('the forged change was saved');
});

await step('an older browser with only Origin is judged by it (403)', async () => {
  const response = await api.patch(`${BASE}/api/profile`, {
    headers: { Origin: WEBSITE },
    data: { about: 'Forged' },
  });
  if (response.status() !== 403) throw new Error(`answered ${response.status()}`);
});

await step('a form-encoded body is refused even from the app itself (415)', async () => {
  const response = await api.post(`${BASE}/api/auth/logout`, {
    headers: { 'Sec-Fetch-Site': 'same-origin', Origin: BASE },
    form: { x: '1' },
  });
  if (response.status() !== 415) throw new Error(`answered ${response.status()}`);
  const body = await response.json();
  if (body.statusCode !== 415 || !/only accepts JSON/.test(body.message)) {
    throw new Error(`unexpected body ${JSON.stringify(body)}`);
  }
});

await step('as is a text/plain body (415)', async () => {
  const response = await api.patch(`${BASE}/api/profile`, {
    headers: { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'text/plain' },
    data: JSON.stringify({ about: 'Forged' }),
  });
  if (response.status() !== 415) throw new Error(`answered ${response.status()}`);
  if ((await readAbout()) !== 'Checking forged requests') throw new Error('the change was saved');
});

await step('reads are never refused, wherever they came from', async () => {
  const response = await api.get(`${BASE}/api/auth/me`, {
    headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://example.com' },
  });
  if (response.status() !== 200) throw new Error(`answered ${response.status()}`);
});

await step('the person is still signed in afterwards', async () => {
  const me = await page.evaluate(async () => (await fetch('/api/auth/me')).status);
  if (me !== 200) throw new Error(`/auth/me answered ${me}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Not clocked in').waitFor({ timeout: 10000 });
});

// Put their profile back as it was.
await page.evaluate(async (about) => {
  await fetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ about: about ?? '' }),
  });
}, original);

await browser.close();
console.log(
  `\n${errors.length === 0 ? 'ALL FORGED REQUEST CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`,
);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
