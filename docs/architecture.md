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

## Authentication

Passwords are hashed with **argon2id** at the parameters OWASP recommends
(19 MiB, 2 iterations, 1 lane — the library defaults). `@node-rs/argon2` ships
prebuilt binaries, so there is no native compilation step to fail on a deploy.

### Sessions, not tokens

A signed-in browser holds an opaque random token; the server stores only its
SHA-256. Nothing about the user is encoded in it.

This was chosen over JWTs deliberately. A JWT stays valid until it expires,
which is exactly wrong for a product whose Phase 3 is an **offboarding
checklist with access revocation**. Server-side sessions can be withdrawn the
instant someone is offboarded, and `SessionService.resolve` additionally refuses
any session whose employee is `TERMINATED` — so revocation happens even when
nobody remembers to revoke.

A session ends at its absolute expiry (12h), after an idle stretch (8h), when
revoked, or when the employee is terminated. The idle timeout is aimed squarely
at the shared front-desk browser left open overnight.

`lastUsedAt` is refreshed at most once a minute rather than on every request —
otherwise every read would carry a write.

### The cookie

`httpOnly` (a script on the page cannot read it, so an XSS bug cannot steal the
session), `sameSite=lax` (not sent cross-site, which is what blocks CSRF —
combined with same-origin hosting, no separate CSRF token is needed), and
`secure` in production.

### What a failed sign-in reveals

Nothing. A wrong password and an unknown address return the identical message,
and an unknown address still pays for one argon2 verification against a dummy
hash so the response time does not give the answer away either. The
`TERMINATED` check runs *after* the password is proven, so a former employee's
status cannot be probed with a guess.

Lockout is 8 attempts, then 15 minutes — long enough to stop online guessing,
short enough that a real person who fat-fingered their password is not calling
an admin. An admin can reset it sooner by issuing a temporary password.

### The password policy

Length, plus a blocklist. No forced symbol-and-digit mixes: those produce
`Password1!` and sticky notes, which is why NIST dropped them.

The blocklist works on the **stem** — digits and punctuation are stripped before
comparison — because a 12-character minimum does not prevent `password1234`, it
invites it. Also rejected: keyboard and counting runs, digits alone, too few
distinct characters, the practice and location names, and the user's own name or
email.

### Temporary passwords

An admin sets one for onboarding or lockout recovery. It signs the person in and
nothing more: `SessionAuthGuard` refuses every route except `me`,
`change-password` and `logout` until it is replaced, and the web app shows only
the change-password screen to match. Setting one also revokes every existing
session for that employee.

Changing your own password requires the current one — an unattended browser
should not be a takeover — and signs out every *other* browser, which is what
ends an intruder's session if the old password had leaked.

### Roles

`ADMIN` implicitly passes every `@Roles` check. Employees listing shifts or time
entries are silently scoped to their own records rather than being refused.

### Bootstrapping

There is no sign-up page, so a fresh database has no way in. `npm run
create-admin` creates the first administrator, prompting for the password with
echo disabled so it never lands in shell history or the process list.

## Decisions worth revisiting

- **No partial unique index on open time entries.** Postgres could enforce "one
  open entry per employee" with a partial index, but Prisma cannot express one,
  and a hand-written index gets dropped by the next generated migration. The
  serializable transaction covers the same race without that footgun.
- **Location coordinates are `Decimal(9,6)`** (~11cm precision). Prisma returns
  these as `Decimal` objects, converted to numbers at the verification boundary.

## Web app (apps/web)

React + Vite + Tailwind, three screens: **Clock**, **Timesheet**, **Schedule**.

The Vite dev server proxies `/api` to the NestJS server on port 3000, so the
browser sees a single origin and there is no CORS configuration to get wrong
during development. That changes at deploy time — see the to-do below.

### Where the seams are

- **`lib/api.ts`** is the only file that knows how the caller is identified. The
  session rides in an httpOnly cookie, so it attaches nothing by hand — it just
  sets `credentials: 'include'` and lets the browser do it.
- **`lib/session.tsx`** holds the signed-in employee. On load it asks
  `/auth/me` rather than assuming signed-out, so an existing cookie restores the
  session; a 401 there is the ordinary "not signed in" answer, not an error to
  show the user.
- **`lib/types.ts`** hand-mirrors the API's response shapes. This is the weakest
  seam in the app: a change on the server will not break the build, it will break
  at runtime. Generating these from the API is a tracked to-do.

### Clock screen

The screen the whole product is judged on, so the failure paths get the care:

- Geolocation is requested **inside the click handler**. Browsers only show the
  permission prompt on a user gesture, so asking on page load would silently fail.
- **A location failure does not abort the punch.** The request is still sent
  without coordinates, because the server may accept it on the office IP. Only
  the server decides.
- Refusals show the server's own sentence ("You appear to be about 1812m from
  North Bergen…") rather than a generic error, and offer the kiosk whenever the
  browser will keep refusing.
- Phones are reported as `MOBILE` and desktops as `WEB`, detected via
  `pointer: coarse`, so the timesheet can tell them apart.

### Timesheet

Employees are scoped to their own entries by the API, and the UI hides the
manager-only columns to match. Corrections require a reason of at least three
characters, and the reason is displayed on the row afterwards — the audit trail
is only worth keeping if someone can actually read it.

`<input type="datetime-local">` is given `step="1"` and fed seconds. Without
that, opening a correction dialog and saving an *untouched* field rounds the
timestamp down to the minute, which on a short punch pushes clock-out onto
clock-in and fails validation.

## Deployment to-dos (not yet done)

- **Same-origin hosting is now required, not merely convenient.** The session
  cookie is `sameSite=lax`, which is what removes the need for CSRF tokens — but
  it means the API must be served from the same origin as the web app (a Vercel
  rewrite). Splitting them across domains would force `sameSite=none` and a
  CSRF-token scheme.
- **A session cleanup job.** `SessionService.purgeExpired()` exists but nothing
  calls it yet; expired rows accumulate harmlessly until it is scheduled.
- **Vercel project setup** — build commands, the hosted `DATABASE_URL`, and
  running `prisma migrate deploy` on release.
