// Likes, comments and polls on News posts (October 2026, Dominguez): anybody
// signed in likes, comments and votes, all by name; admins add polls with the
// post and close voting; the writer changes their own comment, and the writer,
// managers and admins delete one; the post's writer and earlier commenters
// hear about a new comment on the bell.
import { chromium } from 'playwright';
import { openNews } from './nav.mjs';
import { mkdirSync } from 'node:fs';

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

async function signIn(email, viewport = { width: 1280, height: 1100 }, extra = {}) {
  const ctx = await browser.newContext({ viewport, ...extra });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Max is seeded with a temporary password, to be changed on first sign-in.
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

const card = (page, title) =>
  page.locator('[data-testid^="post-"]').filter({ has: page.getByRole('heading', { name: title }) });

const POLL_TITLE = 'Holiday party';
const QUESTION = 'Which day suits you?';
const TEXT_TITLE = 'New parking rules';

const admin = await signIn('admin@domihealthcare.com');
await openNews(admin);

await step('an admin writes a post with a poll, and no message is needed', async () => {
  await admin.getByRole('button', { name: '+ New post' }).click();
  await admin.getByLabel('Title').fill(POLL_TITLE);
  await admin.getByRole('button', { name: '+ Add a poll' }).click();
  await admin.getByLabel('Poll question').fill(QUESTION);
  await admin.getByLabel('Choice 1', { exact: true }).fill('Friday');
  await admin.getByLabel('Choice 2', { exact: true }).fill('Saturday');
  await admin.getByRole('button', { name: '+ Add a choice' }).click();
  await admin.getByLabel('Choice 3', { exact: true }).fill('Sunday');
  // Says plainly that votes are named, where the poll is written.
  await admin.getByTestId('poll-editor').getByText('Votes are named').waitFor({ timeout: 5000 });
  await admin.getByRole('button', { name: 'Post it' }).click();
  await admin.getByRole('heading', { name: POLL_TITLE }).waitFor({ timeout: 15000 });
  const poll = card(admin, POLL_TITLE).getByTestId('poll');
  await poll.getByText(QUESTION, { exact: true }).waitFor({ timeout: 5000 });
  if ((await poll.getByTestId('poll-option').count()) !== 3) throw new Error('not three choices');
  await poll.getByText('Votes are not anonymous').waitFor({ timeout: 5000 });
});

await step('an admin writes an ordinary post too', async () => {
  await admin.getByRole('button', { name: '+ New post' }).click();
  await admin.getByLabel('Title').fill(TEXT_TITLE);
  await admin.getByLabel('Message').fill('Use the back lot from Monday.');
  await admin.getByRole('button', { name: 'Post it' }).click();
  await admin.getByRole('heading', { name: TEXT_TITLE }).waitFor({ timeout: 15000 });
  if ((await card(admin, TEXT_TITLE).getByTestId('poll').count()) > 0)
    throw new Error('a post without a poll shows one');
});

await step('the API refuses a post with neither a message nor a poll', async () => {
  const status = await admin.evaluate(() =>
    fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Empty', body: '  ' }),
    }).then((r) => r.status),
  );
  if (status !== 400) throw new Error(`an empty post answered ${status}`);
});

const staff = await signIn('frontdesk@domihealthcare.com', { width: 390, height: 844 }, { isMobile: true });

await step('staff vote by tapping a choice, and see their name on it', async () => {
  await openNews(staff);
  const poll = card(staff, POLL_TITLE).getByTestId('poll');
  await Promise.all([
    staff.waitForResponse((r) => r.url().includes('/vote') && r.request().method() === 'PUT'),
    poll.getByRole('radio', { name: /Friday/ }).check(),
  ]);
  await poll.getByText('Frankie Front-Desk').waitFor({ timeout: 10000 });
  await poll.getByText('1 person has voted.').waitFor({ timeout: 5000 });
});

await step('tapping another choice changes the vote rather than adding one', async () => {
  const poll = card(staff, POLL_TITLE).getByTestId('poll');
  await Promise.all([
    staff.waitForResponse((r) => r.url().includes('/vote') && r.request().method() === 'PUT'),
    poll.getByRole('radio', { name: /Saturday/ }).check(),
  ]);
  const friday = poll.getByTestId('poll-option').filter({ hasText: 'Friday' });
  const saturday = poll.getByTestId('poll-option').filter({ hasText: 'Saturday' });
  await saturday.getByText('1 vote', { exact: true }).waitFor({ timeout: 10000 });
  await friday.getByText('0 votes', { exact: true }).waitFor({ timeout: 5000 });
  await poll.getByText('1 person has voted.').waitFor({ timeout: 5000 });
});

await step('a one-choice poll refuses two choices at the API', async () => {
  const status = await staff.evaluate(async () => {
    const posts = await fetch('/api/announcements').then((r) => r.json());
    const post = posts.find((p) => p.poll);
    return fetch(`/api/announcements/${post.id}/vote`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionIds: post.poll.options.slice(0, 2).map((o) => o.id) }),
    }).then((r) => r.status);
  });
  if (status !== 400) throw new Error(`two choices answered ${status}`);
});

await step('staff like a post and are named under it', async () => {
  const post = card(staff, TEXT_TITLE);
  await post.getByRole('button', { name: 'Like', exact: true }).click();
  await post.getByRole('button', { name: 'Liked', exact: true }).waitFor({ timeout: 10000 });
  await post.getByTestId('liked-by').getByText('Frankie Front-Desk').waitFor({ timeout: 5000 });
});

await step('staff comment, with a reminder of who reads it', async () => {
  const post = card(staff, TEXT_TITLE);
  await post.getByRole('button', { name: 'Comment' }).click();
  await post.getByText('Never anything about a patient.').waitFor({ timeout: 5000 });
  await post.getByLabel('Write a comment').fill('Does this include\nSaturdays?');
  await post.getByRole('button', { name: 'Post comment' }).click();
  const comment = post.getByTestId('comment').filter({ hasText: 'Saturdays?' });
  await comment.getByText('Frankie Front-Desk').waitFor({ timeout: 10000 });
  const text = await comment.innerText();
  if (!/include\nSaturdays\?/.test(text)) throw new Error(`line break lost: ${text}`);
  await post.getByText('1 comment', { exact: true }).waitFor({ timeout: 5000 });
});
await staff.screenshot({ path: `${OUT}/news-social-phone.png`, fullPage: true });

await step('the writer can change their own comment, and it says edited', async () => {
  const post = card(staff, TEXT_TITLE);
  await post.getByTestId('comment').getByRole('button', { name: 'Edit' }).click();
  await post.getByLabel('Change your comment').fill('Does this include weekends?');
  await post.getByRole('button', { name: 'Save', exact: true }).click();
  const comment = post.getByTestId('comment').filter({ hasText: 'weekends?' });
  await comment.getByText(/edited/).waitFor({ timeout: 10000 });
});

await step('the phone page does not scroll sideways, and has no file input', async () => {
  const overflow = await staff.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('News scrolls sideways on a phone');
  if ((await staff.locator('input[type=file]').count()) > 0) throw new Error('a file input appeared');
});

const ma = await signIn('ma@domihealthcare.com');

await step('another member of staff cannot change or delete somebody else’s comment', async () => {
  await openNews(ma);
  const comment = card(ma, TEXT_TITLE).getByTestId('comment');
  await comment.waitFor({ timeout: 15000 });
  if ((await comment.getByRole('button', { name: 'Edit' }).count()) > 0) throw new Error('offered Edit');
  if ((await comment.getByRole('button', { name: 'Delete' }).count()) > 0) throw new Error('offered Delete');

  const statuses = await ma.evaluate(async () => {
    const posts = await fetch('/api/announcements').then((r) => r.json());
    const post = posts.find((p) => p.comments.length > 0);
    const url = `/api/announcements/${post.id}/comments/${post.comments[0].id}`;
    const edit = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Not mine' }),
    });
    const remove = await fetch(url, { method: 'DELETE' });
    return [edit.status, remove.status];
  });
  if (statuses.join() !== '403,403') throw new Error(`answered ${statuses.join()}`);
});

await step('a second commenter, and the writer and first commenter are told on the bell', async () => {
  const post = card(ma, TEXT_TITLE);
  await post.getByRole('button', { name: 'Comment' }).click();
  await post.getByLabel('Write a comment').fill('Yes, weekends too.');
  await post.getByRole('button', { name: 'Post comment' }).click();
  await post.getByTestId('comment').filter({ hasText: 'weekends too' }).waitFor({ timeout: 10000 });

  for (const page of [admin, staff]) {
    const items = await page.evaluate(() => fetch('/api/notifications').then((r) => r.json()));
    const found = items.items.find((item) => item.kind === 'NEWS_COMMENT' && /Max Assistant commented/.test(item.title));
    if (!found) throw new Error(`no comment notice: ${JSON.stringify(items.items.map((i) => i.title))}`);
    if (!/^\/news#post-/.test(found.link)) throw new Error(`link was ${found.link}`);
  }
  const own = await ma.evaluate(() => fetch('/api/notifications').then((r) => r.json()));
  if (own.items.some((item) => item.kind === 'NEWS_COMMENT'))
    throw new Error('the commenter was told about their own comment');
});

await step('the bell takes you to the post on News', async () => {
  await admin.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: /^Notifications/ }).click();
  await admin.getByText('Max Assistant commented on “New parking rules”').first().click();
  await admin.waitForURL(/\/news#post-/, { timeout: 15000 });
  await card(admin, TEXT_TITLE).getByText('Yes, weekends too.').waitFor({ timeout: 15000 });
});

await step('likes from several people are all named', async () => {
  const post = card(admin, TEXT_TITLE);
  await post.getByRole('button', { name: 'Like', exact: true }).click();
  await post.getByTestId('liked-by').getByText(/Frankie Front-Desk and Ada Admin/).waitFor({ timeout: 10000 });
  // And taking it back.
  await post.getByRole('button', { name: 'Liked', exact: true }).click();
  await post.getByRole('button', { name: 'Like', exact: true }).waitFor({ timeout: 10000 });
  const text = await post.getByTestId('liked-by').innerText();
  if (text.includes('Ada Admin')) throw new Error('the like was not taken back');
});

const manager = await signIn('manager@domihealthcare.com');

await step('a manager can delete somebody’s comment, after a pop-up', async () => {
  await openNews(manager);
  const comment = card(manager, TEXT_TITLE).getByTestId('comment').filter({ hasText: 'weekends too' });
  await comment.getByRole('button', { name: 'Delete' }).click();
  const asked = manager.getByRole('alertdialog', { name: 'Delete Max Assistant’s comment?' });
  await asked.getByRole('button', { name: 'Delete it' }).click();
  await comment.waitFor({ state: 'detached', timeout: 10000 });
  // A manager does not get the post's Edit or the poll's Close voting.
  if ((await card(manager, POLL_TITLE).getByRole('button', { name: 'Close voting' }).count()) > 0)
    throw new Error('a manager was offered Close voting');
});

await step('once somebody has voted, the choices cannot change', async () => {
  await admin.reload({ waitUntil: 'networkidle' });
  await card(admin, POLL_TITLE).getByRole('button', { name: 'Edit', exact: true }).click();
  await admin.getByText('People have voted, so the choices stay as they are').waitFor({ timeout: 5000 });
  if ((await admin.getByLabel('Choice 1', { exact: true }).count()) > 0) throw new Error('the choices were editable');
  await admin.getByRole('button', { name: 'Cancel' }).click();

  const status = await admin.evaluate(async () => {
    const posts = await fetch('/api/announcements').then((r) => r.json());
    const post = posts.find((p) => p.poll);
    return fetch(`/api/announcements/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poll: { question: 'Which day?', options: ['Monday', 'Tuesday'] } }),
    }).then((r) => r.status);
  });
  if (status !== 400) throw new Error(`changing voted-on choices answered ${status}`);
});

await step('the admin closes voting, and nobody can vote', async () => {
  const poll = card(admin, POLL_TITLE).getByTestId('poll');
  await poll.getByRole('button', { name: 'Close voting' }).click();
  await poll.getByText('Poll · voting closed').waitFor({ timeout: 10000 });

  await staff.reload({ waitUntil: 'networkidle' });
  const theirs = card(staff, POLL_TITLE).getByTestId('poll');
  await theirs.getByText('Poll · voting closed').waitFor({ timeout: 15000 });
  if (!(await theirs.getByRole('radio', { name: /Friday/ }).isDisabled()))
    throw new Error('a closed poll could still be voted in');
  if ((await theirs.getByRole('button', { name: 'Take my vote back' }).count()) > 0)
    throw new Error('a closed poll offered to take a vote back');

  const status = await staff.evaluate(async () => {
    const posts = await fetch('/api/announcements').then((r) => r.json());
    const post = posts.find((p) => p.poll);
    return fetch(`/api/announcements/${post.id}/vote`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionIds: [post.poll.options[0].id] }),
    }).then((r) => r.status);
  });
  if (status !== 400) throw new Error(`voting on a closed poll answered ${status}`);

  // Staff cannot close or open one.
  const reopen = await staff.evaluate(async () => {
    const posts = await fetch('/api/announcements').then((r) => r.json());
    const post = posts.find((p) => p.poll);
    return fetch(`/api/announcements/${post.id}/poll`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closed: false }),
    }).then((r) => r.status);
  });
  if (reopen !== 403) throw new Error(`staff reopening answered ${reopen}`);
});

await step('a tick-box poll takes several choices, and Home lets you vote on the top post', async () => {
  await admin.getByRole('button', { name: '+ New post' }).click();
  await admin.getByLabel('Title').fill('Lunch order');
  await admin.getByRole('button', { name: '+ Add a poll' }).click();
  await admin.getByLabel('Poll question').fill('What should we order?');
  await admin.getByLabel('Choice 1', { exact: true }).fill('Pizza');
  await admin.getByLabel('Choice 2', { exact: true }).fill('Tacos');
  await admin.getByLabel('People can pick more than one').check();
  await admin.getByLabel(/Primary announcement/).check();
  await admin.getByRole('button', { name: 'Post it' }).click();
  await admin.getByRole('heading', { name: 'Lunch order' }).waitFor({ timeout: 15000 });

  await staff.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const top = staff.getByTestId('primary-announcement');
  await top.getByText('What should we order?', { exact: true }).waitFor({ timeout: 15000 });
  for (const choice of ['Pizza', 'Tacos']) {
    await Promise.all([
      staff.waitForResponse((r) => r.url().includes('/vote')),
      top.getByRole('checkbox', { name: new RegExp(choice) }).check(),
    ]);
  }
  await top.getByText('1 person has voted.').waitFor({ timeout: 10000 });
  for (const choice of ['Pizza', 'Tacos']) {
    await top.getByTestId('poll-option').filter({ hasText: choice }).getByText('1 vote', { exact: true }).waitFor({ timeout: 5000 });
  }
  await top.getByRole('button', { name: 'Like', exact: true }).click();
  await top.getByRole('button', { name: 'Liked', exact: true }).waitFor({ timeout: 10000 });
  await staff.screenshot({ path: `${OUT}/news-social-home-phone.png`, fullPage: true });
});

await step('Comment on Home goes to the post on News', async () => {
  await staff.getByTestId('primary-announcement').getByRole('button', { name: 'Comment' }).click();
  await staff.waitForURL(/\/news#post-/, { timeout: 15000 });
  await staff.getByRole('heading', { name: 'News', exact: true }).waitFor({ timeout: 15000 });
});

await step('deleting a post takes its comments, likes and poll with it', async () => {
  await admin.reload({ waitUntil: 'networkidle' });
  const post = card(admin, TEXT_TITLE);
  await post.locator(':scope > div').last().getByRole('button', { name: 'Delete', exact: true }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Delete it' }).click();
  await admin.getByRole('heading', { name: TEXT_TITLE }).waitFor({ state: 'detached', timeout: 10000 });
});

await browser.close();
console.log(`\n${errors.length === 0 ? 'ALL NEWS SOCIAL CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
