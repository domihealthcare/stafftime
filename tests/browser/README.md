# Browser checks

These are end-to-end checks driven by a real Chromium against a real API and a
real Postgres. They exist because most of what can go wrong in this app goes
wrong between the pieces — a cookie that never gets sent, an error code the
frontend reads from the wrong place, a Save button that stays disabled — and
none of that shows up in unit tests.

Each file is a suite of named steps. A step that throws is reported as `FAIL`
and the run keeps going, so one broken screen doesn't hide the rest.

## Running them

You need three things up first:

1. **Postgres** with the schema migrated and seeded
   (`npm run db:up && npm run db:migrate && npm run db:seed` from the repo root;
   the runner re-seeds between suites itself).
2. **The API** on `:3000` — `npm run dev:api`.
3. **The web dev server** on `:5173` — `npm run dev:web`.

Then, once, from this directory:

```bash
npm install          # installs Playwright (not part of the root workspaces)
npx playwright install chromium
```

And to run everything:

```bash
npm test             # or: bash run-all.sh
```

A single suite:

```bash
node scheduler.mjs
```

Screenshots land in `./shots` (gitignored) unless you pass a directory as the
first argument.

## Environment

| Variable | Default | Why |
| --- | --- | --- |
| `CHROMIUM_PATH` | whatever Playwright downloaded | Point at a preinstalled Chromium instead of downloading one. |
| `PGHOST_LOCAL` / `PGPORT_LOCAL` | `127.0.0.1` / `5433` | Where `run-all.sh` resets state between suites. |
| `API_URL` | `http://127.0.0.1:3000/api` | Only `race.mjs` uses it — it talks to the API directly rather than through the web server's proxy. |

## Things worth knowing

- **State is reset between suites, not trusted.** Suites leave an open time
  entry, a changed password, a paired kiosk or a rota behind on purpose. The
  runner re-seeds and clears that between suites instead of depending on which
  suite ran first.
- **Two suites drive no browser at all.** `race.mjs` fires genuinely concurrent
  requests at the API, and `privacy.mjs` checks what the API does and does not
  hand back. They live here because this is the harness that has a real server
  and a real database in front of it, which is the only place those questions
  have an answer.
- **`race.mjs` has been watched to fail.** Dropping clock-in to `ReadCommitted`
  and removing the compare-and-set from clock-out makes all three of its checks
  fail. A concurrency test that has never been seen to fail is not evidence of
  anything, so if you change how those two punches are written, break them
  deliberately once and check this still notices.
- **`setup.mjs` is not in `run-all.sh`.** It exercises first-run setup, which
  only happens when no admin exists yet. Run it by hand against an empty
  database.
- **The scheduler suite builds its rotas in February 2027** so clearing them
  afterwards can't delete the shift the seed puts on today's date.
- **Never point these at production.** The reset step re-seeds the database,
  which resets locations to placeholder coordinates and gives every seeded
  account the same well-known password.

## Testing what production actually serves

The deployed app sends a Content-Security-Policy and a set of other security
headers (see `vercel.json`). A CSP that is wrong turns the whole app into a
blank page, and a deployment is the worst place to find that out.

`vite preview` serves the real production bundle with those same headers — it
reads them out of `vercel.json` rather than keeping a copy — so the suites can
be pointed at it:

```bash
npm run preview          # from the repo root; serves on :4173
BASE_URL=http://127.0.0.1:4173 npm run test:browser
```

That is how the policy is checked rather than assumed. Blob-URL downloads,
geolocation and the kiosk all work under it.

## The phone suite

`phone.mjs` runs the whole app at 390px and fails on any screen where the page
itself scrolls sideways. It makes its own data — a punch, a checklist — rather
than depending on whichever suite ran before it, so it can be run on its own:

```bash
node phone.mjs
```

Note that the timesheet renders both a table and a card list, one hidden by CSS
depending on width. `getByText(...).first()` will resolve to the hidden copy and
time out; use `.locator('visible=true').first()`.

## In CI

These run on every push (`.github/workflows/ci.yml`), against a Postgres service
container and `vite preview`. Screenshots and the per-suite logs are uploaded as
an artifact on every run, pass or fail, since a failure that only happens in CI
is otherwise very hard to read.
