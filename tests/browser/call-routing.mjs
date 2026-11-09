import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
// The webhook is called on the API itself, the way Twilio does, and what is
// signed is the address Twilio would have called (TWILIO_WEBHOOK_BASE_URL).
const API_ORIGIN = (process.env.API_URL || 'http://127.0.0.1:3000/api').replace(/\/api\/?$/, '');
const SIGNED_BASE = (process.env.TWILIO_WEBHOOK_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'ci-twilio-auth-token-0001';
const LINE = process.env.TWILIO_PHONE_NUMBER || '+12015550199';
const CALLER = '+12015550142';
const VOICE = '/api/call-routing/voice';

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
 * The after-hours phone line (Dominguez, November 2026): Twilio's webhook
 * (signed, called directly on the API), the On call page's Phone line
 * settings (what callers hear) and Recent calls, a provider's own on-call
 * number in Your profile, and the backup on the On call page. Nothing is recorded: no <Record> in any answer.
 *
 * Frankie (front desk) and Max (MA) are made providers part-way through, with
 * the Directory phones the seed gives them; the seed puts their job roles
 * back. What the suite adds (covers, changed words) it takes away again.
 */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('shift-change-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
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
      const text = await r.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: r.status, body };
    },
    { path, init },
  );

// ------------------------------------------------------------- Twilio's side

/// Twilio's signature: base64 of HMAC-SHA1 over the address and every field,
/// sorted by name, each as name then value.
function sign(url, params) {
  let data = url;
  for (const key of Object.keys(params).sort()) data += key + params[key];
  return createHmac('sha1', AUTH_TOKEN).update(data, 'utf8').digest('base64');
}

/// POST a form to `path` (with its query) the way Twilio does.
async function twilio(path, params = {}, { signature, unsigned } = {}) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (!unsigned) headers['X-Twilio-Signature'] = signature ?? sign(SIGNED_BASE + path, params);
  const response = await fetch(API_ORIGIN + path, {
    method: 'POST',
    headers,
    body: new URLSearchParams(params).toString(),
  });
  return {
    status: response.status,
    type: response.headers.get('content-type') || '',
    text: await response.text(),
  };
}

const unescapeXml = (text) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/// The path (with query) a relative address in TwiML points to, from `from`.
const resolve = (relative, from) => {
  const url = new URL(unescapeXml(relative), `http://x${from}`);
  return url.pathname + url.search;
};

const dialOf = (xml) => {
  const dial = xml.match(/<Dial\b[^>]*>/)?.[0];
  if (!dial) return null;
  return {
    tag: dial,
    action: dial.match(/\baction="([^"]+)"/)?.[1],
    callerId: dial.match(/\bcallerId="([^"]+)"/)?.[1],
    number: xml.match(/<Number\b[^>]*>([^<]+)<\/Number>/)?.[1],
    whisper: xml.match(/<Number\b[^>]*\burl="([^"]+)"/)?.[1],
  };
};

const must = (ok, message) => {
  if (!ok) throw new Error(message);
};

const sid = () => `CA${Math.random().toString(16).slice(2).padEnd(30, '0').slice(0, 30)}`;
/// Every answer the webhook gave, to check at the end that nothing records.
const answers = [];
const post = async (path, params, options) => {
  const result = await twilio(path, params, options);
  answers.push(result.text);
  return result;
};

/// Rings the line and picks a language; returns the greeting step's answer
/// and the path it came from.
async function callIn(language) {
  const callSid = sid();
  const base = { CallSid: callSid, From: CALLER, To: LINE };
  const opening = await post(`${VOICE}/incoming`, base);
  must(opening.status === 200, `incoming answered ${opening.status}`);
  const path = `${VOICE}/language?try=1`;
  const chosen = await post(path, { ...base, Digits: String(language) });
  return { callSid, base, chosen, path };
}

// ----------------------------------------------------------------- the dates

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ----------------------------------------------------------------- the people

const admin = await signIn('admin@domihealthcare.com');
const manager = await signIn('manager@domihealthcare.com');
const frankie = await signIn('frontdesk@domihealthcare.com');
const max = await signIn('ma@domihealthcare.com');
let frankieId;
let maxId;
let apiCoverId = null;
let uiCoverId = null;
let originalHold = null;

await step('before being providers, the call log and the line screen are not for Frankie or Max', async () => {
  for (const [name, page] of [['Frankie', frankie], ['Max', max]]) {
    const answer = await call(page, '/call-routing/calls');
    must(answer.status === 403, `${name}: the call log answered ${answer.status}`);
    const routing = await call(page, `/on-call/routing?from=${today}`);
    must(routing.status === 403, `${name}: the routing view answered ${routing.status}`);
  }
  await max.goto(`${BASE}/on-call/routing`, { waitUntil: 'networkidle' });
  await max.getByText('The on-call schedule is for providers and managers.').waitFor();
  await max.goto(`${BASE}/on-call/calls`, { waitUntil: 'networkidle' });
  await max.getByText('The on-call schedule is for providers and managers.').waitFor();
});

await step('set-up: Frankie and Max become providers with phones in the Directory', async () => {
  const provider = (await call(admin, '/job-roles')).body.find((r) => r.name === 'Provider');
  frankieId = (await call(frankie, '/profile')).body.id;
  maxId = (await call(max, '/profile')).body.id;
  for (const id of [frankieId, maxId]) {
    const joined = await call(admin, `/job-roles/${provider.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ employeeId: id }),
    });
    must(joined.status < 300, `joining answered ${joined.status}`);
  }
  // The seed's phones; written again so the suite does not depend on them.
  for (const [id, phone] of [[frankieId, '(201) 555-0103'], [maxId, '(201) 555-0104']]) {
    const saved = await call(admin, `/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ phone }),
    });
    must(saved.status < 300, `saving a phone answered ${saved.status}`);
  }
});

await step('set-up: a cover puts Frankie on call, with Max as the backup', async () => {
  const made = await call(manager, '/on-call/covers', {
    method: 'POST',
    body: JSON.stringify({
      startsAt: `${addDays(today, -1)}T00:00`,
      endsAt: `${addDays(today, 3)}T23:00`,
      employeeId: frankieId,
      backupEmployeeId: maxId,
      note: 'call-routing-suite',
    }),
  });
  must(made.status < 300, `the cover answered ${made.status}: ${JSON.stringify(made.body)}`);
  apiCoverId = made.body.id;
});

// --------------------------------------------------------------- 1. webhook

await step('a request with no signature is refused', async () => {
  const answer = await twilio(`${VOICE}/incoming`, { CallSid: sid(), From: CALLER, To: LINE }, { unsigned: true });
  // The forged-request rule (request-origin.ts) turns away a form post with no
  // signature (415) before the signature guard (403) is reached: either way, refused.
  must(answer.status === 403 || answer.status === 415, `answered ${answer.status}`);
});

await step('a request with a wrong signature is refused', async () => {
  const params = { CallSid: sid(), From: CALLER, To: LINE };
  const answer = await twilio(`${VOICE}/incoming`, params, { signature: sign(SIGNED_BASE + VOICE + '/incoming', { ...params, From: '+12015550000' }) });
  must(answer.status === 403, `answered ${answer.status}`);
  const guessed = await twilio(`${VOICE}/incoming`, params, { signature: 'AAAA' });
  must(guessed.status === 403, `a short signature answered ${guessed.status}`);
});

await step('a signed call gets the language menu in both languages', async () => {
  const answer = await post(`${VOICE}/incoming`, { CallSid: sid(), From: CALLER, To: LINE });
  must(answer.status === 200, `answered ${answer.status}`);
  must(answer.type.includes('text/xml'), `content type ${answer.type}`);
  must(answer.text.includes('<Gather'), 'no Gather');
  must(answer.text.includes('For English, press 1'), 'no English opening');
  must(answer.text.includes('Para espa'), 'no Spanish opening');
});

let spanishCall;
await step('pressing 2 gives the Spanish greeting only, then a Dial that is not recorded', async () => {
  spanishCall = await callIn(2);
  const { chosen } = spanishCall;
  must(chosen.status === 200, `answered ${chosen.status}`);
  must(chosen.text.includes('Ha llamado al proveedor de guardia de Domi Healthcare'), 'no Spanish greeting');
  must(!chosen.text.includes('You have reached'), 'the English greeting is there too');
  const dial = dialOf(chosen.text);
  must(dial, 'no Dial');
  must(dial.tag.includes('record="do-not-record"'), `Dial is ${dial.tag}`);
  must(dial.callerId === LINE, `callerId is ${dial.callerId}`);
  must(dial.number === '+12015550103', `dialled ${dial.number} (Frankie is +12015550103)`);
  must(dial.whisper && dial.whisper.includes('whisper'), 'no whisper url');
  must(dial.whisper.includes('lang=es'), `the whisper is not Spanish: ${dial.whisper}`);
});

await step('no key, once: the menu again; no key twice: the English greeting', async () => {
  const base = { CallSid: sid(), From: CALLER, To: LINE };
  await post(`${VOICE}/incoming`, base);
  const again = await post(`${VOICE}/language?try=1`, base);
  must(again.text.includes('<Gather') && again.text.includes('language?try=2'), 'the menu did not come again as try 2');
  must(again.text.includes('For English, press 1'), 'the menu is not the opening');
  const wrong = await post(`${VOICE}/language?try=1`, { ...base, Digits: '7' });
  must(wrong.text.includes('language?try=2'), 'a wrong key did not bring the menu again');
  const second = await post(`${VOICE}/language?try=2`, base);
  must(second.text.includes('You have reached the Domi Healthcare on-call provider'), 'no English greeting on the second go');
  must(dialOf(second.text), 'no Dial after the second go');
});

await step('nobody answering walks the chain, with hold words, to the closing message', async () => {
  let { callSid, base, chosen, path } = spanishCall;
  // The chain is: Frankie (whisper), Max (whisper), Frankie again with no
  // whisper so it reaches her own voicemail, then the closing words.
  const rung = [dialOf(chosen.text).number];
  let sawHold = false;
  let current = chosen;
  for (let hop = 0; hop < 6; hop += 1) {
    const dial = dialOf(current.text);
    if (!dial) break;
    path = resolve(dial.action, path);
    current = await post(path, { ...base, DialCallStatus: 'no-answer', DialBridged: 'false' });
    must(current.status === 200, `a dial result answered ${current.status}`);
    if (current.text.includes('Por favor, permanezca en la l')) sawHold = true;
    const next = dialOf(current.text);
    if (next) rung.push(next.number);
  }
  must(sawHold, 'no Spanish hold words between tries');
  must(rung.join() === '+12015550103,+12015550104,+12015550103', `rung ${rung.join()}`);
  must(current.text.includes('No pudimos comunicarnos'), 'no Spanish closing words');
  must(current.text.includes('<Hangup/>'), 'no Hangup at the end');
  must(!dialOf(current.text), 'it still dials');
});

await step('the English hold words and closing words are used for an English call', async () => {
  const { base, chosen, path: first } = await callIn(1);
  must(chosen.text.includes('You have reached the Domi Healthcare on-call provider'), 'no English greeting');
  must(!chosen.text.includes('Ha llamado al proveedor'), 'the Spanish greeting is there too');
  const dial = dialOf(chosen.text);
  const next = await post(resolve(dial.action, first), { ...base, DialCallStatus: 'no-answer', DialBridged: 'false' });
  must(next.text.includes('Please continue to hold'), 'no English hold words');
});

await step('the whisper asks the provider to press 1; only 1 connects', async () => {
  const { chosen, path } = await callIn(1);
  const whisperPath = resolve(dialOf(chosen.text).whisper, path);
  const whisper = await post(whisperPath, { CallSid: sid() });
  must(whisper.status === 200, `the whisper answered ${whisper.status}`);
  must(whisper.text.includes('<Gather'), 'no Gather in the whisper');
  must(whisper.text.includes('Press 1 to accept'), 'no "Press 1 to accept"');
  must(whisper.text.includes('English-speaking caller'), 'the whisper does not name the language');
  const answerPath = resolve(whisper.text.match(/<Gather\b[^>]*\baction="([^"]+)"/)[1], whisperPath);
  const yes = await post(answerPath, { CallSid: sid(), ParentCallSid: sid(), Digits: '1' });
  must(/^<\?xml[^>]*\?><Response\/>$/.test(yes.text.trim()), `1 did not give an empty Response: ${yes.text}`);
  const no = await post(answerPath, { CallSid: sid(), ParentCallSid: sid(), Digits: '9' });
  must(no.text.includes('<Hangup/>'), `9 did not hang up: ${no.text}`);
});

await step('2 on the whisper sends the caller to the provider\'s voicemail, skipping the backup', async () => {
  const { callSid, base, chosen, path } = await callIn(1);
  const dial = dialOf(chosen.text);
  const whisperPath = resolve(dial.whisper, path);
  const whisper = await post(whisperPath, { CallSid: sid() });
  must(
    whisper.text.includes('or 2 to send the caller to your voicemail'),
    'the whisper does not offer 2 for voicemail',
  );
  const answerPath = resolve(whisper.text.match(/<Gather\b[^>]*\baction="([^"]+)"/)[1], whisperPath);
  const two = await post(answerPath, { CallSid: sid(), ParentCallSid: callSid, Digits: '2' });
  must(two.text.includes('<Hangup/>'), `2 did not hang up on the provider: ${two.text}`);
  // The dial then ends without being bridged; the next ring is the same
  // provider again (not the backup), with only an announcement.
  const next = await post(resolve(dial.action, path), {
    ...base,
    DialCallStatus: 'completed',
    DialBridged: 'false',
  });
  const again = dialOf(next.text);
  must(again, `no dial after pressing 2: ${next.text}`);
  must(again.number === dial.number, `rang ${again.number}, not the same provider ${dial.number}`);
  must(again.whisper && again.whisper.includes('a=1'), `the last ring has no announcement: ${again.whisper}`);
  const announce = await post(resolve(again.whisper, path), { CallSid: sid() });
  must(announce.text.includes('Domi Healthcare call,'), 'the announcement does not say what the call is');
  must(!announce.text.includes('<Gather') && !announce.text.includes('<Hangup'), 'the announcement asks for a key or hangs up');
});

await step('a call a provider accepts is logged as accepted', async () => {
  const { base, chosen, path } = await callIn(1);
  const dial = dialOf(chosen.text);
  const done = await post(resolve(dial.action, path), { ...base, DialCallStatus: 'completed', DialBridged: 'true' });
  must(done.text.includes('<Hangup/>'), 'a bridged call did not end with Hangup');
  const log = (await call(manager, '/call-routing/calls')).body;
  // The log does not hand out the call's sid, so look for the accepted one.
  const found = log.find((c) => c.outcome === 'ACCEPTED');
  must(found && found.outcome === 'ACCEPTED', 'no accepted call in the log');
});

await step('nothing the webhook said records, listens or takes a voicemail', async () => {
  must(answers.length > 10, `only ${answers.length} answers were collected`);
  for (const xml of answers) {
    must(!/<Record/i.test(xml), `a <Record in: ${xml.slice(0, 120)}`);
    must(!/transcribe|speech/i.test(xml.replace(/Spanish-speaking|English-speaking/g, '')), 'speech or transcription in an answer');
  }
});

// --------------------------------------------------------------- 2. the page

await step('the manager opens Phone line settings at the bottom of the On call page', async () => {
  await manager.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await manager.getByRole('link', { name: 'On call' }).click();
  await manager.getByRole('heading', { name: 'On call', exact: true }).waitFor();
  must((await manager.getByRole('link', { name: 'After-hours calls' }).count()) === 0, 'an After-hours calls link is still there');
  must((await manager.getByRole('link', { name: 'Call log' }).count()) === 0, 'a Call log link is still there');
  must(!(await manager.locator('#phone-line').evaluate((el) => el.open)), 'Phone line settings does not start closed');
  await manager.locator('#phone-line summary').click();
  for (const heading of ['The line', 'What callers hear']) {
    await manager.getByRole('heading', { name: heading, exact: true }).waitFor();
  }
  await manager.getByRole('heading', { name: /^Providers.? phones$/ }).waitFor();
  must((await manager.getByRole('heading', { name: 'Next 60 days' }).count()) === 0, 'the 60-day grid is still there');
  must((await manager.getByRole('heading', { name: 'Covers', exact: true }).count()) === 0, 'the Covers list is still there');
});

await step('the status card says the line is switched on and the fallback is set', async () => {
  const card = manager.getByTestId('routing-status');
  await card.getByText('Switched on', { exact: true }).waitFor();
  await card.getByText('Set', { exact: true }).waitFor();
  await card.getByText('(201) 555-0199').waitFor();
});

await step('Providers phones lists who can be dialled and who cannot', async () => {
  const list = manager.getByTestId('provider-phones');
  for (const name of ['Frankie Front-Desk', 'Max Assistant']) {
    const row = list.locator('div', { hasText: name }).filter({ hasText: 'Can be dialled' }).first();
    await row.waitFor();
  }
  // Take Max's phone away, look, and put it back.
  const cleared = await call(admin, `/employees/${maxId}`, { method: 'PATCH', body: JSON.stringify({ phone: null }) });
  must(cleared.status < 300, `clearing the phone answered ${cleared.status}`);
  try {
    await openPhoneLine(manager);
    const row = manager.getByTestId('provider-phones').locator('div', { hasText: 'Max Assistant' }).filter({ hasText: 'Missing or not a US number' }).first();
    await row.waitFor();
    await manager.getByTestId('routing-status').getByText(/cannot be rung/).waitFor();
  } finally {
    await call(admin, `/employees/${maxId}`, { method: 'PATCH', body: JSON.stringify({ phone: '(201) 555-0104' }) });
  }
});

// --------------------------------------------------------------- 3. covers

await step('a manager adds a part-of-day override from the On call page, and it is listed and marked', async () => {
  await manager.goto(`${BASE}/on-call`, { waitUntil: 'networkidle' });
  await manager.getByTestId(`on-call-${today}`).click();
  const day = manager.getByTestId('on-call-day');
  await day.getByRole('button', { name: 'Part of the day' }).click();
  const form = day.getByRole('form', { name: 'Override' });
  // The defaults are 6 PM that day until 6 AM the next.
  must((await form.getByLabel('From time').inputValue()) === '18:00', 'the default start is not 6 PM');
  must((await form.getByLabel('Until time').inputValue()) === '06:00', 'the default end is not 6 AM');
  must((await form.getByLabel('Until date').inputValue()) === addDays(today, 1), 'the default end date is not the next day');
  // From yesterday to the day after tomorrow, so it holds the moment the calls are made.
  await form.getByLabel('From date').fill(addDays(today, -1));
  await form.getByLabel('From time').fill('00:00');
  await form.getByLabel('Until date').fill(addDays(today, 2));
  await form.getByLabel('Until time').fill('23:00');
  await form.getByLabel('Provider on call').selectOption({ label: 'Max Assistant' });
  await form.getByLabel('Backup').selectOption({ label: 'Frankie Front-Desk' });
  await form.getByLabel('Note').fill('ui cover');
  await form.getByRole('button', { name: 'Save override' }).click();
  await manager.getByText('Saved. The override is added.').waitFor();
  const card = manager.getByTestId(/^cover-/).filter({ hasText: 'ui cover' });
  await card.waitFor();
  await card.getByText('Max Assistant').waitFor();
  await card.getByText('backup Frankie Front-Desk').waitFor();
  uiCoverId = (await card.getAttribute('data-testid')).replace('cover-', '');
  await manager.getByTestId(`on-call-${today}`).getByTestId(`override-mark-${today}`).first().waitFor();
});

await step('providers see the overrides read-only', async () => {
  await frankie.goto(`${BASE}/on-call`, { waitUntil: 'networkidle' });
  const card = frankie.getByTestId(`cover-${uiCoverId}`);
  await card.getByText('Max Assistant').waitFor();
  must((await card.getByRole('button', { name: 'Edit' }).count()) === 0, 'a provider sees Edit');
  must((await card.getByRole('button', { name: 'Remove' }).count()) === 0, 'a provider sees Remove');
});

await step('a call made during the cover dials its provider, and the backup second', async () => {
  const { chosen, base, path } = await callIn(1);
  const first = dialOf(chosen.text);
  must(first.number === '+12015550104', `dialled ${first.number}, not Max (+12015550104)`);
  const next = await post(resolve(first.action, path), { ...base, DialCallStatus: 'busy', DialBridged: 'false' });
  must(dialOf(next.text)?.number === '+12015550103', 'the backup (Frankie) was not rung second');
});

await step('the override can be changed', async () => {
  const card = manager.getByTestId(`cover-${uiCoverId}`);
  await card.getByRole('button', { name: 'Edit' }).click();
  const dialog = manager.getByTestId('cover-dialog');
  await dialog.getByRole('heading', { name: 'Change an override' }).waitFor();
  await dialog.getByLabel('Note').fill('ui cover changed');
  await dialog.getByRole('button', { name: 'Save override' }).click();
  await manager.getByText('Saved. The override is changed.').waitFor();
  await manager.getByTestId(`cover-${uiCoverId}`).getByText('ui cover changed').waitFor();
});

await step('removing it asks first, and the earlier cover takes over again', async () => {
  const card = manager.getByTestId(`cover-${uiCoverId}`);
  await card.getByRole('button', { name: 'Remove' }).click();
  await manager.getByRole('button', { name: 'Yes, remove it' }).click();
  await manager.getByText('The override is removed.').waitFor();
  await card.waitFor({ state: 'detached' });
  uiCoverId = null;
  const { chosen } = await callIn(1);
  must(dialOf(chosen.text)?.number === '+12015550103', `dialled ${dialOf(chosen.text)?.number}, not Frankie`);
});

// --------------------------------------------------------------- 4. words

/// Presses Save and waits for the save itself, then for "Saved".
/// Opens the On call page's Phone line settings by its address.
async function openPhoneLine(page) {
  await page.goto(`${BASE}/on-call/routing`, { waitUntil: 'networkidle' });
  await page.waitForURL(/\/on-call#phone-line$/);
  await page.getByRole('heading', { name: 'What callers hear' }).waitFor();
}

async function saveWords(page) {
  const saved = page.waitForResponse((r) => r.url().includes('/on-call/routing/settings') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save what callers hear' }).click();
  return saved;
}

await step('changed hold words are saved, shown as saved, kept on reload and heard', async () => {
  await openPhoneLine(manager);
  const box = manager.getByLabel('While on hold, English words', { exact: true });
  originalHold = await box.inputValue();
  must(originalHold.length > 0, 'the hold words are empty');
  await box.fill('Hold on please, suite words.');
  const response = await saveWords(manager);
  must(response.status() < 300, `saving answered ${response.status()}`);
  await manager.getByText('Saved', { exact: true }).waitFor();
  await openPhoneLine(manager);
  const kept = await manager.getByLabel('While on hold, English words', { exact: true }).inputValue();
  must(kept === 'Hold on please, suite words.', `kept "${kept}"`);
  const { chosen, base, path } = await callIn(1);
  const next = await post(resolve(dialOf(chosen.text).action, path), { ...base, DialCallStatus: 'no-answer', DialBridged: 'false' });
  must(next.text.includes('Hold on please, suite words.'), 'callers do not hear the new hold words');
});

await step('a recording link must be https; one that is plays instead of the words', async () => {
  const link = manager.getByLabel('Opening, English recording link (https, from Twilio Assets)', { exact: true });
  await link.fill('http://example.com/a.mp3');
  await manager.getByRole('button', { name: 'Save what callers hear' }).click();
  await manager.getByText('A recording link has to start with https://.').waitFor();
  await link.fill('https://example.com/a.mp3');
  const response = await saveWords(manager);
  must(response.status() < 300, `saving answered ${response.status()}`);
  await manager.getByText('Saved', { exact: true }).waitFor();
  const opening = await post(`${VOICE}/incoming`, { CallSid: sid(), From: CALLER, To: LINE });
  must(opening.text.includes('<Play>https://example.com/a.mp3</Play>'), `no Play in: ${opening.text.slice(0, 300)}`);
  must(!opening.text.includes('For English, press 1'), 'the words are still said as well');
});

await step('the words are put back and the link cleared', async () => {
  await manager.getByLabel('Opening, English recording link (https, from Twilio Assets)', { exact: true }).fill('');
  await manager.getByLabel('While on hold, English words', { exact: true }).fill(originalHold);
  const response = await saveWords(manager);
  must(response.status() < 300, `saving answered ${response.status()}`);
  await manager.getByText('Saved', { exact: true }).waitFor();
  const opening = await post(`${VOICE}/incoming`, { CallSid: sid(), From: CALLER, To: LINE });
  must(!opening.text.includes('<Play'), 'a Play is still there');
  must(opening.text.includes('For English, press 1'), 'the opening words are gone');
});

// --------------------------------------------------------------- 5. call log

await step('the Call log shows the calls with the full number and an outcome badge', async () => {
  await manager.goto(`${BASE}/on-call/calls`, { waitUntil: 'networkidle' });
  await manager.waitForURL(/\/on-call#calls$/);
  await manager.getByText('Calls to the on-call line in the last 30 days, newest first.').waitFor();
  const table = manager.getByTestId('call-log-table');
  await table.waitFor();
  await table.getByText('(201) 555-0142').first().waitFor();
  const row = table.locator('tr', { hasText: '(201) 555-0142' }).filter({ hasText: 'Nobody reached' }).first();
  await row.waitFor();
  await row.getByText('Spanish').waitFor();
  await row.getByText('Frankie Front-Desk').first().waitFor();
  await table.locator('tr', { hasText: '(201) 555-0142' }).filter({ hasText: /Accepted/ }).first().waitFor();
  must((await manager.getByRole('link', { name: 'Call log' }).count()) === 0, 'the old Call log link is still there');
  must((await manager.getByRole('link', { name: 'After-hours calls' }).count()) === 0, 'the old After-hours calls link is still there');
});

await step('a provider can open Recent calls, but not the phone line settings', async () => {
  await frankie.goto(`${BASE}/on-call/calls`, { waitUntil: 'networkidle' });
  await frankie.getByTestId('call-log-table').waitFor();
  must((await frankie.locator('#phone-line').count()) === 0, 'a provider sees the phone line settings');
  must((await call(frankie, '/call-routing/calls')).status === 200, 'the API refused a provider');
  must((await call(frankie, `/on-call/routing?from=${today}`)).status === 403, 'the line screen API let a provider in');
});

await step('a plain employee is refused the Call log by the API and the screens say so', async () => {
  // Max stops being a provider for this step (the job role is put back after).
  const provider = (await call(admin, '/job-roles')).body.find((r) => r.name === 'Provider');
  const left = await call(admin, `/job-roles/${provider.id}/members/${maxId}`, { method: 'DELETE' });
  must(left.status < 300, `leaving the role answered ${left.status}`);
  try {
    const answer = await call(max, '/call-routing/calls');
    must(answer.status === 403, `the call log answered ${answer.status}`);
    await max.goto(`${BASE}/on-call/calls`, { waitUntil: 'networkidle' });
    await max.getByText('The on-call schedule is for providers and managers.').waitFor();
    await max.goto(`${BASE}/on-call/routing`, { waitUntil: 'networkidle' });
    await max.getByText('The on-call schedule is for providers and managers.').waitFor();
  } finally {
    await call(admin, `/job-roles/${provider.id}/members`, { method: 'POST', body: JSON.stringify({ employeeId: maxId }) });
  }
});

// --------------------------------------------------------------- on-call number

await step('a provider sets an on-call number in Your profile and the line dials it', async () => {
  // Frankie became a provider after her page loaded: reload so the session knows.
  await frankie.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  const box = frankie.locator('#onCallPhone');
  await box.waitFor();
  await frankie.getByText('The on-call phone line rings this number when you are on call.').waitFor();
  await box.fill('(201) 555-0188');
  await frankie.getByRole('button', { name: 'Save profile' }).click();
  await frankie.getByText('Profile saved.').waitFor();
  const stored = (await call(frankie, '/profile')).body.onCallPhone;
  must(stored === '+12015550188', `stored ${stored}`);
  await frankie.reload({ waitUntil: 'networkidle' });
  must((await frankie.locator('#onCallPhone').inputValue()) === '(201) 555-0188', 'not shown formatted');
  const { chosen } = await callIn(1);
  must(dialOf(chosen.text)?.number === '+12015550188', `dialled ${dialOf(chosen.text)?.number}`);
  await openPhoneLine(manager);
  const row = manager.getByTestId('provider-phones').locator('div', { hasText: 'Frankie Front-Desk' }).last();
  await row.getByText('(201) 555-0188 (their on-call number)').waitFor();
});

await step('a number that is not a US number shows the server\'s message and is not kept', async () => {
  await frankie.locator('#onCallPhone').fill('12345');
  await frankie.getByRole('button', { name: 'Save profile' }).click();
  await frankie.getByRole('alert').waitFor();
  const stored = (await call(frankie, '/profile')).body.onCallPhone;
  must(stored === '+12015550188', `stored ${stored} after a bad number`);
});

await step('clearing the on-call number goes back to the Directory phone', async () => {
  await frankie.locator('#onCallPhone').fill('');
  await frankie.getByRole('button', { name: 'Save profile' }).click();
  await frankie.getByText('Profile saved.').waitFor();
  must((await call(frankie, '/profile')).body.onCallPhone == null, 'still set');
  const { chosen } = await callIn(1);
  must(dialOf(chosen.text)?.number === '+12015550103', `dialled ${dialOf(chosen.text)?.number}`);
});

// --------------------------------------------------------------- 6. backups

await step('the On call page has a Backup choice in the pattern and in a one-day change', async () => {
  await manager.goto(`${BASE}/on-call`, { waitUntil: 'networkidle' });
  const card = manager.getByTestId('on-call-pattern');
  await card.getByRole('button', { name: /^(Set it|Change it)$/ }).click();
  const form = manager.getByRole('form', { name: 'The usual pattern' });
  await form.getByLabel('Mondays', { exact: true }).selectOption({ label: 'Frankie Front-Desk' });
  const backup = form.getByLabel('Backup for Mondays', { exact: true });
  await backup.waitFor();
  const options = await backup.locator('option').allTextContents();
  must(options.includes('No backup') && options.includes('Max Assistant'), `backup options: ${options.join(', ')}`);
  must(!options.includes('Frankie Front-Desk'), 'the provider can be their own backup');
  await form.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
  await manager.reload({ waitUntil: 'networkidle' });
  await manager.getByTestId(`on-call-${today}`).click();
  const dialog = manager.getByTestId('on-call-day');
  const change = dialog.getByRole('form', { name: 'Change this day' });
  await change.getByLabel('Backup').waitFor();
});

// --------------------------------------------------------------- shots, fit

await step('screenshots at 1280 and 390, with no sideways scroll on a phone', async () => {
  const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await openPhoneLine(manager);
  await manager.getByTestId('provider-phones').waitFor();
  await manager.screenshot({ path: `${OUT}/call-routing-1280.png`, fullPage: true });
  await manager.goto(`${BASE}/on-call#calls`, { waitUntil: 'networkidle' });
  await manager.getByTestId('call-log-table').waitFor();
  await manager.screenshot({ path: `${OUT}/call-log-1280.png`, fullPage: true });

  await manager.setViewportSize({ width: 390, height: 900 });
  try {
    await openPhoneLine(manager);
    await manager.getByTestId('provider-phones').waitFor();
    await manager.screenshot({ path: `${OUT}/call-routing-390.png`, fullPage: true });
    const routingFits = await fits(manager);
    await manager.goto(`${BASE}/on-call#calls`, { waitUntil: 'networkidle' });
    await manager.locator('ul [data-testid^="call-"]').first().waitFor();
    await manager.screenshot({ path: `${OUT}/call-log-390.png`, fullPage: true });
    const logFits = await fits(manager);
    must(routingFits, 'The On call page scrolls sideways at 390 px with the phone line open');
    must(logFits, 'The On call page scrolls sideways at 390 px with Recent calls open');
  } finally {
    await manager.setViewportSize({ width: 1280, height: 1000 });
  }
});

// --------------------------------------------------------------- clean-up

await step('clean-up: the suite takes its cover away', async () => {
  for (const id of [uiCoverId, apiCoverId].filter(Boolean)) {
    const gone = await call(manager, `/on-call/covers/${id}`, { method: 'DELETE' });
    must(gone.status < 300 || gone.status === 404, `removing a cover answered ${gone.status}`);
  }
  const covers = (await call(manager, `/on-call/covers?from=${today}&to=${addDays(today, 7)}`)).body;
  must(!covers.some((c) => c.note && c.note.includes('call-routing-suite')), 'the suite cover is still there');
});

await browser.close();
if (errors.length) {
  console.log(`\n${errors.length} failure(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll call routing checks passed.');
