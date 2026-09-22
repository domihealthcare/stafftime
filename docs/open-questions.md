# Open questions and to-dos

Carried forward from the project brief, plus what surfaced while building
Phase 1. Answers belong in `docs/architecture.md` once confirmed.

## Blocking before anyone clocks in for real

There is now a screen for all three of these: sign in as an admin **on your
phone**, open **Locations**, and set them standing at each front desk. Note that
`npm run db:seed` resets them back to placeholders.

- [ ] **Real street addresses and surveyed coordinates for both offices.** The
      seed uses approximate town-centre points and `TODO` addresses. The
      **Use my current location** button captures them from the device.
- [ ] **Geofence radius per location.** Currently 150m everywhere, a placeholder.
      Too tight and staff cannot clock in at their own desk; too loose and the
      parking lot across the street counts. Try clocking in from the far corner
      of the office before settling on a number.
- [ ] **Office IP addresses** for the allow-list fallback — and whether they are
      static. A dynamic residential-style IP would make this check unreliable.
- [ ] **Geolocation consent disclosure.** The brief flags this: browser clock-in
      captures staff location, which needs a handbook/policy disclosure before
      launch. Flagged here rather than built silently.

## Needed for the ADP export (still blocked on ADP)

The generic Excel/CSV export is built and usable for payroll in the meantime.
What is still missing is ADP-specific, and none of it can be guessed:

- [ ] ADP TotalSource company/client code.
- [ ] Activate the "Time Sheet Import" feature on the Domi Healthcare account.
- [ ] The specific earning/pay codes ADP expects, so hours map correctly.
- [ ] Confirm whether TotalSource (PEO) uses a different file spec than
      standalone ADP Run / Workforce Now — it sometimes does.

When those arrive, the work is an adapter that reuses the existing aggregation
and writes ADP's layout — the timesheet logic itself does not change.

## PTO (Phase 2, requests and approval are built)

- [x] ~~Balances and carry-over.~~ Built. The practice sets the rules on the
      Time off screen; defaults are 15 PTO days, 5 sick days, 5 carried over.
- [ ] **Confirm personal days come out of the PTO allowance** rather than being
      their own bucket. It is the common arrangement, but it is a handbook
      decision.
- [ ] **Accrual, if Domi wants it.** Days are currently granted for the whole
      policy year up front (prorated for a new hire). If PTO should instead
      accrue per pay period, that is a different model and worth deciding before
      anyone relies on a balance.
- [ ] **NJ earned sick leave.** The sick allowance is a plain number the practice
      sets. New Jersey has its own accrual and carry-over rules for earned sick
      leave — worth checking the default of 5 days with no carry-over is
      compliant for Domi's headcount.
- [ ] **Per-employee allowances.** One policy covers everyone today. Part-timers
      or longer-tenured staff may warrant different numbers.
- [ ] **Who approves whom.** Today any manager can decide any request except
      their own. Fine for two locations; revisit if that changes.
- [ ] **Should approving PTO cancel the shifts inside it?** Today it does not —
      the manager sees the clash and reassigns cover by hand. Automatic
      cancellation would be easy to add but hard to undo.
- [ ] **Notifications.** Nobody is told when a request is decided; they have to
      look. Needs the same email decision as password reset.

## Calendar syncing

Built as a read-only iCalendar subscription per employee.

- [ ] **A per-location feed for managers**, so someone can see the whole
      front-desk roster in their own calendar. Same mechanism, wider scope —
      worth doing if managers ask.
- [ ] **Two-way sync is not planned.** Writing to Google Calendar needs OAuth,
      refresh tokens and per-user consent, and the schedule should be edited in
      one place anyway. Worth revisiting only if someone genuinely wants to move
      a shift from their phone's calendar app.
- [ ] **Confirm the refresh interval is acceptable.** The feed asks subscribers
      to re-check hourly, but Google in particular decides for itself and can
      take considerably longer. If same-day schedule changes need to reach people
      promptly, that wants a notification, not a calendar.

## Scheduling

The week grid, repeating rotas, copy-last-week and the coverage summary are
built. What is deliberately left open:

- [ ] **How far ahead schedules are published.** Shifts can be created as drafts
      or published straight away, and only published shifts reach an employee's
      calendar feed. Nobody has decided the practice's actual habit — a fortnight
      out, a month out — which is worth settling before managers build the habit
      for themselves.
- [ ] **Whether repeating rotas should be editable as a series.** They are
      materialised as individual shifts on purpose (see `docs/architecture.md`),
      so "change every Thursday from March" means deleting and rebuilding. Fine
      at this size; revisit if it becomes a chore.
- [ ] **Minimum staffing per location per day**, so coverage can say "short one
      person" rather than only reporting the hours it found. Needs a number from
      whoever runs the front desk.
- [ ] **Should the coverage summary flag anything else?** It currently names
      empty days, who is away on approved leave, and shifts that clash with
      approved leave. Overtime risk (someone scheduled past 40 hours) is the
      obvious next one, and easy to add.

## Product decisions

- [ ] **Kiosk device:** dedicated tablet per location, or a shared front-desk PC?
      Kiosk mode works on either — the device is bound to a location when it is
      paired — but this decides whether badge readers are worth buying.
- [ ] **Kiosk auth:** PIN is built and working. Badge tap is not; the schema
      stores `badgeId` and it is a small addition, but it needs a reader in hand
      to test. Is PIN enough day to day?
- [ ] **Who may correct a timesheet** — any manager, or only the employee's own
      manager? Today any manager can edit any entry.
- [ ] **Overnight shifts.** Supported by the schema (start/end are full
      timestamps) and preserved when a week is copied, but no real Domi shift
      crosses midnight yet, so the handling is untested against actual practice.
- [ ] **Confirm who is exempt from overtime.** The export's optional overtime
      split treats salaried staff as exempt and hourly staff as not. Pay type is
      a reasonable proxy but it is not the legal test, and this is expensive to
      get wrong — worth confirming with whoever runs payroll before the first
      real export.
- [ ] **Confirm the overtime rule itself** — over 40 hours per week is the
      federal baseline, but check nothing else applies to a NJ practice.

## Kiosk

Built and working with PINs. What is left:

- [x] ~~A kiosk session endpoint pairing a device to a location.~~ Done.
- [x] ~~A PIN verification endpoint.~~ Done, with policy, argon2 and lockout.
- [ ] **Badge tap.** Not built. A USB badge reader behaves like a keyboard, so
      the screen would listen for a fast burst of keystrokes ending in Enter and
      match it against `Employee.badgeId` — a small addition, but it cannot be
      written or tested responsibly without a reader in hand. Needs the device
      decision below first.
- [ ] **Kiosk browser setup.** Whatever the device, it wants guided access or
      kiosk browser mode so staff cannot navigate away, and the screen kept
      awake. Device configuration rather than code, but somebody has to do it
      before launch.
- [ ] **Per-device PIN attempt throttling.** Lockout is per employee today, so
      someone at the tablet could try 5 PINs each against many names. Worth a
      device-level cooldown on top.

## Technical to-dos

- [x] ~~Replace the stubbed auth with real login before any deployment.~~ Done —
      passwords, roles and server-side sessions. See `docs/architecture.md`.
- [ ] **Self-service password reset.** Today a locked-out or forgetful employee
      needs an admin to issue a temporary password. A "forgot password" email
      flow needs an email sender (SendGrid, Resend, SES) chosen and configured —
      not set up, and a decision for you rather than a technical blocker.
- [x] ~~Rate limiting and lockout on kiosk PIN entry.~~ Done — 5 attempts then
      10 minutes, tracked separately from password lockout.
- [ ] **Per-IP rate limiting on the login endpoint.** Account lockout stops
      guessing at one account; it does not stop one attacker spraying one common
      password across every known address.
- [ ] **Schedule `SessionService.purgeExpired()`** so expired session rows are
      cleaned up rather than accumulating.
- [ ] **Two-factor authentication** — worth considering given the app holds
      staff location history, but not started.
- [ ] **Tune the GPS accuracy tolerance** (currently 2× the geofence radius)
      against real readings from both offices — indoor fixes are often poor.
- [x] ~~Decide the hosted Postgres provider.~~ Neon, as written up in
      `DEPLOY.md` — a free tier that is enough for a practice this size, and it
      hands out both a pooled and a direct connection string, which Prisma
      migrations need.
- [ ] **Integration tests against a real database.** Unit tests cover the
      verification rules; the service layer is currently only covered by manual
      end-to-end checks.
- [ ] **Generate the frontend's API types from the server** instead of
      hand-maintaining `apps/web/src/lib/types.ts`. Today a server-side rename
      compiles fine and breaks at runtime.
- [x] ~~Automated browser tests.~~ Committed as a suite in `tests/browser`
      (`npm run test:browser`). Still to do: get them running in CI rather than
      only on a developer's machine, which needs a Postgres service and a
      headless browser in the pipeline.
- [x] ~~CORS or a same-origin rewrite for production.~~ Solved by hosting the
      API and the web app as one Vercel project, so the browser only ever talks
      to one origin and the session cookie needs no cross-site handling.
