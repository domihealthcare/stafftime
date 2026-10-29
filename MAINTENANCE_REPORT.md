# Maintenance report, 28 to 29 October 2026

Branch: `maintenance/2026-10-28` (29 commits on top of `main` at `58b6325`).
Release number: **1.30.0**.

In short: the app was already in good health. Every automated check passed
before this work started, and still passes after it. This pass tidied up,
closed a handful of security gaps, made a few slow screens faster, and
brought the documentation up to date. Nothing was deployed, no database
migration was written or run, and no real data was touched. All testing
used a throwaway database on the temporary machine this work ran on.

---

## 1. What was done

### The numbers, before and after

| What | Before | After |
| --- | --- | --- |
| Lint (code style rules) | 0 errors, 0 warnings | 0 errors, 0 warnings |
| Type checks | 0 errors (web app only was checked) | 0 errors (web app, API, and the Vercel entry file now all checked) |
| Unit tests | 1,807 pass, 0 fail (139 files) | 1,831 pass, 0 fail (143 files) |
| Browser tests (a real browser clicking through the app) | 121 suites, 1,267 checks, all pass | still running when this was first committed; see the next commit |
| Files not in the house formatting style | 12 | 0 |
| Known security problems in dependencies (`npm audit`) | 46 (3 critical, 14 high, 18 moderate, 11 low) | 40 (0 critical, 13 high, 16 moderate, 11 low) |
| ...of those, in code that runs on the live site | 13 (4 high, 9 moderate) | 13 (needs the major upgrades in section 3) |
| First download for every visitor (main JavaScript file) | 508.8 kB (156.2 kB compressed), with a "too large" build warning | 453.4 kB (141.1 kB compressed), no warning |
| Opening the Invoices screen | also downloaded the 430 kB PDF library | PDF library loads only when you press Download |
| Dashboard "Time off balances" card | about 6 database reads per person, one after another (about 360 for 60 people) | about 6 reads in total, for everybody |
| Each "Worth a look" banner | worked out the whole nightly round-up (about 20 loaders) | works out only the 1 to 5 sections it shows |

### Each change, in plain terms

**Housekeeping (nothing anybody would notice)**

- `9a7a7f4` **Formatting.** 12 files had drifted from the project's code
  style. Re-formatted (spacing and line breaks only).
- `0b75148` **Formatting.** The same, for one Help paragraph changed later in
  this pass.
- `7c9a94d` **`.gitignore`.** Added `apps/api/var/`. If payroll exports are
  ever saved to disk while testing locally, they land there, with staff
  names and hours. Now they can never be committed by accident.
- `4ac3eab` **Wider type checking.** `npm run typecheck` checked only the web
  app. It now also checks the API, the seed script and `api/index.ts` (the
  file Vercel actually runs). All of them already passed; this keeps it that
  way, and CI runs it.
- `f9c7bec` **Small dependency updates.** Patch-level updates only (no
  version-range changes): concurrently, fast-uri, handlebars,
  postcss-selector-parser, qs, shell-quote, source-map-js, ts-jest. This
  removed all 3 "critical" warnings (all in developer tools, not the live
  site).
- `c1a32d4` **Removed unused code.** Four functions in the web app for calling
  the server that no screen used, and one unused constant on the server.
  Deliberately kept: the half-built "sign out other browsers" code (a decision
  for you, see section 3), unused helpers in the clinical forms and a web copy
  of a CME calculation (they mirror code that may be wanted), and the list of
  downtime group names (it documents them).
- `2f80048` **Errors no longer vanish silently.** Four places caught an error
  and threw it away with no trace: sending News notifications, removing a
  raise or 360 meeting from the calendar, and "Approve the clean time off".
  Each now writes a warning to the server log (ids only, nothing personal).
  What the app does is unchanged.
- `9288be5` **Stale comments.** Fixed a code comment that described invoices
  wrongly, pointed two "TODO" comments at the open questions they belong to,
  and changed the app's description from "Domi Time & Scheduling" to "Domi
  Staff" (the package names stay, as the brief asks).
- `28982b9` **Documentation.**
  - The README said the ADP export was not built (it is), described only
    Phase 1, gave the wrong geofence radius, said nothing is ever uploaded
    (profile photos are), and had a route list covering 65 of 444 routes.
    Rewritten to what is true.
  - `DEPLOY.md` now links the setup guides for punch reminders and Ask Domi
    Staff, and documents `VAPID_SUBJECT`, a setting the code read but no
    document mentioned.
  - Test counts in `CLAUDE.md` and a file path in `docs/architecture.md` were
    corrected.

**Bug fix**

- `d8da680` **Availability: double tap on Remove.** After removing an entry,
  the button came back before the list had reloaded, so a quick second tap
  could try to remove it again and show an error. Fixed with one missing
  `await`. *(Small user-visible bug fix.)*

**Security fixes** (each one approved; the ones marked *visible* change
behaviour)

- `7b73cff` **Tablet PINs: admins only, and the person is told.** *(Visible:
  managers lose a power that no screen offered them.)*
  - Any manager could set anybody's tablet PIN through the server, and the
    same PIN unlocks the pay screens. So a manager could set an admin's PIN
    and open pay on a computer where that admin was still signed in.
  - The screens were already admins only (your 20 October decision); now the
    server is too.
  - The person gets a bell notice: "Your tablet PIN was changed for you".
  - A browser test that checked managers *could* do this now checks they
    can't.
- `1a66004` **The seed script refuses the live database.**
  - `npm run db:seed` resets the office pins and gives the admin account a
    password written in the README. Run once against the live database, it
    would have done exactly that; the only protection was a warning in
    CLAUDE.md.
  - It now refuses any database that isn't on the computer running it.
  - 7 new unit tests.
- `580da1e` **No reset links in the server log.**
  - If the email service were ever switched off on the live site, every
    email, password-reset links included, was written in full to Vercel's
    logs.
  - On the live site it now logs only who an email was for and the subject.
    Locally it still logs everything, which the tests rely on.
- `33a3aea` **Sign-in cookie always HTTPS-only on the live site.** The
  "never send over plain http" flag depended on one setting that defaults to
  off. It now also turns on whenever the app's address starts with
  `https://`. 4 new unit tests.
- `4075887` **Links that pretend to stay in the app.** In quizzes and guides,
  a link written as `/\other-site.com` looks like an in-app link but browsers
  send it to another website. Refused now. Only managers write these.
- `9d0cd17` **Photo location data removed on the server too.**
  - The browser already strips a photo's hidden data (including GPS
    location) before upload. But a photo sent straight to the server, not
    through the screen, kept it.
  - The server now removes it too. Photos uploaded through the screen are
    stored exactly as before.

**What staff see when something fails** *(visible)*

- `bf6bfbc` **A plain-words error screen.** When a screen crashed (like the 24
  October "Invalid time value"), staff saw a developer page full of code. Now
  they see "Something went wrong on this screen", a **Reload** button and a
  way back to Home (or to the time clock on the tablet), in English or
  Spanish. A new browser test makes a screen fail on purpose and checks this;
  it fails on the old code.
- `1c98554` **"Could not check" instead of silence.** Four checks treated
  "I couldn't check" as "nothing to warn about":
  - overtime and closures when saving a shift (now a pop-up asks whether to
    go ahead anyway);
  - "You're on the rota then" on the time-off form;
  - your balance on the Schedule.

  Each now says it could not check. Browser tests cover all four.

**Speed** (nothing looks different, only faster)

- `d6a25ae` **Smaller first download.** Home's lunch icon (🍽️/🥪) pulled the
  whole calendar event editor into the file every visitor downloads first.
  Moving two small helper functions fixed it (509 kB to 453 kB).
- `c9836ce` **Invoices.** The 430 kB PDF library now loads only when you
  press Download.
- `39a7cf4` + `2e29158` **Time off balances.**
  - The Dashboard card (open on every visit) worked out each person's balance
    in turn, about 6 database reads each. Now about 6 reads cover everybody.
    The arithmetic was moved, not changed.
  - Checked two ways: a new unit test compares everybody-together with
    each-person-alone, and on a test copy with varied data the old and new
    code gave byte-for-byte identical results for all 12 people.
- `7135cdc` **Banners.**
  - Each "Worth a look" banner worked out the whole nightly round-up; now it
    works out only its own sections. The nightly email still gets everything.
  - Checked: each of the 26 sections on its own matched the full round-up
    exactly. This also closes a technical to-do in `docs/open-questions.md`.
- `2c5cda2` **The five-minute timer.** License and onboarding reminders and
  downtime notices tried to record "sent" for everything every 5 minutes, and
  relied on the database refusing duplicates: thousands of refused writes a
  day. They now look up what was already sent first. Who is told, and when,
  is unchanged. New unit tests.
- `a449226` **Downtime bar.** Stopped checking every 2 minutes in hidden
  browser tabs. It still checks the moment a tab is shown again.
- `2d49d00` **Faster cold starts.**
  - The spreadsheet library (about 150 ms to load) now loads only when an
    export is made.
  - Two requests arriving while the server starts up now share one start-up
    instead of starting two.
- `74d58ff` **Schedule.** Week changes now ask for everything at once
  instead of in two rounds.

**Other**

- `50bb0b1` **Node 22.** Node 20 reached end of life in April 2026. CI and
  the `engines` setting now both say Node 22. *(This decides which Node.js
  version Vercel uses: see section 3.)*
- `4daf961` **Version 1.30.0**, as CLAUDE.md asks for each release.

**Worth carrying to the Domi EMR module** (CLAUDE.md asks to point these
out): the tablet-PIN and pay-lock fix, the seed guard, keeping emails out of
the logs, the cookie flag, the link check, photo metadata stripping, the
error screen and the "could not check" messages.

### Approved but deliberately left smaller, or not done

- **Punch reminders were not regrouped.** Each check already stops at its
  first "yes" (someone who clocked in costs one small lookup), and the tests
  pin each lookup's exact rule. The gain was not worth the risk to reminders
  staff rely on.
- **The AI library still loads at start-up** (about 45 ms). Loading it later
  means reworking how both AI services set up their connection.
- **"Approve the clean time off"** still checks each waiting request one at a
  time. Not in the approved list; noted in section 2.

---

## 2. What can be done (optional, later)

| Item | What it means | Effort | Impact |
| --- | --- | --- | --- |
| Copy week / repeating shifts in fewer steps | Copying a 150-shift week makes about 450 database calls one after another. Grouping them needs care, because new shifts must also be checked against each other. | Medium | Medium (copying a week gets faster) |
| Database indexes on dates | Make date searches on shifts and time entries faster as those tables grow. Needs a **migration**, which reaches the live database as soon as its branch is pushed. | Small | Low today, grows over time |
| "Approve the clean time off" in one go | Same idea as the balances fix, for the Schedule and Time off screens. | Small | Low to medium |
| Formatting and "forgotten await" checks in CI | Stops style drift and the kind of bug fixed in `d8da680` from coming back. Could block a merge until fixed. | Small | Medium |
| Unit tests for the web app | There are none; the web's pure logic (dates, repeat patterns, clinical scoring) is tested only through the browser suites. | Medium | Medium |
| Unit tests for sign-in and permission guards, pay screens | Currently covered only by browser tests. | Medium | Medium |
| Spanish phrases loaded only for Spanish readers | About 60 kB of the first download is Spanish text everybody gets. | Medium | Low |
| One badge request instead of three per screen | The bell, downtime and time-off counts each ask the server on every screen change. | Small | Low |
| Generate the web's data types from the server | `apps/web/src/lib/types.ts` (2,800 lines) is kept by hand; mismatches are caught only by tests. | Large | Medium |
| Shared date helpers in the web | About 10 small copies of "add a day" and two ideas of "today" (the browser's vs New Jersey's). All correct now. | Small | Low |

---

## 3. What needs to be done / still pending

Ranked by urgency.

1. **Check the Vercel Node.js setting before merging** (from `50bb0b1`). The
   next deployment will run on Node 22. In Vercel: Project → Settings →
   General → Node.js Version should say **22.x**. Everything here was tested
   on Node 22.
2. **Upgrade NestJS 10 to 11** (the server framework). This is where the 4
   remaining "high" security warnings in live-site code come from: denial of
   service (overloading the server) through how it reads incoming requests.
   They need someone able to reach the site, and Vercel's own limits soften
   them, but they are real. **Large** job; best done as its own project with
   the browser tests as the safety net.
3. **Upgrade React Router 6 to 7 and Vite 5 to 7 or later.** The React Router
   warnings (moderate) are about link handling; Vite's are developer-only.
   **Medium to large.**
4. **Questions for you:**
   - **Half-built "sign out other browsers".** The server side exists and the
     README used to advertise it, but no screen has a button. Build it (it
     helps with "a login is left open") or remove it?
   - **Idle sign-out never happens on an open tab.** The bell checks the
     server every minute while a tab is visible, and that counts as activity,
     so the 8-hour idle sign-out never happens on, say, the front-desk
     computer. Should those background checks stop counting as activity?
   - **Hashing the calendar links?** Each person's private calendar link is
     stored readable in the database. Hashing it is safer, but the link could
     then be shown only once.
   - **Blocking form posts from other `domihealthcare.com` pages?** A form on
     another page of the domain (the Wix website, for example) could act as a
     signed-in person. That needs somebody to control a page on the domain.
     A small fix, if you want it.
5. **Things to look at in your dashboards** (I can't see them):
   - Vercel's server region should match Neon's database region; every
     database call pays the distance.
   - Resend's logs, Sunday around 6 pm: "Your week" and "You're on tomorrow"
     go out together, and Resend's default limit is 2 emails a second.
6. **Already on your list in CLAUDE.md** (unchanged by this pass): rotate the
   Neon database password, and the ADP test import before anybody is paid
   from it.

**Secrets check:** no passwords, keys or database addresses are committed to
the repo. The only password in the code is the demo accounts'
(`shift-change-2026`), for local use; the seed guard (`1a66004`) now stops it
ever reaching the live database.

---

## 4. How to verify

These commands run from the repository folder.

**Get the branch**

```bash
git fetch origin maintenance/2026-10-28
```

```bash
git checkout maintenance/2026-10-28
```

```bash
npm ci
```

```bash
npm run prisma:generate --workspace @stafftime/api
```

**The quick checks** (a few minutes)

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

Each should finish without errors; `npm test` should report 1,831 tests
passing.

**The browser tests** (about 70 minutes, needs a local database, the API and
the web app running; see `tests/browser/README.md`)

```bash
npm run test:browser
```

GitHub's CI also runs everything on each push. Once the branch is pushed,
the result shows on the branch's commits on GitHub.

**See the changes**

```bash
git log --oneline main..maintenance/2026-10-28
```

**To keep it:** open a pull request from `maintenance/2026-10-28` into `main`
on GitHub and merge it once CI is green. Remember that merging to `main`
deploys to the live site (check point 1 in section 3 first). This branch adds
**no database migrations**.

**To undo one change only:** `git revert <commit>` with the hash from
section 1 (each commit stands on its own).

**To throw the whole thing away:** delete the branch on GitHub (or `git push
origin --delete maintenance/2026-10-28`). `main` was never touched.
