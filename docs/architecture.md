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

### Working from home

A manager can mark a shift **work from home** (`Shift.isRemote`). While the
person has a *published* one on — from `REMOTE_EARLY_MINUTES` (30) before it
starts until it ends — `TimeEntriesService.clockIn` skips the office check
altogether and records the punch as `REMOTE`: the shift's location (so reports
and payroll still attribute it to an office), and **no coordinates and no IP**,
even if the browser sent them. Clocking out of a `REMOTE` entry is likewise
unchecked and unrecorded. Chosen by Dominguez in September 2026 over a
standing per-person "may work from home" flag, because it keeps the rule to
one place a manager already looks: the rota. Outside such a shift the ordinary
geofence/IP rules apply, so a remote punch cannot be claimed on a day somebody
is due in. The kiosk never takes this path — it is at an office by definition.

The web page asks for no position during a work-from-home shift
(`ClockPage`), and says so under the button; `tests/browser/wfh.mjs` fails if
it does.

Two rules worth knowing about:

**The radius is stored and entered in feet**; the distance maths is metric
underneath and converts once, at the comparison
(`common/util/distance.util.ts`). Storing the unit somebody types avoids the
alternative, where 500 feet is saved as 152 metres and read back as 499, which
looks like the app losing their input. The migration that introduced this
*converted* the existing values rather than relabelling them — a rename alone
would have reinterpreted 150 metres as 150 feet and shrunk every geofence to
under a third, refusing staff at their own front desk. There is a test that
fails if the radius is ever compared against metres again; the other geofence
tests all pass either way, which is why it had to be written deliberately.

- **A GPS fix reporting accuracy wider than twice the geofence is not trusted.**
  A "±1300 ft" fix cannot prove presence inside a 500 ft circle. Such a punch
  falls through to the IP check. The multiplier is a guess and is flagged for
  tuning once there are real readings from both offices.

  This is why the radius has a floor of 50 ft and why tightening it below a few
  hundred feet is counterproductive: a smaller radius does not make clock-in
  stricter, it makes the accuracy rule reject more fixes, and a rejected fix
  falls through to the IP check rather than failing closed.
- **A failed clock-OUT never blocks the punch.** It is recorded, marked `MANUAL`
  and flagged `NEEDS_REVIEW` for a manager. Trapping someone on the clock because
  their phone lost GPS in the parking lot would be worse than an entry to review.

### Two taps at once

Both punches are written under a guard, and both guards have been watched to
fail — `tests/browser/race.mjs` fires genuinely concurrent requests at the real
API against real Postgres, because that is the only place a race exists. A unit
test with a mocked client cannot have one.

**Clock-in** runs in a `Serializable` transaction: checking for an existing open
punch and inserting the new one must be atomic. Dropped to `ReadCommitted`, six
of eight simultaneous punches were accepted — and the damage was sticky rather
than cosmetic. Each later clock-out closed exactly one of the six, so the
employee was refused every clock-in for days until somebody noticed and cleaned
up by hand. "Clocked in twice" undersells it: the clock jams.

**Clock-out** is a compare-and-set — `updateMany` with `clockOutAt: null` in the
where clause, and a `ConflictException` when it matches nothing. It used to be a
plain `update` on an id read a few lines earlier, and eight simultaneous taps
were eight writes to the same row, each stamping its own clock-out time over the
last. The hours barely moved, since the writes were milliseconds apart, but each
one carried its own *verification* result too: a punch made from the car park,
correctly recorded `MANUAL` and flagged `NEEDS_REVIEW`, could be overwritten by a
tap that happened to land afterwards from inside the geofence, and the flag
simply vanished. That is the check the third case in `race.mjs` makes — the row
on file must be exactly what the one accepted response said.

The loser of either race gets the same answer a slow second tap would get a
minute later, rather than a different one because it arrived a millisecond
earlier.

### What happens to the captured position

Capturing a coordinate is what makes a browser clock-in mean anything. Keeping
it is a different question, and the answer is three rules.

**It is not part of a timesheet.** The query behind every list of entries is an
explicit `select` that does not name the coordinate or IP columns. It used to be
an `include`, which returns every scalar on the row — so the position of every
punch went out with every timesheet, to every screen, and nothing on any screen
ever read one. That is the worst kind of exposure: all of the risk, none of the
use. Adding a field to `TIME_ENTRY_SELECT` is how it would come back.

**Reading one is a deliberate act.** `GET /api/time-entries/:id/location` is the
only route that returns coordinates: one entry, admin-only, and the read is
written to the server log. The honest reason to want them is a disputed punch,
and a dispute is about one punch. "I looked up where you were on the 3rd" should
leave a trace.

**They expire.** The nightly job clears coordinates, accuracy and IP off punches
older than 90 days. The punch survives — the time, the location it was
attributed to, and what the check concluded — so *was this punch verified?* is
answerable forever while *where exactly were they standing?* is answerable for a
quarter. `time-entries/location-retention.ts` argues the number: a dispute
happens within a pay period or two, and what is left after that is a map of
where each member of staff was on each morning, for as long as the app runs.

The lookup route distinguishes "cleared for age" from "never captured", because
a kiosk punch has no coordinates and never did, and reporting that as *cleared*
would send somebody looking for data that never existed.

`docs/location-disclosure.md` has the staff-facing side: what is captured, and
draft handbook wording.

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

**At least 8 characters, including a number** — Dominguez's choice in
September 2026. It replaced a 12-character minimum whose advice ("three
unrelated words") did not suit the practice. No symbol or capital is required:
those produce `Password1!` and sticky notes, which is why NIST dropped them.

The rule lives in `PasswordService` (`PASSWORD_RULE`, `MIN_LENGTH`) and, for the
screens' "not yet" hint only, in `apps/web/src/lib/password.ts`; the server
always decides. `create-admin` uses the same check.

The blocklist does the real work, on the **stem** — digits and punctuation are
stripped before comparison — because a minimum length does not prevent
`password1`, it invites it. Also rejected: keyboard and counting runs, digits alone, too few
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

**Who sets it** (Dominguez, September 2026): the person, on their profile
(`PUT /profile/pin`), confirming with their current password so a session left
open on a shared computer cannot be used to change it. Managers and admins can
set a replacement for somebody who has forgotten theirs (`PUT
/kiosk/employees/:id/pin`, from the Directory), never read one. The profile
answers only `hasPin` and `pinUpdatedAt`; the hash never leaves the service.

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

### A week to build one, a month to see its shape

The Schedule screen does both. The week view is where shifts are added and
removed; the month view is an overview, and a day in it is a way back to that
week.

**The month is drawn as whole Monday-to-Sunday weeks**, so every row has seven
days and the month sits inside it — four rows for a February that starts on a
Monday, six for a month that straddles. The days either side are shown but
dimmed: a shift on the 1st matters whichever row it lands in.

**It shows who is on.** This is mostly a staff screen — a manager builds the
rota a week at a time on a laptop; an employee opens the month to see which days
they are working, on a phone. So the square lists first names for a manager, who
is looking at everybody, and times for an employee, who only ever sees their own
shifts and would otherwise read their own name forty times.

At phone width a square is about forty pixels of text, where "1pm–9pm"
truncates to "1p…" and tells nobody anything. So the narrow rendering is the
start time alone, which still answers the question somebody opened the month to
ask — am I on at nine or at one — with the full range in the `aria-label` and
one tap away in the week. Three lines per day, then "+2 more".

**The chosen view is remembered** in `localStorage`, because whichever one you
want you tend to want every time: a manager lives in the week, somebody checking
their own shifts lives in the month, and neither should re-pick it after each
trip to another screen. Every touch of storage is guarded — it throws in a
private window — and the default stands if it fails.

**The day-by-day coverage strip stays a week thing.** A month of those squares
would be a second, worse calendar next to the real one. The overtime warning
appears in both views, from the same component, at the top of the page:
overtime is a per-week question either way, and a month view that quietly used
a different rule would be worse than one that said nothing.

`monthGrid` in `lib/format.ts` builds the range. It is worth reading the note on
`addMonths` next to it: `setMonth` on the 31st rolls into the month after next,
and a schedule that skips February is a memorable bug.

### Warning about overtime while the rota is being built

The coverage strip answers "is anybody scheduled?"; this answers "is anybody
scheduled too much?", at the moment a manager can still do something about it
rather than a fortnight later when the payroll export splits the hours.

Two details are the whole feature, and either one taken literally turns the
warning off in exactly the case it exists for.

**The whole week counts, not the window on screen.** A manager looking at
Thursday and Friday still needs Monday to Wednesday in the total, or adding a
sixth day looks free. The overtime query therefore widens to the Monday of the
first week and the Sunday of the last, whatever window was asked for.

**Every location counts, not the one being viewed.** Somebody on 24 hours at
North Bergen and 20 at West New York is on 44 for the week, and a per-location
view is precisely where that goes unnoticed. The hours are totalled across the
practice even when the screen is filtered, and `spansLocations` tells the screen
to say so — otherwise the number looks wrong to whoever is reading it.

Weeks start Monday in the location's timezone, using the same `weekStartIn` as
the payroll export. That sharing is deliberate: a rota that predicts overtime
and an export that reports it must not disagree about where a week begins, and a
late Sunday shift has to land in the week the person experienced rather than the
week UTC puts it in.

**The threshold is the practice's**, in `PracticeSettings`, not a constant.
Forty is the federal line and a sensible default, but it was a default nobody
had been asked about. The payroll export splits at the same number and the
spreadsheet's notes sheet states it, so the rota, the export and the file cannot
say three different things.

#### Making it hard to miss (September 2026)

Dominguez asked for the overtime alerts to be more visible, and for the person
being scheduled to be told as well. Where it used to be one amber box under the
coverage squares at the foot of the page, it is now:

- **Before saving.** `GET /shifts/overtime-check` answers "where does this
  person's week land with this shift in it?" — same counting rules as above,
  in `OvertimeService`. The add-shift form, the rota's quick-add and the Assign
  control call it as they are filled in and show a red (over) or amber (close)
  box inside the form. Pressing save asks again, fresh, and if the shift puts
  somebody over, a confirmation pop-up asks the manager to say so. A warning
  with a way through, never a refusal, like the availability warning.
- **On the week.** A red banner above the rota (not below it), and a badge in
  each person's Week total — red "4 h overtime", amber "2 h to overtime". The
  badge uses the server's per-person figure, so a row filtered to one office
  still shows the week as a whole.
- **Close to overtime** is within `NEAR_OVERTIME_HOURS` (4) of the line,
  inclusive — one late finish away. A constant for now, as the threshold was
  before somebody asked to move it. Coverage returns these as `nearOvertime`,
  separately from `overtime`, and the screens say them more quietly.
- **Repeating shifts and Copy last week** report anybody they put over with
  their result, since a month of Tuesdays reaches weeks nobody is looking at.
- **The person is told.** `GET /shifts/my-overtime` lists their own coming
  weeks (six ahead) that their **published** shifts put over or close;
  it shows on Clock and Schedule. And when a published change first takes a
  week over the line — a new shift, an assignment, a move, publishing a draft,
  a repeating or copied rota published straight away — they are emailed once.
  The check compares published hours before and after the change
  (`snapshot` / `announceNewOvertime`), so a week already over does not email
  again and drafts email nobody. Fire and forget, like every notification.

The coverage response carries the threshold it applied, rather than the screen
assuming one. That is not theoretical tidiness: the warning text hardcoded
"past 40 hours" and kept saying it after the setting moved to 20 — the API was
right and the screen was confidently wrong. A browser check for the setting
caught it.

**Scheduled hours, not worked ones.** This is a question about a rota being
built, and mixing in actual punches would make the number impossible to explain
— "why does it say 41 when I scheduled 38?". The screen says which it is. The
gap is real, though: somebody who stayed late every day this week can cross forty
without the rota ever showing it. Noted in `docs/open-questions.md`.

Hourly staff only, matching the export, with the same caveat — pay type is a
reasonable proxy for exempt status and is not the legal test.

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

Optional here, and computed **per calendar week** rather than across the period: 45
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

## Test environments

`APP_ENVIRONMENT` is `production` by default, so a deployment is only ever a
test environment on purpose — never by forgetting to set something. Set it to
`test` and every screen carries a standing amber banner saying nothing there is
real.

The banner sits above the router, so it appears on the sign-in screen and the
kiosk too. Those are exactly where someone could mistake a review deployment
for the one their hours are recorded in, and the kiosk in particular is a device
a member of staff walks up to without context.

`GET /api/config` is public for the same reason: the banner has to render before
anyone signs in.

## Calendar syncing

Each employee can generate a private subscription URL carrying their published
shifts and approved time off. One iCalendar feed covers Google Calendar, Apple
Calendar and Outlook, which is why this is one feature rather than three
integrations — and why it is a *subscription* rather than a download: a shift
added next month appears without anyone doing anything.

### The token is the credential

A calendar app cannot send a cookie or an auth header, so the unguessable token
in the path is what authenticates the request. That is how Google's own secret
iCal addresses work, and it means the URL must be treated as a password. The
screen says so plainly, and offers **Regenerate** — which rotates the token and
breaks the old URL everywhere — and **Turn off**.

The feed is scoped to one employee, and stops working the moment they are
terminated, like their sign-in.

### What goes in it

Published shifts only. A draft is a manager's working copy, and putting
provisional shifts on somebody's personal calendar would be worse than putting
nothing there.

Approved time off appears as all-day events marked `TRANSPARENT`, so it does not
make the person look busy to anything reading their availability.

The window is bounded — 60 days back, a year forward — so the feed stays small
for an app polling it hourly.

### The format details that actually matter

`apps/api/src/calendar/ical.ts` is hand-rolled rather than pulled from a
library, because the subset needed is small and the rules that break real
calendar apps are few: CRLF endings everywhere, lines folded at 75 **octets**
with continuations starting with a space, `,` `;` `\` and newlines escaped
inside TEXT values, and a stable `UID` per record with a `SEQUENCE` derived from
`updatedAt` so an edited shift replaces rather than duplicates.

Folding counts octets, not characters, so a multi-byte character is never split
across the boundary.

All-day `DTEND` is **exclusive**: time off from the 3rd to the 7th inclusive is
written as `DTSTART:20261103` / `DTEND:20261108`. Getting that wrong silently
loses the last day, which is why there is a test for it.

The output is verified both by unit tests and by parsing a real generated feed
with `ical.js` — a strict third-party parser — so the check is "would a calendar
app accept this", not "does it look right to us".

## Shift planning

`apps/api/src/shifts/shift-planning.service.ts` sits beside the plain
create/update/delete of `ShiftsService` and handles the three things a manager
actually does when building a schedule: repeat a shift across a date range,
copy one week's rota into another, and check whether a week is covered.

### Rotas are rows, not rules

`POST /api/shifts/repeat` materialises one `Shift` row per date. It does not
store a recurrence rule.

Storing the rule would be tidier and is what a calendar app does, but it makes
every other feature harder: a timesheet has to expand the rule before it can
match a punch to a shift, an exception (someone covers one Thursday) becomes a
second concept, and editing one day means splitting the series. Rows are boring
and every existing query already understands them. If a manager wants to change
next month, they delete those shifts and make new ones.

The guards are there because "repeat this" is easy to point at a decade:
`MAX_GENERATED_SHIFTS = 200` and `MAX_SPAN_DAYS = 400`, both refused up front
rather than part-way through.

### Conflicts are skipped and reported

A rota that runs into an existing shift, or into approved time off, does not
fail and does not silently overwrite. The conflicting dates are skipped, and the
response says which and why:

```ts
type SkipReason = 'OVERLAPS_SHIFT' | 'ON_APPROVED_LEAVE';
interface PlanResult { created: number; skipped: PlannedSkip[]; dates: string[]; }
```

The web app shows that list. A manager asking for a month of Tuesdays and
getting 3 instead of 4 needs to know which Tuesday is missing — "created: 3" on
its own is worse than an error.

Re-running the same rota is therefore safe and idempotent-ish: everything is
skipped as `OVERLAPS_SHIFT`, nothing is duplicated.

### Copy week rebuilds from wall-clock time

`POST /api/shifts/copy-week` does **not** add seven days of milliseconds to each
timestamp. It reads each source shift's local start and end time, then rebuilds
that time on the target date in the location's timezone.

Adding 604800000ms across a clock change moves a 9am shift to 8am or 10am. Staff
read the schedule as "I'm on at nine", so nine is what gets copied. Overnight
shifts keep their length via an `endOffset` in days, so a 10pm–6am shift still
ends the following morning.

### Coverage answers a different question

`GET /api/shifts/coverage` files each shift under its **local** date, not its
UTC date — otherwise an evening shift lands on tomorrow. Per day it reports
scheduled hours, who is on, who is away on approved leave, and whether a
scheduled shift clashes with approved leave (`conflictsWithLeave`).

That last flag exists because approving time off deliberately does not cancel
shifts (see the PTO notes) — somebody has to reassign the cover, and this is
where they find out they haven't.

### Timezone arithmetic

All of the above needs wall-clock-to-UTC conversion that survives DST, which is
`apps/api/src/common/util/zoned-time.util.ts`. It measures a zone's offset at an
instant using `Intl.DateTimeFormat` and converts in two passes: guess with the
offset at the naive instant, then re-measure at the guess and correct. One pass
is wrong for times near a transition.

No timezone library is pulled in for this. The whole file is under 150 lines,
`Intl` is already in Node, and a dependency here would be carrying a database of
every zone's history to answer "what is 9am in America/New_York".

## Onboarding and offboarding checklists

Phase 3. A `ChecklistTemplate` is a reusable list of tasks; an
`EmployeeChecklist` is one person's copy of it.

The lists track **that** a step was done, by whom and when. They deliberately do
not hold the paperwork those steps produce — see *What a checklist does not
hold*, below.

### Instances are snapshots, not references

Starting a checklist copies the template's tasks — title, description, owner,
due offset — into `EmployeeChecklistTask` rows. The template
is kept as `templateId` for provenance and nothing else.

Referencing the template instead would be less data and much worse: reword "sign
the 2026 handbook" to say 2027 and you have silently rewritten what forty people
already acknowledged. A signed acknowledgement of a document nobody can name any
more is worth nothing in an audit, and these are records the practice is legally
required to keep. So the template is editable precisely because the copies are
not affected.

The checklist's `name` is copied for the same reason: retiring a template must
not leave someone's finished onboarding pointing at nothing.

### One open checklist of each kind per person

A second unfinished onboarding checklist for the same employee is refused. Two
lists means two people ticking off the same I-9 with neither knowing the other
did it, which is exactly the failure a checklist exists to prevent. Finished
ones do not block a new one — a rehire gets a fresh list.

### Due dates hang off an anchor

Each template task carries `dueOffsetDays` relative to an anchor: the hire date
for onboarding, the last day for offboarding. An offer letter is -7, an I-9 is
+3, a 30-day check-in is +30. The anchor can be given explicitly when the
record's own dates are not right yet — a start date that has not been entered.

Offboarding refuses to guess: no termination date and no explicit anchor means
an error saying to set one, rather than quietly anchoring to today.

All of this arithmetic is UTC-midnight dates via
`common/util/calendar-date.util.ts`, so a due date cannot drift a day when the
clocks change or when the server is in a different zone from the practice.

### Three task states, not two

`PENDING`, `DONE`, `NOT_APPLICABLE`. The third exists because "CPR card on file"
does not apply to the receptionist, and leaving it pending forever means the
checklist never completes and nobody can tell an unfinished list from a finished
one. Marking something not applicable **requires** a reason — a skipped
compliance task with no explanation is worse than an unfinished one.

Completion is derived, not set: the checklist is stamped `completedAt` exactly
when nothing is left `PENDING`, and un-stamped if a task is reopened.

### What a checklist does not hold

An earlier version of this let you attach the I-9, the W-4 and the signed
handbook to the tasks, and stored the bytes. That was removed on purpose.

This is a timekeeping app. It answers "who was here, and for how long" — and, on
these screens, "has the new hire been set up yet". The documents an onboarding
produces are the most sensitive records a practice holds: an I-9 or a W-4 carries
a social security number. Holding them here meant a clock-in app, used from
phones on the shop floor and from a shared tablet at the front desk, was also the
place a breach would be worth having. The personnel file — wherever the practice
already keeps it, and however it is already controlled — is the right home for
that, and it does not need a second copy.

So the task says "Form I-9 completed and verified", it records who verified it
and when, and the form stays where personnel records live. The checklist is a
better checklist for it: the question "is the paperwork done" is answered by a
tick either way, and the thing that made it risky is gone.

The same reasoning removed the licence number and the licence scan from
credentials (see *Licence and certification expiry*), which now hold dates only.

Two guards keep it that way, because the easy way to undo this is to add one
column in a pull request that looks harmless:

- `src/common/no-sensitive-data.spec.ts` reads `schema.prisma` and fails if an
  identity number, a stored document or a `requiresDocument` flag reappears on
  the employee or credential models.
- The browser suites assert that no `input[type=file]` exists on the checklist
  or credential screens at all.

### File storage is an adapter

`src/storage` is the same shape as the payroll exporter the brief asks for: a
narrow `FileStorage` interface (`put`, `get`, `delete`) with two
implementations.

**One caller: payroll exports.** Nothing is uploaded to this app. The only bytes
it stores are the spreadsheets it generates itself, kept so a run can be
re-downloaded exactly as it went to payroll rather than re-derived from today's
data.

**`DatabaseFileStorage` is the default**, and at this scale it is the right
default. An export is a few hundred kilobytes and there are twenty-six of them a
year. Keeping them in Postgres means they inherit the database's backups, access
control and encryption at rest; there is no second account to set up and no
bucket policy to get wrong; and a database restore restores the export history
with it. Bytes live in their own `stored_files` table with no foreign key back to
the export record, so the adapter stays a storage backend and listing the export
history never drags file contents into memory.

There is no public URL for one either: a timesheet names everybody who works here
and what they were paid for, and a long random link is a bearer token that never
expires and cannot be revoked except by deleting the file. `FileStorage` has no
method that returns a URL, so no backend is ever asked for one.

**`LocalDiskFileStorage`** exists to prove the seam is real and is genuinely
useful for local work — you can open the folder. It is wrong for Vercel, where
the filesystem is ephemeral and per-instance.

Keys are `2026/09/` plus 16 random bytes. Nothing from the file's own name goes
into them: a key built from a filename is how you end up serving `../../.env`.
Every backend validates the key against that pattern before touching anything,
and the disk backend additionally confirms the resolved path is still inside its
root.

Clearing an export's file clears the metadata pointer first and the bytes second.
The other order leaves a record whose file has gone, which looks like data loss;
this order leaves unreferenced bytes, which is recoverable garbage and which the
nightly sweep collects.

The database stops being sensible somewhere around a few gigabytes. That is what
the interface is for — S3 or a blob store is one class.

## Hardening

### Per-address sign-in throttling

Account lockout (8 failures, then 15 minutes) stops someone grinding away at one
person's password. It does nothing about the other shape of attack: one common
password tried against every address in turn, which never reaches any single
account's limit.

The obvious fix — "N failures per IP" — is wrong for this practice, because both
offices sit behind one address each. Twenty people fumbling their passwords on a
Monday morning are one address with a lot of failures, and locking the whole
front desk out of the clock is a worse outage than the attack it prevents.

So `auth/login-throttle.service.ts` counts **how many different accounts** an
address has failed against, inside a rolling window. Spraying is many accounts
with few attempts each. A bad Monday is few accounts with many attempts each,
which account lockout already handles. A deliberately high raw-failure ceiling
sits behind it for degenerate cases.

The defaults — ten accounts inside ten minutes — sit above what a practice of
twenty could plausibly fumble and below what working through a staff list looks
like. Two properties make the tradeoff acceptable:

- **The kiosk is unaffected.** Punches go through `/api/kiosk/punch` with a PIN
  and never touch the sign-in route, so a throttled office can still clock
  people in at the front desk.
- **The refusal reveals nothing.** A 429 saying "too many failed sign-ins from
  this connection" says nothing about whether any of those addresses exist.

The counters live in `login_attempts` in the database, not in memory, because
production is serverless: an in-memory counter lives in one instance and the
attacker's next request lands in another. The email is stored hashed — the
throttle needs to know how many different accounts were targeted, not which, and
a plaintext column would be a standing list of who somebody tried to sign in as.

### Scheduled housekeeping

`GET /api/maintenance/purge`, called daily by Vercel Cron (`vercel.json`). It
removes expired sessions, throttle rows past the window, kiosk pairing codes
that expired unused (an unused code is still a live credential), and file bytes
that no export record references any more.

There is nobody signed in when a cron fires, so the route cannot sit behind the
session guard. It is authorised with `CRON_SECRET` compared in constant time,
the way Vercel sends it (`Authorization: Bearer …`). **With no `CRON_SECRET`
configured the route refuses everything**, rather than falling open — a
maintenance endpoint that opens when a variable is missing is worse than not
having one.

The orphaned-file sweep leaves anything younger than an hour alone, since it may
belong to an export that is mid-flight between the storage write and the record.
Its keep-list must name every model that holds a `storageKey`: miss one and the
sweep quietly deletes live files an hour after they are written. There is a test
for exactly that.

### Response headers

The web app's headers are set in `vercel.json`: `nosniff`, `X-Frame-Options:
DENY`, `Referrer-Policy: no-referrer`, a `Permissions-Policy` that keeps
geolocation (clock-in needs it) and drops camera, microphone and payment, and a
Content-Security-Policy that allows scripts, styles and images only from the
app's own origin.

`no-referrer` is not the usual default and is deliberate: the app puts a
calendar subscription URL on screen, and that URL is a credential. A referrer
header is a quiet way for one to end up in somebody else's logs.

The API sets its own equivalents in `main.ts`, because Vercel's header rules do
not apply once a request is inside the function.

A wrong CSP turns the whole app into a blank page, and the deployment is the
worst place to find that out. So `vite.config.ts` **reads the headers out of
`vercel.json`** and serves them from `vite preview`, which serves the real
production bundle. `npm run preview` then gives a local copy of the deployed
configuration, and the browser suites can be pointed at it with
`BASE_URL=http://127.0.0.1:4173` — which is how the policy was checked, rather
than by reading it and hoping. Downloads (blob URLs), geolocation and the kiosk
all work under it.

### The policy is one row, and the database enforces it

`PtoPolicyService.get()` creates the policy on first read, so a fresh
deployment starts with sensible defaults rather than nothing. That used to be a
plain read-then-create, which is a race: the Time off screen asks for the policy
and for a balance at the same moment, and a balance needs the policy too, so the
very first page load is two concurrent creates. Twenty concurrent first reads
produced **eighteen** policy rows when measured against real Postgres.

Nothing failed loudly. `findFirst` picked whichever row sorted first, so an
admin's edit landed on one row while later reads came back from another, and the
practice's PTO rules silently reverted. It surfaced as an intermittently failing
browser check — the sort was only unstable when two rows shared a `createdAt`
millisecond.

The fix is a `singleton` column that is always 1 and unique, so a second row
cannot exist. `get()` reads by that key, creates when there is nothing, and
treats a duplicate-key error as having lost the race — it re-reads the winner's
row rather than failing. `update()` writes by the same key rather than by an id
it read a moment earlier.

The migration collapses any duplicates a deployment already has before adding
the constraint, keeping the most recently updated row as the practice's latest
intent.

## Demo data for a review

`npm run db:demo` (`apps/api/prisma/demo.ts`) fills the app with a plausible
five weeks: eight more staff across the two offices, rotas, punches that are
mostly fine and occasionally not, time off in every state, somebody over forty
hours so the overtime column has something in it, and a checklist part-way
through.

It exists because an empty timesheet tells a practice manager nothing, and
"imagine there were hours here" is not a review.

Three things about how it is built:

- **It is deterministic.** The jitter on each punch comes from a fixed-seed
  generator, so two people looking at the app are looking at the same data.
- **It is a reset, not an addition.** Every shift, punch, time-off request and
  checklist is cleared first. A generated week next to leftovers from somebody's
  experiments is harder to read than either alone. Locations, accounts and
  checklist templates are left alone — those belong to `db:seed`, and a reviewer
  may have set real geofence coordinates.
- **It refuses to run against production.** `APP_ENVIRONMENT` must not be
  `production` unless `ALLOW_DEMO_DATA=yes-really` is set as well. It deletes
  real hours and creates accounts sharing one well-known password; that is not
  something to do by pasting the wrong connection string.

The data is deliberately imperfect: somebody late, somebody who left early,
somebody who forgot to clock out, one entry a manager corrected with the reason
recorded. The whole point is to see what the flagged cases look like.

`docs/manager-review.md` is the walkthrough that goes with it, written for the
managers rather than for a developer.

## Phones

Half of this app is used on a phone: clocking in at the desk, a manager
approving hours between patients, an admin setting a geofence while standing at
the front door. `tests/browser/phone.mjs` runs the whole app at 390px wide — the
narrowest phone anyone at the practice is likely to have.

The check that matters is **horizontal overflow**. A page wider than the window
means the entire layout slides sideways under a thumb, which makes everything
feel broken even where it works. A table that scrolls inside its own box is
fine; the page itself scrolling is not. The suite measures
`documentElement.scrollWidth` against `clientWidth` on every screen and names
the offending elements when it finds a difference.

Two things it caught:

- **The navigation ran off the edge of every signed-in screen.** An admin has
  nine destinations in a single non-wrapping flex row, so every page scrolled to
  807px in a 390px window. It now wraps onto two or three rows. A hamburger menu
  would be tidier and worse: this is an app where "Clock" should be one tap, and
  hiding eight of nine destinations behind a button to save a few pixels of
  header is the wrong trade.
- **The checklist task actions could not shrink**, because the block holding the
  file picker was `shrink-0`. On a phone the actions now sit under the task
  rather than beside it.

### The timesheet is a table or a list, depending on room

Below `sm` the timesheet renders each entry as a card instead of a row. Eight
columns do not fit on a phone, and the alternative — a sideways-scrolling table
— puts **Approve** furthest from the thumb when approving is the entire job.

Both layouts are always in the DOM, one hidden by CSS. That matters when writing
a check against this screen: `getByText(...).first()` resolves to the hidden
copy, which never becomes visible and times out. Ask for
`.locator('visible=true').first()` instead.

### Editing a template

The task list is sent **whole** on every save rather than patched task by task.
A checklist is read as a list, so it is edited as a list, and reordering is then
just moving an item rather than renumbering everything around it. The server
deletes the template's tasks and recreates them inside one transaction.

That would be reckless if instances referenced templates. They do not — they are
snapshots — so nothing already under way can be disturbed by it. The editor says
so on screen, because an admin about to reword "sign the 2026 handbook" needs to
know they are not rewriting what forty people already signed. There is a browser
check that starts a checklist, rewords the template underneath it, and asserts
the running checklist kept its original wording.

`dueOffsetDays` is stored as a signed number of days, but nobody thinks in
signed numbers. The editor splits it into a direction and a count — *before the
start date*, *after the last day*, *on the day*, *whenever* — and the wording
follows the template's kind, since an onboarding checklist hangs off a start
date and an offboarding one off a last day.

Templates are **retired**, never deleted, so a finished checklist can still say
where it came from. Retiring also clears the default flag; if that leaves the
practice with no default for that kind, starting a checklist says so plainly
rather than failing.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to every branch. Two jobs:

- **checks** — lint, typecheck, unit tests and a production build. No database,
  because the unit tests do not need one, so it comes back quickly.
- **browser** — a Postgres service container, the schema built from the
  migration chain, both apps built, the API started, and every browser suite.

The browser job deliberately runs against **`vite preview`**, not the dev
server. That serves the real production bundle with the real security headers —
`vite.config.ts` reads them out of `vercel.json` — so a Content-Security-Policy
that breaks the app fails in CI rather than on the practice's phones. It is also
the closest thing to what Vercel serves.

Building the schema with `prisma migrate deploy` from empty is a test in its own
right: it proves the whole migration chain still applies in order, including the
hand-written parts (the PTO policy singleton migration collapses duplicates
before adding its constraint, and that SQL has to work on an empty table too).

Screenshots and per-suite logs upload as an artifact on every run, pass or fail.
A browser check that fails only in CI is otherwise almost impossible to read.

`run-all.sh` takes `PGHOST_LOCAL`, `PGPORT_LOCAL`, `PGUSER_LOCAL` and
`PGDATABASE_LOCAL`, which is how the same script serves both a laptop on port
5433 and a service container on 5432.

## Email

Another adapter, the same shape as the payroll exporter and the file storage:
one narrow `EmailSender` interface in `src/email`, an implementation per
provider, and nothing else in the app knows which is in use.

Sending is **best effort by contract**. Implementations log rather than throw,
callers do not await, and `NotificationsService` catches. An approval that
failed because a mail server hiccuped would be a far worse bug than a missing
notification.

Note that `void somePromise()` is *not* enough to make something fire and
forget: an unhandled rejection takes the Node process down, so a mail provider
having a bad afternoon would stop the practice clocking in. Every call site
attaches a `.catch`. There is a test for it, which is how the bug was found.

### The default is "write it to the log"

`LogEmailSender` is what runs with no provider configured, and that is
deliberate: sending real mail needs an account, a verified domain and DNS
records, none of which should be a prerequisite for running the app locally. A
developer testing a password reset copies the link out of the terminal.

In production it warns on **every message** that nothing was sent, because a
silent non-delivery that looks like success is the worst outcome available.

`ResendEmailSender` is the real one — plain `fetch` to one HTTP endpoint rather
than an SDK, since a dependency wrapping one POST is a dependency to keep up to
date for no benefit, and it keeps the serverless bundle small. HTTP rather than
SMTP because the app runs as a serverless function, where outbound SMTP is slow
at best and blocked at worst. It has its own timeout, so a provider that never
answers cannot hold a function open until the platform kills it.

Mail from a test deployment is prefixed `[Test]` in the subject line, where
somebody sees it before opening anything.

## Password reset

`POST /api/auth/forgot-password` always answers the same way — *"If that address
belongs to a Domi account, a reset link is on its way."* — whether the address
exists, belongs to somebody who has left, or has asked five times this hour.
Anything else on an unauthenticated form is a way to find out who works at the
practice. There is a browser check that compares the two answers character for
character.

The token is 32 random bytes, url-safe, and **only its SHA-256 is stored**, for
the same reason session tokens are: a database dump must not hand somebody a
working link into every account.

Links last 30 minutes and are single use. Spending one also spends every other
outstanding link for that account — asking twice and using the first should not
leave the second working.

Expired, spent, never-existed and belongs-to-somebody-who-left all produce
**one** message. Distinguishing them tells an attacker which guesses were close.

Completing a reset signs out every session on the account, including the browser
doing the resetting. If the reason for the reset was that somebody else had the
old password, leaving their session alive defeats the exercise — so the screen
says so rather than letting it be a surprise.

Rate limited at five links per account per hour, so the form cannot be used to
bombard a colleague's inbox, and the per-address sign-in throttle covers the
rest.

### How it is tested without a mail server

The browser suite reads the link out of the server log, which is where the
default sender writes it. That tests the real path, and it is the same way a
developer gets the link locally.

The tempting alternative — returning the link in the HTTP response when
`APP_ENVIRONMENT` is `test` — was rejected. One mistyped environment variable on
a real deployment would make every account takeable by anyone who knows an
address.

## Who gets told what

- **Somebody asks for time off** → every active manager and admin, except the
  person who asked. Until now a request could sit for a week because nobody
  went and looked.
- **A request is decided** → the person who asked, with the manager's name and
  their reason. An approval also says that shifts already on the schedule are
  still there, because approving leave deliberately does not cancel them.
- **A password reset is requested** → the link, to an address that may not
  belong to anybody. The service decides that and never says either way.

Dates in emails are rendered in UTC from the `@db.Date` values, for the same
reason the app does: a day is a day wherever you read it.

## Payroll export

The brief asks for two things here, and they were the last parts of the core
data model still missing: a `PayrollExporter` interface so a new provider is a
new adapter, and a `PayrollExport` record for every run so one can be audited or
repeated.

### The adapter

`src/exports/payroll/payroll-exporter.ts`. The aggregation — who worked, for how
long, what counts as overtime — happens once in `TimesheetExportService` and is
handed over already done. An exporter's whole job is layout: which columns, in
what order, with which pay codes. Adding Gusto or Paychex later is one class and
one line in the module.

Two are registered. `SpreadsheetExporter` is the general-purpose one.
`AdpTotalSourceExporter` builds TotalSource's payroll import file — see below.
Each says whether it is ready (`readiness()`), and one that is not is shown on
the screen greyed out with its reason rather than left out: a target the
practice still has to set up is easier to finish when the app names what is
missing where it would be used.

### ADP TotalSource

Built to ADP's instructions, *Importing Payroll into ADP TotalSource*. Those are
unusual: the import is not a CSV we lay out ourselves but one that **starts
from a worksheet exported out of the practice's own TotalSource account**. The
export's first three rows are headers marked with `!` — among them the row of
field names, which must begin Co Code, Batch ID, File # — then one row per
employee, then footer rows from the next `!`. Only the rows between the markers
may be edited. The file is named `PRcccEPI` after the company code.

So an admin pastes that exported worksheet into Practice settings once
(`AdpSettings`, one row). The server keeps the header and footer rows verbatim
and learns the column names from them; the employee rows are dropped before
anything is written — they are ADP's copy of the staff list and can carry pay
details this app has no business holding. It is a paste, not an upload: the
app takes no files (*Data this app does not hold*).

The admin then picks which columns take regular and overtime hours, from the
worksheet's own list, so nothing about Domi's paydata grid is guessed. Each
employee needs their ADP **File #** (`Employee.adpFileNumber` — ADP's staff
number, meaningless outside the account, not an identity number).

Each export writes the stored header rows, one row per person — Co Code, a
Batch ID (8 characters at most; defaults to the last day as MMDDYYYY, the shape
of ADP's example), File #, and hours in the chosen columns, every other cell
empty — then the footer rows. CRLF, no byte-order mark (ADP's first row starts
with `!`, and a BOM in front of it would hide the marker). Overtime is always
split per week for ADP, whatever the form says, and salaried staff are left out
unless the manager ticks them in. Anybody with hours and no File # stops the
export with their name: dropping their hours silently would underpay them.

The layout lives in `adp-worksheet.ts` (pure functions, unit-tested); the
exporter decides what goes in it. What ADP has not told us — which columns Domi
uses for which hours, and whether paid leave should go too — is in
`docs/open-questions.md`, and one test import checked in TotalSource before it
is submitted is the last step.

### What gets recorded

Every run writes a `PayrollExport`: the period, the target, who ran it, the
counts and total hours, the options in full so it can be repeated, and the file
itself through the `FileStorage` adapter.

Keeping the bytes matters. Re-deriving the file from the same period later would
use *today's* data, which is the one thing an audit must not do — the whole
reason to look is usually that something has since changed.

A run that fails is recorded too, with its reason. "We tried to send these hours
and could not" is part of the trail. Recording it can never replace the reason:
the screen sends instants, and until September 2026 the failure record appended
a time to one, got an invalid date, and crashed — so the manager saw "could not
produce that file" instead of, say, whose File # was missing.

Runs are **voided**, never deleted. A voided run stays readable; it is simply no
longer the one that counts.

### Which entries, not which dates

`PayrollExportEntry` links a run to the exact time entries that went into it.
The date range alone is not enough: an entry created or corrected afterwards
falls inside the same range but was not in the file, and that difference is the
whole point of asking whether hours have been paid yet.

The ids come from the same read that built the file, carried through
`TimesheetData.entryIds`. A second query could select a different set — an entry
corrected between the two — and the record of what was paid would be wrong.

## Hours that have already been paid

`src/time-entries/payroll-state.ts` answers two questions about a time entry:
has it been sent to payroll, and has it changed since.

**Derived, not stored.** A flag would have to be kept in step with every edit,
every export and every void, and the one time it drifted is the time somebody
gets paid twice. Voided runs are filtered out in the query, so an entry whose
only run was voided reads as never sent.

It lives in its own file because two features need the same rule — the
timesheet, to refuse a careless correction, and the export preview, to count
corrections that have not reached payroll. Two copies would eventually disagree,
and the disagreement would be about somebody's pay.

### Correcting paid hours

Refusing outright would be worse than allowing it: the database would stay wrong
forever, and the mistake is usually exactly what needs fixing. But changing a
number that has already gone to payroll, with nobody noticing, leaves the
spreadsheet and this app quietly disagreeing.

So the first attempt is refused with `ALREADY_EXPORTED` and the date it went
out; the dialog turns that into a warning and relabels its button *Correct it
anyway*. The second attempt carries `acknowledgeExported` and goes through. The
entry then reads as changed-since-export, and the export preview counts it —
*"1 entry has been corrected since it last went to payroll"* — so the correction
cannot be quietly forgotten before the next run.

## Licences and certifications

`EmployeeCredential` is anything with a renewal date: a state licence, a board
certification, a BLS card, a DEA registration.

Its own record rather than a field on a checklist task, because a credential
outlives the checklist it was first collected on. A licence renews every couple
of years, long after onboarding is finished, and the renewal has nowhere to go
if the only home is a one-off task.

For a medical practice this is the compliance risk that bites quietly: nobody
notices a lapsed licence until somebody asks to see it, usually at the worst
possible moment. So the screen opens on **what is about to lapse**, soonest
first, rather than on everything the practice holds — and "expiring within N
days" always includes what has already lapsed, because the one that ran out last
month is more urgent than the one running out next month, not less.

`daysUntil` is zero on the day a credential runs out, and that still counts as
valid: a licence is good until the end of the day it expires.

### Dates only

A credential record is a name, an issuer, an expiry date and a note. It used to
carry the licence number and a scan of the licence too, behind an access rule
that showed the number to an admin and the owner but not to a manager.

That rule was the tell. Once a field needs its own visibility tier, the question
worth asking is why a timekeeping app is holding it at all — and the answer was
that it did not need to. What the practice needs from this screen is *the 13th of
March*, early enough to chase. The number and the document belong in the
personnel file, where they already are.

So managers see everything a credential record now holds, and there is no tier to
get wrong. Employees still see only their own; recording and renewing stays with
managers; deleting stays with admins. `src/common/no-sensitive-data.spec.ts`
fails if the columns come back.

## Settings the practice sets for itself

`PracticeSettings` is a database-enforced singleton, the same shape as
`PtoPolicy` and for the same reason — see the note on `PtoPolicyService.get`,
where a read-then-create race produced eighteen policy rows in testing.

It holds two numbers, both of which started life as constants, and the pay
period (below):

- **`overtimeThresholdHours`** (40) — where the rota warns and the payroll
  export splits.
- **`rotaWarningDays`** (4) — how close the coming week has to be before an
  unpublished rota is chased.

Constants were the right place to start: the numbers had to come from somewhere
and nobody had an opinion yet. They moved here when it turned out both were a
guess standing in for something only the practice knows — how far ahead Domi
publishes a rota, and what it treats as too many hours. A guess that has been
overruled should not need a deploy.

Both are bounded in the DTO rather than free. Below about twenty hours the
overtime warning fires for every part-timer and stops meaning anything; above
sixty it never fires at all. Either way the setting quietly turns the feature
off, which is not what somebody adjusting a number expects to have done.

Managers read them — the numbers explain what their screens are telling them —
and only an admin changes them.

### The pay period

A third setting, **`payPeriodStart`**, is a date rather than a number: the
first day of any one pay period. Domi is paid **every two weeks**, so every
other pay period follows from it by counting fortnights forwards or backwards
(`settings/pay-period.ts`). It is null until an admin enters it, and the
pay-period shortcuts stay greyed out until then, saying why — the app does not
guess which Monday a fortnight starts on, because a guess that is a week out
would put every export one week wrong.

The server works out the current and previous pay period (`GET
/settings/pay-period`, in the practice's time zone) rather than each screen
doing the sum, so the Timesheet and the Export cannot disagree about which
fortnight "last pay period" means. The length is a constant, not a setting:
nobody has asked for weekly or twice-monthly, and twice-monthly is not a fixed
number of days anyway.

### Date shortcuts

Screens that show a period — Timesheet and Export — share one picker
(`components/DateRangePicker.tsx`): this week, last week, this or last pay
period, this or last month, and Custom for two dates. The arrows step by the
same kind of period — a month moves a month, anything else moves by its own
length, so stepping back from a pay period lands on the one before. The
Timesheet opens on this week, as it always has; the Export opens on the last
pay period once one is set, since that is what gets exported.

## What needs a look

`AttentionService` is the one place that answers "what does somebody need to
deal with?" — nine lists of ready-to-read lines. It is read twice: by the
nightly email, and by the banners on the screens.

That sharing is the point. Two implementations would drift, and the failure
would be quiet and embarrassing: an email chasing something the screen says is
fine, or the reverse.

### What it chases, and why each threshold

- **Kiosk tablets gone quiet** — paired, unrevoked, and not seen for 24 hours.
  The tablet polls while it sits on the kiosk screen, so silence is real: it is
  unplugged, off the wifi, or somebody closed the browser. A day is long enough
  that an overnight router reboot does not raise it. A tablet that has *never*
  been seen is worded differently from one that has stopped, because those are
  different problems — a setup nobody finished, versus a thing that broke.
- **Next week unpublished** — no published shifts for the coming week, from four
  days out. Drafts do not count: staff cannot see a draft, so a fully drafted
  week is indistinguishable from an empty one to the people who need to know
  when to turn up. The line says so when drafts exist, because "you wrote it,
  you just did not publish it" is a much shorter conversation. Only locations
  with published shifts in the last 28 days are chased, so a location scheduled
  some other way does not complain every night forever.
- **Shifts for people who have left** — future shifts for terminated staff,
  grouped per person. Looking forward only: a shift they actually worked is
  history, not a mistake.
- **Hours not approved** — completed punches unapproved for over a week,
  grouped per person and oldest first. These are the hours that quietly miss a
  pay run. Six unapproved shifts for one person is one thing to do, not six
  lines of email.
- Plus the four that were already there: lapsed and lapsing credentials, overdue
  checklist tasks, punches with no clock-out, undecided time off.

### Banners go where the thing gets fixed

`NeedsAttention` takes the sections that belong on the screen it is on: silent
tablets on Kiosks, the rota warnings on Schedule, unapproved hours and missing
punches on Timesheet. Deliberately not one banner listing everything on every
page — the same warning on eight screens is wallpaper, and gets scrolled past
within a week.

It is manager-only (every line names somebody) and fails quietly: a banner that
cannot load is not worth an error on a screen somebody came to for something
else.

## The nightly digest

`DigestService` runs from the maintenance job, because that is already the one
thing that happens every night whether anybody is looking or not. What goes in
it is `AttentionService`'s job — the same nine lists the banners read, so the
email and the app cannot disagree. This is only about sending it.

Three rules make it worth reading:

**It says nothing when there is nothing to say.** A daily email that is usually
empty gets filtered into a folder within a fortnight, and then the one that
matters goes there too.

**Empty sections are left out, not printed empty.** Same reason.

**It is a manager's to turn off**, not an admin's to turn off for them
(`wantsDailyDigest`, on by default). A practice with two managers and an admin
does not need all three chasing the same lapsed licence, and an unwanted daily
email is one that gets filtered — taking the one that mattered with it. Nothing
is lost by opting out: every line is also on the screen it belongs to, which is
why the banners came first. When everybody has opted out the job logs that it
had something to say and nobody to say it to, rather than emailing somebody
anyway.

Each line names the person and the thing, so the email can be acted on without
opening the app.

It cannot fail the job it runs inside. Tidying up and telling people are
separate concerns, and a mail provider having a bad night must not stop expired
sessions being cleared.

## Announcements

Admins post; everyone signed in reads. None of it is public — the login page
can be opened by anyone on the internet, so the endpoints need a session like
everything else, and the home screen shows the primary post only after sign-in.

While any post exists, **exactly one is primary**. "At most one" is a partial
unique index in the migration (Prisma cannot declare one). "At least one" is
the service's job: the first post is primary whatever the form said, the flag
is moved rather than cleared, unticking the primary is refused, and deleting
the primary hands it to the newest post left.

## Job roles and resources

`JobRole` is what somebody does (Front Desk, Medical Assistant…); `Employee.role`
is what they may do in the app (Employee / Manager / Admin). They are kept
apart on purpose. Managers keep the job-role list, and one of the starting
roles is literally called "Manager" — if job roles granted anything, tidying
that list would be a way to hand somebody the payroll export. So a job role
decides which resources somebody sees and nothing else.

Somebody can hold several (`EmployeeJobRole` is a plain join table). Staff see
the Everyone section plus their roles'; managers see every role, their own
marked. Opening another role's page by its address is refused by the API, not
just hidden by the screen.

A resource is a link or a short written page, **never a file** — see *Data this
app does not hold* in `CLAUDE.md`, and the guard in `no-sensitive-data.spec.ts`.
Links must be http(s): a `javascript:` link would run in a colleague's session.
An address pasted without a scheme is taken as https.

A job role with resources cannot be deleted until they are moved or removed:
they were written for somebody, and deleting a role should not quietly throw
that work away. Its members just stop being in it.

The Team / Manage menus in the top bar are disclosures of ordinary links, not
ARIA menus, so the links stay links to assistive tech and to the browser suites.

### Job-role colours

Each job role wears a colour, chosen by managers, so the directory and the
resources page can be scanned by eye. The colour is stored as a **key from a
fixed set of eight** (`job-roles/job-role-colours.ts`), not a free hex. The
eight are a categorical palette checked for colour-blind readers in that order
— the first five, which the starting roles wear, stay distinguishable when they
sit side by side — and a free picker would let two roles end up as near-twins.
A new role takes the first colour nobody is wearing.

The colour is only ever a dot or a stripe beside the name; the name stays in
slate. Three of the eight are below 3:1 against white, which is fine for a mark
next to a label and not for the label itself, and a colour on its own tells a
colour-blind reader nothing.

## Branding

The app uses Domi Healthcare's blue from domihealthcare.com — `#3A6888` — as
the `brand` 600 step in `tailwind.config.js`; the other steps keep its hue and
chroma and move only lightness. White on 600 is 6.0:1. Type is Avenir where the
device has it (every Apple device), as on the website, and the system face
elsewhere: Avenir is not a font the app may serve itself.

The logo is the practice's own, from domihealthcare.com ("Original on
Transparent", 5000 px square), cropped into `apps/web/public/brand/`:
`domi-healthcare.png` (roof and name) on the sign-in screen, and
`domi-mark.png` (the roof alone) beside "Domi Staff" in the header, on the
kiosk and as `favicon.png`. They are served from the app itself because the
deployed CSP only allows images from `'self'`; linking the website's image
host would be blocked, and would break the day the website changes.

## The rota and open shifts

The Schedule week is a rota table (`components/RotaTable.tsx`), chosen by
Dominguez from three renderings (a time-slot calendar, a rota table, tighter
day columns). The same week can be shown for everyone, by location (a section
per office) or by job role (a section per role, a person appearing under each
of theirs), and filtered to one office or role. Coverage sits in the day
headings rather than a box of its own.

An **open shift** is a `Shift` with no `employeeId`: a slot an office needs
covered, optionally for a job role. Making `employeeId` nullable touched every
reader of shifts, deliberately in one direction — an open shift is a *need*,
not hours anybody is down for:

- It is left out of scheduled hours (coverage, the dashboard), overtime and
  availability warnings, and nobody can clash with it or be on leave for it,
  so repeating open shifts skips those checks and can make several a day.
- Copying a week copies it open: the need recurs, the person is undecided.
- It is flagged three ways from one source: the rota's own row and count, and
  `openShifts` in the attention round-up (next 14 days), which feeds both the
  banner and the nightly email.
- Staff never see one: the API scopes a staff member's shifts to their own.
  That is a decision, not a gap (Dominguez, September 2026): open shifts are
  the managers' to fill, and there is no staff pick-up.

**Colour** carries both things a manager scans for (Dominguez asked for
"both"): the chip is tinted in its office's colour (`LOCATION_COLOURS`, in
the order offices are listed) and has a 4px stripe on the left in the job
role's colour — the shift's own role, or else the person's first. Work from
home is violet, open shifts amber, drafts a dashed outline. A key above the
table spells it out, roles included, because colour alone should never be the
only way to tell: the chip also says the office (or Home) in text, and its
accessible name says the rest.

Assigning is an ordinary update (`employeeId`), with the usual refusals —
somebody not at that office, or already on at that time; the dialog greys
those people out rather than letting the server say no. `employeeId: null`
makes a shift open again.

## Profiles and photos

"Your profile" (account menu, `/profile`) is where somebody sets how
colleagues see them: the name they go by, pronouns, a phone number, one line
about themselves, and a photo. It is the only way a phone number gets into the
app for most staff, which is why the Directory used to show so few.

**Photos are the one upload the app takes**, and a deliberate reversal of
*Data this app does not hold* (Dominguez, September 2026), kept as narrow as
it can be:

- The browser crops the picture to its centre square, draws it at 256 px and
  re-encodes it as a JPEG before it is sent. Re-encoding throws away
  everything a camera attaches — where the photo was taken included — on the
  device, not on our server.
- The server has no image library and accepts nothing it would need one for:
  a JPEG (checked by its signature and its start-of-frame marker, not its
  name), no bigger than 150 KB, between 32 and 1024 px a side
  (`profile/photo.ts`).
- It is stored in its own table, `EmployeePhoto`, which a schema test holds
  to the bytes and when they changed, and goes with the person.
- It is served only to somebody signed in, from the app's own origin (the CSP
  allows images from `'self'` only), at a URL carrying `photoUpdatedAt`, so it
  can be cached without a stale face ever showing.
- Its owner can remove it any time; an admin can remove anybody's.

## Help

`/help`, from the account menu: a guide for everyone and, for managers and
admins, a second tab for running the practice. It is plain text in the bundle,
not pages in the database, so it ships with the feature it describes and cannot
drift from it between releases — when a screen changes, change its answer in
`pages/HelpPage.tsx` in the same commit. The password answer reads the rule
from `lib/password.ts` rather than restating it.

## Staff directory

Everybody signed in can read it: it is how colleagues reach each other. It
holds work contact details — name, email, phone (Dominguez confirmed phone
numbers should be shown, September 2026), job roles and locations — and
nothing from the personnel side: no pay type, hire date or access level. People
who have left, or have not started, are not listed; somebody on leave is, marked.

**In now** is any open punch from the last 16 hours. Older than that is a
forgotten clock-out, and should not tell the front desk somebody is in who went
home yesterday — the missing punch is already chased by *What needs a look*.
Colleagues see where somebody is; only managers see when they clocked in.

## Availability

Staff say when they cannot work: a weekday every week, or one date, either all
day or between two wall-clock times at the shift's location. They set it
themselves and nobody approves it; managers can read everybody's, and cannot
change it — it is each person's statement about their own time.

**A published week is fixed** (Dominguez, September 2026). The first date a
change can touch is the day after the last week with a published shift at any
of the person's locations, and never before today. So:

- a new weekly rule starts there (`effectiveFrom`), not today;
- removing a weekly rule that has already covered a published week *ends* it
  there (`effectiveUntil`) instead of deleting it, so the published weeks keep
  saying what they said;
- a one-off date inside a published week cannot be added or removed.

"Published" is per location, not per person: somebody not on this week's rota
may still be about to be added to it.

The scheduler **warns, never refuses**, when a shift overlaps one — a manager
sometimes has to ask. The check is in `availability.rules.ts`, a pure function
over local dates and "HH:MM" times: overlap rather than containment, touching
ends allowed (a shift ending at 17:00 fits "not after 5"), and a shift past
midnight counted against its first day only.

## Surveys and the suggestion box

Promised to staff as **truly anonymous**: nobody, admins included, can find out
what a person said. Four things keep that true, and each exists because the
obvious version quietly breaks it:

- **Answers carry no person and no time.** `SurveyResponse` is an id and a
  survey; `SurveyAnswer` hangs off it. A `createdAt` would let anybody line the
  answers up against who was on their break. `no-sensitive-data.spec.ts` fails
  if a person, a timestamp, an IP or a user agent is added to either table, or
  to `Feedback`.
- **Who took part is kept apart.** `SurveyParticipant` records that Frankie has
  answered (so nobody answers twice, and managers get a count) with no link to
  the response and no time. It is written in its own transaction before the
  answers, so the two rows never share one; if saving the answers fails, the
  participation is taken back so they can try again.
- **Results wait for the survey to close, as well as for three answers.** Three
  alone is not enough: a live average that moves just after somebody says
  "done" tells a manager what they said. Closing first means nobody watches it
  move. Free-text answers come back shuffled, so their order is not a clue.
- **Staff never see the count.** A number ticking up while you watch a
  colleague put their phone down is its own clue; only managers see it.

Deleting an open survey is refused (people may be answering); a question
cannot change once a survey is sent, because the answers already given would
then mean something else.

The **suggestion box** keeps the message and the *day* it arrived — a time to
the minute says who was at the front desk. A session is needed to post, so the
box is not open to the internet, and nothing from the session is kept. The UI
warns that a very specific detail can still give somebody away; no design can
fix that.

Limits worth knowing: somebody with direct database access could in principle
correlate rows by their physical order. The promise is about the app — no
screen, report, export or log connects a person to what they said — and the
service logs "answered" without the person for the same reason.

## Manager dashboard

Read-only, managers and admins, built from punches, the rota, approved leave
and availability. The arithmetic is a pure function (`dashboard.summary.ts`)
so it can be tested without a database, and every rule in it is one the rest
of the app already uses — a number here must never disagree with the
timesheet, the scheduler or the payroll export:

- a week is Monday–Sunday **in the location's timezone**;
- hours worked come from **completed** punches; an open punch counts as a punch
  but not as hours (it is somebody still at work, or a missing clock-out that
  *What needs a look* chases);
- overtime is per person per week **across both locations**, hourly staff only,
  against the practice's own threshold — so it does not change with the
  location filter, and the screen says so;
- time off counts **weekdays**, a half day as half, and is attributed to the
  person's primary location.

"Next two weeks" reuses the scheduler's own coverage check, so availability
clashes and scheduled overtime read the same on both screens.

The chart follows the data-viz method: two series (one per location) in
categorical slots 1 and 2, validated on the white card surface; the colour is
fixed to the location, not its position, so filtering never repaints a line;
one axis; a legend always, end labels only when they would not collide; a hover
tooltip; and the week-by-week table as its table view.
