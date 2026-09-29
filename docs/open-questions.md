# Open questions and to-dos

What is still waiting on a decision or a job. Once something is settled it is
taken off this list, and the answer is written into `CLAUDE.md` or
`docs/architecture.md`.

## Left over from going live

- [ ] **Geolocation consent disclosure.** Draft wording is written, in
      `docs/location-disclosure.md`, along with exactly what the app captures
      and for how long. It needs a read by whoever advises Domi on employment
      matters, and it lists four things for the practice to settle — chief among
      them whether the time clock is genuinely available on every shift, since
      the opt-out depends on it.
- [ ] **Rotate the Neon database password.** Reset it in Neon, paste the new
      pooled and direct strings into `DATABASE_URL` / `DIRECT_DATABASE_URL` in
      Vercel, and redeploy.
- [ ] **Should Vercel previews have their own database?** They appear to share
      the live one, so a pushed branch's migration reaches the live database
      before it is merged (see *Never edit a migration once it has been pushed*
      in `CLAUDE.md`). Check in Vercel → Settings → Environment Variables
      whether Preview has its own `DATABASE_URL`.

## ADP TotalSource import (built September 2026 — needs setting up)

Built from ADP's own instructions, *Importing Payroll into ADP TotalSource*:
the import file starts from a worksheet exported out of the practice's
TotalSource account, keeps its `!` header and footer rows, and every row starts
Co Code, Batch ID (8 characters at most), File #. It is named `PRcccEPI.csv`.
Nothing about Domi's layout is guessed — the app learns the columns from the
pasted worksheet. Before the first real run:

- [ ] **Company code** — enter it under Practice settings → ADP TotalSource.
- [ ] **Paste a worksheet exported from ADP** there (Manage Payroll → Add
      Worksheet → All Employees → Export to File, opened in Notepad).
- [ ] **Confirm with the Payroll Representative which columns take regular and
      overtime hours.** The app suggests "Reg Hours" and "O/T Hours" when the
      worksheet has them; ADP's instructions say additional fields depend on
      the data and to ask them. Paid leave hours are not sent yet — say if they
      should be, and under which column/code.
- [ ] **Each person's ADP File #** on the Staff screen. The export refuses, and
      names them, if anybody with hours has none.
- [ ] **Salaried staff** are left out by default (TotalSource normally pays them
      without hours); there is a tick box to include them. Confirm which is
      right.
- [ ] **Batch ID** defaults to the last day of the period as MMDDYYYY. ADP's
      example uses the pay date — confirm what payroll wants there.
- [ ] **One test import**, checked in TotalSource's imported worksheet before
      it is submitted, before anybody is paid from it.

The spreadsheet export stays as the fallback.

## PTO (Phase 2, requests and approval are built)

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

What is deliberately left open:

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
- [ ] **Should it count hours already worked, not just scheduled?** Today it is
      scheduled hours, which is the honest answer to "what is this rota about to
      cost" and the only one that can be explained on screen. But somebody who
      stayed late every day can cross forty without the rota showing it. Worth
      asking the managers whether they want the current week to blend actual
      punches in, knowing the number gets harder to reason about.
- [ ] **Holiday pay.** Holidays and closures are built (September 2026) but,
      as Dominguez chose, change nothing about pay: the export still counts
      only real punches. Before holidays can reach payroll: which holidays are
      paid, who gets holiday pay (full-time only? after how long?), how many
      hours a paid holiday is worth (the usual shift, 8, pro rata?), whether
      somebody who works on a holiday gets a premium, and the **ADP earning
      code** for holiday hours. Then the export could add holiday hours per
      eligible person for each all-day closure of their office.
- [ ] **Should repeating rotas skip closures?** Today a repeating rota runs
      straight through Christmas and every shift it lands there is flagged
      (banner, email, ⚠ on the shift). Skipping them automatically would be
      tidier, but quietly leaves days unscheduled if the closure is later
      removed. Worth asking once a real Christmas rota has been built.
- [ ] **Does the overtime week start on the pay period's first day?** Asked
      when the calendar moved to Sunday-first (September 2026), Dominguez said
      overtime goes by the pay period and must not move with the display. The
      app counts overtime **Monday to Sunday** (rota, dashboard and payroll
      export alike), as it always has. If Domi's pay period starts on a
      Sunday — worth checking the date in Practice settings, and the workweek
      ADP TotalSource has on file — the overtime week should start on Sunday
      too. A small change once confirmed; not made without it, as it moves pay.
- [ ] **Should regular shifts (no end date) be editable as a series?** Today
      a regular shift can only be stopped; to change the hours, stop it and
      make a new one from the next week. Revisit if that becomes a chore.
- [ ] **When should event reminders go?** Everybody an event is for gets a
      reminder under the bell the day before each date. Worth asking the
      managers whether the morning of would be better.

## Onboarding / offboarding checklists (Phase 3, built)

What needs a decision from the practice:

- [ ] **Does keeping no documents in the app cause a problem?** The checklists
      record that a step was done, not the paperwork. Worth asking the managers
      once they have run a real onboarding: is there a step that only makes
      sense with the form to hand?
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
- [ ] **Licence warnings.** How far ahead the practice wants warning (60 days
      by default), and whether a lapsed licence should stop somebody being
      scheduled — today it is reported, not enforced.
- [ ] **Should marking somebody as no longer employed start an offboarding
      checklist?** Today the two are separate: an admin marks them terminated on
      the Staff screen and starts the checklist here. Linking them would mean
      one less thing to forget, but also a checklist appearing without anyone
      asking for one.
- [ ] **Per-task reminders.** The nightly round-up chases overdue tasks in
      bulk, and the bell tells somebody when a checklist with tasks for them
      starts. Worth asking whether that is enough before building per-task
      emails.

## Staff platform (Phase 4, confirmed September 2026)

Scope is in `CLAUDE.md` under *Build phasing*. Still to settle:

- [ ] **Check everybody is in their job role(s).** It decides which closing
      checklist and resources somebody gets. Staff → Edit, or Manage →
      Job roles.
- [ ] **Uploads for resources.** Links and written pages only for now. Adding
      uploads later reverses *Data this app does not hold* and needs deciding
      out loud, with limits on what may be uploaded.
- [ ] **Confirm recording *that* somebody answered a survey.** Answers are
      stored with no person and no time. What *is* stored, separately and
      with no link to the answers, is that Frankie has taken part — without
      it anybody could answer the same survey ten times. Managers see a count
      ("5 of 12 answered"), never names. If even that is too much, the
      alternative is to allow repeat answers.
- [ ] **The anonymity threshold** for survey results — 3 answers by default.
      With five providers and a small front desk, a question sent to one job
      role can have fewer than three people who could answer it.

## Product decisions

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

The office computer is the time clock for now, with PINs. What is left:

- [ ] **Badge tap.** Not built. A USB badge reader behaves like a keyboard, so
      the screen would listen for a fast burst of keystrokes ending in Enter and
      match it against `Employee.badgeId` — a small addition, but it cannot be
      written or tested responsibly without a reader in hand. Only worth it
      if a tablet and reader are bought — is PIN enough day to day?
- [ ] **Kiosk browser setup.** Whatever the device, it wants guided access or
      kiosk browser mode so staff cannot navigate away. Device configuration
      rather than code.

## Technical to-dos

- [ ] **Two-factor authentication** — less pressing now the personnel documents
      are gone, but the app still holds staff location history and everybody's
      hours. Not started.
- [ ] **Tune the GPS accuracy tolerance** (currently 2× the geofence radius)
      against real readings from both offices — indoor fixes are often poor.
- [ ] **`/attention` is re-queried on every screen that shows a banner.** Three
      manager screens each ask for all nine lists on mount, which is eight or so
      queries a time. Measured at ~7ms against a seeded database, so it is not
      worth caching for a practice of twenty — noted because it is the sort of
      thing that stops being free at a different size, and because the obvious
      fix (cache it in the session context) is a five-minute change if it ever
      does.
- [ ] **A partial-failure test.** Still missing: something that can kill an
      export between the storage write and the record landing, to prove the
      orphan sweep picks up the pieces. Harder than a race, because it needs to
      interrupt the process rather than just crowd it.
- [ ] **Generate the frontend's API types from the server** instead of
      hand-maintaining `apps/web/src/lib/types.ts`. Today a server-side rename
      compiles fine and breaks at runtime.
