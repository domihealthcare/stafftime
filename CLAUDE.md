# Domi Staff (formerly Domi Time & Scheduling) — Project Brief

## Purpose
A standalone web app for Domi Healthcare staff to clock in/out and for managers to
build schedules, approve PTO, and run onboarding/offboarding checklists. Deployed at
**staff.domihealthcare.com**, separate from the public marketing site and separate
from Domi EMR (a different product owned by Domi Medical LLC).

This is intentionally **not** built inside Domi EMR right now, but it should be built
so a future merge is cheap: same conventions, same stack, and every Employee record
carries a stable `external_id` field so it can later be matched to EMR staff/provider
records without a messy migration.

## Company context
- Domi Healthcare: 5-provider primary care practice, two locations — North Bergen, NJ
  and West New York, NJ (domihealthcare.com).
- Domi Medical LLC (separate company) owns Domi EMR — not part of this project, but
  built with the same stack, so patterns should match where reasonable.

## Stack (match Domi EMR conventions)
- Backend: NestJS + Prisma + PostgreSQL
- Frontend: React + Vite + Tailwind
- Own GitHub repo, own Postgres database — do not share Domi EMR's DB
- Deploy: separate Vercel project (own domain: staff.domihealthcare.com)
- Auth: role-based (Employee / Manager / Admin)

## Core data model
- **Location** — North Bergen, West New York; each has a geofence radius (in
  **feet**, default 500) and/or allow-listed IP(s) for clock-in verification
- **Employee** — name, role, assigned location(s), employment status, pay type,
  hire date, `external_id` (nullable, for future EMR linkage)
- **Shift** — employee, date, start/end time, location — built by managers in the
  scheduler
- **TimeEntry** — clock in/out timestamps, method (web / mobile / kiosk), captured
  geolocation or IP, linked shift (if any), flags (late, early, manually edited,
  missing punch)
- **PTORequest** — employee, type, date range, status, approver, notes
- **OnboardingChecklist** / **OffboardingChecklist** — reusable templates plus a
  per-employee instance with task status (I-9 verified, W-4 collected, handbook
  signoff, equipment return, access revocation, etc.). Tasks record **that** a
  step was done and by whom — see *Data this app does not hold*, below
- **EmployeeCredential** — licences and certifications, tracked by expiry date so
  nothing lapses unnoticed. Dates only
- **PayrollExport** — export batch record: date range, target system, status,
  generated file reference (for audit trail / re-export)

## Data this app does not hold
Decided in September 2026, after the checklists were built with document upload
and it was taken back out.

This is a timekeeping app, not a payroll or HR system. It deliberately stores:
- **no social security numbers**, and no identity numbers of any kind
- **no personnel documents** — no I-9, no W-4, no signed handbook, no licence
  scans. The checklist records that the step was done; the paperwork stays in the
  personnel file, where the practice already keeps it and already controls it
- **no licence numbers** — the credential screen holds the expiry date, which is
  the thing a manager actually needs to act on

Nothing is uploaded to the app, with **one deliberate exception**: a
**profile photo** of yourself (confirmed by Dominguez, September 2026). The
browser crops it square, shrinks it to 256 px and re-encodes it as a small
JPEG — which drops the camera's metadata, location included — and the server
accepts nothing else. It is removable by its owner any time, and by an admin.
Apart from that, the only files the app stores are the payroll export
spreadsheets it generates itself.

**Captured clock-in location** is kept, because it is the point of a browser
punch, but on a short leash: never returned with a timesheet, readable one entry
at a time by an admin and logged when it is, and deleted by the nightly job
after 90 days. Staff-facing wording is drafted in `docs/location-disclosure.md`
and still needs a read by whoever advises on employment matters.

The reasoning: this is the app people open on their phones and on a shared
front-desk tablet. Putting the practice's most sensitive records behind that is
a large risk for no benefit — none of it was needed to answer "who was here, for
how long, and is the new hire set up yet".

Two guards keep it that way, because the easy way to undo it is one harmless-
looking column: `apps/api/src/common/no-sensitive-data.spec.ts` reads the schema
and fails if such a field reappears, and the browser suites assert there is no
file input anywhere.

## Clock-in methods (all three, from day one)
1. **Web / mobile browser** — browser geolocation API checks the employee is within
   the geofence radius of an assigned location before allowing clock-in. Requires a
   consent disclosure (add to employee handbook/policy — flag this as a to-do, not
   something to build silently).
2. **Kiosk mode** — a tablet/PC at the front desk of each location, in a
   location-bound kiosk session; employees clock in via PIN or badge tap. No
   geolocation needed since the device itself is location-bound. Likely the most
   reliable method day-to-day.
3. **IP allow-listing** per location as a secondary/fallback check for web clock-ins.

## Payroll export (ADP now, others later)
Build this as an **adapter/plugin pattern**, not a hardcoded ADP integration:
- A `PayrollExporter` interface with one method (e.g. `export(dateRange, employees)`)
  that each provider implements.
- First adapter: **ADP TotalSource** (confirmed). TotalSource is a PEO product —
  there is no simple self-serve public API for pushing timesheets into it. The
  realistic path is a **CSV export** built to ADP's required column layout/pay
  codes. Before building the adapter:
  - Contact ADP (or whoever manages the Domi Healthcare TotalSource account) to
    activate the "Time Sheet Import" feature and get the company/client code.
  - Get the specific earning/pay codes ADP expects, so hours map to the right
    codes in the export.
  - Confirm whether TotalSource (PEO) uses a different file spec than standalone
    ADP Run/Workforce Now — it sometimes does.
  Build the exporter to generate this CSV on demand from approved timesheets;
  treat it as a manual-download-then-upload-to-ADP flow unless/until an API path
  is confirmed to exist.
- Design so adding a second provider (Gusto, QuickBooks Payroll, Paychex, etc.) later
  means writing a new adapter, not touching the core timesheet logic.
- Every export should be logged (`PayrollExport` record) so it can be re-run or
  audited.

## Build phasing
1. **Phase 1 (launch priority):** employee accounts + roles, clock in/out (web +
   mobile + kiosk) with location verification, timesheet view, manager shift
   scheduler, ADP export.
2. **Phase 2:** PTO requests + manager approval workflow.
3. **Phase 3:** onboarding/offboarding checklists (task tracking only — no
   document upload; see *Data this app does not hold*).
4. **Phase 4 — from timeclock to staff platform** (confirmed by Dominguez,
   September 2026). Timekeeping stays the main job; these sit around it.
   Staff now see it as **"Domi Staff"** — "Sign in to clock in, check your
   schedule and keep up with the team." on the sign-in screen and in the tab
   title, and — since September 2026 — in emails, the calendar feed, the
   export spreadsheet and the first-run setup page too. The repo, the
   `@stafftime/*` packages and the Vercel project keep their old names.
   - **Announcements** — admins write, edit and remove posts. Seen only after
     sign-in, never on the public login page. There is **always exactly one
     primary** post while any exist: it is shown at the top of the home screen,
     ticking another moves it, it cannot be unticked without choosing another,
     and if it is deleted the newest remaining post takes over. All posts are
     listed on a **News** page, newest first, like a blog.
   - **Job roles and resources** — **managers** (and admins) keep the list of
     job roles and who is in each; the starting list is Front Desk, Medical
     Assistant, Provider, Administrative, Manager. Somebody can hold **several**
     (front desk staff who also work as MAs; providers who also do admin work).
     A job role decides which resources somebody sees and **nothing else** — it
     is separate from the Employee / Manager / Admin access level, so being in
     "Administrative" or "Manager" grants no power in the app. Each job role has a
     resources section: **links** (Drive, ADP, vendor portals) and **pages
     written in the app**. No uploads for now; uploads may come later, but that
     would be a deliberate reversal of *Data this app does not hold*, not a
     quiet addition.
   - **Staff directory and who's on now** — name, work email, **phone number**
     (confirmed fine to show colleagues), job roles and locations; nothing from
     the personnel side. "In now" comes from live clock-ins; colleagues see
     where somebody is, managers also see since when.
   - **Availability** — staff set their own, **every week** (a weekday, all day
     or between two times) or **on one date**; no approval. A change only
     reaches weeks whose rota is **not yet published** — a published week is
     fixed. The scheduler warns (never refuses) when a shift lands on one, next
     to the overtime warning. Managers read everybody's but do not change it.
   - **Pulse surveys and anonymous feedback** — **truly anonymous**: answers
     are stored with no person and no time, so nobody (admins included) can
     find out who said what. The app does record *that* somebody took part,
     separately and unlinked, so nobody answers twice. Results appear only
     once a survey is **closed** and at least **3** people answered. Managers
     write surveys (1–5 rating, pick one, written answer) for everyone, one job
     role or one location. The suggestion box is always open and keeps only
     the message and the day it arrived.
   - **Look and help** (September 2026) — Domi Healthcare's blue (#3A6888)
     throughout; job roles each wear a colour managers pick from a fixed,
     colour-blind-checked set of eight; a **Help** page (account menu) with a
     staff guide and a managers guide. The practice's logo, from the website,
     is on the sign-in screen, in the header, on the kiosk and as the favicon.
   - **Profiles** (September 2026) — "Your profile" in the account menu:
     photo, the name you go by, pronouns, phone and a one-line "about you",
     all shown to colleagues in the Directory. Legal name, email, access,
     job roles and offices are shown but are the practice's to change.
   - **Manager dashboard** (Manage → Dashboard, managers and admins) — this
     week's hours worked against scheduled, overtime, late clock-ins and time
     off; hours worked per week by location as a chart; a week-by-week table;
     and, looking ahead, shifts in the next two weeks that clash with somebody's
     availability or push them into overtime. Built from data the app already
     holds, by the same rules as the timesheet, scheduler and payroll export.

## Where it has got to (September 2026)

All three phases are built, and **deployed and live** on Vercel against a Neon
Postgres, at `https://stafftime-ap.vercel.app` — verified 22 September 2026:
health endpoint OK, demo data loaded, sign-in working, and the deployed
security headers (CSP, HSTS, `X-Frame-Options`) all present on the production
bundle. `main` is the test environment for manager review; `APP_ENVIRONMENT` is
`test`, so `/config` reports `isTestEnvironment: true` and a standing banner
sits on every screen.

Still to do on the deployment, in `DEPLOY.md`:

- ~~`staff.domihealthcare.com` does not exist yet~~ — **done, 22 September
  2026.** The CNAME points at `6eb32dbe408d7769.vercel-dns-017.com`, the
  certificate is issued, and the app answers on the real address: `/api/health`
  OK, `/api/config` reporting the test environment, sign-in returning 200. The
  Vercel URL `stafftime-ap.vercel.app` still works alongside it.
- **The geofence pins are still the seeded placeholders** (North Bergen
  40.804/-74.012, West New York 40.7878/-74.0143), carried straight from
  `prisma/seed.ts` — the addresses were typed in but the coordinates were
  never captured. With a 500 ft radius an approximate pin can refuse somebody
  standing at their own front desk. Fix by standing at each office and
  pressing **Use my current location** on the Locations screen.
- **`SETUP_TOKEN` should be deleted** from the Vercel environment variables
  now that the first admin exists, and the Neon password rotated.

Beyond the phases, the parts worth knowing about before picking up work:

- **Payroll export** is an adapter (`PayrollExporter`). The spreadsheet exporter
  works and every run is recorded so it can be re-downloaded exactly as it went
  out. **The ADP TotalSource import file is built** (September 2026) to ADP's
  instructions: an admin pastes a worksheet exported from TotalSource into
  Practice settings (only its `!` header/footer rows and column names are
  kept), enters the company code, picks the regular/overtime columns, and
  gives each person their ADP File # on the Staff screen; the export then
  writes `PRcccEPI.csv`. **Not set up on the live site yet**, and one test
  import checked in TotalSource should come before anybody is paid from it —
  see `docs/open-questions.md`.
- **Hours already sent to payroll are protected** from a careless edit: a
  correction is allowed but has to be deliberate, and is then flagged until it
  reaches a later run.
- **Licence and certification expiry**, dates only (see *Data this app does not
  hold*), chased by the nightly round-up.
- **A nightly round-up** of what needs a look — lapsing licences, overdue
  checklist tasks, undecided time off, punches with no clock-out, kiosk tablets
  that have gone quiet, next week still unpublished, hours nobody has approved,
  shifts for people who have left. The same nine lists appear as banners on the
  screens where each thing gets fixed, from one service, so the email and the
  app cannot disagree. Managers can turn the email off; nothing is lost by it.
  **Needs an email provider configured before any of it sends.**
- **The rota** (September 2026): the Schedule week is a table — a row per
  person, a column per day — shown for everyone, by location or by job role,
  with filters. **Open shifts** (`Shift.employeeId` null, optional
  `jobRoleId`) are slots an office needs covered: made singly or repeating
  ("Nobody yet", with how many each day), flagged on the rota, in the banner
  and the nightly round-up (next 14 days) until somebody is put in them, and
  left out of scheduled hours, overtime and the dashboard. Staff see only
  their own row. Chosen by Dominguez from three renderings.
- **The scheduler** does a week (for building, on a laptop) and a month (for
  staff checking when they are on, often on a phone), warns when the rota puts
  somebody past the overtime threshold in a week, and syncs to Google, Apple or
  Outlook calendars by private subscription URL.
- **Demo data** loads from a button (account menu → Practice settings), not
  only from a terminal — whoever sets a deployment up is in a browser. Admin
  only, and refuses unless `APP_ENVIRONMENT` is `test`: it replaces every shift
  and punch, and every demo account shares one password.
- **`PracticeSettings`** holds the numbers the practice sets for itself: the
  overtime threshold (40) and how many days before a week starts an unpublished
  rota gets chased (4). Both were constants until Dominguez asked for them to be
  adjustable; the defaults are confirmed. It also holds the **pay period
  start** — pay is every two weeks, confirmed September 2026 — which drives
  the "this / last pay period" shortcuts on the Timesheet and Export. **Not
  entered yet**: an admin sets it under Practice settings.
- **Tests**: ~540 unit tests, and ~220 end-to-end checks in `tests/browser`
  driven against a real API, a real Postgres and a real Chromium. Both run in CI
  on every push. The convention is to run the browser suites twice — once
  against the dev server, once against `vite preview`, which applies the
  deployed security headers.

`docs/architecture.md` is the long version, and explains *why* for anything
surprising. `docs/open-questions.md` is what is still waiting on a decision, and
`docs/manager-review.md` is written for the managers rather than for us.

## Ways of working
- Confirm scope and data accuracy before drafting deliverables — don't build ahead
  of confirmed requirements.
- Prefer iterative discovery: try things, report findings back, refine the
  architecture from there rather than over-planning up front.
- Dominguez is a beginner with dev tooling/version control — handle git
  conversationally, keep full context documented in this file (and docs/ as it
  grows) so sessions can resume without re-explanation.

## Open questions to confirm before/during Phase 1
- Get ADP TotalSource company/client code and pay/earning codes from ADP before
  finalizing the CSV export column mapping.
- Kiosk device: dedicated tablet per location, or a shared front-desk PC?
- Geofence radius per location (how tight should "at work" be)? Defaults to
  500 ft; needs confirming by standing at the far corner of each office.
