# Deploying to staff.domihealthcare.com

About 30 minutes, most of it waiting. **No terminal needed** — everything is in
a browser.

You will need two accounts: one for the database ([Neon](https://neon.tech)) and
one for hosting ([Vercel](https://vercel.com)). Both are free at this size.

---

## Before you start: get the code onto `main`

Vercel deploys whatever is on the repository's `main` branch. The app currently
lives on a branch called `claude/brave-ride-wupefn`, so **merge it into `main`
first** or Vercel will deploy an empty repository.

1. Go to <https://github.com/domihealthcare/stafftime>
2. GitHub will show a banner about the recently pushed branch — click
   **Compare & pull request**. (No banner? Click **Pull requests → New pull
   request**, and set `base: main`, `compare: claude/brave-ride-wupefn`.)
3. Click **Create pull request**, then **Merge pull request**

`main` now has the app. Everything below deploys from it.

---

## 1. Create the database

1. Sign up at [neon.tech](https://neon.tech) and create a project called
   `stafftime`. Pick a US East region — it is closest to New Jersey
2. On the project dashboard, find **Connection string**
3. Copy **two** versions and paste them somewhere safe for a minute:
   - the **pooled** one — the default, with `-pooler` in the host name
   - the **direct** one — toggle off "Connection pooling" to reveal it

You need both. The app uses the pooled one; database updates cannot run through
a pooler and use the direct one.

---

## 2. Create the Vercel project

1. Sign in to [vercel.com](https://vercel.com) **with GitHub**
2. **Add New → Project**, and import `domihealthcare/stafftime`
3. Leave every build setting alone. The repository already tells Vercel what to
   do
4. Expand **Environment Variables** and add these twelve:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the **pooled** connection string |
| `DIRECT_DATABASE_URL` | the **direct** connection string |
| `SETUP_TOKEN` | a long random phrase you invent — see below |
| `APP_ENVIRONMENT` | `test` while managers are reviewing, `production` later |
| `SESSION_TTL_HOURS` | `12` |
| `SESSION_IDLE_TIMEOUT_HOURS` | `8` |
| `MAX_LOGIN_ATTEMPTS` | `8` |
| `LOCKOUT_MINUTES` | `15` |
| `MAX_PIN_ATTEMPTS` | `5` |
| `PIN_LOCKOUT_MINUTES` | `10` |
| `PUNCH_GRACE_MINUTES` | `5` |
| `MAX_UPLOAD_MB` | `10` |
| `CRON_SECRET` | another long random phrase — see below |

**`SETUP_TOKEN`** is a one-time password that lets you create the first
administrator account. Make it long and unguessable — four or five random words
is ideal, for example `copper-lantern-harbour-tuesday-49`. You will type it once
and then delete it.

**`CRON_SECRET`** authorises the nightly housekeeping job — clearing expired
sessions, stale sign-in counters and kiosk pairing codes that were never used.
Make it long and random, the same way as `SETUP_TOKEN`, and keep it: unlike
`SETUP_TOKEN` this one stays. If it is missing the job simply refuses to run,
which is safe but means nothing gets tidied up.

**`MAX_UPLOAD_MB`** is the largest checklist document anybody can attach. A
scanned form is well under 10MB; the cap is there so one person cannot fill the
database.

There is deliberately nothing to configure for document storage. Uploaded
documents go in the database, which means they are covered by Neon's backups
and there is no second account to set up — and no public link to a file with
somebody's social security number in it. See `docs/architecture.md` if that ever
needs to change.

**`APP_ENVIRONMENT=test`** puts a standing amber banner on every screen saying
nothing there is real. Leave it on `test` for the review, and change it to
`production` — or remove it — when you are ready for actual hours. It defaults
to production if unset, so it is never a test environment by accident.

Do **not** add `NODE_ENV`. Vercel sets it, and that is what makes the login
cookie secure.

5. Click **Deploy** and wait a couple of minutes. The database tables are
   created for you during the build

---

## 3. Create your account

Open the URL Vercel gives you (something like `stafftime-xxxx.vercel.app`).

You will see **Set up Domi Time**. Fill in your setup token, your name, your
email and a password of at least twelve characters. Three unrelated words make a
good one.

Press **Create administrator** and you are signed in.

### Then close the door behind you

Go back to Vercel → **Settings → Environment Variables**, delete `SETUP_TOKEN`,
and redeploy (**Deployments → ⋯ → Redeploy** on the latest one).

The setup screen already refuses to run twice, so this is belt and braces — but
do it anyway.

---

## 4. Point the domain at it

1. In Vercel: **Settings → Domains → Add**, enter `staff.domihealthcare.com`
2. Vercel shows a `CNAME` record
3. Add that record wherever `domihealthcare.com`'s DNS is managed
4. Wait for it to go green — usually minutes

HTTPS is issued automatically.

---

## 5. Set it up for real use

Signed in as yourself, in this order:

**a. Add your two offices** — *Locations → Add a location*. Name, address, and
coordinates. Rough coordinates are fine at this stage; you fix them in step (d).

**b. Add your managers** — *Staff → Add someone*. Set their role to Manager and
tick the locations they work at. Then on their card, **Set a temporary
password** — press *Suggest one* and it makes a readable one. It is shown once,
so note it down.

**c. Check the time-off policy** — *Time off*. It should read 15 PTO days, 5
sick days, 5 carried over. Change it if your handbook says otherwise.

**d. Fix the geofences — on your phone.** Open *Locations* on your phone, stand
at each front desk, press **Use my current location**, set a radius, save. Then
walk to the far corner of the office and try clocking in. If it refuses you, the
radius is too tight.

This step cannot be done from a desk, and until it is done browser clock-in will
either refuse people or accept the car park.

**e. Kiosks, if you want them** — *Kiosks*. Add a tablet per location, open
`/kiosk` on that tablet, and type the pairing code. Set each person's PIN on the
same screen.

## Showing it to your managers

Send them the link and their email address. Give them the temporary password by
phone or in person — not in the same email as the link.

With `APP_ENVIRONMENT=test` set, every screen tells them plainly that nothing is
real — so they can clock in, request time off and poke at anything without
worrying they have created a payroll problem.

When you are ready for real hours: change `APP_ENVIRONMENT` to `production`,
redeploy, and clear out the practice data they created. Ask me for a hand with
that when you get there — it wants care rather than a delete button.

---

## What to expect

- **The first visit after a quiet spell takes two or three seconds.** Normal for
  this kind of hosting; it wakes up and stays fast
- **Deploys are automatic** — anything merged to `main` goes live
- **Database updates run on every deploy**, so a change ships with its code

## If something goes wrong

| What you see | Why |
| --- | --- |
| Build fails mentioning `prisma migrate` | `DIRECT_DATABASE_URL` is missing, or is the pooled string |
| Everything errors once deployed | `DATABASE_URL` is wrong, or the Neon database is asleep — open it once in the Neon console |
| No setup screen, just sign-in | `SETUP_TOKEN` is missing, shorter than 8 characters, or an admin already exists |
| "Too many connections" | `DATABASE_URL` is the direct string — it should be the pooled one |
| Sign-in works then bounces back | The site is not on `https://` |

Stuck on any of it — tell me what you see and I will work it out.
