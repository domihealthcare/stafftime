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

## Needed for the kiosk screen (Phase 1, not yet built)

The web and mobile clock-in screens are done. The kiosk is not, and it needs
backend work first:

- [ ] **A kiosk session endpoint** — pairing a device to a location and holding
      that binding, so the tablet identifies its own location.
- [ ] **A PIN/badge verification endpoint.** The schema stores `pinHash` and
      `badgeId` and the API can set a PIN, but nothing verifies one yet. The
      clock-in API already accepts `method: KIOSK`, so the punch itself works —
      only the "who is this?" step is missing.
- [ ] Decide PIN vs badge tap (see below) before building the screen.

## Technical to-dos

- [x] ~~Replace the stubbed auth with real login before any deployment.~~ Done —
      passwords, roles and server-side sessions. See `docs/architecture.md`.
- [ ] **Self-service password reset.** Today a locked-out or forgetful employee
      needs an admin to issue a temporary password. A "forgot password" email
      flow needs an email sender (SendGrid, Resend, SES) chosen and configured —
      not set up, and a decision for you rather than a technical blocker.
- [ ] **Rate limiting and lockout on kiosk PIN entry.** Sign-in has both; the
      kiosk PIN path does not exist yet and will need its own, since a 4-digit
      PIN with unlimited attempts is guessable.
- [ ] **Per-IP rate limiting on the login endpoint.** Account lockout stops
      guessing at one account; it does not stop one attacker spraying one common
      password across every known address.
- [ ] **Schedule `SessionService.purgeExpired()`** so expired session rows are
      cleaned up rather than accumulating.
- [ ] **Two-factor authentication** — worth considering given the app holds
      staff location history, but not started.
- [ ] **Tune the GPS accuracy tolerance** (currently 2× the geofence radius)
      against real readings from both offices — indoor fixes are often poor.
- [ ] **Decide the hosted Postgres provider** before deploying (Neon, Supabase,
      Vercel Postgres). Local Docker only, for now.
- [ ] **Integration tests against a real database.** Unit tests cover the
      verification rules; the service layer is currently only covered by manual
      end-to-end checks.
- [ ] **Generate the frontend's API types from the server** instead of
      hand-maintaining `apps/web/src/lib/types.ts`. Today a server-side rename
      compiles fine and breaks at runtime.
- [ ] **Automated browser tests.** The web app's flows were verified by driving a
      real browser, but those checks are not committed as a suite yet.
- [ ] **CORS or a same-origin rewrite for production** — the Vite dev proxy does
      not exist once deployed. See `docs/architecture.md`.
