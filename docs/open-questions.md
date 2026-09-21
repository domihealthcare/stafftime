# Open questions and to-dos

Carried forward from the project brief, plus what surfaced while building
Phase 1. Answers belong in `docs/architecture.md` once confirmed.

## Blocking before anyone clocks in for real

- [ ] **Real street addresses and surveyed coordinates for both offices.** The
      seed uses approximate town-centre points and `TODO` addresses. Standing at
      each front desk with a phone and reading the coordinates is enough.
- [ ] **Geofence radius per location.** Currently 150m everywhere, a placeholder.
      Too tight and staff cannot clock in at their own desk; too loose and the
      parking lot across the street counts. Worth testing on-site before picking.
- [ ] **Office IP addresses** for the allow-list fallback — and whether they are
      static. A dynamic residential-style IP would make this check unreliable.
- [ ] **Geolocation consent disclosure.** The brief flags this: browser clock-in
      captures staff location, which needs a handbook/policy disclosure before
      launch. Flagged here rather than built silently.

## Needed for the ADP export (Phase 1, not yet started)

- [ ] ADP TotalSource company/client code.
- [ ] Activate the "Time Sheet Import" feature on the Domi Healthcare account.
- [ ] The specific earning/pay codes ADP expects, so hours map correctly.
- [ ] Confirm whether TotalSource (PEO) uses a different file spec than
      standalone ADP Run / Workforce Now — it sometimes does.

## Product decisions

- [ ] **Kiosk device:** dedicated tablet per location, or a shared front-desk PC?
      Affects how the location-bound kiosk session is established and secured.
- [ ] **Kiosk auth:** PIN, badge tap, or both? The schema supports both
      (`pinHash`, `badgeId`); nothing decides between them yet.
- [ ] **Who may correct a timesheet** — any manager, or only the employee's own
      manager? Today any manager can edit any entry.
- [ ] **Overnight shifts.** Supported by the schema (start/end are full
      timestamps), untested against real scheduling patterns.

## Technical to-dos

- [ ] **Replace the stubbed auth** with real login before any deployment. See
      `docs/architecture.md`.
- [ ] **Rate limiting and lockout on kiosk PIN entry.** A 4-digit PIN with
      unlimited attempts is guessable; the hashing alone is not enough.
- [ ] **Tune the GPS accuracy tolerance** (currently 2× the geofence radius)
      against real readings from both offices — indoor fixes are often poor.
- [ ] **Decide the hosted Postgres provider** before deploying (Neon, Supabase,
      Vercel Postgres). Local Docker only, for now.
- [ ] **Integration tests against a real database.** Unit tests cover the
      verification rules; the service layer is currently only covered by manual
      end-to-end checks.
