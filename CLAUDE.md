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

**The code is the starting point for a Staff module in Domi EMR** (decided by
Dominguez, October 2026). This app stays as it is: Domi Healthcare's own, at
staff.domihealthcare.com, with its own database. Nothing moves out of that
database. Domi EMR takes a **one-time copy of the code** and adapts it there into
an optional module that organizations switch on: many organizations instead of
one, EMR accounts instead of this app's sign-in, document upload, Domi-specific
content made into settings. The clinical forms are expected to stay on the EMR's
clinical side rather than in the module. The EMR repo records which commit here it
copied from. After that the two codebases go separate ways, so nothing flows
across by itself: when a fix or feature here would also matter to the EMR
module, say so, and it can be carried across by hand. This app's rules (*Data this
app does not hold*, its own database) are unchanged by this.

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
  prorated and onboarding counts from the day it starts), whether they clock
  in (`clocksIn`, October 2026 — providers do not), `external_id`
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
- **CmeRequest** / **CmeAllowance** (October 2026) - a provider's CME activity
  sent for approval with its costs, and their yearly allowance. No receipts
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

The **clinical forms** — 99483 (September 2026), the CCM care plan
(October 2026) and the Annual Wellness Visit (October 2026) — are the only
screens that handle patient details, and they
keep them out of the app too: they are typed, made into a PDF and downloaded
entirely in the browser, and never sent or stored (see *Clinical forms* and
*CCM care plan* below).

**Staff profiles** (October 2026, confirmed by Dominguez) are the one step back
from "not an HR system": an **admin** may keep somebody's **home address**,
**emergency contact**, and **pay and position over time** (each raise and
promotion with the day it took effect). Admins only — not managers, not the
person, not the Directory, not the payroll export. They live in their own tables
(`EmployeePersonalRecord`, `EmploymentChange`), read only by `src/staff-records/`
and never added to `Employee`, and the schema guard pins their fields. Still no
identity numbers, documents, licence numbers or date of birth. The one other
reader (October 2026, Dominguez) is the **rota's cost** for the people an
admin chooses — totals by office and day only, never by person.
Those same people (`Employee.canSeeRotaCost`, whatever their access level)
also keep **Pay & raises** (23 October 2026, Dominguez: "i want to stop having
to use this excel workflow"): everybody's pay, each raise's steps
(`PayRaise`) and why somebody left (`LeavingRecord`), in `src/staff-records/`
and pinned by the schema guard. Providers are left out for now. **Anything
that shows pay asks for the person's PIN first** (or their password), even
for those allowed to see it (`pay-lock/`). The census spreadsheet Dominguez
shared was not imported, and its social security numbers were never read.

**An outside AI service** (October 2026, Dominguez: staff names and schedules
may go to one; patient details never): **Ask Domi Staff** sends a question,
and what the app looks up to answer it *as that person sees it* (and the Help
topics likely to answer it), to Anthropic (Claude). The **AI helpers** send
what they are given to work on: a News post's words or an admin's notes, a
pasted booking message, and for a time-off decline the person's first name,
dates and the manager's words (counts of who else is off, never names).
Never the clinical forms, the suggestion box, survey answers (360s included), staff
profiles, licenses, punch locations, the reps list, PINs or passwords;
nothing is kept beyond a daily count, unless somebody saves what a helper
wrote (and a post's Spanish, once translated, stays on the post). Off until
`ANTHROPIC_API_KEY` is set — see `docs/ask-domi-staff-setup.md`.

**Phone notifications** (October 2026) travel through the browser maker's
push service (Apple's, Google's), encrypted with the device's own keys so
that service cannot read them — the same words as the bell, which never
carry patient details.

Nothing is uploaded to the app, with **one deliberate exception**: a
**profile photo** of yourself (confirmed by Dominguez, September 2026). The
browser crops it square, shrinks it to 256 px and re-encodes it as a small
JPEG — which drops the camera's metadata, location included — and the server
accepts nothing else. It is removable by its owner any time, and by an admin.
Since October 2026 (Dominguez: "i should be able to upload pictures for staff
avatars") an **admin may also put one up for somebody**, from Edit on the
Staff screen, fitted and shrunk the same way; the person is told under the
bell and can change or remove it. Still only a profile photo of the person.
**Invoices** (October 2026, Dominguez) are kept, as he needs copies, but one
made out to a **patient** keeps no name, date of birth or address: they are
typed in the browser, printed on the PDF downloaded there and then, and never
sent, so the saved copy shows them blanked out (a database constraint and the
schema guard hold it). A provider paid directly may have their home address
saved as an invoice **pay-to** (October 2026, Dominguez), which is why
invoices are for **Manager access only**, not admins.

Apart from that, the only files the app stores are the payroll export
spreadsheets it generates itself. The practice's own spreadsheets brought onto
the portal in October 2026 — the diagnostics guide and the reimbursements
(loaded from the sheets by migration), vendor payments (typed in) — are
never uploaded, and hold no patient details; the I-693 applicants list
(patients, with dates of birth and ID numbers) was deliberately left out.

**Captured clock-in location** is kept, because it is the point of a browser
punch, but on a short leash: never returned with a timesheet, readable one entry
at a time by an admin and logged when it is, and deleted by the nightly job
after 90 days. Staff-facing wording is drafted in `docs/location-disclosure.md`
and still needs a read by whoever advises on employment matters. A punch **from
home** records no location and no IP at all — only that it was from home.

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
   Staff now see it as **"Domi Staff"** — in the tab title (the sign-in
   screen showed it with "Sign in to clock in, check your schedule and keep
   up with the team." until October 2026, when that gave way to the logo), and — since September 2026 — in emails, the calendar feed, the
   export spreadsheet and the first-run setup page too. The repo, the
   `@stafftime/*` packages and the Vercel project keep their old names.
   - **Announcements** — admins write, edit and remove posts. Seen only after
     sign-in — except posts an admin ticks **Show publicly** (October 2026,
     Dominguez), which also appear on the time clock and under the sign-in
     form, title and words only. There is **always exactly one
     primary** post while any exist: it is shown at the top of the home screen,
     ticking another moves it, it cannot be unticked without choosing another,
     and if it is deleted the newest remaining post takes over. All posts are
     listed on a **News** page, newest first, like a blog.
   - **Job roles and resources** — **managers** (and admins) keep the list of
     job roles and who is in each; the starting list is Front Desk, Medical
     Assistant, Provider, Administrative, Manager. Somebody can hold **several**
     (front desk staff who also work as MAs; providers who also do admin work),
     and then one is their **main job role** (October 2026, Dominguez:
     "everyone should have a 'primary' role") — chosen by an admin in the
     Staff editor, listed first everywhere, what shift forms start on and
     what a shift without a role gets (`EmployeeJobRole.isPrimary`, one per
     person, handed on when it is taken away).
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
- **No branch previews, on purpose** (decided by Dominguez, 29 September
  2026). `vercel.json`'s `ignoreCommand` skips every build Vercel labels a
  preview (`VERCEL_ENV` = `preview`), whoever pushed it; anything else,
  production included, builds — written that way round so a missing label
  can never stop the live site deploying. Reasons: previews shared the live
  database (a branch's migration reached it on push), and could email staff
  and make Meet links. GitHub's CI is the check before merge. Separately,
  Vercel's Hobby plan only deploys commits authored by the account owner, and
  Claude's commits are authored "Claude <noreply@anthropic.com>", so those
  were blocked even before this. To bring previews back later: (1) Preview
  gets its own database — a Neon branch, with `DATABASE_URL` /
  `DIRECT_DATABASE_URL` set per environment in Vercel; (2) Preview gets
  `APP_ENVIRONMENT=test` and no `RESEND_API_KEY` or
  `GOOGLE_SERVICE_ACCOUNT_JSON`; (3) remove `ignoreCommand`; (4) only then
  author commits as `domihealthcare <dominguez@domihealthcare.com>` (git
  config in the session, keeping the `Co-Authored-By: Claude` trailer).
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
  Since October 2026 it is laid out (`email/digest-email.ts`): a subject
  naming the most urgent things, three tiers — sort out today, coming up, when
  you have a minute — each section linking to its screen, and HTML as well as
  plain text.
  **Who gets which part** (7 October 2026, Dominguez: "certain managers should
  be notified of certain things"): on Email settings each manager unticks the
  parts somebody else looks after — the rota, hours, time off, licenses, the
  time clock, closing and supplies, onboarding, the suggestion box
  (`Employee.mutedDigestTopics`, grouped in `email/digest-topics.ts`) — and
  **Who gets what** below shows everybody's, which an **admin** can change for
  anybody. A part **nobody** has chosen still goes to everyone who gets the
  round-up, so nothing falls through. The Time off part also decides who is
  emailed and rung when a request comes in. The banners still show every
  manager everything.
  **Email is live** (24 September 2026): Resend, sending as
  `Domi Staff <no-reply@domihealthcare.com>`, with its DKIM and `send`/`rsend`
  records in the domain's DNS at **Wix**; a password reset was received.
  Sends are awaited, never fire-and-forget — on Vercel anything left running
  after the response is frozen, which is why the first attempt never left.
- **Reminders to clock in and out** (5 October 2026, Dominguez: "notify the
  person, 15 minutes after"): "You haven't clocked in yet" 15 minutes into a
  published shift with no punch, and "You're still clocked in" 15 minutes
  after it ends — to the person, by **email and the bell**, once per shift
  (`PunchReminder`). Not on approved time off, in a closure, or for a punch
  with no shift. Vercel's free plan runs its own timer once a day, so
  **cron-job.org** calls `GET /api/maintenance/punch-reminders` every 5
  minutes with its own `PUNCH_REMINDER_SECRET` — **live since 5 October
  2026**: the secret is in Vercel (Production only) and the job, on
  Dominguez's cron-job.org account, runs every 5 minutes 6am–midnight New
  York time; checked that night (200 with the secret, 403 without). Set-up
  and troubleshooting in `docs/punch-reminders-setup.md`; check Neon's usage
  after a week. Texts were asked about; not built
  (needs Twilio and carrier registration — `docs/open-questions.md`). See
  *Punch reminders* in `docs/architecture.md`.
- **Clocked out at midnight** (6 October 2026, Dominguez): anybody still
  clocked in at midnight — shift or no shift — is clocked out **at 12:00 AM**,
  so they can clock in the next day. The time is the app's, so it is a
  warning both ways: the person is told (bell and email), and it is a
  **clock-out to correct** for managers (banner, nightly email, dashboard),
  which **cannot be approved until a manager corrects the time**
  (`TimeEntry.autoClockedOutAt`). Done by the 5-minute timer, the nightly job,
  and for one person whenever they open Home, punch or use the time clock.
  **Live since 6 October 2026** (version `4b35a9e`). See *Clocked out at
  midnight* in `docs/architecture.md`.
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
  the top bar: under Manage for managers/admins, in the account menu ("Your
  licenses", "Your onboarding") for roles with `seesOwnPersonnelTabs` (Provider); Front
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
  Fixed in October 2026: with two shifts in a day Home looked only at the
  first, so an office shift in the morning hid a work-from-home one later.
- **Choosing where to clock in** (2 October 2026, Dominguez — this replaced
  "work from home only during a work-from-home shift"): Home's Location list
  offers **all of the person's offices and Work from home, every day**, the
  place of today's shift first ("— your shift"). Picking somewhere else —
  the other office, or home with no work-from-home shift — shows a warning
  with an optional **Why?** box, then a pop-up to confirm; it is allowed
  (somebody moved to the other office, or approved to work from home that
  day). The punch is flagged `TimeEntry.isOtherPlace` with
  `otherPlaceReason`, shown on the timesheet as **Not where scheduled** with
  the reason. An office still needs the location check; home still records
  no location or IP. With no shift at all, an office gives no warning and
  home does. `tests/browser/clock-place.mjs`; see *Working from home* in
  `docs/architecture.md`.
- **Working from home today in the Directory** (2 October 2026, Dominguez):
  the box under the office boxes is always shown — who is clocked in from
  home now, then anybody with a published work-from-home shift today who is
  not in yet ("not in yet"), and a badge on their card. Their **hours are in
  a note on the name** (and on the badge), shown on hover, a tap on a phone,
  or keyboard focus — not on the line (Dominguez, October 2026;
  `components/HoverNote.tsx`).
  Everybody sees it: the one, narrow exception to staff not seeing each
  other's shifts (today, from home, hours only). `homeToday` in
  `DirectoryService.list`.
- **The suggestion box on Home** (2 October 2026, Dominguez: "creative in
  how it's viewed … even like a pop up"): a card with a drawn box and **all
  four kinds of note** (idea, not working, shout-out, question — not one
  rotating question, which read as "only for shout-outs"); each opens a
  pop-up with that kind picked (`Feedback.kind`, optional), and on sending
  the note drops into the box. **Truly anonymous — how?** on the card, and
  **Is it really anonymous?** in the pop-up, say in plain words what is and
  is not kept (`HowItIsAnonymous`) — every line must stay true. **Managers are told** while any are not dealt with: a count
  and the oldest day (never the words) in the nightly email and on a Surveys
  banner (`newSuggestions` in `AttentionService`), and "N waiting to be read"
  on Home. Not on the bell — it would stamp the minute.
- **Directory and Staff side by side** (2 October 2026, Dominguez): both are
  **three columns** on a laptop (two on a tablet, one on a phone), and the
  Directory's top row is North Bergen · West New York · Working from home
  today. **In now groups people by job role** (5 October 2026, Dominguez),
  in the practice's order of job roles, each person once: under the job
  role of the **shift they clocked in to** ("it should be how they are
  scheduled"), otherwise their **main job role** ("Other" for none). A **Staff card says everything a Directory card does** — photo,
  pronouns, "about you", in now / working from home / on leave, tappable
  email and phone, birthday — plus access, ADP File #, PIN and password
  status, Profile and Edit. Shared pieces in `components/PersonDetails.tsx`.
- **Office extensions in the Directory** (2 October 2026, Dominguez — from
  the practice's *Office Extensions* sheet, 04.2024–08.2026): a card under
  the search box, a column per section (Providers, Admin Team, Front Desk &
  Outdesk, Misc), searchable. A person's **5xx number rings their mobile on
  their work-from-home day** (`homeExtension`, `homeDays` as written, e.g.
  "Thursday") — an extension, not their mobile number. Managers and admins
  **Edit** it (add, reorder, remove, match a line to a person); a matched
  person shows "Ext. 121 · 521 from home (Thursday)" on their Directory and
  Staff cards, and on a day working from home "Ext. 521 today" first, and in
  the Working from home box. `OfficeExtension`, saved whole
  (`PUT /directory/extensions`); migration `20261002030000_office_extensions`
  loads the sheet and matches a line to an account only when exactly one
  current member of staff has that first and last name — **check the
  matches on the live site** and fix any in Edit. **Replaced on 7 October
  2026 by the new phone system's list** (Dominguez,
  `20261007010000_office_extensions_new_phones`): Providers are now the
  doctors' room phones (Dr N 1 201 …), with the providers' own softphones
  (501–504) listed after them as "Dr. D (softphone)" and so on, matched to
  nobody (first a section of their own; moved the same day so the five
  sections fit on one row on a laptop); the admin team keep 521–525 as from-home numbers; Front Desk
  (FD N 1 101 … FD 10 110), MA & Lab (111–113) and Shared lines (Office 100,
  Admin 120, CCM 130, IT 777).
- **Notes on a shift** (2 October 2026, Dominguez: "so I can write 7-12
  upstairs and 12-3 downstairs"): `Shift.notes` had always been in the
  schema (and on the calendar feed and invites) but no screen wrote it. Now
  a **Notes** box on every way of adding a shift (＋ on the rota, + Add) and
  in the shift's pop-up (**Save note**; empty it to remove). Shown on the
  rota chip (📝), a 📝 in the month, under today's shift on Home and on the
  printed rota. A changed note on a published shift rings the person's bell
  (`shift-notices.ts`). 500 characters at most. Staff only ever see their
  own shifts' notes in the app; the printed rota shows everybody's.
  `tests/browser/shift-notes.mjs`.
- **Who can cover this?** (8 October 2026, Dominguez — the first of the
  "make the app smarter" ideas, all rules, no AI): clicking a shift on the
  rota suggests who to ask first — people at its office in its job role who
  are free then, not off, not past their availability and furthest from
  overtime — as buttons that pick them, with the full list under it grouped
  free / could but check first (with the reason) / already on or off.
  Suggests, never refuses. `GET /shifts/:id/cover-options`,
  `shifts/cover-options.ts`, `components/CoverSuggestions.tsx`; see *Who can
  cover this?* in `docs/architecture.md`; `tests/browser/cover.mjs`. Worth
  carrying to the EMR module.
- **Patterns worth a word** (8 October 2026, Dominguez — the second
  "smarter" idea, defaults proposed and agreed): over the last 4 weeks,
  **late 3 times or more** (and "3 Mondays running" when the same weekday
  repeats), **forgot to clock out twice** (clocked out by the app at
  midnight), or **left early twice**. A card on the Dashboard ("Which
  days?" lists them) and a section in the nightly email's *when you have a
  minute*, under the Hours part — **managers only, never a banner, and the
  person is not told**: a reason to ask, not a verdict. Read from the
  timesheet's own flags; hand entries are not punches and are left out.
  `time-entries/punch-patterns.ts` (one query for both);
  `tests/browser/patterns.mjs`.
- **Too many off at once** (8 October 2026, Dominguez — the third "smarter"
  idea, defaults proposed and agreed): more than half of the people holding
  one job role at one office off the same day — so all of them in a role of
  one or two — counting **approved and still-asked-for** time off, on
  weekdays and weekend days with shifts at that office. Shown **on the
  request** while a manager decides it ("Approving this leaves North Bergen
  with 1 of 3 in Medical Assistant on Tue, Dec 22 — also off: …", on the
  Schedule and on Time off), on the **Dashboard** for the next 8 weeks, and
  in the **nightly email** for the next 2, under the Time off part. **Warns,
  never refuses**; never a banner. A role of one warns whenever that person
  is off — or, where a **minimum** is set for that office and role (see
  *A minimum per office and job role*), when time off leaves fewer than it.
  `pto/time-off-clashes.ts` (one
  query for all three), `GET /pto/:id/clashes`,
  `components/TimeOffClashes.tsx`; `tests/browser/clashes.mjs`.
- **Suggest people for the open shifts** (8 October 2026, Dominguez — the
  fourth "smarter" idea, a first draft of the rota): **✨ Suggest people for
  them** on the rota's open-shift line proposes somebody free for each open
  shift on screen — the "Who can cover this?" ranking, **good fits only**,
  never two shifts at once, hours spread (each pick is booked before the
  next), the shifts with fewest free people filled first; "Nobody is free
  then" otherwise. The manager unticks any and presses **Assign**; nothing
  is saved before that. `POST /shifts/suggest-cover`, `planCover` in
  `shifts/cover-options.ts`; steps in `tests/browser/cover.mjs`.
- **Approve the clean hours** (9 October 2026, Dominguez — the fifth
  "smarter" idea): the Timesheet's **Approve all N with nothing flagged**
  approves, after asking, every entry on screen that is closed and carries no
  flag (late, left early, edited, entered by hand, clocked out at midnight,
  not where scheduled, needs review); the flagged ones stay for a look one by
  one. The filters narrow what it takes. The server approves only the ids
  sent that still match (`time-entries/clean-entry.ts`, one `updateMany`), so
  an entry edited meanwhile is left out; a spec fails if a new flag is not
  added there. `POST /time-entries/approve-clean`;
  `tests/browser/approve-clean.mjs`.
- **Before you publish** (9 October 2026, Dominguez — the sixth "smarter"
  idea): **Publish all** and a person's **Publish N draft shifts** first show,
  in one pop-up, what is worth a look about those drafts — a **required
  license lapsed by the shift** (new: nothing checked that before; one with
  nothing on file is left to the Licenses screen), people who have left, time
  off (approved or asked), closures, availability, overtime, and open shifts
  still with nobody (not for one person's drafts). **Warns, never refuses**:
  **Publish anyway**; with nothing to say, the plain question as before.
  `POST /shifts/publish-check`, `shifts/publish-check.ts` (words, pure) and
  `publish-check.service.ts` (reads, by each rule's existing code),
  `components/PublishCheckDialog.tsx`; `tests/browser/publish-check.mjs`.
- **Before you export** (9 October 2026, Dominguez — the seventh "smarter"
  idea): the Export screen's **Download** first shows, in one pop-up, what is
  worth a look about the period before it goes to payroll — no ADP File #
  (ADP only), **clocked out at midnight or still clocked in (left out of the
  file)**, hours not approved yet (going out or left out, by the statuses
  ticked), hand entries nobody has looked into, corrections since payroll,
  and each person's overtime. **Warns, never refuses**: **Export anyway**; a
  clean period downloads at once. `POST /exports/timesheet/check`,
  `exports/export-check.ts` (words, pure) and `export-check.service.ts`
  (every status in the period, plus the export's own build); the pop-up is
  `components/WarningsDialog.tsx`, shared with Before you publish.
  `tests/browser/export-check.mjs`.
- **License reminders to the holder** (9 October 2026, Dominguez — the
  eighth "smarter" idea): the person whose license or certificate runs out is
  told on the bell and by email at **60 days**, **30 days** and **once
  lapsed** (up to 30 days after), each **once** for a given expiry date
  (`CredentialReminder`, claimed before sending; a new expiry date starts
  again). Only the most pressing stage that applies; an old card with a newer
  one of the same kind beside it is skipped. Managers' round-up unchanged.
  Run by the five-minute timer and, as a fallback, the nightly job.
  `credentials/license-reminders.ts`, `maintenance/license-reminders.service.ts`,
  migration `20261009010000_license_reminders`;
  `tests/browser/license-reminders.mjs`.
- **Heading for overtime on hours worked** (9 October 2026, Dominguez — the
  ninth "smarter" idea): part-way through the week, hours **worked so far**
  plus what the rota **still has them down for**, for hourly staff, both
  offices; anybody past the overtime line is named, with the rota's own total
  beside it ("the rota already had them over" when the rota did it). An open
  punch counts to now; an uncorrected midnight clock-out is left out. A card
  on the **Dashboard** and a *coming up* section in the nightly email under
  the Hours part — **managers only, never a banner**.
  `time-entries/overtime-forecast.ts` (one loader for both);
  `tests/browser/overtime-forecast.mjs`.
- **Onboarding reminders to the new hire** (9 October 2026, Dominguez — the
  tenth "smarter" idea): tasks on somebody's own **onboarding** checklist
  that are **theirs to do** are reminded about on the bell and by email
  **two days before** they are due and **once overdue** (up to two weeks
  after, then it is the managers' list), each once for a given due date, all
  of a person's in **one message**; nothing on the day the checklist starts.
  The link opens their checklist, where they tick their own off — Front Desk
  and MA included, though it is in no menu for them. Offboarding is left
  out. Run by the five-minute timer and, as a fallback, the nightly job.
  `checklists/onboarding-reminders.ts`,
  `maintenance/onboarding-reminders.service.ts`, migration
  `20261009020000_onboarding_reminders`;
  `tests/browser/onboarding-reminders.mjs`.
- **Shifts with no clock-in** (9 October 2026, Dominguez — the eleventh
  "smarter" idea): a **published** shift that is **over** (last 14 days) with
  **no punch by that person that day** — not on approved time off, not in a
  closure of its office — is listed on the **Timesheet** banner, counted on
  the Dashboard and in the nightly email (*sort out today*, Hours part),
  managers only. Settled by **+ Add hours**, recording the time off or
  removing the shift; nothing new stored. `time-entries/missed-shifts.ts`;
  `tests/browser/missed-shifts.mjs`.
- **Availability that clashes with a regular shift** (9 October 2026,
  Dominguez — the twelfth "smarter" idea): when somebody adds availability
  that rules out one of their **regular shifts** in the next eight weeks, the
  managers down for the rota hear **at once on the bell**
  (`AVAILABILITY_CLASH`), and it is on the **Schedule** banner and in the
  nightly email (*coming up*, Schedule part) until the shift or the
  availability changes. Saved either way, nothing changed by it.
  `availability/regular-shift-clashes.ts`, migration
  `20261009030000_availability_clash_notice`;
  `tests/browser/availability-clash.mjs`.
- **A new shift starts on their usual hours** (9 October 2026, Dominguez —
  the thirteenth "smarter" idea): the ＋ on the rota and **+ Add** start on
  the person's **regular shift** for that day, else what they worked most on
  that **weekday** in the last 8 weeks (at least twice), else on **any day**
  (at least three times), else 9 to 5 — hours, office and job role, with a
  line saying where it came from, until the manager changes them by hand.
  `GET /shifts/usual`, `shifts/usual-hours.ts`, `components/UsualShift.tsx`;
  `tests/browser/usual-hours.mjs`. (Browser suites that relied on the 9 to 5
  start now set it.)
- **A minimum per office and job role** (9 October 2026, Dominguez — the
  fourteenth "smarter" idea): **Manage → Job roles → Minimum on each day**
  (`StaffingMinimum`, managers; blank is none). Where set, **Too many off at
  once** goes by it instead of "more than half", and **days the rota leaves
  short** — an office with anything on the rota that day, not closed at noon,
  fewer people on in that role than the minimum (drafts count; working from
  home and open shifts do not; a shift with no role counts under the
  person's main one) — are on the **Schedule** banner and in the nightly email
  (next 14 days, *coming up*, Schedule part) and in **Before you publish**.
  Warns, never refuses. `staffing/minimums.ts`, `PUT /staffing/minimums`,
  `components/StaffingMinimumsCard.tsx`, migration
  `20261009040000_staffing_minimums`; `tests/browser/minimums.mjs`.
- **Ask Domi Staff** (9 October 2026, Dominguez — the first AI feature,
  after he agreed staff names and schedules, never patient details, may go
  to an outside AI service): `/ask`, linked from Home's Quick card, a
  question in plain words answered by **Claude Opus 5.5** (Anthropic) from
  **tools that answer as the asker** — their own shifts and time off, the
  practice calendar, pay days, the Directory; managers also the rota, time
  off waiting and the round-up (`assistant/assistant-tools.ts`, gated and
  unit-tested). Looks up only, never changes. **Nothing kept**: no question
  or answer stored or logged, only a daily count (`AssistantUsage`, **40 a
  day each**); the conversation lives on the screen. Effort `low`, refusals
  fall back server-side (`fallbacks: "default"`), at most 4 rounds inside
  Vercel's 30 seconds. **Off until `ANTHROPIC_API_KEY`** is set in Vercel
  (Production only) — **not on the live site yet**; steps, cost (~3–5¢ a
  question) and the disclosure line in `docs/ask-domi-staff-setup.md`.
  `@anthropic-ai/sdk` pinned at 0.128.0. Migration
  `20261009050000_assistant_usage`; `tests/browser/ask.mjs` (off, and the
  screen with answers stood in for). **Answers "how do I…?" from the Help
  guide** (9 October 2026): the screen sends the few Help topics that best
  match the question, as text walked out of the Help page's own JSX
  (`lib/help-text.ts`), so there is no second copy to drift. Never the
  clinical forms (would need a BAA).
- **The AI helpers** (9 October 2026, Dominguez — chosen from a list of AI
  ideas): all through `ai/ai.service.ts` (one client, Claude Opus 5.5, effort
  low, refusal fallback, and **one allowance: 40 a day each, questions and
  helpers together**); structured outputs, so the answer fills a form that a
  person reads and saves. Off until the key, buttons hidden. **News — ✨ Help
  me write it** (admins: notes → title and message). **News in Spanish**
  (Dominguez: "staff should be able to toggle from English, which is default,
  to Spanish"): an **English | Español** switch on Home and News, per device;
  a post's Spanish (`Announcement.titleEs` / `bodyEs` / `spanishByAi`,
  migration `20261009060000_news_in_spanish`) is the admin's — typed, or
  **✨ Translate from the English** in the editor — or translated the first
  time a reader asks, kept, and marked *Traducido automáticamente*; changing
  the English clears Spanish not redone with it; polls, comments and public
  posts stay English. **Calendar — ✨ Fill this in from a message**
  (managers): a rep's email or text read into the form; the office and rep
  are matched to the app's own lists here (`events/read-booking.ts`), a rep
  not on the list is named to add. **Time off — ✨ Help me word it**
  (managers): a kind reason for declining (`pto/decline-wording.ts`), in a
  new decline pop-up (`components/DeclineTimeOff.tsx`) that also **mended
  the Schedule's Decline** — it sent no reason, which the server refuses, so
  it had failed since 1 October. See *The AI helpers* in
  `docs/architecture.md`; `tests/browser/ai-helpers.mjs`. Still only ideas:
  summaries of closed surveys' written answers (would need a new line in
  *Truly anonymous — how?*), a Monday briefing for managers.
- **Time off that lands on shifts** (9 October 2026, Dominguez — a "smarter"
  idea): the **request form** lists the person's shifts in those days before
  it is sent (staff see their own published ones; a manager filing *For*
  somebody sees theirs), and **Approve** — on the Schedule and on Time off —
  asks, when the request covers shifts still to come, whether to leave them as
  **open shifts**, **take them off the rota** (a draft deleted, a published
  one cancelled) or **leave them**, in one step (`PATCH /pto/:id/review`
  `shifts: KEEP | REMOVE | OPEN`, `PtoService.handleShifts`). The person is
  told once, in the approval notice. A half day keeps its shift; with no
  shifts it approves at once as before. `components/ApproveTimeOff.tsx`;
  `tests/browser/time-off-shifts.mjs`.
- **Someone called out: ask who can cover** (10 October 2026, Dominguez —
  a "smarter" idea): in an **open shift's** pop-up on the rota, **Ask people
  to cover** lists the people free then (the "Who can cover this?" good fits
  ticked, the ones with a catch unticked with the catch); **Ask** sends each a
  bell note and an email linking to `/cover/:id`, where they press **Yes,
  I'll take it** or **No, I can't**. The **first yes gets the shift** — put on
  it and published, claimed only while still open and not started, refused if
  they are working then — the manager is told, and the others still to answer
  hear it is covered; everybody saying no tells the manager too; **Stop
  asking** tells those still to answer. Only the people asked can open it (a
  manager may look), and it shows the shift only, never who else was asked —
  staff still never see open shifts. `CoverRequest` / `CoverAsk`, migration
  `20261010010000_cover_requests` (notification kind `COVER_REQUEST`),
  `shifts/cover-requests.ts` (words and state, pure) and
  `cover-requests.service.ts`, `components/AskToCover.tsx`,
  `pages/CoverPage.tsx`; `tests/browser/ask-cover.mjs`. Worth carrying to the
  EMR module with *Who can cover this?*.
- **Payroll is due, hours aren't approved** (10 October 2026, Dominguez — a
  "smarter" idea): from **two working days before a pay period ends until the
  day before it is paid**, **Payroll is due** leads the Timesheet banner and
  the nightly email (first in *sort out today*, and its subject): entries in
  that period not approved yet (and for how many people), clock-outs the app
  made at midnight still to correct, punches still open from an earlier day.
  Silent outside the window, and until a pay period is set. Nothing new
  stored. `time-entries/payroll-due.ts`; `tests/browser/payroll-due.mjs`.
- **Staff who never signed in** (10 October 2026, Dominguez — a "smarter"
  idea): at the top of **Manage → Staff** (admins), a folded card lists
  everybody still here who has never once signed in, with what most likely
  holds each up — never sent a welcome email, the link ran out (7 days), a
  temporary password not used, or a password chosen but no sign-in since —
  and **Send welcome email** / **Send it again** where one can go (only to
  somebody with no password). It says who clocks in at the time clock. Demo
  staff are left out. `GET /employees/welcome/pending`,
  `auth/not-signed-in.ts`, `components/NotSignedInCard.tsx`;
  `tests/browser/not-signed-in.mjs`.
- **"You're on tomorrow"** (11 October 2026, Dominguez — a "smarter" idea,
  "should be able to turn off as a user"): from **6pm** the evening before,
  everybody with a published shift tomorrow is told **once** on the bell and
  by email — hours, place, job role and any note, one message for two shifts
  — not on approved time off, nor for a shift in a closure. Each person turns
  it off on **Email settings** (`Employee.wantsShiftReminders`, theirs only).
  Run by the five-minute timer, claimed per shift (`PunchReminder` kind
  `TOMORROW`). `shifts/tomorrow-reminder.ts` (words),
  `PunchRemindersService.remindAboutTomorrow`, migration
  `20261011010000_shift_tomorrow_reminders`; `tests/browser/tomorrow.mjs`
  (checks it arrives when run 6pm–midnight, that nothing goes early
  otherwise).
- **Onboarding starts by itself** (11 October 2026, Dominguez — a "smarter"
  idea): adding somebody with a hire date (one at a time or the pasted list)
  — or giving them one later — starts the **default onboarding template**
  for them, counting from that date, as **Start checklist** would; the Staff
  screen says so. Only for somebody hired **within the last 30 days** or not
  yet started (so adding the existing staff starts nothing), never a second
  time, not demo staff; nothing happens without a default template.
  Templates are not per job role — the default is used.
  `ChecklistsService.startOnboardingIfNew`, called from
  `EmployeesController`; `tests/browser/auto-onboarding.mjs`.
- **360 feedback** (11 October 2026, Dominguez: "a survey on all employees by
  all employees, completely anonymous though produces a report for the
  employee that we … are able to set up a time to meet with the employee and
  discuss"; his choices: **managers only** see reports, a **self-rating**, a
  **starter set, editable**, the manager **offers 2–4 times** and the person
  picks): **Surveys → 360 feedback → Start a 360** (managers) — five 1–5
  ratings (teamwork, communication, reliability, helpfulness,
  professionalism) and two written answers, each with first-person words for
  yourself; everybody here then is asked about everybody, and told on the
  bell; one open at a time, an optional closing day. Staff answer at
  `/surveys/360/:id` (Home links it): each colleague once, **Skip** for
  somebody they don't work with enough, never editable. **Anonymous the
  pulse surveys' way**: `Review360Response` / `Review360Answer` name who it
  is about, never who said it, and no time; `Review360Rated` (who rated
  whom, or skipped) is kept apart only to stop a second go — the schema
  guard pins all three tables' fields. **Reports** (`/surveys/360/:id/
  reports`, managers and admins, once closed, **never your own**): only with
  **3 or more colleagues** (`MIN_RATERS`), colleagues' average and spread
  beside the self-rating, written answers shuffled. From a report, **Offer
  times to meet** (2–4, up to 3 hours, place, optional Google Meet); the
  person is told (bell, email) and picks at `/meetings/:id`, which makes a
  practice event for the two of them — "Feedback conversation: Frankie and
  Morgan" — so it reaches calendars like any event. Withdrawn or cancelled
  from the report. Never sent to the AI service. Staff's parts are in
  Spanish. `src/reviews360/` (`review360.ts` pure, `reviews360.service.ts`),
  `components/Reviews360Section.tsx`, `pages/Review360Page.tsx`,
  `Review360ReportsPage.tsx`, `ReviewMeetingPage.tsx`, migration
  `20261011020000_reviews_360`; `tests/browser/review360.mjs`.
- **Running late** (11 October 2026, Dominguez — a "smarter" idea): on Home,
  before clocking in for today's shift (from three hours before it until it
  ends), **Running late?** → about 10 / 20 / 30 / 45 / 60 minutes; the
  managers of that office are told on the bell (`officeManagers`: managers and
  admins at the office, else all of them), not by email; **Change** gives a new
  time. The timesheet shows "Running late: said about 20 minutes" beside the
  entry. Excuses nothing by itself. `RunningLate` (one per shift),
  `shifts/running-late.service.ts`, `POST /shifts/:id/running-late`,
  `components/RunningLate.tsx`; `tests/browser/running-late.mjs`.
- **Managers told about a no-show** (11 October 2026, Dominguez): 30 minutes
  into a published shift with no clock-in (and no more than two hours), the
  office's managers hear "… isn't clocked in for 9:00 AM at North Bergen" on
  the bell, once (`PunchReminder` kind `NO_SHOW`) — not on approved time off,
  in a closure, or before a "running late" time plus 15 minutes has passed.
  The person's own 15-minute reminder is unchanged. Run by the five-minute
  timer (`PunchRemindersService.tellManagersOfNoShows`).
- **Staff who do not clock in** (12 October 2026, Dominguez: "an option for
  some employees that do not have to clock in (i.e. the providers at the
  moment) though it still should show where they are for that shift in the
  directory"): **Clocks in** on the Staff editor (`Employee.clocksIn`,
  admins; "Doesn't clock in" on the Staff card). Unticked, nobody reminds
  them to clock in, managers hear of no no-show, a shift with no punch is not
  on *Shifts with no clock-in*, the time clock leaves them off its list,
  Home asks for no tablet PIN and shows **No need to clock in** with today's
  shift instead of the button (clocked in anyway, Clock out still shows),
  and *Your week* gives only the shifts. The **Directory** shows them **"On
  shift · North Bergen"** (or working from home) in that office's In now box
  while a published shift of theirs runs, not on approved time off — the
  office, never the hours; managers see since when it started. Migration
  `20261012010000_clocks_in` unticks everybody holding a job role with *uses
  clinical forms* (the providers) — **check the Staff screen on the live
  site**. Their hours are no longer on the timesheet, so the dashboard's
  hours worked against scheduled and the payroll export have none for them.
  `tests/browser/clocks-in.mjs`.
- **Ask for a correction** (11 October 2026, Dominguez): on their own
  Timesheet, staff press **Ask to fix** on a closed entry, give the times
  (a finish before the start is the next morning) and what happened. One
  waiting per entry; times checked (in the past, under 16 hours, the same
  day). Managers down for hours are told on the bell; **Corrections asked
  for** at the top of the Timesheet, on its banner and in the nightly email
  (*sort out today*, Hours part). **Approve** is the ordinary `edit` with
  "Asked for by … : reason" (paid hours still need a deliberate yes — the
  request is put back to waiting if refused); **Decline** needs a reason.
  The person is told by bell and email. Never your own. `CorrectionRequest`,
  `time-entries/correction-requests.service.ts` (`POST
  /time-entries/:id/correction`, `GET /corrections`, approve / decline),
  `components/Corrections.tsx`; `tests/browser/corrections.mjs`.
- **Offboarding starts by itself** (11 October 2026, Dominguez): marking
  somebody as having left starts the default offboarding template from their
  last day — not for a last day more than 30 days ago, nor while one is
  unfinished or one was started in the last half year.
  `ChecklistsService.startOffboardingIfLeaving`, from the terminate route.
- **Approve the clean time off** (11 October 2026, Dominguez — like "Approve
  the clean hours"): **Approve all N with nothing to check**, on the
  Schedule's requests and the Time off screen, approves every waiting request
  (not your own) that is PTO or sick with enough left once counted
  (`balanceOn` its first day's policy year), not "Too many off at once", and
  on no shifts still to come; each re-checked on the server and approved
  through the ordinary review. `pto/clean-time-off.ts`,
  `clean-time-off.service.ts`, `GET /pto/clean`, `POST /pto/approve-clean`,
  `components/ApproveCleanTimeOff.tsx`; `tests/browser/clean-time-off.mjs`.
- **Your week** (11 October 2026, Dominguez — with an off switch like
  "You're on tomorrow"): Sunday from 6pm, bell and email — last week's hours
  (an uncorrected midnight clock-out left out and named) and this week's
  published shifts; nothing when there is neither. Turned off on Email
  settings (`Employee.wantsWeeklySummary`); claimed per person and week
  (`WeeklySummary`). `time-entries/weekly-summary.ts`,
  `maintenance/weekly-summary.service.ts`; `tests/browser/weekly.mjs`.
  Migration `20261011030000_running_late_corrections_weekly` holds this
  round's tables.
- **Browser suites on a Sunday** (fixed 11 October 2026): rota-print,
  overtime, bell and availability worked out "next week" Monday to Sunday on
  the test machine's clock, while the Schedule's weeks run Sunday to Saturday
  in New Jersey — so every Sunday (UTC) they looked a week too far. They now
  take next Monday as this Sunday + 8 on New Jersey's calendar, or open the
  week directly; auto-clock-out looks in last week for yesterday's punch.
- **Required reading and tasks** (10 October 2026, Dominguez — from a survey
  of similar apps: "something the admin/managers can require for need to
  know information or required tasks", a **nag, never a gate**): **Manage →
  Required reading** (`/required`) asks Everyone, or any mix of job roles,
  offices and people, to **read and confirm** something (a News post —
  **Require reading** on the post — a Resources page, a link, a few lines)
  or to **do** something, optionally by a date. Told on the bell and by
  email; an amber **Waiting for you** card on Home (and the button on the
  post) until they press **I've read it** / **Done**; reminded two days
  before, the day after and weekly (eight at most), one message each; read
  as the audience is today, so new hires in a role are asked too. Managers
  see "N of M confirmed", who has and who has not, **Remind them now**,
  **Stop asking**. Keeps only *that* somebody confirmed and when.
  `requirements/`, migration `20261010020000_required_reading`; see
  *Required reading and tasks* in `docs/architecture.md`;
  `tests/browser/required.mjs`.
- **Rota cost** (10 October 2026, Dominguez: "only for certain individuals
  (i.e. kayla, angelica, and myself)", hourly and salaried): a folded line
  above the rota on the Schedule — the week or month on screen in dollars,
  by office, opening to hourly pay, the overtime extra, salaries and each
  day — for the people on **Practice settings → Who sees the rota's cost**
  (`Employee.canSeeRotaCost`, admins keep it; an admin not on it does not
  see it). From staff profiles' pay: scheduled hours, drafts included, at
  the rate in force that day, hours past the line at 1.5× for hourly staff
  (the pay period's weeks), salaries a year ÷ 52 a week for every day
  employed, split by where they work. People on the rota with no pay on file
  are named. Never by person. Migration `20261010030000_rota_cost` puts
  Dominguez on the list, and Kayla and Angelica Dominguez **only if exactly
  one current person has that name — check the list on the live site**.
  `staff-records/rota-cost.ts` (pure) and `rota-cost.service.ts`,
  `components/RotaCost.tsx`; `tests/browser/rota-cost.mjs`.
- **Provider on call** (10 October 2026, Dominguez: "provider on call
  schedule will def be needed"): **Schedule → On call** (`/on-call`, a third
  tab; providers — a job role with *uses clinical forms* — managers and
  admins only). Each day's turn runs **noon to noon** ("because we are
  limited to our answering/forwarding service"), the hand-over time saved
  with the pattern. A **usual pattern** by weekday with **exceptions** for a
  week of the month (1st–4th, last; the most particular wins), saved from a
  chosen day so the past stays as it was; **weekends counted by their
  Saturday** (the 4th weekend is the 4th Saturday and the Sunday after).
  Migration `20261010040000_on_call` loads the current one — Dr. Dominguez
  Mon, Tue, Wed, Fri and weekends except the 4th; Dr. Jose Badia Thursdays
  and the 4th weekend — **only if both are found** (Dr. Badia by name):
  check it on the live site. Managers change **one day** (with a note; both
  told by bell and email; **Back to the usual**). A provider **asks another
  to swap** a day, optionally taking one of theirs back; it happens when
  they press **Yes, swap**, re-checked then; managers told on the bell.
  **On call now** on Home, and a provider's own turns in the calendar feed
  (all-in-one and **My on call**). **Not paid, never hours** (Dominguez).
  `on-call/on-call.ts` (rules, pure) and `on-call.service.ts`,
  `pages/OnCallPage.tsx`; `tests/browser/on-call.mjs`. Worth carrying to the
  EMR module. Dominguez would like to look into something better than the
  answering service's fixed noon hand-over — not started.
- **Provider schedule reviews** (16 October 2026, Dominguez: "admin/manager/
  staff that are responsible for reviewing providers schedule … so they are
  aware they are to review a certain schedule and others are aware which
  schedule is being reviewed"; his choices: the **patient schedule** in eCW,
  a **usual pattern with changes**, **no done tick**, shown on **Home**, a
  **list everybody sees** and the **provider's Directory card**):
  **Schedule → Reviews** (`/schedule-reviews`, a tab for everybody). A usual
  pattern — for each provider (a job role with *uses clinical forms*, as for
  on call), who reviews their schedule on each weekday, anybody still here —
  and **one day changed** by a manager (somebody else or nobody, a short note
  everybody reads; **Back to the usual**), today or later only. The week,
  Sunday first, for everybody; managers also see providers with nobody and
  press a line to change it. **Schedules you review** on the reviewer's Home
  (today and the next days they have one, three at most); "Today's schedule
  reviewed by …" on the provider's Directory and Staff cards. **No
  notifications** (not chosen). **Only who and which provider** — never a
  patient or an appointment; the schema guard pins `ScheduleReviewer` and
  `ScheduleReviewDay`. Somebody who has left counts as nobody.
  `schedule-reviews/schedule-reviews.ts` (rules, pure) and
  `schedule-reviews.service.ts`, `pages/ScheduleReviewsPage.tsx`,
  `components/MyScheduleReviews.tsx`, migration
  `20261016030000_schedule_reviews`; `tests/browser/schedule-reviews.mjs`.
  Worth carrying to the EMR module, where it could sit beside the real
  appointment schedule.
- **Phone notifications** (10 October 2026, Dominguez: "are we able to do
  this since we dont have an iphone/android app?" — yes, web push):
  whatever rings somebody's bell (`InboxService.notify`) also goes to each
  device where they pressed **Turn on for this device** (Your profile; **Get
  these on your phone** under the bell). iPhone needs Domi Staff on the Home
  Screen (iOS 16.4+); Android and computers work in the browser. No Twilio,
  no carrier registration, no cost. **An admin switches it on once**,
  Practice settings → **Phone notifications** → **Switch on for the
  practice**, which makes the app's own key pair (`PushKeys`; Vercel's
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` win if ever set). **Not switched
  on on the live site yet.** Devices in `PushSubscription` (only real push
  services accepted; a device the service says is gone is forgotten);
  `email/push.service.ts` (`web-push` 3.6.7, pinned), `public/push-sw.js`,
  `lib/push.ts`, `components/PhoneNotificationsCard.tsx`, migration
  `20261010050000_push_notifications`; `tests/browser/push.mjs` (a headless
  browser cannot subscribe, so the device is registered through the API).
- **Spanish for the staff screens** (10 October 2026, Dominguez: "can do
  the spanish for whole app" — staff screens first): each person chooses
  **English | Español** on **Your profile** (`Employee.language`, migration
  `20261010060000_staff_language`; the News switch is now the same choice),
  applied the moment it is pressed and whenever they sign in, anywhere.
  `lib/i18n/` — `t('English')` keyed by the English itself, so anything not
  yet translated stays English and English output never changes; Spanish in
  `lib/i18n/es/*.ts` by area (about 600 phrases, "tú"), dates via
  `locale()`. Translated: the frame (menus, phone bar, bell's own words),
  Home with the closing checklist, Schedule (staff's view), time off,
  availability, Timesheet (own hours), Directory, Resources, News, Surveys
  (answering), required reading, Your profile, the calendar card and
  practice calendar. **Still English**: managers' tools, the Help guide,
  what the bell and emails say, the kiosk and sign-in. **The Spanish needs
  a native speaker's read** (`NEEDS_NATIVE_SPEAKER_REVIEW`).
  `tests/browser/spanish.mjs`.
- **From the survey of similar apps** (10 October 2026, Dominguez): what was
  agreed is above (required reading, rota cost, on call, phone
  notifications, Spanish). **Turned down**: tracking HIPAA /
  OSHA training as license types, staff confirming their own hours each pay
  period, and NJ earned-sick-leave accrual changes. **On hold**: monthly OIG
  exclusion screening.
- **Time off, from staff feedback** (15 October 2026, Dominguez): a request
  takes **weekdays only, and not a weekday the office is closed all day**
  (Ivanna's Wednesday to Wednesday is 6 days, not 8) — one rule for
  balances, every request listed, the form and "Approve the clean time off"
  (`pto/counted-days.ts`). Asking for **more than is left** is still allowed
  once the person ticks that it **may be unpaid**; refused without it, and
  shown to whoever decides as **Past the balance** (`PtoRequest.pastBalance`).
  The form now asks the server what a request takes (`GET /pto/preview`).
  **Sick days are never prorated** (Jennifer's 5 had shown as 2.2) — except
  **hourly staff starting on or after 16 October 2026**
  (`PtoPolicy.sickAccrualFrom`, Practice settings), who **earn** them: an hour
  per 30 hours worked, up to the year's days ("going forward, any new staff
  that is hourly would get the accumulation" — not the general accrual change
  turned down below). A **pop-up on Home at the start of each month** with
  the PTO and sick days left, once (`Employee.balanceReminderMonth`; not in
  somebody's first month). Migration `20261015020000_time_off_counting`;
  see *Which days a request takes* and after in `docs/architecture.md`;
  `tests/browser/time-off-feedback.mjs`.
- **Diagnostics and reimbursements** (16 October 2026, Dominguez: "it
  shouldn't be an excel, it should be an app inside the app with the similar
  format … a 'big board' for staff to reference … reimbursements also … a big
  board, but also searchable … preloaded with the data that is already
  there"; replaced the 15 October pasted reference tables, never used).
  **Diagnostics** (`/diagnostics`, everybody; Home's Quick card, Resources →
  Reference): insurances × ultrasounds or tests (two halves, as on the sheet),
  YES / NO / PA / Call ref # / N/A coloured as the sheet, time and prep above,
  self-pay below, the sheet's reminders, a plan's eCW insurance / payer ID /
  insurance ID; **Find an insurance** gives its answers as large tiles, **Test**
  narrows to one; **Big board** fills the screen. **Reimbursements**
  (`/reimbursements`, **managers and admins only**; Manage and Resources):
  CPT × insurance amounts, searchable by code or description, insurances
  narrowed, a code pressed for every insurer's amount highest first, big
  board. Both **loaded from the sheets** by migration
  `20261016020000_diagnostics_reimbursements_data` (so the contracted rates
  are now in the private repo — accepted, as asked) and kept in place by
  managers and admins (**Edit the board**). `src/diagnostics/`,
  `src/reimbursements/`, `pages/DiagnosticsPage.tsx`,
  `pages/ReimbursementsPage.tsx`, `components/BigBoard.tsx`; schema guard pins
  every field; `tests/browser/diagnostics.mjs`, `reimbursements.mjs`. The
  **I-693 applicants** sheet was **not brought in** — patients, with dates of
  birth and ID numbers (*Data this app does not hold*). Worth carrying to the
  EMR module.
- **Vendor payments** (15 October 2026, Dominguez — the "Payments to vendors"
  sheet): **admins only**, Manage → Vendor payments: each vendor, and every
  invoice, check or cash payment, **To pay → Sent → Completed** with the
  days; what is not completed yet, and what each was paid this year. Notes
  never carry a patient's name (the sheet's did); the schema guard pins
  `Vendor` and `VendorPayment`. No history imported — "going forward".
  `src/vendors/`, `pages/VendorsPage.tsx`, migration
  `20261015030000_reference_tables_vendor_payments`;
  `tests/browser/vendors.mjs`.
- **Phone book for referrals** (18 October 2026, Dominguez: "a searchable
  phone book for referrals for staff to use and edit" — from the practice's
  PHONE_BOOK.docx): `/phone-book`, for **everybody signed in to read, add and
  change**, and **managers and admins only to remove** (Dominguez). Labs, Holy
  Name services, home care, DME, hospitals, pharmacies, imaging and every
  specialty as a **Listed under** heading, 315 entries loaded by migrations
  `20261018020000_phone_book_data` (first read) and
  `20261018040000_phone_book_data_v2` (re-read with offices and stars; adds
  only entries not already there, so staff's edits are kept) from the
  document — every number and email in it was checked present. The split into
  entries was made by a script from the document's layout, so **a few entries
  are untidy**: staff fix them with Edit. **Same day, Dominguez's four asks**:
  (1) **printable** — **Print** on the page opens `/phone-book/print`
  (outside the layout, like the printed rota) with the heading, search or
  "preferred only" being looked at. **Made for patients** (Dominguez: "easier
  to read, as this will be distributed to patients"): the default **patient
  copy** is large, easy type in two columns, each place's name, its addresses and bold phone
  number, a line asking them to call and check their
  insurance, and a ★ legend — **no fax numbers and none of the notes**, which
  are the staff's (what to fax over, account numbers, an account manager's
  cell). A **Staff copy** tick adds fax numbers and notes in a denser two-column
  list headed "not for patients". Starred first. **Short on purpose** (Dominguez: "less pages,
  ideally how it is on the document — cardiology should only be 2 pages"):
  Cardiology is one page, the whole book about 22, headings running on rather
  than a page each. (2) **Starred / preferred** — the document's **yellow-highlighted**
  entries (39) are `ReferralContact.preferred`, shown with an amber ★, first
  within a heading, a **Preferred only** button and a tick in the form.
  (3) **Several offices** — `ReferralOffice` (label, address, phone, fax; a
  box may hold several numbers): the document's multi-address entries
  (Apex Heart's eight, LabCorp's five patient sites) are one entry with an
  office each; **+ Add another address** in the form. (4) **Easy to reach** —
  its own tab in the laptop header and on the phone's bottom bar (a sixth
  tab), still on Home's Quick card and Resources; the search is focused on a
  laptop (not a phone, where the keyboard would cover the list), stays in
  view while scrolling, and lives in the address (`?q=&category=&starred=`)
  so Back returns to it. Search takes any words in any field and every
  office, and a number however it is written; a phone number is a call link,
  a fax number is not. Entries are about **places only — never a patient**
  (the form says so; the schema guard pins both tables). Lab account numbers
  and NPIs in notes are the practice's business identifiers, not a person's.
  The page body is English; only its labels on Home, the header and
  Resources have Spanish. `src/phone-book/`, `pages/PhoneBookPage.tsx`,
  `pages/PhoneBookPrintPage.tsx`, `lib/phone-book.ts`, migrations
  `20261018010000_phone_book`, `…030000_phone_book_offices` (the old
  single address/phone/fax become a first office; entries nobody had touched
  are dropped and re-read), `…040000_phone_book_data_v2`;
  `tests/browser/phone-book.mjs`. Worth carrying to the EMR module.
- **Manage in five headings** (18 October 2026, Dominguez: "lets cut down the
  manage options — job roles can be with staff, locations and kiosks together,
  etc."): up to fifteen entries became five, each opening its first screen
  with a **strip of tabs** to the others — **Dashboard**; **People** (Staff,
  Job roles, Licenses, Onboarding & Offboarding, Provider productivity);
  **Offices** (Locations, Kiosks, Closing checklists, Reps); **Surveys &
  reading** (Surveys, Required reading); **Money** (Export, Reimbursements,
  Vendor payments). The grouping was Claude's from Dominguez's two examples —
  change it in one place, `lib/manage-sections.ts` (which screen sits under
  which heading, and who may open it). Nothing else moved: every screen keeps
  its address and its server-side permission, and a person sees only the tabs
  they may open (a manager has no Staff tab; the strip is left off when only
  one tab is left, so staff answering a survey see none). The header's Manage
  menu and the phone's More → Manage show the five; the heading stays lit on
  each of its tabs (`components/SectionTabs.tsx`, `NavMenu`'s `matches`). Help
  has **Where is everything under Manage?**, and "Manage → X" in Help and the
  screens now reads "Manage → People → X". Older entries above still say
  "Manage → X": read them with this map. Browser suites reach a Manage screen
  with `goToManage(page, 'Job roles')` in `tests/browser/nav.mjs`
  (`SECTION_OF` is the same map); `tests/browser/manage-sections.mjs`.
- **Phone book, tidied** (19 October 2026, Dominguez, from a printout): the
  printed title no longer carries the search words (a search for "pulm" prints
  as the heading it found); the star is explained on a line of its own; **the
  starred are a block at the top of every heading across both columns**, then
  the rest; an office is under **Location**, not "Where"; and **a group of
  doctors is listed one to a line** ("Dr. A / Dr. B" or "Dr. A, Dr. B" in the
  name), with a specialty in brackets after the last one shown once as the
  group's note (`doctorsOf` in `lib/phone-book.ts`); the whole name is still
  what is searched, so any one doctor finds the group. Cardiology is two pages.
- **Phone book: a practice name for the card** (23 October 2026, Dominguez:
  "not each address needs an office name, if anything the whole card needs a
  practice name"): `ReferralContact.practice` (optional, migration
  `20261023010000_phone_book_practice`, schema guard updated), a **Practice
  name** field in the form, shown under the name on the card and the
  printout, and searched. The per-address name is now **Location name**,
  shown in the form only when one is set or **+ Name this location** is
  pressed; existing ones are kept.
- **Rep lunch: search the reps, add one there** (23 October 2026, Dominguez:
  "should be able to search in the dropdown and also be able to add a rep
  right there"): **Which rep?** is a dropdown you type into (name or
  company; `SearchableSelect`, now with value/label options and a footer),
  and **+ Add a new rep** (in the list, under it, or from the AI helper's
  "not on the list yet") opens a small form in place - name, company,
  medication, cell, food, status; notes stay on the Reps screen - which saves
  through `POST /reps` and chooses the new rep. `QuickAddRep` in
  `components/PracticeEvents.tsx`; `tests/browser/practice-calendar.mjs`.
- **A mini calendar on the rota** (23 October 2026, Dominguez: "should
  include a mini calendar to skip to certain weeks without having to go week
  by week"): **📅 Go to a week** (Go to a month in Month) beside Previous ·
  This week · Next opens a small month calendar: a month or a year at a time
  with the arrows, the week or month on screen shaded, today ringed; pressing
  a day goes to its week or month. `components/JumpToDate.tsx`;
  `tests/browser/jump-to-date.mjs`.
- **Phone book: providers, managers and admins add** (23 October 2026,
  Dominguez: "the add entry for the phone book should be limited to only
  providers, admin, managers"): **+ Add an entry** is shown only to them and
  `POST /phone-book` refuses anybody else (`PhoneBookService.canAdd`; a
  provider is a job role with *uses clinical forms*, and while viewing as
  somebody the chosen job roles count). Everybody it is set up for still
  reads and **fixes** entries; managers and admins still remove them.
  `tests/browser/phone-book.mjs`.
- **A published shift's job role change rings the bell** (23 October 2026,
  Dominguez: "when a published shift changes the user should be notified"):
  the bell already told the person of a published shift added, moved (hours,
  office, from home), removed or its note changed, on every path (one shift,
  "every later Wednesday", regular shifts, a usual week, publishing, copying,
  cover, time off). The one gap, a change of **job role** on a published
  shift, is now "Shift changed: … as Medical Assistant. Was … as Front
  Desk." (`shifts/shift-notices.ts`). The same words reach phones once
  **Phone notifications** are switched on in Practice settings, which they
  are not yet on the live site.
- **The phlebotomist on the calendar** (23 October 2026, Dominguez: "we
  need a phlebotomist schedule as part of the calendar"; chosen: entered on
  the calendar, not from the rota): a sixth kind of `PracticeEvent`,
  `PHLEBOTOMY` (💉, orange), added by managers from Schedule → Calendar →
  **+ Add → Phlebotomist date** or the rota's right-click day menu: an
  office, the hours and an optional name (none is "Phlebotomist"); it can
  repeat. For everyone, like diagnostics: on the calendar and its Show
  filter, narrowed by office, printed, the bell when added, moved or
  cancelled (no day-before reminder, not on Home's "coming up"), and a
  calendar feed of its own (`phlebotomist.ics`). Migration
  `20261023040000_phlebotomist_calendar`; `tests/browser/practice-calendar.mjs`.
- **Phlebotomist names saved, Telemedicine as a place, and a form crash
  fixed** (24 October 2026, Dominguez, version 1.23.0):
  - **Saved names** ("so i can reuse the name in future scheduling (should
    be able to delete name as well)"): every name a phlebotomist date is
    saved with is kept (`Phlebotomist`: id, name, created; once however it
    is capitalised; never the plain "Phlebotomist"), listed under the name
    box in the form to press and reuse, each with a × to remove it after a
    confirmation. A date keeps the name as its own title, so removing one
    changes no date. `GET /phlebotomists`, `DELETE /phlebotomists/:id`
    (managers), `events/phlebotomists.service.ts`, kept from
    `EventsService.create` / `update`. Migration
    `20261024010000_phlebotomist_names` starts the list from the names
    already on the calendar; the schema guard pins the table.
  - **Telemedicine on the Calendar's place picker** ("in north bergen
    location it should telemedicine together with this", read as: keep them
    apart): **All locations · North Bergen · West New York · Telemedicine**.
    An office now shows only its own providers, not telemedicine with it;
    Telemedicine shows the providers on telemedicine and what is
    practice-wide, nothing at an office (`TELEMEDICINE` in
    `lib/calendar-kinds.ts`, `placesOn`, `shownAt` in `PracticeEvents.tsx`;
    the printout too). `tests/browser/provider-calendar.mjs`.
  - **The crash** ("Unexpected Application Error! Invalid time value"):
    the event form's **Repeats** worked out a weekday from **Starts** on
    every keystroke, and a half-typed or cleared date reads as empty, so it
    threw. `RepeatPicker` now keeps the last whole date until a new one is
    typed, and the form refuses to save without both times. It could happen
    on any event, not only the phlebotomist. Checked in
    `practice-calendar.mjs`, which fails on the old code.
- **Home's Quick card: Rep lunches, not availability** (23 October 2026,
  Dominguez): **Rep lunches** opens the calendar on rep lunches alone
  (`/schedule/calendar?show=REP_LUNCH`; `?show=` takes any kinds, comma
  separated, and is remembered like a pick under Show), for everybody.
  **Your availability** left Quick; it is still on the Schedule, under the
  calendar link card.
- **Shared accounts** (23 October 2026, Dominguez: a general
  office@domihealthcare.com account with front desk access, kept out of what
  counts people): **Shared account, not a person** in the Staff editor
  (`Employee.isSharedAccount`, admins; a "Shared account" badge on the Staff
  card; migration `20261023050000_shared_accounts`). It signs in and sees what
  its access and job roles give it, but **never clocks in** (forced off and
  refused by `clockIn`, phone and time clock), is **never put on a shift**,
  given hand-entered hours or **time off** (refused by the server, left out
  of the rota, its print and the pickers), and Home shows "Shared account"
  instead of the clock, with no time off, monthly balance pop-up or
  availability. It is **left out of** the Directory and birthdays, 360
  feedback, pulse surveys, required reading, "never signed in", who can
  cover and the suggestions, too many off at once, find a time, licenses by
  person, time off balances, Pay & raises and auto-onboarding.
  `common/people.ts` (`A_PERSON`, spread into any "people who work here"
  query, and `assertAPerson`); `tests/browser/shared-account.mjs`. Anybody
  who reads office@ can reset its password, so it should stay Employee
  access. **Not created on the live site yet**: an admin adds it on Staff.
- **Shortcuts, the key, Time off in Schedule, and more** (23 October 2026,
  Dominguez, version 1.22.0):
  - Home's **Quick** card is now **Shortcuts** (Spanish was already "Accesos
    rápidos"), in his order: Phone book, Diagnostics, Rep lunches, the guides
    and forms, Ask Domi Staff, then **Request time off** and Help last.
  - The rota's **Key** is two rows: the fill (offices, from home, open
    shift, draft, time off) with 🍽️ at the far right, then the outline (job
    roles) with 🥪 at the far right.
  - **Time off** (`/time-off`) carries the Schedule's tabs, and Schedule
    stays lit in the header and phone bar on Time off, Reviews and On call,
    so going to the requests no longer seems to leave the Schedule.
  - **Who is told** (`TopicAssignee`) can now be anybody in the
    **Administrative** or **Manager** job role, whatever their access
    (`ASSIGNABLE` in `email/digest-settings.controller.ts`, `choosable` in
    `components/TopicAssignees.tsx`, labelled "Administrative, told only").
    They get the part's bell notes and its section of the nightly email (the
    round-up now also reads people chosen for a part, and nobody else's part
    reaches them); emails to them say a manager decides it. Deciding still
    needs Manager access, and a chosen person without it never stops managers
    clearing closing checklists (`ClosingService.mayClear`).
  - **Staff cards**: "Doesn't clock in" and "Shared account" sit beside the
    offices, not on the bottom row, so Profile and Edit stay level.
  - **Provider productivity**: a statement published, or a published one
    changed, now reaches the provider **by email** as well as the bell
    (`NotificationsService.personal`). **Printing**: Print on a statement,
    Select to print and **Print selected**, or **Print all**, each opening
    `/productivity/print?employee=&ids=` in a new tab (outside the layout,
    behind the pay PIN, print window opens by itself;
    `pages/ProductivityPrintPage.tsx`).
  - **Diagnostics and Reimbursements fit a laptop**: both screens take the
    whole width (`WIDE_SCREENS` in `Layout.tsx`); Diagnostics' columns share
    it (`table-fixed`, smaller type, names break after a slash);
    Reimbursements reads insurance names upwards and shows amounts **to the
    dollar** on the grid, with the cents on hover, read out, in the list a
    code opens and while editing (`formatRateShort`). The Big board is as
    it was. No sideways scroll from 1280 px wide.
- **View as** (23 October 2026, Dominguez: "me (as the super admin) should
  have a way to see the views that other staff have - i.e. something like view
  as another role, i can click one (or multiple) roles ... both to make sure
  build is correct, and to show staff how to do certain tasks"): account menu
  → **View as…** (admins): **Employee** or **Manager** access and any job
  roles to stand in for their own. Kept per browser tab (`lib/view-as.ts`,
  `sessionStorage`) and sent on every request as `x-view-as` and
  `x-view-as-job-roles`, which `SessionAuthGuard` honours **only for an admin
  and only downwards**: `AuthUser.role` becomes the chosen level with
  `actualRole: ADMIN` and `viewAsJobRoleIds`, so the guards, `/auth/me`
  (`role`, `viewingAs`, the job-role flags and `tools`), Resources
  (`JobRolesService.idsHeldBy`), tool access and the closing checklist preview
  all answer as that person is answered; the person's own data (shifts,
  hours, name) is still theirs. **Invoices stay shut** to an admin viewing as
  a manager (`ManagerAccessOnlyGuard` reads `actualRole`). An amber banner
  (`components/ViewAsBanner.tsx`) says whose view it is, with **Change** and
  **Back to yourself**; `useIsActualAdmin` is the one thing that stays the
  admin's. Signing out clears it. `components/ViewAsDialog.tsx`; Help has
  *Seeing the app as somebody else sees it*; `tests/browser/view-as.mjs`.
  Not reflected while viewing: the per-person switches (rota cost,
  productivity, News posting) stay the admin's own.
- **Pay behind the PIN** (23 October 2026, Dominguez: "anything that shows
  pay ... even if the certain user has access to view it, should prompt them
  to insert pin to view - sometimes a log in is left open"): Pay & raises,
  the rota's cost, staff profiles, provider productivity (and a provider's
  own), Export, Reimbursements, Invoices and Vendor payments ask for the
  person's **tablet PIN**, or their password (**Use your password instead**;
  the only way for somebody with no PIN). The unlock is per sign-in session
  (`Session.payUnlockedUntil`, migration `20261023020000_pay_lock`), lasts
  **10 minutes** and slides while pay is being used; the page also locks it
  after 10 minutes with no touch or key, and **Lock pay now** locks it at
  once. Wrong PINs count against the same lockout as the time clock; wrong
  passwords against the sign-in lockout. The server refuses with 403
  `PIN_REQUIRED` (`PayLockGuard`, added with `@UseGuards` to each pay
  controller; the rota cost's access list is not behind it), and the web's
  `request()` then sends every `PinGate` on the page back to its prompt.
  `src/pay-lock/`, `components/PinGate.tsx` (wrapping each route in
  `App.tsx`, and the rota cost on the Schedule as a folded line). The suites
  unlock with `unlockPay(page)` in `tests/browser/nav.mjs`, which
  `goToManage` calls for anything under Finances. Worth carrying to the EMR
  module, which will hold pay too.
- **Pay & raises** (23 October 2026, Dominguez: "this excel shows our current
  way of monitoring employees pay, when there was a raise, how much, when it
  became/becomes effective ... this should be what determines the rota pay
  ... exclude the providers"; then "i want to stop having to use this excel
  workflow and have a workflow within the staff portal ... This is not for a
  upload of an excel"; his choices: **the rota-cost people** see it, **the
  full steps** with the meeting made in the portal, **full leaving details**
  for the same people only): **Manage → Finances → Pay & raises** (`/pay`,
  `need: 'rotaCost'` in `lib/manage-sections.ts`, so an Employee-level person
  on the list sees Finances with that one tab). **Current staff**: pay now and
  since when, a change still to come ("Coming up"), any raise open. A name
  opens the person: the **Raise** card and the same **Pay and position**
  history as the staff profile (`EmploymentHistoryCard` now takes its routes
  as `calls`). A raise is **asked for** (day, amount optional), then **Set a
  meeting** (a practice event for the person and whoever set it, titled
  "Check-in: Casey and Morgan", never what it is about; moved or taken off,
  which tells them through the calendar), **Make an offer** (the pay, a new
  title optional), then **Approve** / **Accepted: approve it** (the pay and
  the **day it starts, past or still to come**), **Decline** / **Turned
  down**, or **They withdrew it**. Approving writes a PAY_CHANGE (PROMOTION
  with a new title) into `EmploymentChange` on that day, which is what the
  rota's cost reads from then. ADP is not changed. **Former staff**: last day,
  last position and pay, **how they left** (resigned, let go, laid off,
  retired, end of contract, other), a short reason, the **last paycheck**,
  and the **exit checklist**'s progress (a link for managers, or **Start the
  exit checklist**). Pay that is not the practice's (providers: a job role
  with *uses clinical forms*) is left out here and from the **rota's cost**
  (`NOT_A_PROVIDER` in `staff-records/rota-cost.service.ts`). Demo staff are
  left out. `PayRaise`, `LeavingRecord`, migration
  `20261023030000_pay_raises_leaving`; `staff-records/pay.ts` (rules, pure),
  `pay.service.ts`, `pay.controller.ts`; `pages/PayPage.tsx`;
  `tests/browser/pay.mjs`. Every read is logged, as the profiles'. **Pay is
  not entered on the live site yet**: the rota-cost people type each
  person's current pay in once (from the spreadsheet, by hand), then raises
  go through the screen.
- **Pay on file** (24 October 2026, Dominguez: "i need to be able to add
  people pay rate (without it being a new rate at this time or anything like
  that now)", version 1.24.0): a seventh kind of `EmploymentChange`,
  `PAY_ON_FILE` ("Pay on file"), for what somebody is already paid when it
  is first typed in. On Pay & raises a person with **No pay on file** opens on
  **Enter their pay** (pay, per hour or year from their pay type, and *Paid
  this since*, started on their hire date, empty meaning today); the staff
  profile has the same button. It is not a raise and touches no raise; the
  rota's cost reads it from that day like any pay. Refused without an amount.
  Migration `20261024020000_pay_on_file`; `tests/browser/pay.mjs`.
- **The exit checklist** (23 October 2026, Dominguez: "an exit employee
  checklist for terminated employees (i.e. keys, emr access, staff portal
  access, whatsapp, etc.)"): it is the default **offboarding** template,
  which already starts by itself when somebody is marked as left. Migration
  `20261023030000_pay_raises_leaving` adds to it each exit step it lacks
  (matched by a word in the title, after its own tasks, so nothing a manager
  wrote changes): keys and door / alarm codes, EMR (eCW), Domi Staff,
  **WhatsApp groups**, work email, phone extension or softphone, Google
  Drive, BrainCheck and outside portals, shared passwords (Wi-Fi, the iPad),
  equipment. With no default template it makes "Exit checklist - Domi
  Healthcare". `prisma/seed.ts` has the same steps. Managers tick it off and
  change its steps under Manage → Staff → Onboarding & Offboarding; Pay &
  raises shows its progress beside the leaving details. **Check the
  template on the live site** and add or remove steps there.
- **Time off is a tab under Schedule** (23 October 2026, Dominguez: "how do i
  even get to time off requests?"): Shifts · Calendar · **Time off** · Reviews
  · On call · Timesheet - everybody's requests for a manager, your own for
  staff (`/time-off`, unchanged), beside "All requests →" on the Shifts tab.
- **Job roles are a pop-up on Staff** (23 October 2026, Dominguez: "is the
  Job roles section actually needed since we are already grouping them at the
  top? ... can't that be integrated?"): the section at the bottom of the Staff
  screen is gone; **Job roles…** at the end of the row of job roles above the
  list opens the same thing (`JobRolesSection` inside a `Modal`: add, rename,
  colour, members, minimums). `/job-roles` lands on Staff with it open.
  `goToManage(page, 'Job roles')` in the suites opens the pop-up.
- **Phone book: Specialty, searchable; addresses on two lines** (23 October
  2026, Dominguez): "Listed under" is **Specialty** on the page, the form and
  Help, and the filter is a dropdown you type into
  (`components/SearchableSelect.tsx`: a combobox with the list narrowing as
  you type, arrow keys, Enter, Escape; clearing it means every specialty).
  An address shows as the street on one line and the town, state and zip on
  the next (`addressLines` in `lib/phone-book.ts`, on the cards and the
  printout; only when the end reads like "Union City, NJ 07087", else one
  line; the stored text is untouched). `tests/browser/phone-book.mjs`.
- **Manage's headings renamed** (22 October 2026, Dominguez): **People is
  Staff** and **Money is Finances**, and **Provider productivity moved to
  Finances** (Export, Reimbursements, Invoices, Vendor payments, Provider
  productivity). `lib/manage-sections.ts`; Help, the screens and the suites'
  `SECTION_OF` follow. Older entries in this file still say "Manage → People
  → X" and "Manage → Money → X": read them as Staff and Finances.
- **Closing checklists go by the main job role** (22 October 2026, Dominguez:
  "make sure it only goes to the people whose primary/main role is that (i.e.
  Celeste should not be getting checklists)"): `ClosingService.applicableFor`
  takes the sections of the person's **main** job role only (`isPrimary`; the
  first role they hold when none is marked), not every role they hold, on the
  phone and at the time clock alike. Somebody Administrative first and Front
  Desk second gets no list. `tests/browser/closing.mjs` switches Frankie's
  main role to check it.
- **Who looks after what** (22 October 2026, Dominguez: "assign staff (i.e.
  specific managers/admin) to being notified and clearing/approving
  checklists ... in the offices -> closing checklists"; "same thing with PTO
  requests, i don't want to always be notified of PTO requests, that should be
  a setting to who it notifies"): a part of the round-up can now have people
  **chosen** for it (`TopicAssignee`: topic, employee; `GET
  /digest-settings/assignees`, `PUT /digest-settings/assignees/:topic`,
  managers), beside the per-manager unticking on Email settings. A part with
  anybody chosen goes to them alone: its bell notes as things happen (a new
  time-off request, a CME request, a correction asked, an availability clash,
  a clock-out with something missed) and its section of the nightly email
  (`chosenOrReaders` in `email/digest-topics.ts`, one rule for
  `NotificationsService` and `DigestService`); with nobody chosen it goes by
  the ticks as before, and to everyone when nobody has it. Set on the screen
  the part belongs to, with one component (`components/TopicAssignees.tsx`):
  **Who is told of new requests** (folded) on Time off requests, and **Who
  looks after them**, a fourth tab on Closing checklists; Email settings lists
  **Chosen to look after a part** under Who gets what. **Closing checklists
  are also cleared**: `ClosingRecord.clearedAt` / `clearedById`, **Clear** on
  a clock-out with something missed (`POST /closing/records/:id/clear`; only
  the people chosen for Closing, or any manager while nobody is), which takes
  it off the banner and the nightly email ("Cleared by ... at ..."); the
  chosen people are rung at once (`NotificationKind.CLOSING`, no lines in
  it). Migration `20261022010000_topic_assignees_closing_cleared`;
  `tests/browser/who-looks-after.mjs`, `closing.mjs`. Worth carrying to the
  EMR module.
- **Staff and Job roles are one screen** (22 October 2026, Dominguez: "can we
  merge the Staff and Job Roles? I should be able to search staff by job
  roles"): **Manage → People → Staff** has a **row of job roles above the
  list** (Everyone, then each role with a count; one press shows only the
  people in it, `?role=<id>` opens it so), the search box also matches a job
  role's name, and the **job roles themselves are the bottom of the screen**
  (`components/JobRolesSection.tsx`: the same cards, + New job role, the
  minimums; `/job-roles` redirects to `/staff#job-roles`, which scrolls
  there). **Managers open Staff now** - this revises the 8 October decision
  that the Staff screen stays the admins': they keep the job roles, so the
  merged screen has to be theirs too. A manager sees the cards (as the
  Directory shows people, plus access and job roles) and the job roles, and
  none of the admin's tools - Add, Add several, Profile, welcome emails, who
  never signed in, ADP File #, password and PIN status (`isAdmin` in
  `StaffPage`; the server refused them already). **Edit stays for managers**
  as it always was at `/staff` (the suites `staff-profile`, `credential-types`
  and `main-job-role` rely on it): the editor shows them the person and their
  licenses, hides the photo and sign-in tools, and the server refuses a save. The right-click menu's
  **Open in Staff** stays admins' only. The People strip has no Job roles
  tab; `goToManage(page, 'Job roles')` in the suites opens Staff and waits
  for the section (`TAB_OF` in `tests/browser/nav.mjs`). Help's "Manage →
  People → Job roles" now reads "Manage → People → Staff → Job roles".
  `tests/browser/staff.mjs`, `manage-sections.mjs`.
- **Phone book: print one entry, and nothing cut off** (22 October 2026,
  Dominguez: a computer "is cutting off the edges", and "print just that
  contact card ... click an icon of a printer"): a **printer icon** on every
  card opens `/phone-book/print?entry=<id>` in a new tab - that one place
  alone, one column, a size up (18-point name on the patient copy), headed
  with its name and the heading it is listed under, Staff copy still a tick -
  and **the print window opens by itself** once the entry is on the page
  (once; a dev build runs effects twice, so the mark is set when the timer
  fires). The cut edges: the printout now wraps any long web address, email
  or address inside its column (`overflow-wrap: anywhere`), is never wider
  than the printable width, and keeps its half-inch margins; what the app
  cannot set is the print window itself, so a line under the toolbar and Help
  say: paper size Letter, margins Default, scale 100% (or Fit to page). The
  toolbar's own Print link is matched `exact` in the suite now that the cards
  have "Print <name>" links. `tests/browser/phone-book.mjs`.
- **News and the whole rota for staff an admin chooses** (19 October 2026,
  Dominguez: Administrative access "needs to post notifications (about
  schedule etc) and view everyone's schedule"; named: Angelica Notario;
  schedule chosen as a **read-only rota of published shifts**): two switches on
  the Staff editor, `Employee.canPostNews` (writes, edits and removes any News
  post) and `canSeeEveryonesSchedule` (an **Everyone** tab under Schedule,
  week and month, time off as "Off", no drafts, open shifts or notes, nothing
  changeable). Job roles still grant no power. Migration
  `20261019020000_news_and_schedule_access` switches Angelica Notario on only
  if exactly one current person has that name: **check the Staff screen on the
  live site**. `shifts/everyones-schedule.*`, `pages/EveryonesSchedulePage.tsx`;
  `tests/browser/everyone-schedule.mjs`. Worth carrying to the EMR module.
- **Timesheet is a tab beside Shifts** (19 October 2026, Dominguez: "put
  schedule and timesheet together so the header remains only 1 row"): off the
  laptop header, on the Schedule's strip; Schedule stays lit on it.
- **Managers change the kind of time off** (19 October 2026, Angelica
  Dominguez via Dominguez: an hourly person put a sick day down as PTO): on
  Time off requests, **Change to** (Sick / PTO / Unpaid) on any waiting or
  approved request that is not the manager's own, past days included, after a
  confirmation. Balances move because they read the type afresh; nobody is
  told. `PATCH /pto/:id/type`, `PtoService.changeType`;
  `tests/browser/time-off-type.mjs`.
- **Schedule review groups, and the pattern from the provider sheet** (19
  October 2026, Dominguez, from the practice's Schedule Review picture and
  *Domi Schedule NB & WNY 2026*): beside the per-provider pattern, **Schedule
  → Reviews** has **Who reviews each group** (`ScheduleReviewArea`: name and
  one reviewer, everybody reads, managers edit; on a reviewer's Home as
  "Always · …"). Started as Telemedicine = Kayla B, NB Providers = Angelica N,
  NB Bloodwork & Nursing = Kayla B, WNY ALL = Tatiyana R. The sheet also set the
  **usual per-provider pattern** Monday to Friday: a provider on telemedicine
  that day is reviewed by Kayla B, at North Bergen by Angelica N, at West New
  York by Tatiyana R (Saturdays change by the week of the month, so are left
  out). Migrations `20261019030000_schedule_review_areas` and
  `20261019040000_schedule_review_pattern_from_sheet` match people by name and
  providers by initials (JD, CI, JB, DD, KH), each only when exactly one fits,
  and leave a provider who already has a pattern alone: **check Reviews on the
  live site and fill any gap in the app**. The sheet's
  assignment of Claude's reading (location decides the reviewer) is an
  assumption to confirm. `tests/browser/schedule-reviews.mjs`.
- **Providers on the calendar** (19 October 2026, Dominguez: "so staff know
  what offices are open and who should be there and who's scheduled to be on
  telemedicine"): a **Providers** kind on Schedule → Calendar (month, list and
  the printed month, filterable by office): each day, each office's providers
  with their hours, and **Telemedicine** for work-from-home shifts. Built from
  the **published** shifts of people in a provider job role (so it is only as
  right as the rota), names, offices and hours only; which offices are shut
  is the Closures kind beside it. Everybody reads it. Not in the phone calendar
  feed. `GET /calendar/providers`, `CalendarService.providerPlaces`,
  `components/ProviderPlaces.tsx`; `tests/browser/provider-calendar.mjs`.
- **Reviews, tidied** (19 October 2026, Dominguez: "why does reviews and on
  call have different formats from the others … reviews should show … the
  location … and include the resources"): Reviews and On call now lay out like
  Shifts and Calendar (title, then the tab strip, in the same centred width).
  Each provider on the Reviews week wears a **place tag** for that day, from
  their published shifts: the office in its rota colour (NB, WNY) or **Tele**
  (violet). The groups gained **resources**: a group ticked *Resource (on each
  day)* in the editor (`ScheduleReviewArea.forResources`) is listed on every
  weekday's card. The starting list is now Telemedicine, NB Providers, WNY
  Providers, and the resources NB BW, NB Nurse, WNY BW, WNY Nurse (migration
  `20261019050000_review_resources` splits the old groups, keeping each one's
  reviewer, and touches only groups still under their starting names).
- **Guides and invoices from the staff's own documents** (20 October 2026,
  Dominguez: "these 4 documents are things the staff use / update ... lets
  create easy ways for staff to utilize these"; his choices: managers and
  admins edit, the playbook for providers, managers and admins). Three
  **guides** (`GuideSection`, `GuideKey`; `src/guides/`), each a list of
  sections under headings in a light markup (`lib/guide-markup.ts`: bullets,
  tables, `**bold**`, `==action==` amber, `!!` red warnings, `[[Blank]]`,
  `:::copy` blocks, `::tool:` helpers), searchable by any words, a heading at a
  time, loaded by migration `20261020010000_guides_and_invoices` from the
  documents (typos mended, the scripts' examples turned into blanks, the
  duplicate Omega 3 and the half-copied Tylenol entry left out, the playbook's
  empty table dropped). **Front desk guide** (`/front-desk`, everybody; Home's
  Quick card and Resources): the Front Desk Cheat Sheet, with message scripts
  filled in and copied in the browser (never sent), a **how many to dispense**
  helper and **new patient or follow up** (3 years to the day). **Results
  playbook** (`/results-playbook`) and **Inpatient notes**
  (`/inpatient-notes`, templates to copy and a **which code for the time**
  helper from 99221-99233), for providers, managers and admins (server-side,
  `guides/guides.ts`). The playbook's "CI, JD, JB" are Dr.
  Iparraguirre, Dr. Dominguez and Dr. Badia (confirmed by Dominguez). **Invoices**
  (Manage, Money, managers and admins; `Invoice`, `InvoiceLine`,
  `src/invoices/`, `pages/InvoicesPage.tsx`, `lib/invoice-pdf.ts`): numbered
  #001 on, laid out like the Invoice Template, kept to download again, marked
  paid, searched; **to a patient** the details go on that PDF only (see *Data
  this app does not hold*). Also fixed: the phone book's and guides' sticky
  search bar covered the header's menus. `tests/browser/guides.mjs`. The
  guides and invoices are worth carrying to the EMR module.
- **Invoices: who it is paid to** (21 October 2026, Dominguez: "some
  invoices go directly to the provider - therefore - the default should be
  the practice but should be able to create options that you can save and
  change the pay to info"): the invoice editor has **Pay to**, starting on
  Domi Healthcare; **+ New pay-to** there, or **Pay-to options** on the list,
  saves others (`InvoicePayee`: the name at the top of the invoice, address /
  email / phone lines, who checks are payable to), which managers and admins
  change or remove. The PDF prints the chosen one at the top and on "Make all
  checks payable to"; the logo and the office's contact line at the foot stay
  the practice's. Each invoice keeps a **copy** of its pay-to
  (`Invoice.payToName` / `payToLines` / `payableTo`, all empty for the
  practice), so changing an option never changes one already sent. Business
  details only, no tax ID (the form says so, the schema guard pins it).
  Migration `20261021020000_invoice_pay_to`. **Saved vendors** the same day
  (Dominguez: "also have a way to save the vendor information"):
  **Saved vendor** in the editor fills in who it is to, **Save this vendor
  for next time** saves what was typed (or updates the saved one of that
  name), and **Saved vendors** on the list changes or removes them
  (`InvoiceVendor`, migration `20261021030000_invoice_saved_vendors`);
  invoices keep their own copy. **Invoices are for Manager access only**
  (Dominguez, same day: "managers only should be able to access invoices",
  as a provider paid directly may need their **home address** on one):
  admins do not see the screen or its routes (`ManagerAccessOnlyGuard`, the
  one place an admin does not pass; `managerAccessOnly` in
  `lib/manage-sections.ts`). The logo and office details stay on every
  invoice, with **angelica@domihealthcare.com** as its email (`PRACTICE`
  in `lib/invoice-pdf.ts`). `tests/browser/guides.mjs`.
- **Forms and guides in their own Resources sections** (20 October 2026,
  Dominguez: "the forms/references should go in the subsections that they
  are supposed to"): the Forms and Reference blocks at the top of Resources
  are gone; each built-in tool is a tinted card at the top of the section it
  belongs to (`lib/resource-tools.ts`): Phone book and Diagnostics under
  Everyone; the BrainCheck Care Plan, APCM Care Plan, Results playbook and
  Inpatient notes under the job role with *uses clinical forms* (Provider);
  the Annual Wellness Visit under each role with *uses the wellness form*;
  the Front desk guide under a role named Front Desk; Reimbursements under
  Manager. Only tools the person may open are shown, and one whose section
  they cannot see falls back to Everyone. Same day: the Directory card lost
  **Set a new tablet PIN** (see *Tablet PINs*), and Home lost "The Directory
  shows you there while your shift is on." for staff who do not clock in.
- **Managers choose who uses each form and guide** (20 October 2026,
  Dominguez: "there should be an option for managers ... to make the form
  available for either one group or multiple groups of job roles"; and "APCM
  Care Plan should be Medical Assistant and AWV has to be for both"): on
  Resources each built-in tool (phone book, diagnostics, front desk guide,
  BrainCheck Care Plan, APCM Care Plan, Annual Wellness Visit, results
  playbook, inpatient notes) says who it is for, and a manager or admin
  presses **Change** to pick **Everyone** or any job roles. It is then
  listed in those roles' sections, and the server refuses everybody else
  (`ToolAccess`, `ToolAccessRole`, `src/tool-access/`, `GET /tool-access`,
  `PUT /tool-access/:key`; the session's profile carries `tools`, read by
  `canUseTool` in `lib/clinical-access.ts`). **With no row saved, the
  defaults are worked out in code** (`tool-access/tools.ts`), so nothing
  changed on the live site until somebody saves: phone book and diagnostics
  for everyone, the front desk guide for Front Desk, the BrainCheck Care
  Plan, results playbook and inpatient notes for providers (*uses clinical
  forms*), and the APCM Care Plan and the Annual Wellness Visit for the roles
  with *uses the wellness form* (Medical Assistant and Provider). Managers
  and admins can always open them, **except the BrainCheck Care Plan** (its
  note is signed as the provider). The **AWV stays one form** (not split):
  in the Provider section it opens on page 1, in any other on page 2
  (`?page=`). The Job roles screen's *uses the wellness form* tick is gone
  (the setting now lives on Resources; the column stays for the defaults),
  and *uses clinical forms* reads "People in this role are providers" (it
  still decides on call, schedule reviews, productivity and the AWV page).
  Reimbursements is back on Resources, in the Manager section, fixed to
  managers and admins. `tests/browser/care-plan.mjs`, `guides.mjs`.
- **CME requests** (21 October 2026, Dominguez: "a CME reimbursement
  submission form for providers for managers to approve"; "it's not for
  receipts - it's to approve a cme activity/event"; a **yearly allowance per
  provider**): `/cme` - **Your CME** in the account menu for providers (a
  job role with *uses clinical forms*) and **Manage → People → CME** for
  managers and admins. A provider asks with the activity, who runs it, in
  person or online and where, the days, credits and four costs (registration,
  travel, lodging, other); the form adds them up against that year's
  allowance. Managers **Approve** (that amount or another, optional note),
  **Decline** (a reason, which they read) and later **Mark paid back** (day
  and amount); never their own, each decided once. Allowances per provider a
  calendar year (blank is none), counted from approved requests at what was
  paid back once it has been; going past it **warns, never refuses**. Told on
  the bell and by email both ways (managers down for the Licenses part), and
  in the nightly email under *coming up* while waiting (`cmeWaiting`). **No
  receipts or certificates kept** - the form says so; the schema guard pins
  `CmeRequest` and `CmeAllowance`. Not in the payroll export. `src/cme/`
  (`cme.ts` rules, pure), `pages/CmePage.tsx`, `lib/cme.ts`, migration
  `20261021010000_cme_and_office_admins` (notification kind `CME`);
  `tests/browser/cme.mjs`. See *CME requests* in `docs/architecture.md`.
  Worth carrying to the EMR module.
- **An admin in the office, and minimums on chosen weekdays** (21 October
  2026, Dominguez: "we need to have an admin in WNY location daily except
  Friday - right now the schedule is that Kayla is Wednesday, Tatiyanna is
  Monday and Celeste is Tuesday and Angelica Notario Thursday"; chosen: a rule
  plus a list everybody sees). A **staffing minimum can apply on chosen
  weekdays** (`StaffingMinimum.weekdays`, empty is every day; the days under
  a number on Job roles), and the migration sets **Administrative at West New
  York, 1, Monday to Thursday** - so a short day is on the Schedule banner, in
  the nightly email and in Before you publish, and Too many off at once uses
  it on those days. It counts shifts **in the Administrative job role**, so
  **check on the live site that the four have it and their WNY shifts carry
  it**. **Admin in the office** on Schedule → Reviews (`OfficeAdmin`,
  `OfficeAdminDay`; like schedule reviews): who per office per weekday, one
  day changed by a manager with a note, everybody reads it, the admin sees it
  on **Home**; managers also see when that person is off or not on the rota
  there. No notifications. The migration loads Tatiyana R Monday, Celeste
  Tuesday, Kayla B Wednesday, Angelica Notario Thursday, each only when
  exactly one current person fits: **check it on the live site**.
  `src/office-admins/`, `staffing/weekdays.ts`,
  `components/OfficeAdminsCard.tsx`, `components/MyOfficeAdminDays.tsx`;
  `tests/browser/office-admins.mjs`. See *The admin in the office* in
  `docs/architecture.md`.
- **Downtime** (26 October 2026, Dominguez: "a downtime section - things that
  are needed or to do when downtime happens (i.e. no access to EMR) it should
  be activated by manager/admin and then closed by them as well - it should put
  notifications for employees who have a shift now or upcoming today - it
  should be clear and easy to use"; discussed first, the forms drawn as a mockup
  and changed with him): `/downtime` (Home's Shortcuts, Resources), tabs **Now**,
  **What to do**, **Forms**, **Monthly check** (admin team and managers),
  **Log** and **Set-up** (managers). A manager or admin **starts** one: what is
  down (eCW, phones (Weave: phones, fax, card machine), internet), which office
  (eCW starts on both; the internet can be one), a note; or **Planned**, entered
  ahead, starting by itself, those working then told at 6pm the evening before.
  Everybody on a published shift there today is told (bell, email, phone), and
  managers and admins; anybody coming on later, two hours before their shift (the
  five-minute timer). A **red bar** on every screen and on the time clock while it
  is on. Managers tick off **who they contacted** (support numbers, managers and
  admins only: eCW email and Stephanie Parker, Kevin S. MacNiven of United MSO,
  Miguel for the internet, Weave), **post updates** to the same people, and
  **close** it with the **cause**; the catch-up is due the same day under 4
  hours, the next working day up to a day, else a plan. The **log** adds up the
  year (how many, how long, by cause, what was down, office) and keeps who was
  told and contacted, the updates, **caught up** and **paper shredded** (two
  weeks after). **What to do** is a guide (`GuideKey.DOWNTIME`) for everybody,
  opening on their own job (Front desk, Medical assistant, Provider, Managers and
  admins), managers edit it; telemedicine uses doxy.me then Doximity, urgent
  calls Doximity, a power cut means the other office or rescheduling. **Forms**
  print from the portal, nothing on Drive (Dominguez): sign-in sheet (17 rows),
  running patient sheet (two a page), checkout list (follow-ups), call-back list,
  progress note (two pages, his time statement without the EMR parts), order
  pads (lab and referral, all five providers with NPIs under the signature;
  **the old paper pads had Dr. Iparraguirre's NPI wrong**, 1700383942, now
  1700383924), a "What to do" sheet per job and a window sign in English and
  Spanish (**the Spanish needs a native speaker's read**). Blank, filled in by
  hand: no patient detail reaches the app. The **monthly check** goes to admins
  and the Administrative job role on the 1st (and the 8th if not done): what is
  low in the stack and anything changed, to managers until read. The nightly
  email has a **Downtime** part. Migrations `20261026010000_downtime_kinds`,
  `20261026020000_downtime` (the procedures, contacts, stack and providers);
  `src/downtime/`, `pages/DowntimePage.tsx`, `pages/DowntimePrintPage.tsx`; see
  *Downtime* in `docs/architecture.md`; `tests/browser/downtime.mjs`. **Next**:
  a quiz on the procedures, sent through Required reading; what to buy for the
  offices (backup internet, battery backup, a lockable downtime box) is to be
  discussed after. Worth carrying to the EMR module.
- **Turned down: "PTO about to be lost"** (9 October 2026, Dominguez): a
  reminder to use PTO before it fails to carry over was proposed and refused —
  not in the practice's interest. Do not propose it again.
- **Time off on a staff profile, condensed** (8 October 2026, Dominguez:
  "shouldn't be this big … maybe just a pop up"): the profile shows what is
  left, the next day off and what is waiting; **See all N on file** opens
  the list in a pop-up (recorded days removable there), and **+ Record
  past time off** and **Adjust balance** open in pop-ups too — Adjust is
  the same form as Time off → Staff balances, so it can be done from the
  person (`GET /pto/balances/:employeeId`). `components/Modal.tsx` is a
  shared pop-up for new ones.
- **"Time off & balances" retired from Manage** (8 October 2026, Dominguez,
  from a four-screen rendering, "looks good"): **requests** stay on the
  Schedule (to decide, with **All requests →** opening `/time-off`, now
  titled "Time off requests" for managers; "All your time off" for staff),
  and **+ Request time off** has the **For** picker for managers;
  **everybody's balances with Adjust** are a **Time off balances** card on
  the **Dashboard** (managers and admins — Dominguez), open from the start,
  six rows then "Show all"; the **time off rules** (PTO and sick a year,
  carry-over, year start, prorating) are in **Practice settings**, admins
  change them. `/time-off` keeps the manager's own balance and says where
  the rest went.
- **"For [name]" on a staff profile** (8 October 2026, Dominguez): shortcuts
  to Schedule, Timesheet, Licenses, Onboarding & offboarding and
  Availability opened **narrowed to that person** (`?person=<id>`, read by
  `components/OnePerson.tsx`, with **Show everyone** to undo it; the
  Schedule already had it), and **+ Request time off for …** (`?for=<id>`
  on `/time-off?request=1`). From an audit of what could only be done from
  one screen; still only on their own screens: regular shifts, Email
  settings' "Who gets what", productivity. **The Staff screen stays the
  admins'** (decided by Dominguez, 8 October 2026, on Claude's
  recommendation): the right-click person menu's **Open in Staff** is now
  shown to admins only — managers were offered it, but the Staff screen is
  in the admins' menu and only an admin can save there. Managers have the
  Directory (the same person, PIN reset, See schedule).
- **Home's "today" is New Jersey's** (fixed 8 October 2026): Home asked for
  today's shifts by the browser's own day, so a browser in another zone —
  CI's, in UTC — lost a shift running past its own midnight, and `wfh.mjs`
  failed whenever CI ran between 5 and 8 pm New Jersey time. Now
  `practiceToday()` in `lib/practice-time.ts`, like the rest of the app.
- **Changing a shift's hours** (5 October 2026, Dominguez: "Gaby is 7-2 but
  it is changing to 1-8, so instead of Celeste doing 1 by 1, she can just
  edit all"): the shift's pop-up on the rota has **Hours**; once changed it
  offers **Just this shift**, **every later Wednesday like it**, or **all of
  their later 7am–2pm shifts, any day** (same person, office and old hours,
  not yet started). Changed in place — notes and publishing kept, a clash
  skipped and listed, the person told once. A regular shift behind them
  follows (ended the day before and carried on at the new hours), so later
  weeks do too. `POST /shifts/:id/retime`, `shifts/shift-retime.service.ts`;
  see *Changing the hours or place of a shift* in `docs/architecture.md`;
  `tests/browser/shift-hours.mjs`. **The place too** (6 October 2026,
  Dominguez: "needs to be able to update location as well"): the section is
  **Hours and place**, with a **Location** list (their offices and Work from
  home; an open shift, any office) under the same three choices; a regular
  shift follows to the new place. The pop-up's old **Make it work from
  home** button was taken out (Dominguez) — the Location list does it.
  **The pop-up's hours are New Jersey's** (fixed 6 October 2026): it used to
  read them on the browser's clock while the server reads them as New
  Jersey's, so a browser in another zone moved the shift on every save (CI's
  UTC browser put it 8 hours later and `wfh.mjs` failed). Now
  `lib/practice-time.ts`; live as `fead07e`.
- **Tablet PINs are chosen by staff** on their profile (confirmed with their
  password); the profile shows only that one is set and since when, never the
  PIN. An admin sets a replacement from the Staff editor (Signing in), never
  reads one (decided September 2026; on the Directory card until 20 October
  2026, when Dominguez moved it to the Staff screen to make the cards
  shorter, so managers who are not admins no longer have the button). **The PIN rules are light** since
  October 2026 (Dominguez: "please don't make it too strict"): only one digit
  repeated, a straight run and a short list of the commonest PINs are
  refused; years (1911) and patterns (3636) are allowed. The lockouts do the
  rest (`kiosk/pin.service.ts`).
- **Regular shifts** (September 2026, Dominguez: "I always work Mondays"):
  Repeating shifts → **No end date** makes a `ShiftSeries`; its shifts are
  written out 8 weeks ahead (`STANDING_DAYS_AHEAD`) and the nightly job
  writes the next ones, from the day after the last written, so a shift
  removed by hand stays removed. Listed under Schedule → **Regular shifts**,
  stopped there from a chosen last day (later shifts cancelled or deleted,
  person told once).
- **Which weeks** (October 2026, Dominguez: "1st Saturday of the month -
  stuff like that"): repeating shifts, the ＋ on the rota and a regular
  shift's Edit choose every week, every 2–4 weeks, or **certain weeks of the
  month** (1st–4th, last; several at once), with the first few dates shown
  before saving. `ShiftSeries.everyWeeks` / `weeksOfMonth` / `cycleFrom`;
  one rule in `shifts/repeat-pattern.ts`, mirrored in the web's
  `lib/repeat-pattern.ts`. A usual week only reads and replaces every-week
  ones. See *Which weeks* in `docs/architecture.md`;
  `tests/browser/repeat-weeks.mjs`.
- **A usual week** (29 September 2026, Dominguez: a salaried person with
  different hours or offices each day needed a regular shift per day): under
  Schedule → Regular shifts (**Set somebody's usual week**, or **Their
  week…**) and in the Staff editor, tick the days somebody works and give
  each hours, a place (office or work from home) and optionally a job role;
  saved once, from a chosen day. Stored as ordinary regular shifts — days
  sharing hours and place share one — so nothing else changed. A later save
  only touches the days that changed; the person is told once. One shift a
  day. See *A usual week* in `docs/architecture.md`.
- **A shift's job role is one the person holds** (29 September 2026,
  Dominguez: "I shouldn't have the option to be 'any job role'"). Every shift
  form (add, ＋ on the rota, repeating, regular-shift edit, usual week,
  assigning an open shift) offers only the chosen person's roles — no "Any"
  or "Not specified"; with one role it is that one. Assigning an open shift
  with a role lists only people in it. The server enforces it
  (`shifts/held-job-role.ts`): a role they do not hold is refused; none
  given (only possible outside the screens) uses their first.
  Open shifts keep any role or none. Shifts saved before are left as they
  were until edited.
- **The Schedule, shorter** (9 October 2026, Dominguez: the requests and
  the overtime alert "nearly take up half the page", and the ＋ in every
  cell made it longer): time-off requests to decide and the overtime alert
  are **one folded line each** naming who, opened for Approve / Decline and
  the hours. The ＋ strip is gone: **click a day's empty space** to add a
  shift (phones too), **right-click a day** on the week or month for *Add a
  shift*, *Add time off* (that person, that day), *Add an event / rep lunch
  / diagnostics date / holiday or closure* (`components/ContextMenu.tsx`).
  Name and shift right-clicks keep the person menu. See *The rota's day
  menu* in `docs/architecture.md`; `tests/browser/quick-add.mjs`.
- **Weeks start on Sunday on screen** (September 2026, Dominguez): week
  view, month, printed rota, "This week" shortcuts, weekday pickers.
  Display only.
- **Overtime weeks follow the pay period** (September 2026, Dominguez): each
  two-week pay period is two overtime weeks starting on the pay period's
  weekday (`workweekStartsOn`), for the rota warnings, dashboard and payroll
  export alike; Monday until a pay period date is set. Still 40 **a week**,
  not 80 a fortnight (federal and NJ law). Practice settings shows the day.
- **The scheduler** does a week (for building, on a laptop) and a month (for
  staff checking when they are on, often on a phone — managers can narrow the
  month by office and job role, like the week, and to one person from a
  dropdown with a search), warns when the rota puts
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
- **News** is on Home (October 2026, see *Navigation and Home*), with **All
  news** for the full list; on a phone also under More.
- **Likes, comments and polls on News** (3 October 2026, Dominguez): anybody
  signed in likes a post, comments under it and votes in its poll — **all by
  name** (Dominguez chose named votes; unlike pulse surveys, polls are not
  anonymous, and the poll says so). Admins add a poll with the post (**+ Add a
  poll**: question, 2–10 choices, optionally pick several); the choices are
  fixed once anybody votes, and the admin can **Close voting**. The writer
  edits and deletes their own comment; **managers and admins delete
  anybody's**. A comment rings the bell for the post's writer and earlier
  commenters. Votable and likeable on Home too. See *Likes, comments and
  polls* in `docs/architecture.md`; `tests/browser/news-social.mjs`.
- **Practice events** (September 2026, asked for by Dominguez): office,
  admin and provider meetings and things like a wellness day. Managers and
  admins add them from Schedule → **+ Add event** — timed or all day (one day
  or several), a place, and who it is for: **everyone, one job role or one
  office** (like surveys). They show in an **Events** row above the rota and
  in the month, only to the people they are for (managers see all), go to
  phones through the existing calendar feed, and ring the bell when added,
  moved or cancelled. **Calendar only — never hours, overtime or payroll**;
  anybody paid to attend clocks in as usual. **Replies** came later (see
  *Replies to meetings and Find a time*). All four choices confirmed by
  Dominguez. `PracticeEvent`,
  `src/events/`.
- **The practice calendar** (7 October 2026, Dominguez: "a calendar that
  staff can reference for multiple things … events, diagnostic schedule,
  holidays/office closures"): **Schedule → Calendar** (`/schedule/calendar`,
  a Shifts | Calendar switch on both). Month or list, a key that filters,
  an office picker; managers and admins add, everybody reads, and it all
  goes through the existing calendar link. Two new kinds of
  `PracticeEvent`: **Diagnostics** (`DIAGNOSTIC` — "US + ECHO 8–2" at an
  office, `atLocationId`; for everyone; bell on add/move/cancel, no
  day-before reminder; **Add another date like this** for the dates that
  differ; when the tests are on, never who is booked) and **Holidays**
  (`HOLIDAY` — Election Day: all day, for everyone, shuts nothing, no
  notification; a shut office is still a closure). **Pay days** are worked
  out, never stored: the Friday after each pay period ends
  (`settings/pay-days.ts`, `GET /calendar/pay-days`). **Rep lunches**
  (`REP_LUNCH`, same day): a rep from **Manage → Reps** (`Rep`,
  `src/reps/`, managers and admins only — name, cell, company, medication,
  catering or self-order, status Preferred / OK / Has restrictions / Don't
  book, notes), an office and a time; named after the rep. Staff see rep,
  company, medication and food; **the cell also to job roles with "sees a
  rep's cell" (`JobRole.seesRepCell`, on for Front Desk — Dominguez: "front
  desk can see the cell")**; status and notes managers' only (server-side;
  none of it in the feed); "Don't book" asks first, never refuses; the
  schema guard pins `Rep`. A rep lunch is **told to the people on the rota
  at its office that day** — a published shift there, not from home — when
  it is added, moved or cancelled, and **every evening from 6pm** each
  office open the next day (a published shift there, not closed all day)
  tells the people on its rota "Rep lunch tomorrow" or "No rep lunch
  tomorrow — bring your own lunch" on the bell
  (`events/lunch-notices.service.ts`, run by the five-minute timer, once per
  office and day via `LunchNotice`). Until 12 October 2026 both went to
  everybody whose offices included it (Dominguez: "why am I being notified
  of lunches of locations i am not scheduled for?"). **Show** filters the calendar:
  All, or any one or more kinds (Dominguez). **Separate subscriptions**:
  besides the all-in-one `domi.ics`, one address per kind on the same
  private token (`/api/calendar/<token>/<feed>.ics` — `shifts`,
  `diagnostics`, `rep-lunches`, `holidays`, `pay-days`, `events`;
  `calendar/feeds.ts`), chosen under **Separate calendars** on the calendar
  card, each its own calendar on the phone. **Printed month**
  (`/schedule/calendar/print`, from **Print** on the Calendar, anybody): one
  landscape page like the practice's paper month, printing the kinds and
  office the Calendar shows; a rep lunch is the rep's name only. **Lunch on
  shifts** (Dominguez: "should show that in the employees shift - via an
  icon"): 🍽️ on a shift at an office with a rep lunch that day, 🥪 when
  there is none — on the week rota, the month and Home ("No rep lunch,
  bring your own lunch"), explained in the Schedule's key
  (`components/LunchIcon.tsx`); not on work-from-home shifts. **My shifts**
  (Dominguez: "the calendar should also have the option to show the users
  schedule for the month"): a **Show** option of its own, in All — the
  person's own **published** shifts ("🕘 9am–5pm · NB", with the lunch
  icon, opening that week on the Schedule) and their approved time off
  ("🌴 Off · PTO"), in the month and the list (`components/MySchedule.tsx`).
  Printed only when picked, never under All, so a month printed for the
  wall never carries the printer's own schedule. Would matter to the EMR
  module too, if it takes events. See *The practice calendar* in
  `docs/architecture.md`; `tests/browser/practice-calendar.mjs`.
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
- **Replies to meetings and Find a time** (15 October 2026, Dominguez —
  chosen from replies, staff booking meetings and Find a time; **staff still
  do not book meetings**): the people a meeting is for answer **Going /
  Maybe / Can't go** in its pop-up, one answer per date
  (`PracticeEventReply`, migration `20261015010000_event_replies`), and
  **everybody it is for sees who is going**, who can't and who hasn't said
  (Dominguez's choice); a ✓ / ? / ✗ on the chip shows your own. Meetings
  only, never closures, holidays, diagnostics or rep lunches. Whoever made it
  hears on the bell when somebody can't go; no day-before reminder for them;
  a new time clears that date's answers and asks again. In the event form,
  **Find a time everyone is free** (managers) lists the best few times in the
  next two weeks, 7am–7pm, going by the rota (drafts too), time off,
  availability and other meetings — nobody busy first, then most already at
  work — with **Use this time**; it cannot see anybody's own calendar.
  `events/event-replies.service.ts`, `events/find-a-time.ts` (pure) and
  `find-a-time.service.ts`, `components/EventReplies.tsx`,
  `components/FindATime.tsx`; see *Replies and "Find a time"* in
  `docs/architecture.md`; `tests/browser/event-replies.mjs`. Worth carrying
  to the EMR module if it takes events.
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
  link to a Google Drive folder lists its files, read by the robot itself
  (`drive.readonly`, no delegation), cached 5 minutes. Needs only the Drive
  API enabled in the Cloud project. **Since October 2026 (Dominguez) the
  files open through the app** and the folder is shared with the **robot's
  address only**, not "Anyone with the link" — so staff need no Google
  account, a forwarded link opens nothing, and nobody changes Drive when
  staff join or leave. Pressing the folder's name opens the list (folders
  inside open in place); a file opens in a new tab, streamed from Drive and
  never kept (Docs, Sheets and Slides as PDFs; Forms only in Drive; 50 MB at
  most). Only files inside the link's own folder, checked by walking up
  their parents; only PDFs, pictures, plain text, MP4 and MP3 are shown, the
  rest saved. Managers keep **Open in Drive**. See *Drive folders on
  Resources* in `docs/architecture.md`.
- **Holidays and closures** (September 2026, Dominguez): a `PracticeEvent`
  with `kind: CLOSURE` — Christmas all day, Christmas Eve from 1pm — for
  **both offices or one** (never a job role). Shown with a 🔒 to that office's
  staff, on phones and under the bell. **Warns, never refuses**: a shift inside
  one is flagged in the shift forms (with a pop-up before saving), with ⚠ on
  the rota, and in the banner and nightly email. **Pay is untouched** — holiday
  pay is an open question. **Entered each year** with **Copy these into next
  year** on the Schedule's *Holidays and closures* card. **Moving holidays
  go to their own day** (9 October 2026, Dominguez — a "smarter" idea):
  Thanksgiving and the day after, Memorial Day, Labor Day, MLK, Presidents',
  Columbus, Election Day, Good Friday and Easter are recognised by name and
  moved by their rule — only when this year's entry was on the rule's day —
  in the copy and in a closure's *Repeat every year*; the copy then lists
  what moved and any fixed one landing on a weekend (which day off instead
  stays the practice's call). `events/moving-holidays.ts`;
  `tests/browser/moving-holidays.mjs`. The printed rota says when an office
  is closed.
- **Accessibility pass** (30 September 2026, from a UI/UX audit): each screen names the
  tab ("Timesheet · Domi Staff", taken from its `<h1>`) and moves focus to the content on
  a page change (`useRouteAnnouncer` in `Layout.tsx`); a "Skip to content" link; header
  links and small inline links have 44px touch targets on a phone (the `.tap` class in
  `index.css`); `slate-500` was darkened in `tailwind.config.js` so hint text passes AA
  on the page background; pages are left-aligned to the header instead of centred.
  Batch B: the "Worth a look" banner shows three lines per section with "Show N more";
  Time off puts a manager's requests first and the balances and policy under them; Staff
  has a search box. Batch C, part one: `components/useDialog.ts` gives a pop-up focus on
  open, a Tab that stays inside, Escape to close and focus handed back; the shift,
  event, correct-entry, add-hours and hand-entry dialogs use it (new pop-ups should).
  Since 23 October 2026 Escape also works when focus has fallen out of the
  pop-up (a Save button disabled while it saves drops focus to the page): a
  page-wide listener closes the top-most one, never while a confirmation is
  open. Since version 1.20.1 Tab from there goes back inside it too, not to
  the header behind.
  Part two: `buttonClass('primary' | 'secondary', 'sm' | 'md')`, `inputClass` and a `Field`
  (label, hint, error wired for screen readers) in `components/ui.tsx`; about 110
  buttons use the helper, and input focus is the brand blue everywhere (`index.css`).
  New buttons should use them; the rest move over as their screens are touched.
  Batch D: on the Schedule "Worth a look" starts as a one-line summary that opens on a
  tap (`NeedsAttention collapsible`), and the colour key is a `<details>` — open
  from the start on every screen since October 2026 (Dominguez), and it lists the
  job roles' outline colours for staff too (the Schedule used to load job roles
  for managers only, so staff saw "Outline, the job role:" with nothing after it). The phone header's two rows became a bottom tab
  bar — see the next entry.
- **Schedule and phone navigation** (30 September 2026, Dominguez): the Regular
  shifts list is hidden behind "Show the N regular shifts", with a search box and
  eight at a time. The month view lists **every** shift on a laptop (a phone still shows
  three and counts the rest), tinted by office with the job role as the stripe, with
  the same key as the week (`lib/shift-colours.ts`, shared). On a phone the navigation
  is a **bottom tab bar** and the header is one row; from `sm` up it is the header
  nav (both rearranged in October 2026 — see *Navigation and Home*). Only one of the two is ever on the page (`useIsPhone`), so each link
  appears once. Browser tests open menus through `tests/browser/nav.mjs`.
- **Publishing, open rows, photo fitting** (30 September 2026, Dominguez): drafts
  are published together — a **Publish all N** banner above the rota for the
  week or month on screen, and **Publish N draft shifts** on the right-click
  menu of a person (`POST /shifts/publish`, `publishMany`; each person is told
  once, overtime once on the crossing). Open-shift rows with nothing in them
  are folded away until "Show them to add one". Person rows are shaded
  alternately with a heavier line between, and a week over the overtime line
  wears an **OT** pill beside the total. A profile photo is **moved and zoomed
  into the circle** before it is saved (`PhotoCropDialog`); it is still cropped,
  shrunk and re-encoded in the browser, so nothing about the rule changed.
- **Version on the Help page** — "About this version": since October 2026
  (Dominguez) a **release number**, `version` in the root `package.json`
  (**1.0.0** from 15 October 2026), and **when it went out** (the build time,
  New Jersey's clock); whether it is the test or live site; and — because
  `/api/config` reports the commit the server runs — a "newer version is live,
  reload" prompt when a tab is out of date. **Bump the version in every PR
  that is a release**: the last part for fixes, the middle for new features,
  the first for a big change.
- **On a phone's home screen** (September 2026): an installable web app —
  manifest, the round logo-with-slogan badge as its icon, opens full screen as
  "Domi Staff" — not a store app. A one-time tip on the sign-in screen of a
  phone (Safari and Chrome on iPhone, Chrome on Android), and "Put Domi Staff
  on your phone" in Help, computer Chrome included. The logo **with its
  slogan** is on every signed-out screen, in black on the printed rota; the
  roof alone stays in the header and favicon. Signed in, the header's
  "**Domi** Staff" is bolder and the slogan runs on a thin blue strip under
  it on every screen (chosen by Dominguez from three renderings). **No offline mode**, on
  purpose: a punch with no signal must plainly fail, not seem to work. The
  only service worker (`/push-sw.js`, since October 2026) shows phone
  notifications and nothing else — no fetch handler, no cache — and is
  registered only when somebody turns notifications on (`push.mjs` checks).
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
- **An iPad time clock at North Bergen** (October 2026, Dominguez — **in use
  since 5 October 2026**, the first clock-in done that day): an 8th-generation
  iPad (iPadOS 26, the last it can run — replace in a year or two), shared
  with BrainCheck Assess for patients (Guided Access while a patient has it,
  not between patients). **BrainCheck is the web version**,
  `provider.braincheck.com` added to the Home Screen as a web app: BrainCheck
  support said the iOS app is for legacy accounts only and the practice's
  account will not sign in there. Its login is saved in the iPad's Passwords,
  filled with the iPad passcode. Whether the web version has a patient-facing
  mode and a session timeout was asked of BrainCheck — meanwhile Help's
  *Giving a patient the BrainCheck test* is the interim web version (saved
  login, Guided Access, stay close, **sign out after every patient**; no
  patient mode), to revisit once they answer. Owned by a practice
  Apple Account on `devices@` (an alias reaching only Dominguez — office@ is
  read by all staff); Google Home on it is signed in as office@ so staff can
  change either office's thermostat. `/kiosk` now has its own page
  (`kiosk.html`, `kiosk.webmanifest`) so it installs as a full-screen **Time
  Clock** app; the Domi Staff install and every other page are unchanged.
  See *The time clock on a tablet's home screen* in `docs/architecture.md`.
  Paired inside the Time Clock app (5 October 2026). Staff instructions are
  on Help → **The front-desk iPad** (clocking in, BrainCheck with Guided
  Access, thermostats, lock screen) — never a passcode there, it is shown to
  everybody; `help.mjs` checks for anything that looks like one.
  Since 5 October 2026 the time clock lists **everybody** at its office, those
  without a PIN tagged **No PIN yet** (a tap explains how to choose one; the
  tablet never sets one), and Home shows **Choose your tablet PIN** until they
  do — see *What the keypad will not tell you* in `docs/architecture.md`.
  **The time clock's main screen** (5 October 2026, Dominguez) shows the News
  posts ticked **Show publicly** (`Announcement.showOnTimeClock`, newest
  three, title and words only — no author, likes, comments or poll) and one
  **Clock in or out** button; the names are behind it, in a list with a
  search box (**Find your name**), not on the main screen. `GET /kiosk/posts`.
  The **same posts show under the sign-in form** (Dominguez: "since they are
  both public appearing … 1 tick for both"), from `GET /announcements/public`
  — the one News read that needs no session; one query
  (`announcements/public-posts.ts`) serves both. The column keeps its first
  name, `showOnTimeClock`; it means "public".
- **Timesheet and sign-in tidied** (8 October 2026, Dominguez): the
  Timesheet's **Correct** is now **Edit** (dialog "Edit time entry", **Save
  changes**), rows are tighter with In – Out in one column, and there are
  **Day** and (managers) **Employee** search filters above the table,
  narrowing what the period loaded. **It never scrolls sideways**: long
  cells wrap, and below a laptop's width (`lg`) the entries are cards
  (`correct.mjs` checks 390–1280 px). The sign-in page has the public News
  posts **at the top** and a smaller, more compact sign-in under them:
  the **logo alone at the top of the card**, the form right under it, no
  visible heading or tagline (an `sr-only` "Sign in to Domi Staff" heading
  stays for screen readers).
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
- **Staff profiles** (1 October 2026, Dominguez): on Manage → Staff an admin
  presses a name (or **Profile**) for `/staff/:id` — employment (hire date,
  position now, pay type, offices, ADP File #), contact (work email, phone,
  **home address**, **emergency contact**), **Pay and position** (a history of
  changes: Started / Promotion / Pay change / New position, a title, a rate per
  hour or per year, a comment; "now" is the latest in force) and **Time off**
  (this year's balance and every request). **Record time off already taken**
  writes down past Sick or PTO days with an **optional comment**. It is an
  approved request from the start (`PtoRequest.recordedById`), so it comes off
  the balance. Nobody is told, it can be removed, and it can't be for yourself
  or for future days. Managers see the Staff screen as before. See *Staff
  profiles* in `docs/architecture.md`.
- **Time off is Sick or PTO** (September 2026, Dominguez): a new request is
  one or the other, starting on Sick (PTO once the person's sick days are
  used up); `VACATION` is shown as "PTO". Older kinds stay readable.
  **Unpaid** is a third choice since 16 October 2026 (staff asked for unpaid
  sick days; Dominguez: "more generalized to just unpaid day"): `UNPAID`,
  for any reason, using **neither** balance even with days left. Managers
  decide it as usual; **Approve the clean time off** always leaves it for a
  look. Time off is still not in the payroll export, so "unpaid" is what the
  manager reads, not a pay code. For the
  switch-over, Time off → **Staff balances** (managers and admins) shows
  everybody's days left, and **Adjust** takes the PTO and sick days somebody
  had already taken this year before Domi Staff, what really carried over
  (blank: worked out) and their own yearly amount (blank: the practice's) —
  `PtoStartingPoint`, `PtoAllowance`; see *The switch-over* in
  `docs/architecture.md`. **Fixed 8 October 2026** (Dominguez: "it should be
  15 PTO and 5 sick"): rollover was worked out from every year since the hire
  date, so years before the app counted as unused and everybody got the full
  5 extra; now it counts only from when they were added to the app, and the
  real rollover is entered under Adjust ("PTO rolled over into this year",
  used days under "PTO already taken"). Adjust also chooses **the practice's
  PTO, their own amount, or No PTO** ("not all employees have PTO").
- **Schedule layout** (September 2026, Dominguez): the month (or the week's
  dates) is a large heading right above the calendar, under the buttons.
- **The Schedule on a phone** (October 2026, Dominguez): a manager's phone
  **starts on their own schedule** (week and month), with **Show everyone**
  beside it; on a laptop, where rotas are built, it starts on everyone. The
  person picker now works in the week as well as the month. In the rota the
  **name column folds to the photo and first name** on a phone (full name
  kept for screen readers), and the buttons above sit in full-width rows.
  `tests/browser/schedule-phone.mjs`.
- **"Still needed here" starts folded** on the clinical forms (October 2026,
  Dominguez — eighteen lines crowded a phone): each section shows its count,
  and the list opens from "Show what is still needed here".
- **Navigation and Home** (1 October 2026, Dominguez — option B of three
  mockups, "please use the icons"): the laptop header reads **Home · Schedule ·
  Timesheet · Directory · Resources · Manage ▾**, each with a small line icon
  (`components/NavIcons.tsx`, no icon library); the phone's bottom bar is
  **Home · Schedule · Directory · Resources · More** (More: Timesheet, News,
  Surveys, and Manage). The **Team** menu and the **Time off** and **News**
  tabs are gone. **Home** (was Clock, `pages/ClockPage.tsx`) is two-thirds /
  one-third on a laptop: the clock card and then the news (primary post in
  full, three more, "All news") on the left; on the right Quick (Request time
  off, availability, Forms for those who have them, Help), birthdays this week,
  holidays and events in the next 30 days, and surveys waiting with the
  suggestion box (`components/HomeCards.tsx`). On a phone they stack: clock
  first, then the news (Dominguez, October 2026), then the rest. **Time off lives in the Schedule** (`components/ScheduleTimeOff.tsx`):
  a "+ Request time off" button, "Your time off" (days left, upcoming
  requests), and for managers the requests to decide with Approve / Decline;
  the pending count is a badge on **Schedule**. The full Time off screen is
  still `/time-off` — "All requests" for managers (Manage → Time off &
  balances until 8 October 2026, see above), "All your time off" for staff.
  **Manage** gained Surveys.
  Somebody's own licenses, onboarding (Provider) and productivity moved to the
  **account menu**. Browser tests get around with `goTo`, `navLink`,
  `openNews` and `openTimeOff` in `tests/browser/nav.mjs`.
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
- **Code review, 6 October 2026** (Dominguez: "review / clean up / optimize"):
  the Staff screen no longer sends anybody's **calendar link token** or lockout
  counters (a manager could subscribe to a colleague's calendar); a wrong
  current password is counted against the lockout wherever it is asked, and
  password and PIN guesses are counted atomically (see *Lockout* in
  `docs/architecture.md`); "forgot password" takes the same time either way;
  **staff no longer see their own draft shifts** (the docs always said they
  could not); a shift with a punch is never cancelled by a regular-shift
  change; changing a regular shift sends the overtime email; time off,
  copy-week and coverage use New Jersey's midnight, not UTC's; two managers
  cannot both decide one request; export file names and the Period note give
  the real last day (they said the day after); CSV cells cannot run as Excel
  formulas; a time-off balance is one read, not one per year since hire; Home
  reads the four newest posts, not every post. `configure-app.ts` is the one
  place the API is set up, for `main.ts` and the Vercel function alike (the
  latter had lost its security headers). Not done, waiting on a decision: see
  *Code review, October 2026* in `docs/open-questions.md`.
- **Clinical forms — CPT 99483, shown as "BrainCheck Care Plan"** (29
  September 2026, Dominguez; Phases 1–3 built; renamed and moved October
  2026). Resources → **Forms** (its own section, first on the page) →
  **BrainCheck Care Plan**, for job roles with **uses clinical forms**
  (Provider only; access level brings nothing). The clinical note keeps the
  CPT name. The provider fills it in during the visit
  and downloads the **clinical note** for eCW Documents and the **care plan
  handout** for the patient, in **English, or English and Spanish** (only
  those two, Dominguez; Spanish read and approved by a native speaker, and a
  test PDF tried in eCW, October 2026). **Patient details (PHI) never leave the browser
  or stay in it**: no request, no table, no browser storage — a lint rule on
  `src/clinical/`, the schema guard and `tests/browser/clinical.mjs` hold it
  there. Shape, as reworked with Dominguez: **requirements ticked first**
  (impairment documented in eCW — not re-entered; historian present; 180
  days; no conflicting codes), the provider is **the person signed in**,
  **office or telehealth** (telehealth reminds about modifier 95), each
  element "Today" or "Prior visit" **as a ticked statement** (A starts as
  prior), **BrainCheck Assess** as the test, **FAST staging on screen**, no
  AWV, and a **care plan built from the answers** (suggested goals and
  actions, never ticked for them). The handout follows **BrainCheck's care
  plan** layout; providers have a section on Help. Everything editable
  is in `clinical/cognitive-assessment/config.ts`. Leaving, Back, reloading
  and Sign out all ask first. See *The clinical forms* in
  `docs/architecture.md`.
- **CCM care plan** (1 October 2026, Dominguez — replaces the practice's
  Google Forms "Care Plan - General" and one per condition). Resources →
  **Forms** → **CCM care plan** (`/clinical/care-plan`), for **providers,
  managers and admins** (Dominguez; `lib/clinical-access.ts` — unlike 99483,
  access level counts here). The general care plan question for question as
  on the Google Form, then **at least two chronic conditions** from the
  practice's CCM list (37 with ICD-10, plus "Other"); each adds its form's
  questions (outcomes, symptoms, long-term goals, SMART goal — typed,
  interventions, care team support, barriers), every one with an Other box.
  One PDF, **English, or English and Spanish** (only those two, Dominguez;
  English then Spanish on a fresh page, like the practice's own; starts as
  both for a Spanish speaker). The Spanish translates words, not measures:
  height stays in inches and weight in pounds. Same
  privacy as 99483: nothing sent or stored, `tests/browser/care-plan.mjs`
  checks it; the two forms share `clinical/common/`. Choices in
  `ccm-care-plan/phrases.ts` (each phrase once, English and Spanish — Spanish
  approved by a native speaker, October 2026). 19 conditions have their own form; HTN and
  Osteoporosis come from the sample care plan, Alzheimer's borrows Dementia's;
  the rest show the shared choices until they get a form. Codes fixed from
  the list as given (Dominguez, 1 October 2026): Osteopenia M85.80, Hepatic
  fibrosis K74.00, OSA G47.33; Chronic back pain (M54.5, retired) dropped in
  favour of Chronic pain (G89.29). See *The CCM care plan* in
  `docs/architecture.md`.
- **Both clinical forms show what is still needed** (October 2026,
  Dominguez): each section's card has an amber edge and "N still needed"
  (green "✓ Complete" when done) with its missing items listed as buttons
  that jump to the answer; the sticky bar counts per section and overall;
  the full list sits above the downloads. All in `clinical/common/layout.tsx`.
  On **all three** the amber waits until somebody has moved past a section
  with something required missing (or tried for a PDF); required fields
  keep their star (`useMovedOn`). The BrainCheck Care Plan's J has **Tick the suggested
  ones** in every area (goals and actions) and **Tick all the suggested
  ones** for the lot, and the "confirm with billing (Coronis)" notes are
  gone (all October 2026, Dominguez).
- **PDF names and signatures** (October 2026, Dominguez): downloads are named
  `MM-DD-YYYY Title.pdf` (dashes — a "/" cannot be in a file name), short
  titles, nothing about the patient: *BrainCheck Note* (for eCW), *Your
  Memory Care Plan* (the patient's handout), *Care Plan*. **All three PDFs
  are signed electronically** by the person signed in ("Electronically signed
  by … on 10/01/2026 3:09 PM ET"; Spanish halves "Firmado electrónicamente
  por …") — no blank signature line.
- **The BrainCheck Care Plan, smarter** (20 October 2026, Dominguez): the
  patient's and caregiver's names (and the historian's) get their capitals
  when the box is left ("de la" kept small); **the MRN is gone** ("difficult
  to put in or find"); **A starts as Today**, its history and exam are tick
  lists with an **Other** box; **the chosen tool is done on the form** - Katz,
  Lawton or the FAQ in B (Katz and Lawton tick the ADL and IADL lists), FAST,
  the GDS or the CDR in D, the PHQ-9, PHQ-2, GDS-15 or Cornell in F, scored
  for the provider (`instruments.ts`, read once through `results.ts`), with
  **Enter the total only** for one done on paper, and a warning plus the 988
  line suggested on a positive self-harm answer; **J has many more goals and
  actions** and smarter suggestions; and **K, Referrals and follow-up**, is a
  section of its own: suggested referrals, **Follow-up in** as a click (no
  date), and on every note and handout "repeat BrainCheck in 6 to 12 months"
  (`BRAINCHECK_RECHECK`). The new Spanish **needs a native speaker's read**
  (`NEEDS_NATIVE_SPEAKER_REVIEW` back to true). Also fixed on all three
  clinical forms: the first tap in a section was lost when the sections above
  it turned amber (`useActivity`). `tests/browser/clinical.mjs`. Worth
  carrying to the EMR module's clinical side.
- **"CCM care plan" is now "APCM Care Plan"** (October 2026, Dominguez — the
  practice uses it for **APCM** as well as CCM; first renamed "Care plan",
  then "APCM Care Plan" the same week): on Resources → Forms, the page
  heading and Help. The downloaded file is still *Care Plan* (not asked to
  change), and the code keeps `ccm-care-plan/`. **Signed by Dr. Jonathan
  Dominguez** (9 October 2026, Dominguez): the person signed in is printed
  as **Prepared by**; the PDF names him as **Reviewing provider** and
  carries **his** electronic signature, whoever prepared it — his choice,
  knowing the PDF is made before he has reviewed it. `REVIEWING_PROVIDER`
  in `ccm-care-plan/config.ts`. **"BrainCheck Care Plan"** is
  written with capitals wherever it is a name (Resources, the page, Help, Job
  roles).
- **Annual Wellness Visit** (1 October 2026, Dominguez — the practice's
  Annual Wellness Supplement Form, 02.2024). Resources → **Forms** →
  **Annual Wellness Visit** (`/clinical/wellness`), for job roles with
  **uses the wellness form** (`JobRole.usesWellnessForm`, started on for
  Provider and Medical Assistant) and managers and admins. Two pages done
  separately, each its own PDF for eCW: the **MA does page 2** (preventive
  services — Yes / No / Offered-Refused, a date for a Yes, result optional)
  and the **provider page 1** (social history and functional ability, then
  the SPMSQ, scored with the form's education allowance), **in the
  patient's preferred language** — in Spanish the questions are shown in
  Spanish with the English under them, and the PDF is English, or English
  and Spanish. Providers open on page 1, everybody else on page 2. Same
  privacy as the other two (`tests/browser/wellness.mjs`). **The Spanish
  still needs a native speaker's read** (`NEEDS_NATIVE_SPEAKER_REVIEW`). See
  *The Annual Wellness Visit form* in `docs/architecture.md`.
- **Provider productivity** (30 September 2026, Dominguez — replaces the
  practice's *Patients & Providers* sheet). Manage → **Provider productivity**
  — **only for people an admin has chosen** (`canManageProductivity`, a list at
  the bottom of that screen, admins only; started with Dominguez and Angelica
  Dominguez; access level brings nothing), and **for provider job roles only**
  (a job role with *uses clinical forms* — plans and statements can only be
  made for people in one): for each provider, a **statement** per period of
  intervals (two weeks on the sheet), each with the patients **expected** and
  **seen**, a **multiplier** on the difference (169 + 154 against 300 at $50
  is $1,150) and a paid date and short note. A short period is **carried
  forward as a running balance**, netted off the next periods until it clears
  (per plan, on by default). A
  statement is a private draft until **published**; the provider can then read
  theirs, and only theirs, under **Your productivity** in the account menu (and is told on
  the bell, with no numbers in it). Every provider's model differs, so
  **everything is optional**: a per-provider *plan* only sets defaults
  (interval length, intervals per statement, expected per interval, multiplier,
  kinds of visit like In-Office / Hospital), a statement copies them when it is
  made, and it can be a bare count, a count against a target, or with money.
  Counts only — never a patient (the schema guard pins the fields; the note is
  the one free-text box and says so). **Not in the payroll export** (decided). See *Provider
  productivity* in `docs/architecture.md`.
- **Tests**: ~1,470 unit tests, and ~515 end-to-end checks in `tests/browser`
  driven against a real API, a real Postgres and a real Chromium. Both run in CI
  on every push. The convention is to run the browser suites twice — once
  against the dev server, once against `vite preview`, which applies the
  deployed security headers. The unit tests ignore a local `apps/api/.env`
  (`apps/api/jest.setup-env.js`): importing Prisma loads it, and it used to
  override the settings specs give themselves.

`docs/architecture.md` is the long version, and explains *why* for anything
surprising, and `docs/open-questions.md` is what is still waiting on a decision.
The guides for staff and managers are on the app's own Help page.

## Ways of working
- **No em dashes, anywhere in the portal or in what is written for it**
  (Dominguez, 19 October 2026: "for all the portal and going forward don't use
  em dashes"). Use a plain hyphen, a comma or a new sentence. Code, screens,
  emails, messages, Help, the AI helpers' output (told not to, and stripped) and
  the lists loaded by migration are clean, and a unit test
  (`common/no-em-dashes.spec.ts`) fails on one in the API or web code. Older
  entries in this file and in `docs/` still have them: leave them, and write
  none new.
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
