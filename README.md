# Domi Staff

[![CI](https://github.com/domihealthcare/stafftime/actions/workflows/ci.yml/badge.svg)](https://github.com/domihealthcare/stafftime/actions/workflows/ci.yml)

Staff clock-in/out, scheduling and timesheets for Domi Healthcare, and the
staff platform around them. Deployed at **staff.domihealthcare.com**.

See [CLAUDE.md](./CLAUDE.md) for the full project brief (what has been built
and why, entry by entry), and [docs/](./docs) for architecture notes and open
questions. The guides for staff and managers are on the app's own **Help**
page.

## What exists today

All four phases in [CLAUDE.md](./CLAUDE.md) are built and live:

- **Timekeeping (Phase 1)**: sign-in with roles (Employee / Manager / Admin)
  and server-side sessions; clock in and out on a phone with a location check
  (geofence), working from home, or at a front-desk time clock by PIN; the
  timesheet with manager approval and corrections; the shift scheduler (a
  week rota and a month, open shifts, repeating and regular shifts, copy last
  week, publish); and the payroll export, a spreadsheet or the ADP
  TotalSource import file, every run kept so it can be produced again.
- **Time off (Phase 2)**: PTO, sick and unpaid requests, manager approval,
  balances and a practice-set policy.
- **Checklists (Phase 3)**: onboarding and offboarding, with editable
  templates and a per-person list of what has been done and by whom.
- **The staff platform (Phase 4)**: News, job roles and resources, the
  Directory, availability, anonymous surveys and the suggestion box, licences
  by expiry date, the practice calendar, the manager dashboard, a nightly
  round-up email, the bell and phone notifications, clinical forms that never
  leave the browser, and more.

Not built: badge-tap clock-in. Some parts are built but switched off until
somebody sets them up (Ask Domi Staff, calendar invites, phone
notifications, the ADP set-up); see *Where it has got to* in
[CLAUDE.md](./CLAUDE.md).

## What it deliberately does not hold

No social security numbers or other identity numbers, no licence numbers, no
date of birth (a birthday is month and day only), no scans of anything, and no
personnel documents: no I-9, no W-4, no signed handbook on file here. This is
a timekeeping app: it records that somebody worked, and that a licence runs out
on the 13th so it can be chased. The paperwork lives in the personnel file,
where it already is and already belongs.

The only file anybody uploads is a profile photo of themselves (cropped,
shrunk and re-encoded in the browser). Apart from that, the only files the app
stores are the payroll exports it generates itself. A test reads the database
schema and fails if any of this creeps back in; see *Data this app does not
hold* in [CLAUDE.md](./CLAUDE.md).

**Deploying it:** see [DEPLOY.md](./DEPLOY.md).

## Repository layout

```
apps/api/       NestJS + Prisma backend
apps/web/       React + Vite + Tailwind web app
api/index.ts    the Vercel serverless entry that runs the API
tests/browser/  end-to-end checks driven by a real browser
docs/           architecture notes, open questions, setup guides
.github/        CI: every push runs the lot
```

Every push runs the linters, the type checks, the unit tests, a production
build, and the whole browser suite against a real Postgres and a real browser.
See `.github/workflows/ci.yml`.

## Getting started

You need [Node.js 20+](https://nodejs.org) and
[Docker Desktop](https://www.docker.com/products/docker-desktop/) installed.

```bash
# 1. install dependencies (run from the repo root)
npm install

# 2. start the local Postgres database
npm run db:up

# 3. point the API at that database
cp apps/api/.env.example apps/api/.env

# 4. create the database tables
npm run db:migrate

# 5. load the two locations and some test staff (local only, never the live database)
npm run db:seed

# 6. start the API and the web app together
npm run dev
```

Then open **http://localhost:5173** in your browser.

The API runs alongside it at http://localhost:3000/api. Check it with:

```bash
curl http://localhost:3000/api/health
```

Run them separately with `npm run dev:api` and `npm run dev:web` if you prefer.

### Other useful commands

| Command | What it does |
| --- | --- |
| `npm test` | Run the unit tests |
| `npm run test:browser` | Run the end-to-end browser checks (see [tests/browser](./tests/browser)) |
| `npm run lint` | Check code style |
| `npm run typecheck` | Check the types of the web app, the API and the Vercel entry |
| `npm run format` | Rewrite the code in the house style (Prettier) |
| `npm run build` | Build both apps for production |
| `npm run preview` | Serve the built web app with the deployed security headers, at http://localhost:4173 |
| `npm run db:demo` | Load five weeks of realistic demo data for a review. **Replaces** existing shifts, punches and time off |
| `npm run db:studio` | Open a visual database browser |
| `npm run db:down` | Stop the local database |

## Signing in

The seed creates four accounts, all sharing the password
**`shift-change-2026`**. Fine for local work, never for a real database:

| Email | Role |
| --- | --- |
| `admin@domihealthcare.com` | Admin, kiosk PIN `8261` |
| `manager@domihealthcare.com` | Manager, kiosk PIN `7394` |
| `frontdesk@domihealthcare.com` | Employee, kiosk PIN `4817` |
| `ma@domihealthcare.com` | Employee, kiosk PIN `5063`; starts with a temporary password, so you can try the forced-change flow |

### On a real deployment

There is no sign-up page. The first administrator is created once, from the
browser: set a `SETUP_TOKEN` environment variable and the site offers a setup
screen until an admin exists. See [DEPLOY.md](./DEPLOY.md).

(`npm run create-admin --workspace @stafftime/api` does the same from a terminal,
if you would rather.)

Everyone else is added by an admin under **Manage → Staff**, one at a time or
as a pasted list, and sent a **welcome email** with a link to choose their own
password (or given a temporary password to replace the first time they sign
in).

**Forgotten passwords** are self-service: the sign-in screen offers a reset
link, good once and for 30 minutes. That needs an email provider configured
(`RESEND_API_KEY` and `EMAIL_FROM`). Without one, the email is written to the
server log instead, which is how it works locally.

## Trying the time clock (kiosk)

1. Sign in as the admin and open **Manage → Offices → Kiosks**
2. Add a kiosk, pick a location, and note the pairing code
3. Open `http://localhost:5173/kiosk` (a second browser profile stands in for the
   tablet) and enter the code
4. Press **Clock in or out**, find your name, and enter that person's PIN from
   the table above

The tablet stays paired until an admin revokes it. It lists everybody still
employed at its office who clocks in; anybody who has not chosen a PIN yet is
tagged **No PIN yet** (they choose one on their profile).

## Setting the geofence

The seeded coordinates are **placeholders**: approximate town-centre points
with a 500 ft radius. Before anyone clocks in for real:

1. Sign in as an admin and open **Manage → Offices → Locations**
2. Type the office's position in (from Google Maps), or stand at the front desk
   on a phone and press **Use my current location**
3. Check the numbers, set a radius, and save
4. Try clocking in from the far corner of the office. If it refuses, the
   radius is too tight

Repeat at the other office. Running `npm run db:seed` resets both back to the
placeholders, so do not run it after setting real values, and **never against
the live database**.

## Finding your way around the code

There are over 400 API routes, so they are not listed here. Each area of the
app is a folder under `apps/api/src/` (for example `shifts/`, `pto/`,
`time-entries/`) with a `*.controller.ts` naming its routes and who may use
them, a `*.service.ts` doing the work, and usually a pure rules file with a
`*.spec.ts` beside it. The matching screen is under `apps/web/src/pages/`.
[docs/architecture.md](./docs/architecture.md) explains the parts that are
not obvious.

Every route needs a signed-in session unless it is marked `@Public()` (health,
config, sign-in and password reset, first-run setup, the public News posts,
the calendar feed by its private token, the paired time clock, and the two
scheduled jobs, each with its own secret).
