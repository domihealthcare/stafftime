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

## Things worth knowing

- **State is reset between suites, not trusted.** Suites leave an open time
  entry, a changed password, a paired kiosk or a rota behind on purpose. The
  runner re-seeds and clears that between suites instead of depending on which
  suite ran first.
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
