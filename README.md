# Domi Time & Scheduling

Staff clock-in/out, scheduling and timesheets for Domi Healthcare.
Deployed at **staff.domihealthcare.com**.

See [CLAUDE.md](./CLAUDE.md) for the full project brief, and
[docs/](./docs) for architecture notes and open questions.

## What exists today

Phase 1, backend and web app:

- Core data model — Location, Employee, Shift, TimeEntry
- Clock in/out with location verification (geofence, office IP, kiosk)
- Timesheet view, with manager approval and corrections
- Manager shift scheduler

Not built yet: real login, the kiosk screen, PTO, onboarding/offboarding
checklists, and the ADP export.

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

## Calling the API while there is no login yet

Authentication is stubbed for now. Opening the web app shows a list of seeded
staff — pick one to act as them, and use "Switch user" in the header to change.

Behind the scenes every request (except `/api/health`) carries an
`x-dev-employee-id` header naming the caller:

```bash
curl http://localhost:3000/api/employees/me \
  -H "x-dev-employee-id: <an-id-from-the-seed-output>"
```

This is development-only. The app refuses to start with `AUTH_MODE=dev` when
`NODE_ENV=production`, so it cannot reach the internet in this state.

## Endpoints

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/api/health` | anyone |
| `GET/POST/PATCH/DELETE` | `/api/locations` | admin (reads: anyone) |
| `GET/POST/PATCH/DELETE` | `/api/employees` | admin (`/me`: anyone) |
| `GET/POST/PATCH/DELETE` | `/api/shifts` | manager (employees see their own) |
| `POST` | `/api/time-entries/clock-in` | anyone |
| `POST` | `/api/time-entries/clock-out` | anyone |
| `GET` | `/api/time-entries/current` | anyone |
| `GET` | `/api/time-entries` | manager (employees see their own) |
| `PATCH` | `/api/time-entries/:id` | manager — edit, reason required |
| `PATCH` | `/api/time-entries/:id/approve` | manager |
| `GET` | `/api/dev/employees` | anyone — **dev mode only**, 404s otherwise |

## Screens

| Screen | What it does |
| --- | --- |
| **Clock** | Clock in/out with a live elapsed timer, today's shift, and a plain-language reason whenever a punch is refused |
| **Timesheet** | Weekly hours. Managers see everyone, plus approve and correct; employees see only their own |
| **Schedule** | Week grid. Managers add and remove shifts; employees see their own |
