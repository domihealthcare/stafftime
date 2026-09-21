# Architecture notes — Phase 1 backend

Running record of what was built and why. Update as the project grows.

## Stack

NestJS + Prisma + PostgreSQL, matching Domi EMR conventions so a future merge
stays cheap. npm workspaces monorepo: `apps/api` today, `apps/web` next.

## Data model

Four core tables plus one join table. Deliberately excludes PTO, checklists and
payroll export — those arrive with their own phases rather than being guessed at
now.

### Location
Holds both clock-in verification mechanisms: a geofence (`latitude`,
`longitude`, `geofenceRadiusMeters`) and an `allowedIps` list. Each location
carries its own IANA `timezone` so reporting stays correct if Domi ever opens
somewhere outside New Jersey — all timestamps themselves are stored in UTC.

### Employee
`externalId` is the EMR linkage hook from the brief: nullable today, unique when
set, so staff records can be matched to EMR staff/provider records later without
a migration. Kiosk credentials (`pinHash`, `badgeId`) live here; the PIN is only
ever stored scrypt-hashed and is never returned by the API.

Employees are never hard-deleted — terminating sets `employmentStatus` so old
timesheets stay attributable.

### EmployeeLocation
Many-to-many: an employee may work both offices. **Clock-in is only permitted at
an assigned location**, so this table is a permission boundary, not just metadata.

### Shift
Manager-built schedule entries. Overlapping shifts for the same employee are
rejected. Published shifts are cancelled rather than deleted so staff who already
saw the schedule have a record of the change; drafts are deleted outright.

### TimeEntry
One row per clock-in/out pair. Every punch records **how it was submitted**
(`method`: WEB / MOBILE / KIOSK) and **how presence was proven**
(`clockInVerification` / `clockOutVerification`: GEOFENCE / IP_ALLOWLIST / KIOSK /
MANUAL), plus the raw captured coordinates and IP.

That separation matters: a disputed timesheet can be reconstructed months later,
and the `MANUAL` value makes manager-corrected punches obvious rather than
indistinguishable from real ones. Manager edits require a reason and record who
made them (`editedById`, `editedAt`, `editReason`).

## Clock-in verification

`LocationVerificationService` is a pure decision function — it takes everything
it needs as arguments and returns a verdict instead of touching the database.
That keeps the rules exhaustively unit-testable, which is why it is the most
thoroughly tested part of the codebase.

Order of proof for a web/mobile punch:

1. Browser geolocation inside the geofence → `GEOFENCE`
2. Request IP on the location's allow-list → `IP_ALLOWLIST`

A kiosk punch needs neither: the device is bound to the location.

Two rules worth knowing about:

- **A GPS fix reporting accuracy wider than twice the geofence is not trusted.**
  A "±400m" fix cannot prove presence inside a 150m circle. Such a punch falls
  through to the IP check. The multiplier is a guess and is flagged for tuning
  once there are real readings from both offices.
- **A failed clock-OUT never blocks the punch.** It is recorded, marked `MANUAL`
  and flagged `NEEDS_REVIEW` for a manager. Trapping someone on the clock because
  their phone lost GPS in the parking lot would be worse than an entry to review.

Clock-in runs in a `Serializable` transaction: checking for an existing open
punch and inserting the new one must be atomic, or a double-tapped button leaves
someone clocked in twice.

## Auth (stubbed)

`DevAuthGuard` trusts an `x-dev-employee-id` header. This is **not**
authentication — it exists so the API is usable before login is built. Env
validation refuses to boot with `AUTH_MODE=dev` under `NODE_ENV=production`.

The contract around it is already final: guards populate `request.user`, routes
declare requirements with `@Roles(...)`, and `@CurrentUser()` reads the caller.
Swapping in a JWT strategy replaces one guard and touches no call sites.

`ADMIN` implicitly passes every `@Roles` check. Employees listing shifts or time
entries are silently scoped to their own records rather than being refused.

## Decisions worth revisiting

- **No partial unique index on open time entries.** Postgres could enforce "one
  open entry per employee" with a partial index, but Prisma cannot express one,
  and a hand-written index gets dropped by the next generated migration. The
  serializable transaction covers the same race without that footgun.
- **Location coordinates are `Decimal(9,6)`** (~11cm precision). Prisma returns
  these as `Decimal` objects, converted to numbers at the verification boundary.
