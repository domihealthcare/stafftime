// Two taps at once.
//
// Not a browser suite — there is nothing to look at. It fires genuinely
// concurrent requests at the real API against real Postgres, because that is
// the only place a race exists: a unit test with a mocked client cannot have
// one, and a serialized test runner will not produce one.
//
// Both rules here have been watched to fail. Dropping clock-in to
// ReadCommitted let six of eight simultaneous punches through, and the damage
// was sticky: each later clock-out closed one of the six, so the employee was
// refused every clock-in until somebody cleaned up by hand. Removing the
// compare-and-set from clock-out let all six writes land, each stamping its own
// time over the last. If either check here stops failing under those
// conditions, it has stopped testing anything.
import { mkdirSync } from 'node:fs';

mkdirSync(process.argv[2] || new URL('./shots/', import.meta.url).pathname, { recursive: true });

// Straight to the API. Going through the web server's proxy would put a second
// thing between the requests, and the question is what Postgres does.
const API = process.env.API_URL || 'http://127.0.0.1:3000/api';
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

// Inside the North Bergen geofence, so the punches are allowed and the race is
// the only thing being tested.
const AT_WORK = { latitude: 40.804, longitude: -74.012, accuracyMeters: 20 };
const ROUNDS = 5;
const SIMULTANEOUS = 8;

async function signIn(email) {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'shift-change-2026' }),
  });
  if (!response.ok) throw new Error(`could not sign in as ${email}: ${response.status}`);
  return response.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

const cookie = await signIn('frontdesk@domihealthcare.com');
const headers = { 'Content-Type': 'application/json', cookie };
// A second session, used only to read the database's opinion of the result.
const asAdmin = { headers: { cookie: await signIn('admin@domihealthcare.com') } };

const clockIn = (locationId) =>
  fetch(`${API}/time-entries/clock-in`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ locationId, method: 'WEB', ...AT_WORK }),
  });

const clockOut = () =>
  fetch(`${API}/time-entries/clock-out`, {
    method: 'POST',
    headers,
    body: JSON.stringify(AT_WORK),
  });

/// However many open punches that employee has right now, straight from the
/// database rather than from whatever the winning response happened to say.
async function openPunchCount(employeeId) {
  const rows = await (
    await fetch(`${API}/time-entries?status=OPEN&employeeId=${employeeId}`, asAdmin)
  ).json();
  return rows.length;
}

const me = await (await fetch(`${API}/auth/me`, { headers: { cookie } })).json();
const employeeId = me.id ?? me.employee?.id;
const locationId = (await (await fetch(`${API}/locations`, asAdmin)).json()).find(
  (l) => l.slug === 'north-bergen',
).id;

// Whatever the previous suite left behind.
await clockOut();

await step(`${SIMULTANEOUS} simultaneous clock-ins create exactly one punch`, async () => {
  for (let round = 1; round <= ROUNDS; round++) {
    const responses = await Promise.all(
      Array.from({ length: SIMULTANEOUS }, () => clockIn(locationId)),
    );

    const created = responses.filter((r) => r.ok).length;
    const open = await openPunchCount(employeeId);

    if (created !== 1)
      throw new Error(`round ${round}: ${created} of ${SIMULTANEOUS} punches were accepted`);
    if (open !== 1)
      throw new Error(`round ${round}: ${open} open entries in the database, expected 1`);

    // Losing a race is not an excuse for a useless error. Whoever tapped twice
    // should be told they are already on the clock, not handed a 500.
    for (const response of responses.filter((r) => !r.ok)) {
      if (response.status !== 409)
        throw new Error(`round ${round}: a losing punch got ${response.status}, expected 409`);
      const { message } = await response.json();
      if (!/already clocked in/i.test(message))
        throw new Error(`round ${round}: a losing punch said "${message}"`);
    }

    await clockOut();
  }
});

await step('simultaneous clock-outs write once, not once each', async () => {
  for (let round = 1; round <= ROUNDS; round++) {
    await clockIn(locationId);

    const responses = await Promise.all(Array.from({ length: SIMULTANEOUS }, clockOut));
    const accepted = responses.filter((r) => r.ok);

    if (accepted.length !== 1)
      throw new Error(`round ${round}: ${accepted.length} clock-outs were accepted`);
    if (await openPunchCount(employeeId))
      throw new Error(`round ${round}: the punch is still open after clocking out`);
  }
});

await step('the punch on file is the one that won, verification and all', async () => {
  // This is what the clock-out race actually cost. Each losing write carried
  // its own verification result, so a punch made from the car park — correctly
  // recorded as MANUAL and flagged for review — could be quietly overwritten by
  // a tap that happened to land afterwards from inside the geofence.
  //
  // So: fire one clock-out from 2km away alongside four from the office, and
  // require the row to be exactly what the single accepted response said.
  const away = { latitude: 40.7878, longitude: -74.0143, accuracyMeters: 20 };

  for (let round = 1; round <= ROUNDS; round++) {
    await clockIn(locationId);

    const responses = await Promise.all([
      fetch(`${API}/time-entries/clock-out`, {
        method: 'POST',
        headers,
        body: JSON.stringify(away),
      }),
      ...Array.from({ length: 4 }, clockOut),
    ]);

    const accepted = responses.filter((r) => r.ok);
    if (accepted.length !== 1)
      throw new Error(`round ${round}: ${accepted.length} clock-outs were accepted`);

    const won = await accepted[0].json();
    const rows = await (
      await fetch(`${API}/time-entries?employeeId=${employeeId}`, asAdmin)
    ).json();
    const stored = rows.find((row) => row.id === won.id);

    for (const field of ['clockOutAt', 'clockOutVerification', 'status']) {
      if (stored[field] !== won[field])
        throw new Error(
          `round ${round}: the winning punch reported ${field}=${won[field]} but the database holds ${stored[field]}`,
        );
    }
  }
});

console.log(`\n${errors.length === 0 ? 'ALL RACE CHECKS PASSED' : `PROBLEMS (${errors.length}):`}`);
errors.forEach((e) => console.log(' - ' + e));
process.exit(errors.length === 0 ? 0 : 1);
