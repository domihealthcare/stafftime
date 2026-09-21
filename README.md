# Domi Time & Scheduling

Staff clock-in/out, scheduling and timesheets for Domi Healthcare.
Deployed at **staff.domihealthcare.com**.

See [CLAUDE.md](./CLAUDE.md) for the full project brief, and
[docs/](./docs) for architecture notes and open questions.

## What exists today

Phase 1, backend and web app:

- Core data model — Location, Employee, Shift, TimeEntry
- Sign-in with passwords, roles and server-side sessions
- Clock in/out with location verification (geofence, office IP, kiosk)
- Front-desk kiosk mode — tablet bound to a location, staff clock in by PIN
- Timesheet view, with manager approval and corrections
- Manager shift scheduler
- Timesheet export to Excel or CSV, with selectable columns
- Admin screens for locations (geofence, IPs) and kiosks

Not built yet: the ADP TotalSource export (waiting on ADP's pay codes and client
code), badge-tap clock-in, self-service password reset, PTO, and
onboarding/offboarding checklists.

## Repository layout

```
apps/api/     NestJS + Prisma backend
apps/web/     React + Vite + Tailwind web app
docs/         architecture notes, open questions
```

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
| `npm test` | Run the test suite |
| `npm run lint` | Check code style |
| `npm run build` | Build both apps for production |
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

There is no sign-up page, so the first administrator is created from the
command line after the database is migrated:

```bash
npm run create-admin --workspace @stafftime/api
```

It prompts for the details and hides the password as you type, so nothing
sensitive lands in your shell history.

Everyone else is added by an admin, who sets a temporary password that the new
hire must replace the first time they sign in. There is no self-service "forgot
password" yet — that needs email sending, which is not set up (see
`docs/open-questions.md`).

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
| `POST` | `/api/auth/login` | anyone |
| `POST` | `/api/auth/logout` | signed in |
| `GET` | `/api/auth/me` | signed in |
| `POST` | `/api/auth/change-password` | signed in |
| `GET`/`DELETE` | `/api/auth/sessions` | signed in — list or sign out other browsers |
| `PUT` | `/api/auth/employees/:id/password` | admin — issue a temporary password |
| `POST` | `/api/kiosk/pair` | anyone with a valid pairing code |
| `GET` | `/api/kiosk/session` `/employees` | the paired device |
| `POST` | `/api/kiosk/punch` | the paired device, plus the employee's PIN |
| `POST`/`GET`/`DELETE` | `/api/kiosk/devices` | admin |
| `PUT`/`DELETE` | `/api/kiosk/employees/:id/pin` | admin |
| `GET` | `/api/exports/columns` | manager |
| `POST` | `/api/exports/timesheet/preview` | manager |
| `POST` | `/api/exports/timesheet` | manager — returns .xlsx or .csv |
| `GET/POST/PATCH/DELETE` | `/api/locations` | admin (reads: anyone) |
| `GET/POST/PATCH/DELETE` | `/api/employees` | admin (`/me`: anyone) |
| `GET/POST/PATCH/DELETE` | `/api/shifts` | manager (employees see their own) |
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
| **Schedule** | Week grid. Managers add and remove shifts; employees see their own |
| **Sign in** | Email and password. A temporary password lands you on a forced change screen and nothing else |
| **Export** (manager) | Produce a timesheet spreadsheet for a period, choosing exactly which columns go in it |
| **Kiosks** (admin) | Pair and revoke tablets, and set staff PINs |
| **Locations** (admin) | Each office's coordinates, geofence radius and IP allow-list. Has a "use my current location" button, so you can set it standing at the desk |
