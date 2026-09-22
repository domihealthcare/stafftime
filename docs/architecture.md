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

## Kiosk mode

A tablet or front-desk PC bound to one location. The device itself is the proof
of where a punch happened, which is why a kiosk punch needs no geolocation —
and why the binding is the whole security model.

### Two credentials, neither sufficient alone

A kiosk punch needs **the device** and **the person**:

- The device holds a long-lived opaque token (httpOnly cookie, SHA-256 stored).
  It proves "this tablet is North Bergen's" and nothing else.
- The person enters a PIN, every single time.

`KioskDeviceGuard` is deliberately separate from `SessionAuthGuard`. A kiosk
token cannot read a timesheet, list staff beyond its own location, or act as
anybody — verified by test. That matters because the tablet sits unattended on a
counter: whoever picks it up gets the device credential for free, and it must be
worth as little as possible on its own.

### Pairing

An admin creates the kiosk in the web app and gets a ten-character code, shown
once. On the tablet, `/kiosk` takes that code and exchanges it for the device
token.

The code exists so nobody types a 43-character token on a tablet keyboard. It is
single-use (cleared the instant it is redeemed), expires in 15 minutes, stored
only as a hash, and drawn from an alphabet with no O/0, I/1, S/5 or Z/2 — because
it gets read aloud across a room.

A device stops working the moment it is revoked, and also if its location is
deactivated or has kiosk mode switched off. Nothing needs to reach the tablet
for that to take effect.

### PINs

A PIN has almost no entropy, so it gets three layers rather than one:

1. **Policy.** Stricter than the password rules: no repeated digits, no
   consecutive runs, no repeated short patterns (`1212`), no plausible years,
   and a list of keypad favourites. `1234`, `0000`, `2580` and `1995` are all
   refused.
2. **argon2id**, same as passwords. Overkill for four digits on its own, which
   is why it is not on its own.
3. **Lockout** after 5 wrong attempts for 10 minutes — tighter than the
   password limits, and tracked in separate columns so fumbling the keypad at
   the front desk never locks someone out of the web app.

### What the keypad will not tell you

A wrong PIN, an unknown employee, and an employee with no PIN set all return the
identical message, and the unknown case still pays for one argon2 verification
so timing does not answer either. Employment status is checked only after the
PIN is proven. The staff list is scoped to the device's own location, so a
tablet cannot be used to read the whole practice roster.

### The punch itself

One request does PIN check and punch together. There is no intermediate "PIN
accepted" state for the next person to walk up and inherit — which is the
failure mode of a kiosk that logs you in and then waits.

Direction is a toggle: an open entry means clock out, otherwise clock in. The
confirmation auto-dismisses after four seconds, and an abandoned PIN screen
clears itself after thirty, so a shared tablet never sits showing someone else's
name and a half-typed PIN.

### Decisions worth revisiting

- **The staff list is visible on the tablet.** It is how you tap your own name,
  and it is the standard time-clock pattern, but it does show who works at that
  location to anyone standing at the desk. The alternative — typing an employee
  number — is slower for a practice this size. Worth revisiting if the tablet
  ends up somewhere more public than the back of the front desk.
- **Badge tap is not built.** The schema stores `badgeId` and a USB badge reader
  behaves like a keyboard, so it is a small addition — but it cannot be written
  responsibly without a reader in hand to test against. See
  `docs/open-questions.md`.

## Timesheet export

A spreadsheet of hours for a period, built to be useful on its own while the ADP
adapter waits on pay codes — and shaped so that adapter slots in beside it
rather than replacing it.

`TimesheetExportService` turns entries into rows and totals; `workbook.ts`
renders them. Splitting those two means the ADP CSV, when it comes, reuses the
aggregation and only writes a different file.

### Details that matter to whoever opens the file

- **Times are rendered in the location's timezone**, not UTC and not the
  exporting manager's. The sheet should match the clock the employee was
  actually looking at.
- **Hours are numbers, not text**, with a `0.00` format and a live `SUM` formula
  at the foot. Whoever receives it can sort, filter and total without cleaning
  anything up.
- **The Summary sheet carries its own provenance** — period, location, generated
  timestamp, entry count — so a printed copy still says what it covers.
- **Open entries are excluded by default.** They have no hours to pay, and
  including them silently would understate a total that looks complete. When
  included, they are counted as zero and the note says so.

### Overtime

Optional, and computed **per calendar week** rather than across the period: 45
hours one week and 35 the next is five hours of overtime, not zero. Weeks start
Monday in the location's timezone, so a late Sunday shift lands in the right one.

Salaried staff are never split, on the assumption they are exempt.

**That assumption needs confirming.** Pay type is a reasonable proxy for exempt
status but it is not the legal test, and this is the kind of thing that is
expensive to get wrong. Flagged in `docs/open-questions.md`.

### Column selection

The catalogue lives in `apps/api/src/exports/columns.ts` and is served to the
web app at `GET /exports/columns`, so the checkboxes and the writer cannot drift
apart. Adding a column is one entry in that array plus a case in the row builder.

## Locations admin

The screen that decides whether clock-in works at all. Built phone-first,
because the only reliable way to get a geofence right is to stand at the front
desk and read the coordinates off the device in your hand — hence **Use my
current location**, which fills the form and reports how far the reading is from
what is currently saved, but never saves on its own.

Saving updates that one location in the page's state rather than reloading the
list. Reloading unmounted the cards, which threw away the confirmation and any
unsaved edits sitting in the other location's form.

## Saved reports

A named set of export options — "Biweekly payroll", "North Bergen overtime" —
so a recurring export is one tap rather than fifteen checkboxes.

The options are stored as a JSON column rather than as columns of their own,
because they are the export screen's shape and every new option would otherwise
be a migration. The trade-off is that the database cannot vouch for them, so
they are **re-validated against the export DTO on the way out**: a stale preset
saved before a column was renamed fails cleanly with "re-save it from the export
screen" rather than producing a broken file.

The period is deliberately **not** saved. A payroll export is almost always "the
last fortnight", not one specific fortnight, so applying a preset leaves
whatever dates are on screen alone.

Presets can be shared, which is the point for a practice this size: the admin
sets up "the payroll export" once and every manager runs the same one. The owner
or an admin can edit or delete; other managers can only use it.

## PTO

Phase 2 of the brief: requests and an approval workflow. Balances and accrual are
deliberately absent — how Domi accrues PTO is not settled, and guessing it would
be worse than leaving it out. See `docs/open-questions.md`.

### Dates are days, not timestamps

`startDate` and `endDate` are `@db.Date`, parsed and rendered at UTC midnight.
"The 3rd to the 7th" means those calendar days wherever the employee happens to
be, and there is no timezone that can shift them by one. Half days are a flag on
a single-day request rather than a pretend time.

### The rules worth knowing

- **Overlapping requests are refused**, counting only pending and approved ones —
  a denied request should not block a second attempt at the same week.
- **Nobody decides their own request**, managers included. The error points them
  at another manager or an admin.
- **Denying requires a reason**, which is shown to the employee. "No" without a
  reason is how a request turns into a conversation nobody has a record of.
- **Requests are never deleted.** Withdrawing or cancelling sets a status and a
  timestamp, because an approved absence that later gets cancelled is exactly
  the thing someone needs to look back at.
- **Time off that has already passed cannot be cancelled** — that would quietly
  rewrite history. A manager corrects the timesheet instead.
- **Approving does not touch the schedule.** The review screen shows shifts
  already booked inside the dates so a manager knows what needs re-covering, but
  nothing is cancelled automatically: deciding who covers is a human judgement.

## PTO policy and balances

The practice's rules are a row in the database, not constants: they are a policy
decision Domi owns and they will change. Defaults are the starting point Anthony
gave — **15 days PTO, 5 sick days, 5 days carried over** — and an admin edits
them on the Time off screen. Everyone else sees the same numbers read-only,
because staff should be able to check what they are entitled to without asking.

### What draws on what

`VACATION` and `PERSONAL` come out of the PTO allowance; `SICK` has its own;
`BEREAVEMENT`, `UNPAID` and `OTHER` are recorded but deducted from neither.
Whether personal days *should* share the PTO allowance is a handbook decision —
flagged in `docs/open-questions.md`.

### Carry-over

Worked out by walking forward from the hire year: each year's unused days,
capped by the policy, become the next year's carry-over, and that carry-over
feeds the year after. Capping at each step is what stops four untouched years
becoming sixty days. The walk starts at the hire date, so it is bounded.

Sick days do not carry by default (`sickCarryoverDays` is 0), but the practice
can turn it on.

### Proration

A mid-year starter gets the share of the policy year they are present for. On by
default, because granting someone hired in December a full fifteen days is
clearly wrong; the practice can switch it off.

### Balances never block

A request that would exceed the allowance is **warned about, not refused** — on
the employee's form and on the manager's card. Going over happens, and whether
it is allowed is a manager's judgement, not a rule the software should enforce
silently.

Pending requests count against the balance as well as approved ones, so the same
day cannot be spent twice while a decision is outstanding.

### The policy year

January to December by default, configurable to a fiscal year. The balance shown
is for one policy year, so the request form only compares against it when the
requested dates fall inside — booking next June against this year's remaining
days would be plainly wrong, so it says which year the request lands in instead.

## Deployment

`vercel.json` and `api/index.ts` set up a single Vercel project that serves the
built web app as static files and routes `/api/*` to the NestJS app running as
one serverless function.

One project, one origin. That is not incidental: the session cookie is
`sameSite=lax`, which is what removes the need for CSRF tokens, and that only
works if the browser sees the API and the app on the same host.

The Nest app is cached per warm instance — booting it and opening a database
connection on every request would be slow and would exhaust Postgres
connections. Two connection strings are needed: a pooled one for the app, and a
direct one for migrations, which cannot run through a pooler.

Step-by-step instructions are in `DEPLOY.md`.

## First-run setup

A new deployment has no accounts and no sign-up page, so the only way in would
be a command line pointed at the production database. That is a real obstacle
for whoever is setting the practice up, so the first administrator can be
created from the browser instead.

Three things keep it from being a back door:

1. It does nothing unless `SETUP_TOKEN` is set, and the route reports itself as
   absent when it is not. No token, no setup.
2. It refuses the moment any administrator exists — checked **before** the token
   is compared, so a second attempt cannot be used to probe a guess.
3. The token is compared in constant time, and the password goes through the
   same policy as any other.

Creating the account also issues a session, because whoever just proved the
token and chose the password should not then be asked to type it again.

`npm run create-admin` still exists for anyone who prefers a terminal.

## Staff administration

Adding people is an admin screen rather than a seed script, because a real
deployment needs it on day one: add someone, set their role and locations, issue
a temporary password.

Temporary passwords are **shown once, on screen, after being set** — there is no
email to send them through, so the admin reads it out. The screen says as much,
and says to use a different channel from the one carrying the link.

Terminating is a status change, never a delete, so timesheets stay attributable.
An admin cannot terminate themselves, which would lock the practice out of its
own administration.
