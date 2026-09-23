# Domi Staff

[![CI](https://github.com/domihealthcare/stafftime/actions/workflows/ci.yml/badge.svg)](https://github.com/domihealthcare/stafftime/actions/workflows/ci.yml)

Staff clock-in/out, scheduling and timesheets for Domi Healthcare.
Deployed at **staff.domihealthcare.com**.

See [CLAUDE.md](./CLAUDE.md) for the full project brief, and
[docs/](./docs) for architecture notes and open questions.

**Showing it to the managers?** [docs/manager-review.md](./docs/manager-review.md)
is written for them: what to try, in what order, and what to comment on.

## What exists today

Phase 1, backend and web app:

- Core data model — Location, Employee, Shift, TimeEntry
- Sign-in with passwords, roles and server-side sessions
- Clock in/out with location verification (geofence, office IP, kiosk)
- Front-desk kiosk mode — tablet bound to a location, staff clock in by PIN
- Timesheet view, with manager approval and corrections
- Manager shift scheduler — a week grid, repeating rotas, copy-last-week, and
  a coverage summary that names the gaps
- Timesheet export to Excel or CSV, with selectable columns and saved reports —
  every run recorded, with the file kept so it can be produced again byte for
  byte, and hours that have already been paid protected from a careless edit
- PTO requests with manager approval, balances and a practice-set policy
- Calendar syncing — each employee gets a private subscription URL for Google
  Calendar, Apple Calendar or Outlook
- Licence and certification tracking by expiry date, so nothing lapses unnoticed
- Self-service password reset, emails when time off is asked for or decided, and
  a nightly digest of what needs a look — lapsed licences, overdue checklist
  tasks, missing punches, undecided time off (needs an email provider
  configured — see [DEPLOY.md](./DEPLOY.md))
- Onboarding and offboarding checklists — editable templates and a per-person
  instance, tracking what has been done and by whom
- Admin screens for locations (geofence, IPs) and kiosks

Not built yet: the ADP TotalSource export (waiting on ADP's pay codes and
client code) and badge-tap clock-in.

## What it deliberately does not hold

No social security numbers, no licence numbers, no scans of anything, and no
personnel documents — no I-9, no W-4, no signed handbook on file here. This is a
timekeeping app: it records that somebody worked, and that a licence runs out on
the 13th so it can be chased. The paperwork lives in the personnel file, where
it already is and already belongs.

Nothing is uploaded to this app at all. The only files it stores are the payroll
exports it generates itself. There is a test that reads the database schema and
fails if any of this creeps back in — see *What a checklist does not hold* in
[docs/architecture.md](./docs/architecture.md).

**Deploying it:** see [DEPLOY.md](./DEPLOY.md).

## Repository layout

```
apps/api/       NestJS + Prisma backend
apps/web/       React + Vite + Tailwind web app
tests/browser/  end-to-end checks driven by a real browser
docs/           architecture notes, open questions
.github/        CI — every push runs the lot
```

Every push runs the unit tests, the linters, a production build, and the whole
browser suite against a real Postgres and a real browser. See
`.github/workflows/ci.yml`.

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

# 5. load the two locations and some test staff
npm run db:seed

# 6. start the API and the web app together
npm run dev
```

Then open **http://localhost:5173** in your browser.

The API runs alongside it at http://localhost:3000/api — check it with:

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
| `npm run build` | Build both apps for production |
| `npm run preview` | Serve the built web app with the deployed security headers, at http://localhost:4173 |
| `npm run db:demo` | Load five weeks of realistic demo data for a review — **replaces** existing shifts, punches and time off |
| `npm run db:studio` | Open a visual database browser |
| `npm run db:down` | Stop the local database |

## Signing in

The seed creates four accounts, all sharing the password
**`shift-change-2026`** — fine for local work, never for a real database:

| Email | Role |
| --- | --- |
| `admin@domihealthcare.com` | Admin — kiosk PIN `8261` |
| `manager@domihealthcare.com` | Manager — kiosk PIN `7394` |
| `frontdesk@domihealthcare.com` | Employee — kiosk PIN `4817` |
| `ma@domihealthcare.com` | Employee — kiosk PIN `5063`; starts with a temporary password, so you can try the forced-change flow |

### On a real deployment

There is no sign-up page. The first administrator is created once, from the
browser: set a `SETUP_TOKEN` environment variable and the site offers a setup
screen until an admin exists. See [DEPLOY.md](./DEPLOY.md).

(`npm run create-admin --workspace @stafftime/api` does the same from a terminal,
if you would rather.)

Everyone else is added by an admin on the **Staff** screen, who issues a
temporary password that the new hire must replace the first time they sign in.

**Forgotten passwords** are self-service: the sign-in screen offers a reset
link, good once and for 30 minutes. That needs an email provider configured
(`RESEND_API_KEY` and `EMAIL_FROM`) — without one, the email is written to the
server log instead, which is how it works locally.

## Trying the kiosk

1. Sign in as the admin and open **Kiosks**
2. Add a kiosk, pick a location, and note the pairing code
3. Open `http://localhost:5173/kiosk` (a second browser profile stands in for the
   tablet) and enter the code
4. Tap a name and enter that person's PIN from the table above

The tablet stays paired until an admin revokes it. Only staff assigned to that
location, still employed, and with a PIN set appear on the keypad.

## Setting the geofence

The seeded coordinates are **placeholders** — approximate town-centre points
with a guessed 150m radius. Before anyone clocks in for real:

1. Sign in as an admin **on your phone** and open **Locations**
2. Stand at the front desk and press **Use my current location**
3. Check the numbers, set a radius, and save
4. Walk to the far corner of the office and try clocking in. If it refuses,
   the radius is too tight

Repeat at the other office. Running `npm run db:seed` resets both back to the
placeholders, so do not run it after setting real values.

## Endpoints

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/api/health` | anyone |
| `GET` | `/api/setup/status` | anyone — is this a fresh deployment? |
| `POST` | `/api/setup` | anyone with the setup token, once |
| `POST` | `/api/auth/login` | anyone |
| `POST` | `/api/auth/logout` | signed in |
| `GET` | `/api/auth/me` | signed in |
| `POST` | `/api/auth/change-password` | signed in |
| `POST` | `/api/auth/forgot-password` | anyone — always answers the same way |
| `POST` | `/api/auth/reset-password` | anyone with a valid link, once |
| `GET`/`DELETE` | `/api/auth/sessions` | signed in — list or sign out other browsers |
| `PUT` | `/api/auth/employees/:id/password` | admin — issue a temporary password |
| `POST` | `/api/kiosk/pair` | anyone with a valid pairing code |
| `GET` | `/api/kiosk/session` `/employees` | the paired device |
| `POST` | `/api/kiosk/punch` | the paired device, plus the employee's PIN |
| `POST`/`GET`/`DELETE` | `/api/kiosk/devices` | admin |
| `PUT`/`DELETE` | `/api/kiosk/employees/:id/pin` | admin |
| `GET` | `/api/exports/columns` | manager |
| `GET` | `/api/exports/targets` | manager — where hours can be sent, and what is not ready |
| `GET` | `/api/exports/history` | manager — every run |
| `GET` | `/api/exports/history/:id/file` | manager — the file exactly as it went out |
| `POST` | `/api/exports/history/:id/void` | manager — no longer the run that counts |
| `POST` | `/api/exports/timesheet/preview` | manager |
| `POST` | `/api/exports/timesheet` | manager — returns .xlsx or .csv |
| `GET`/`POST` | `/api/exports/presets` | manager — saved reports |
| `PATCH`/`DELETE` | `/api/exports/presets/:id` | the owner, or an admin |
| `GET`/`POST` | `/api/pto` | anyone (employees see only their own) |
| `PATCH` | `/api/pto/:id/review` | manager — approve or deny |
| `PATCH` | `/api/pto/:id/cancel` | the requester, or a manager |
| `GET` | `/api/pto/:id/conflicts` | manager — shifts clashing with the request |
| `GET` | `/api/pto/policy` | anyone signed in |
| `PATCH` | `/api/pto/policy` | admin |
| `GET` | `/api/pto/balance` | own balance; managers can ask for anyone's |
| `GET` | `/api/config` | anyone — is this a test environment? |
| `GET`/`POST`/`DELETE` | `/api/calendar/link` | signed in — your own subscription URL |
| `GET` | `/api/calendar/:token/domi.ics` | anyone with the token — the feed itself |
| `GET/POST/PATCH/DELETE` | `/api/locations` | admin (reads: anyone) |
| `GET/POST/PATCH/DELETE` | `/api/employees` | admin (`/me`: anyone) |
| `GET/POST/PATCH/DELETE` | `/api/shifts` | manager (employees see their own) |
| `POST` | `/api/shifts/repeat` | manager — build a rota across a date range |
| `POST` | `/api/shifts/copy-week` | manager — copy one week's rota into another |
| `GET` | `/api/shifts/coverage` | manager — hours and gaps for a week |
| `GET` | `/api/checklists/templates` | manager — read; `POST`/`PATCH`/`DELETE` are admin |
| `GET` | `/api/checklists` | own checklists; managers see everyone's |
| `POST` | `/api/checklists` | manager — start one for somebody |
| `DELETE` | `/api/checklists/:id` | admin |
| `PATCH` | `/api/checklists/tasks/:id` | manager, or the employee for their own tasks |
| `GET` | `/api/credentials` | own credentials; managers see everyone's |
| `GET` | `/api/credentials/expiring` | manager — what lapses next |
| `POST`/`PATCH` | `/api/credentials` | manager |
| `GET` | `/api/maintenance/purge` | the scheduled housekeeping job, with `CRON_SECRET` |
| `POST` | `/api/time-entries/clock-in` | anyone |
| `POST` | `/api/time-entries/clock-out` | anyone |
| `GET` | `/api/time-entries/current` | anyone |
| `GET` | `/api/time-entries` | manager (employees see their own) |
| `PATCH` | `/api/time-entries/:id` | manager — edit, reason required |
| `PATCH` | `/api/time-entries/:id/approve` | manager |

## Screens

| Screen | What it does |
| --- | --- |
| **Kiosk** (`/kiosk`) | The front-desk tablet. Tap your name, enter your PIN, clock in or out. No sign-in, no navigation anywhere else |
| **Clock** | Clock in/out with a live elapsed timer, today's shift, and a plain-language reason whenever a punch is refused |
| **Timesheet** | Weekly hours. Managers see everyone, plus approve and correct; employees see only their own |
| **Schedule** | Week grid. Managers add and remove shifts, build repeating rotas, copy last week forward, and see a coverage summary; employees see their own shifts and can turn on calendar syncing |
| **Sign in** | Email and password. A temporary password lands you on a forced change screen and nothing else |
| **Time off** | Request time off and see your balance; managers approve or deny, and can file on someone's behalf. Admins set the practice's PTO rules here |
| **Export** (manager) | Produce a timesheet spreadsheet for a period, choosing exactly which columns go in it. Settings can be saved as named reports and shared. Every run is listed below with its file, and the screen warns about hours corrected since they were last sent |
| **Licences** | Licences, certifications and anything else with a renewal date. Opens on what is about to lapse. Dates only — the licence number and the document itself stay in the personnel file |
| **Checklists** | Onboarding and offboarding. Managers start one, work through it and see what is overdue; an employee sees their own and the parts that are theirs to do. Admins edit the templates here — add, reword, reorder and retire |
| **Staff** (admin) | Add people, set their role and locations, issue a temporary password, mark someone as no longer employed |
| **Kiosks** (admin) | Pair and revoke tablets, and set staff PINs |
| **Locations** (admin) | Each office's coordinates, geofence radius and IP allow-list. Has a "use my current location" button, so you can set it standing at the desk |
