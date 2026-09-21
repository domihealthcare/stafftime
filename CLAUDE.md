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
  per-employee instance with task status and document uploads (I-9, W-4, handbook
  signoff, equipment return, access revocation, etc.)
- **PayrollExport** — export batch record: date range, target system, status,
  generated file reference (for audit trail / re-export)

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
3. **Phase 3:** onboarding/offboarding checklists with document upload.

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
