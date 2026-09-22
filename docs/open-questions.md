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
- [ ] **Geolocation consent disclosure.** Draft wording is written, in
      `docs/location-disclosure.md`, along with exactly what the app captures
      and for how long. It needs a read by whoever advises Domi on employment
      matters, and it lists four things for the practice to settle — chief among
      them whether the kiosk is genuinely available on every shift, since the
      opt-out depends on it.

## Needed for the ADP export (still blocked on ADP)

The generic Excel/CSV export is built and usable for payroll in the meantime.
What is still missing is ADP-specific, and none of it can be guessed:

- [ ] ADP TotalSource company/client code.
- [ ] Activate the "Time Sheet Import" feature on the Domi Healthcare account.
- [ ] The specific earning/pay codes ADP expects, so hours map correctly.
- [ ] Confirm whether TotalSource (PEO) uses a different file spec than
      standalone ADP Run / Workforce Now — it sometimes does.

When those arrive, the work is **one file**:
`apps/api/src/exports/payroll/adp-totalsource.exporter.ts`. The adapter is
already registered and appears on the export screen, greyed out, saying what it
is waiting for. The hours reach it already aggregated, so only the column layout
and the pay-code mapping remain.

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
- [x] ~~Notifications when a request is decided.~~ Built — the requester is
      emailed the decision and the reason, and every manager is emailed when a
      request comes in. Needs an email provider configured to actually send.
- [x] ~~Anything else worth emailing about?~~ The nightly digest now chases
      lapsed and expiring credentials, overdue checklist tasks, punches with no
      clock-out, and undecided time off. It stays quiet on days when there is
      nothing to say.

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

## Onboarding / offboarding checklists (Phase 3, built)

Templates and per-person checklists work. What needs a decision from the
practice:

- [x] ~~Who should see the attached documents?~~ Moot: the app no longer holds
      any. Document upload was removed deliberately — a timekeeping app is the
      wrong place for an I-9, and the personnel file is the right one. The
      checklists track that a step was done and by whom. See *What a checklist
      does not hold* in `architecture.md`.
- [ ] **Does that cause a problem in practice?** Worth asking the managers
      directly once they have run a real onboarding: is there a step that only
      makes sense with the form to hand?
- [ ] **Go through the seeded templates line by line.** They are a starting
      point built from what a small New Jersey primary care practice generally
      has to do, not from Domi's actual process. Things that are probably wrong
      until someone checks: whether CPR/BLS is required for each clinical role,
      who issues keys, whether there is a 30-day check-in at all.
- [ ] **Record retention is now entirely the practice's.** The I-9 has its own
      rule — three years after the hire date or one year after the last day,
      whichever is later — and since the app holds no copy, nothing here can
      remind anyone. Worth deciding whether it should: a checklist task on the
      offboarding list ("I-9 retention date diarised") would cost nothing.
- [x] ~~Licence and certification expiry.~~ Built, on its own screen, with the
      nightly digest chasing what is about to lapse. Dates only — the licence
      number and any scan were removed along with the checklist documents. Still
      to confirm: how far ahead the practice wants warning (60 days by default),
      and whether a lapsed licence should stop somebody being scheduled — today
      it is reported, not enforced.
- [ ] **Should marking somebody as no longer employed start an offboarding
      checklist?** Today the two are separate: an admin marks them terminated on
      the Staff screen and starts the checklist here. Linking them would mean
      one less thing to forget, but also a checklist appearing without anyone
      asking for one.
- [ ] **Notifications.** Nobody is told that a task is overdue, or that a new
      hire has something waiting. Same email decision as password reset and PTO.
- [x] ~~A template editor.~~ Built. An admin can add, reword, reorder and
      remove tasks, set who each one is for and when it is due, create new
      templates and retire old ones — all on the Checklists screen.
- [x] ~~Document storage at scale.~~ Moot: nothing is uploaded. The only bytes
      the app stores are the payroll exports it generates, which are small and
      few. `FileStorage` stays an adapter, so a blob store remains one class if
      that ever changes.

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
- [x] ~~Self-service password reset.~~ Built, behind the same adapter pattern as
      payroll and file storage. **It needs an email provider to actually send
      anything**: set `RESEND_API_KEY` and `EMAIL_FROM` on the deployment, on a
      domain verified with Resend. Without them, messages are written to the
      server log instead — fine locally, useless in production, and warned about
      on every message.
- [ ] **Choose the email provider and verify a sending domain.** Resend is
      implemented; SendGrid or SES would each be one new class. Somebody has to
      pick one, make an account, and add the DNS records that let mail from
      `domihealthcare.com` past a spam filter. That is the remaining blocker for
      password resets and every notification.
- [x] ~~Rate limiting and lockout on kiosk PIN entry.~~ Done — 5 attempts then
      10 minutes, tracked separately from password lockout.
- [x] ~~Per-address rate limiting on the login endpoint.~~ Done, and it counts
      distinct accounts rather than raw failures — both offices share an
      address, so "N failures per IP" would lock the whole front desk out on a
      bad Monday. See `docs/architecture.md`. Worth revisiting the threshold
      (ten accounts in ten minutes) once Domi's headcount is bigger.
- [x] ~~Schedule `SessionService.purgeExpired()`.~~ Done, as a daily Vercel
      cron hitting `GET /api/maintenance/purge`, which also clears stale
      throttle rows, expired kiosk pairing codes and orphaned file bytes.
      Needs `CRON_SECRET` set on the deployment — without it the route refuses
      everything rather than falling open.
- [ ] **Two-factor authentication** — less pressing now the personnel documents
      are gone, but the app still holds staff location history and everybody's
      hours. Not started.
- [ ] **Confirm the Content-Security-Policy survives the real deployment.** It
      is set in `vercel.json` and verified locally against the production
      bundle (`npm run preview` serves the same headers, and the browser suites
      pass under them), but Vercel's own header handling is not identical to
      Vite's. Load the site once after deploying and check the browser console
      for CSP violations.
- [ ] **Tune the GPS accuracy tolerance** (currently 2× the geofence radius)
      against real readings from both offices — indoor fixes are often poor.
- [x] ~~Decide the hosted Postgres provider.~~ Neon, as written up in
      `DEPLOY.md` — a free tier that is enough for a practice this size, and it
      hands out both a pooled and a direct connection string, which Prisma
      migrations need.
- [x] ~~Tests that can force a race.~~ `tests/browser/race.mjs` fires genuinely
      concurrent requests at the real API. It found one: clock-out was a plain
      read-then-write, and eight simultaneous taps were eight writes, each
      carrying its own verification result over the last. Now a compare-and-set.
      Both guards have been watched to fail — see the note in that directory's
      README before changing how a punch is written.
- [ ] **A partial-failure test.** Still missing: something that can kill an
      export between the storage write and the record landing, to prove the
      orphan sweep picks up the pieces. Harder than a race, because it needs to
      interrupt the process rather than just crowd it.
- [ ] **Generate the frontend's API types from the server** instead of
      hand-maintaining `apps/web/src/lib/types.ts`. Today a server-side rename
      compiles fine and breaks at runtime.
- [x] ~~Automated browser tests.~~ Committed as a suite in `tests/browser`
      (`npm run test:browser`), and running in CI on every push against a real
      Postgres and a real browser.
- [x] ~~CORS or a same-origin rewrite for production.~~ Solved by hosting the
      API and the web app as one Vercel project, so the browser only ever talks
      to one origin and the session cookie needs no cross-site handling.
