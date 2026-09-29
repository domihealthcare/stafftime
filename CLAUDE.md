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
  hire date (optional since September 2026 — without it time off is not
  prorated and onboarding counts from the day it starts), `external_id`
  (nullable, for future EMR linkage)
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
- **no date of birth** — a **birthday** is kept as a **month and day only**,
  never the year (decided with Dominguez, September 2026), so colleagues can
  celebrate it without an age in the app. The staff import drops the year in
  the browser, before anything is sent, and the schema guard fails on any
  other birth field

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
and still needs a read by whoever advises on employment matters. A punch during
a **work-from-home shift** records no location and no IP at all — only that it
was from home.

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
3. **IP allow-listing** per location as a secondary/fallback check for web clock-ins
   (built, but set aside for now — no addresses entered).

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
     A job role decides which resources somebody sees, which **closing
     checklist** they get at clock-out, and whether they see their own
     licenses and onboarding (Provider) — and **no power**: it is separate
     from the Employee / Manager / Admin access level, so being in
     "Administrative" or "Manager" grants nothing in the app. Each job role has a
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

All phases are built and **live** at `https://staff.domihealthcare.com`
(Vercel, against a Neon Postgres; `stafftime-ap.vercel.app` still works
alongside it). **Real use since 26 September 2026**: the test data was cleared
and `APP_ENVIRONMENT` set to `production` in Vercel, so there is no banner and
demo data and "Start using it for real" refuse. `main` deploys straight to the
real practice — every merge is a release.

How the live site is set up, for reference:

- **Domain**: a CNAME to `6eb32dbe408d7769.vercel-dns-017.com`
  (22 September 2026). The deployed security headers (CSP, HSTS,
  `X-Frame-Options`) were checked on it.
- **Geofence pins**: both offices typed in from Google Maps (24 September
  2026 — the phone's indoor fix was only good to ~315 ft). 500 ft stands; the
  far-corner test was waived (Dominguez). **Never run `npm run db:seed`
  against the live database** — it resets the pins to old placeholders.
- **IP allow-listing**: set aside (Dominguez, 25 September 2026). Built, but
  with no addresses entered it does nothing; location is the check.
- **`SETUP_TOKEN`**: deleted (25 September 2026).
- **Never edit a migration once it has been pushed** (learned 28 September
  2026). A preview build runs `prisma migrate deploy`, and the previews appear
  to share the live database. So a migration reaches the live database as soon
  as its branch is pushed, not when it is merged, and an edited migration is
  never run again. That is how the closure `kind` column went missing on the
  live site, breaking the Schedule; `20260928010000_practice_events_kind`
  repaired it. A change always goes in a new migration. Worth checking in
  Vercel whether Preview should have its own database.
- **Still to do**: rotate the Neon password (Dominguez to find time: reset in
  Neon, paste the new pooled and direct strings into `DATABASE_URL` /
  `DIRECT_DATABASE_URL`, redeploy).

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
- **License types** (29 September 2026, Dominguez): Licenses → **License
  types** is the practice's list — name, kind, renewal interval in months
  (optional), and per job role **required / optional / not needed**
  (`CredentialType`, `CredentialRequirement`). Managers keep it. Started with
  providers: medical license, CDS, DEA and malpractice insurance required;
  ACLS, BLS, Student-Athlete Cardiac Assessment Certificate, flu vaccine and
  TB test optional (flu, TB and malpractice were added without saying which —
  check). **By person** shows everybody against their job roles' list; a
  required one with **nothing on file** is on the Licenses banner and in the
  nightly email (lapsed ones were already chased). Recording one picks the
  type; with an interval, the date it was done works out the expiry. Shown
  read-only in the Staff editor, and to staff for themselves. One query
  (`credentials/standing-query.ts`) serves all of them.
- **Dashboard → Across the practice** (29 September 2026, Dominguez): below
  this week's hours — what is waiting on a manager (time off, hours to
  approve, missing clock-outs, hand entries), licenses lapsed / due in 60
  days / required not on file, surveys open or closed in 30 days with counts
  only, onboarding and offboarding progress, closing checklists in the last 7
  days and supplies to order. `GET /dashboard/practice`
  (`PracticeOverviewService`).
- **A nightly round-up** of what needs a look — lapsing licences, overdue
  checklist tasks, undecided time off, punches with no clock-out, kiosk tablets
  that have gone quiet, next week still unpublished, hours nobody has approved,
  shifts for people who have left, open shifts, closing checklists with
  something missed, supplies to order. The same lists appear as banners on the
  screens where each thing gets fixed, from one service, so the email and the
  app cannot disagree. Managers can turn the email off; nothing is lost by it.
  **Email is live** (24 September 2026): Resend, sending as
  `Domi Staff <no-reply@domihealthcare.com>`, with its DKIM and `send`/`rsend`
  records in the domain's DNS at **Wix**; a password reset was received.
  Sends are awaited, never fire-and-forget — on Vercel anything left running
  after the response is frozen, which is why the first attempt never left.
- **The rota** (September 2026): the Schedule week is a table — a row per
  person, a column per day — shown for everyone, by location or by job role,
  with filters. **Open shifts** (`Shift.employeeId` null, optional
  `jobRoleId`) are slots an office needs covered: made singly or repeating
  ("Nobody yet", with how many each day), flagged on the rota, in the banner
  and the nightly round-up (next 14 days) until somebody is put in them, and
  left out of scheduled hours, overtime and the dashboard. Staff see only
  their own row — **only managers see open shifts** (confirmed by
  Dominguez, September 2026; no staff pick-up). Chosen by Dominguez from
  three renderings. Each shift is tinted in its **office's colour** with a
  stripe in its **job role's colour** (both, as asked), with a key above.
  **Time off is in the rota** (September 2026): approved leave hatches the
  day in the person's row, an undecided request shows as "Asked off", and
  adding a shift on a day off warns first. **Print** (`/schedule/print`,
  managers) gives the week on paper, one landscape page per office:
  published shifts only, no open shifts, and time off as a bare "Off" — the
  kind of leave never goes on the wall.
- **Closing checklists** (September 2026, from the practice's Front Desk
  Checklist 2026 and MA Responsibilities): Front Desk and Medical Assistants
  get their role's checklist when they clock out, on the phone and at the
  kiosk (PIN, checklist, PIN again — nothing held on the server between).
  Front Desk picks the desk(s) worked (Check In / Outdesk); rules are shown as
  reminders, not ticked; calls answered is a number flagged under 20; supply
  ticks build a per-office **restock list** managers mark ordered. **Anybody
  can always clock out** — unticked lines and skipped checklists are recorded
  and flagged (Manage → Closing checklists, banner, nightly email), never a
  gate. Ticks and numbers only, no free text (schema guard enforces it).
  Managers edit the lists in the app; `src/closing/default-checklists.ts` is
  only the starting point. **Licenses and Onboarding & Offboarding** moved off
  the top bar: under Manage for managers/admins, under Team ("Your licenses",
  "Your onboarding") for roles with `seesOwnPersonnelTabs` (Provider); Front
  Desk and MA staff do not see them.
- **Work from home** (September 2026): a manager marks a shift work from home
  (`Shift.isRemote`). While a published one is on — from 30 minutes before it
  starts until it ends — the person clocks in from anywhere, no location asked
  for or recorded; the punch is `REMOTE` ("Work from home" on the timesheet
  and in the Directory). Otherwise the usual office check applies. Chosen over
  a standing per-person permission. Since 29 September 2026 (Dominguez) it
  is picked as **Work from home** in the shift forms' Location list, not a
  tick box beside an office; the shift is counted under the person's main
  office (`homeOfficeOf`, `components/PlaceSelect.tsx`). The ＋ on the rota
  can also **repeat** a shift (the same as Repeating shifts, from that day).
- **Tablet PINs are chosen by staff** on their profile (confirmed with their
  password); the profile shows only that one is set and since when, never the
  PIN. Managers and admins can set a replacement from the Directory, never
  read one (decided September 2026).
- **Regular shifts** (September 2026, Dominguez: "I always work Mondays"):
  Repeating shifts → **No end date** makes a `ShiftSeries`; its shifts are
  written out 8 weeks ahead (`STANDING_DAYS_AHEAD`) and the nightly job
  writes the next ones, from the day after the last written, so a shift
  removed by hand stays removed. Listed under Schedule → **Regular shifts**,
  stopped there from a chosen last day (later shifts cancelled or deleted,
  person told once).
- **Weeks start on Sunday on screen** (September 2026, Dominguez): week
  view, month, printed rota, "This week" shortcuts, weekday pickers.
  Display only.
- **Overtime weeks follow the pay period** (September 2026, Dominguez): each
  two-week pay period is two overtime weeks starting on the pay period's
  weekday (`workweekStartsOn`), for the rota warnings, dashboard and payroll
  export alike; Monday until a pay period date is set. Still 40 **a week**,
  not 80 a fortnight (federal and NJ law). Practice settings shows the day.
- **The scheduler** does a week (for building, on a laptop) and a month (for
  staff checking when they are on, often on a phone), warns when the rota puts
  somebody past the overtime threshold in a week, and syncs to Google, Apple or
  Outlook calendars by private subscription URL.
- **Overtime alerts made hard to miss** (asked for by Dominguez, September
  2026): red banner above the rota and a badge on each person's weekly total;
  a warning inside the add/assign forms as they are filled in, and a pop-up to
  confirm before saving a shift that puts somebody over. Amber "close" (within
  4 hours — a constant, `NEAR_OVERTIME_HOURS`) shows **only in those forms**,
  for a shift that lands there; once saved, only actually going over stays
  flagged (Dominguez). The person is told too — a notice on their Clock and
  Schedule screens for published weeks that go over, and one email when a
  published change first takes a week over.
- **Every removal asks first**, in one confirmation pop-up (`useConfirm()` in
  `components/ConfirmDialog.tsx`), never the browser's `confirm()` box or an
  inline "are you sure?" link: shifts, taking somebody off a shift, staff,
  kiosks and PINs, posts, surveys, events, job roles and members, resources,
  credentials, checklists and templates, availability, time off, saved
  reports, voiding an export, calendar sync, your photo. Anything new that
  removes something should use it too.
- **Notifications bell** (September 2026, asked for by Dominguez): beside the
  avatar, with an unread count. A `Notification` row per person per event
  (`InboxService`, in the email module): shifts of theirs added, changed or
  removed once published (one summary for a repeating or copied rota), time
  off decided (to them) or requested (to managers), overtime, a survey opened
  for them, their checklist started (when some tasks are theirs), new
  News posts, and practice events for them added, moved or cancelled. Written at the same moments as the emails and works without an
  email provider. Your own only; deleted by the nightly job after 90 days.
  The old "Notifications" menu item (the nightly email) is now **Email
  settings**.
- **News** is its own tab in the top bar, no longer under Team.
- **Practice events** (September 2026, asked for by Dominguez): office,
  admin and provider meetings and things like a wellness day. Managers and
  admins add them from Schedule → **+ Add event** — timed or all day (one day
  or several), a place, and who it is for: **everyone, one job role or one
  office** (like surveys). They show in an **Events** row above the rota and
  in the month, only to the people they are for (managers see all), go to
  phones through the existing calendar feed, and ring the bell when added,
  moved or cancelled. **Calendar only — never hours, overtime or payroll**;
  anybody paid to attend clocks in as usual. **No replies** (going / can't
  go) for now. All four choices confirmed by Dominguez. `PracticeEvent`,
  `src/events/`.
- **Repeating events and chosen people** (September 2026, Dominguez): an
  event can repeat — every week, every 2 weeks, monthly (same date or "the
  first Friday"), or custom ("every 2 weeks on Mon and Fri") — until a date
  at most a year on. Written out **one row per date** in a
  `PracticeEventSeries`, so one date can be changed or removed alone, or
  "this and all after it" (the old series ends the day before, a new one
  starts). Office and admin meetings on alternate Fridays are two series a
  week apart. **Who it is for** is one searchable box: Everyone, or any mix
  of job roles, offices and people (`audience: CHOSEN`, rows in
  `PracticeEventInvitee`). One notification per series, plus a **reminder the
  day before** each date from the nightly job (`reminderSentAt` stops a
  second). Closures stay both offices or one.
- **Video call links** (September 2026, Dominguez): an event can carry a
  `meetingUrl`, https only (checked in the service, the browser and a
  database constraint). Staff get a **Join video call** button, and phones
  get it as the calendar entry's URL, first in its notes and, with no place,
  as its location. **Create a Google Meet link** (a tick box, one link per
  series) makes a Meet meeting hosted by **office@domihealthcare.com**, set to
  *Open*: anybody with the link joins, no knocking (most staff are on
  personal Google accounts — Dominguez chose Open over Trusted). It works through a
  Google service account with domain-wide delegation for the one scope
  `meetings.space.created` (`events/google-meet.service.ts`, no Google
  library). **Live since 28 September 2026**, set up by the Workspace super
  admin (dominguez@ — not admin@) from `docs/google-meet-setup.md`. The
  Google sign-in is shared (`google/google-auth.service.ts`): as office@ for
  delegated scopes, or as the robot itself.
- **Calendar invites** (September 2026, Dominguez — most staff are on
  personal Google accounts): each published shift goes to the person on it,
  and each practice event to the people it is for, as a real invite from a
  "Domi Staff" calendar the app makes under office@ (scope
  `calendar.app.created`: its own calendar only). Shifts 14 days ahead,
  events 60; closures stay on the feed. Not followed change by change: a
  round compares what should be on calendars with `CalendarInvite` (what was
  last sent, fingerprinted) after any save to shifts, events, staff, offices
  or job roles (`InvitesSyncInterceptor`, awaited), nightly, and from
  Practice settings → **Calendar invites → Send now**. Each invite is claimed
  in the database before Google is called, so parallel saves do not email
  twice. Once on, the feed carries only closures and approved time off.
  **Off until `GOOGLE_CALENDAR_INVITES=on`**, after the admin adds the scope
  (Part 5 of the guide) — not on the live site yet.
- **Drive folders on Resources** (September 2026, Dominguez): a Resources
  link to a Google Drive folder gets **Show what's in it**, listed by the
  robot itself (`drive.readonly`, no delegation), cached 5 minutes. Files
  stay in Drive and open there — the app keeps nothing. Folders are shared
  "Anyone with the link" (Dominguez's choice, for personal accounts). Needs
  only the Drive API enabled in the Cloud project.
- **Holidays and closures** (September 2026, Dominguez): a `PracticeEvent`
  with `kind: CLOSURE` — Christmas all day, Christmas Eve from 1pm — for
  **both offices or one** (never a job role). Shown with a 🔒 to that office's
  staff, on phones and under the bell. **Warns, never refuses**: a shift inside
  one is flagged in the shift forms (with a pop-up before saving), with ⚠ on
  the rota, and in the banner and nightly email. **Pay is untouched** — holiday
  pay is an open question. **Entered each year** with **Copy these into next
  year** on the Schedule's *Holidays and closures* card; moving holidays
  (Thanksgiving) are fixed by hand. The printed rota says when an office is
  closed.
- **Version on the Help page** — "About this version": the build date and
  commit baked in when the bundle is built (`VERCEL_GIT_COMMIT_SHA` on Vercel,
  git locally), whether it is the test or live site, and — because
  `/api/config` reports the commit the server runs — a "newer version is live,
  reload" prompt when a tab is out of date.
- **On a phone's home screen** (September 2026): an installable web app —
  manifest, the round logo-with-slogan badge as its icon, opens full screen as
  "Domi Staff" — not a store app. A one-time tip on the sign-in screen of a
  phone (Safari and Chrome on iPhone, Chrome on Android), and "Put Domi Staff
  on your phone" in Help, computer Chrome included. The logo **with its
  slogan** is on every signed-out screen, in black on the printed rota; the
  roof alone stays in the header and favicon. Signed in, the header's
  "**Domi** Staff" is bolder and the slogan runs on a thin blue strip under
  it on every screen (chosen by Dominguez from three renderings). **No service worker, no offline mode**, on
  purpose: a punch with no signal must plainly fail, not seem to work.
- **Going live** (September 2026): Practice settings → **Start using it for
  real** (admins, test deployments only) shows what goes and which accounts
  stay, then clears the demo staff and everything made while testing —
  shifts, punches, time off, checklists, closing records, restock requests,
  licenses, availability, News posts, surveys, events, suggestions, notifications,
  exports, saved reports. It keeps the set-up (Dominguez's choice): offices and
  pins, settings, ADP set-up, job roles, closing checklists, templates,
  resources, kiosks and real accounts. After it: add the staff, set
  `APP_ENVIRONMENT=production` in Vercel and redeploy, send welcome emails.
- **Adding staff in bulk**: Staff → **Add several people** — paste rows from
  a spreadsheet (tabs or commas, column names first, matched loosely: "Work
  Email", "Position", "Start Date", "NB"/"WNY"/"Both", "MA"…). Every line is
  checked and shown first; all or nothing (`POST /employees/import`). Other
  columns are named as ignored and never kept — a pasted SSN goes nowhere.
  Pasting is not an upload: no file is taken or stored. Emails are stored in
  lower case (sign-in looks them up that way; a mixed-case address used to be
  unable to sign in).
- **New staff start ACTIVE** (fixed 27 September 2026): the schema used to
  default to `PENDING`, which nothing ever changed — and clocking in (phone
  and time clock), the scheduler's lists and the Directory all want `ACTIVE`,
  so the first 23 imported staff could not clock in. The default is `ACTIVE`
  and a migration moved everybody left in `PENDING` over.
- **The Staff card** (Manage → Staff) shows **Access** (Employee / Manager /
  Admin — one, what they can do in the app) as a badge, **job roles** as
  tags, and **one Edit button**, nothing else (September 2026, Dominguez:
  "No longer employed" sat on every card and was too easy to press). **Edit**
  opens one editor (`components/StaffEditor.tsx`): their details — name, the
  name they go by, **email and phone** — then access, pay type, job roles
  (tick several), offices, hire date, birthday and ADP File #; then
  **Signing in** (welcome email, temporary password, tablet PIN); and last,
  **Leaving the practice**, behind a second step: pick the **last day**
  (offboarding counts from it), then the confirmation pop-up. A former member
  of staff can be **brought back** from the same place (Show former staff →
  Edit), which clears the last day. Photo, pronouns and "about you" stay the
  person's own. Job roles are still also managed per role under Manage → Job
  roles.
- **Welcome emails**: from the Staff screen, to one person or everyone who has
  not had one and has no password (never demo staff). A 7-day, single-use link
  to choose a password (`/reset-password?token=…&welcome=1`, same token table
  as resets), plus how to put the app on a phone and day-one FAQs
  (`email/welcome-email.ts`, text and HTML). `Employee.welcomeSentAt` records
  it; a failed send takes the link back and says so.
- **No time clock in use for now** (Dominguez, 29 September 2026): staff clock
  in on their own phones, and a time clock goes in only once the practice has a
  dedicated tablet, not on an office computer meanwhile. Because anybody can give
  a colleague their PIN, a time clock on every computer, a photo check and a
  webcam snapshot were all turned down. A handbook rule (clocking in for
  somebody else is a disciplinary matter) was chosen instead, drafted in
  `docs/location-disclosure.md`. See *Kiosk* in `docs/open-questions.md`.
- **Hours entered by hand** (29 September 2026, Dominguez): Timesheet →
  **+ Add hours** (managers) for a day with no punch at all — a reason from a
  short list and a note, never your own hours, never over a punch already
  there. Marked "Entered by hand", and listed on the Timesheet banner and in
  the nightly email until a **different** manager presses **Looked into
  why…** with what they found — treated like a bug report. Otherwise ordinary
  hours (approval, overtime, payroll). See *Hours entered by hand* in
  `docs/architecture.md`.
- **The office computer as the time clock** (built, not in use; see above):
  any browser pairs as a kiosk at `/kiosk`. It re-fetches its staff list every
  10 minutes, and is only reported quiet if a whole published shift at its
  office passes without it being open — so switching the computer off at
  night is fine. **Per-kiosk PIN pause**: 10 wrong PINs within 15 minutes, on
  any names, stops that time clock taking PINs for 5 minutes; a correct PIN in
  between does not reset the count.
- **Birthdays** (September 2026, Dominguez): `Employee.birthdayMonth` /
  `birthdayDay`, set by an admin (Staff → Role, locations, birthday and ADP)
  or from a Birthday column in the import. Always shown — Dominguez chose no
  opt-out: "Birthdays this week" on the Clock screen, a cake under the day
  and on the person's own row in the Schedule week, a line in the month view,
  and on their Directory card, as **first name and last initial**
  ("Angelica D", so two Angelicas are told apart). Read-only on Your profile. `GET
  /directory/birthdays?from&to` (any signed-in person, two months at most); a
  29 February birthday shows on the 28th in other years.
- **Time off is Sick or PTO** (September 2026, Dominguez): a new request is
  one or the other, starting on Sick (PTO once the person's sick days are
  used up); `VACATION` is shown as "PTO". Older kinds stay readable. For the
  switch-over, Time off → **Staff balances** (managers and admins) shows
  everybody's days left, and **Adjust** takes the PTO and sick days somebody
  had already taken this year before Domi Staff, what really carried over
  (blank: worked out) and their own yearly amount (blank: the practice's) —
  `PtoStartingPoint`, `PtoAllowance`; see *The switch-over* in
  `docs/architecture.md`.
- **Schedule layout** (September 2026, Dominguez): the top bar reads Clock,
  News, **Schedule, Timesheet**, Time off; the month (or the week's dates) is
  a large heading right above the calendar, under the buttons.
- **Demo data** loads from a button (account menu → Practice settings), not
  only from a terminal — whoever sets a deployment up is in a browser. Admin
  only, and refuses unless `APP_ENVIRONMENT` is `test`: it replaces every shift
  and punch, and every demo account shares one password.
- **`PracticeSettings`** holds the numbers the practice sets for itself: the
  overtime threshold (40) and how many days before a week starts an unpublished
  rota gets chased (4). Both were constants until Dominguez asked for them to be
  adjustable; the defaults are confirmed. It also holds the **pay period
  start** — pay is every two weeks, confirmed September 2026 — which drives
  the "this / last pay period" shortcuts on the Timesheet and Export. Entered on
  the live site, 25 September 2026.
- **Review fixes** (27 September 2026, see *Review fixes* in
  `docs/architecture.md`): only the time clock makes time-clock punches; a
  phone clocks in at whichever of the person's offices it is standing at;
  "today" is New Jersey's (`PRACTICE_ZONE`) not the server's UTC; export
  overtime counts the whole week at every office; a repeat PIN within
  `KIOSK_REPEAT_SECONDS` (120) is not a clock-out; screens load when first
  opened and `/assets` is cached for a year.
- **Tests**: ~870 unit tests, and ~495 end-to-end checks in `tests/browser`
  driven against a real API, a real Postgres and a real Chromium. Both run in CI
  on every push. The convention is to run the browser suites twice — once
  against the dev server, once against `vite preview`, which applies the
  deployed security headers.

`docs/architecture.md` is the long version, and explains *why* for anything
surprising, and `docs/open-questions.md` is what is still waiting on a decision.
The guides for staff and managers are on the app's own Help page.

## Ways of working
- Confirm scope and data accuracy before drafting deliverables — don't build ahead
  of confirmed requirements.
- Prefer iterative discovery: try things, report findings back, refine the
  architecture from there rather than over-planning up front.
- Dominguez is a beginner with dev tooling/version control — handle git
  conversationally, keep full context documented in this file (and docs/ as it
  grows) so sessions can resume without re-explanation.

## Open questions
What is still waiting on a decision — ADP set-up, the location disclosure,
PTO rules and the rest — is kept in `docs/open-questions.md`. Settled items
come off that list and are written up here or in `docs/architecture.md`.
