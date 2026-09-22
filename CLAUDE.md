# Domi Time & Scheduling — Project Brief

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
- **Location** — North Bergen, West New York; each has a geofence radius and/or
  allow-listed IP(s) for clock-in verification
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

Nothing is uploaded to the app at all. The only files it stores are the payroll
export spreadsheets it generates itself.

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

## Where it has got to (September 2026)

All three phases are built and running against a real database, but **not yet
deployed** — `staff.domihealthcare.com` is still waiting on the Vercel and Neon
setup in `DEPLOY.md`. `main` is intended as a test environment for manager
review; `APP_ENVIRONMENT=test` puts a standing banner on every screen.

Beyond the phases, the parts worth knowing about before picking up work:

- **Payroll export** is an adapter (`PayrollExporter`). The spreadsheet exporter
  works and every run is recorded so it can be re-downloaded exactly as it went
  out. The ADP TotalSource adapter is registered but refuses, naming what it is
  waiting for — see *Payroll export*, above, for what to get from ADP.
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
  adjustable; the defaults are confirmed.
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
- Geofence radius per location (how tight should "at work" be)?
