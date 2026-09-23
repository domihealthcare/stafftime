# Deploying to staff.domihealthcare.com

About 30 minutes, most of it waiting. **No terminal needed** — everything is in
a browser.

You will need two accounts: one for the database ([Neon](https://neon.tech)) and
one for hosting ([Vercel](https://vercel.com)). Both are free at this size.

---

## Before you start

**The code is already on `main`** — nothing to merge. Vercel deploys whatever is
on that branch, so everything below just works from it.

### One thing to decide first: which Vercel plan

Vercel's free **Hobby** plan is for personal, non-commercial projects. This is a
business app for a medical practice, which means **Pro** (around $20 a month) is
the honest answer. It is not a technical limit — Hobby would run this fine — it
is their licence terms, and worth being right about rather than discovering
later. Check the current terms at
<https://vercel.com/pricing> before you sign up; they do change.

Neon's free tier is fine for a practice this size and has no such restriction.

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
4. Expand **Environment Variables**.

Vercel reads `apps/api/.env.example` and offers you a list of keys with blank
values. Two things to know about that list:

- **Delete any row you are not filling in.** A key that is present but blank is
  not the same as a key that is absent: absent means "use the built-in default",
  blank means "the value is an empty string", and the app refuses to start
  rather than guess which you meant.
- **`SETUP_TOKEN` and `CRON_SECRET` are not on it**, because they are commented
  out in the example file. Add them by hand.

The quickest way is the **paste the .env contents** option, with these eleven —
the two database ones come from Neon in step 1 and are added afterwards:

```
APP_ENVIRONMENT=test
APP_URL=https://staff.domihealthcare.com
SETUP_TOKEN=<four random words and a number>
CRON_SECRET=<four different random words and a number>
SESSION_TTL_HOURS=12
SESSION_IDLE_TIMEOUT_HOURS=8
MAX_LOGIN_ATTEMPTS=8
LOCKOUT_MINUTES=15
MAX_PIN_ATTEMPTS=5
PIN_LOCKOUT_MINUTES=10
PUNCH_GRACE_MINUTES=5
```

Leave out `PORT` (meaningless on serverless), `FILE_STORAGE` and
`FILE_STORAGE_DIR` (the default, `database`, is the one that works on Vercel),
and the three `LOGIN_THROTTLE_*` values (the defaults already match the example
file).

In full, the thirteen are:

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
| `CRON_SECRET` | another long random phrase — see below |
| `APP_URL` | `https://staff.domihealthcare.com` |

**`SETUP_TOKEN`** is a one-time password that lets you create the first
administrator account. Make it long and unguessable — four or five random words
is ideal, for example `copper-lantern-harbour-tuesday-49`. You will type it once
and then delete it.

**`APP_URL`** is how emails know where to point. A password reset link that
says `localhost` is no use to anybody.

**`CRON_SECRET`** authorises the nightly housekeeping job — clearing expired
sessions, stale sign-in counters and kiosk pairing codes that were never used.
Make it long and random, the same way as `SETUP_TOKEN`, and keep it: unlike
`SETUP_TOKEN` this one stays. If it is missing the job simply refuses to run,
which is safe but means nothing gets tidied up.

There is deliberately nothing to configure for file storage, and nothing to
upload. The only files this app holds are the payroll exports it generates
itself, kept so a run can be re-downloaded exactly as it went out; they live in
the database, covered by Neon's backups, with no public link to any of them.

The app holds no personnel documents at all — no I-9, no W-4, no licence scans —
and no social security numbers. That is a deliberate decision, not an omission:
see *What a checklist does not hold* in `docs/architecture.md`.

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

You will see **Set up Domi Staff**. Fill in your setup token, your name, your
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
at each front desk, press **Use my current location**, save. Then walk to the
far corner of the office and try clocking in. If it refuses you, the radius is
too tight.

The radius is in **feet** and starts at **500**, which is a sensible default:
wide enough that a poor indoor GPS fix still lands inside it, tight enough that
somebody clocking in from home is refused. Going much below 300 ft tends to
backfire — the app distrusts a fix whose accuracy is wider than twice the
radius, so a small radius mostly produces refusals rather than precision.

This step cannot be done from a desk, and until it is done browser clock-in will
either refuse people or accept the car park.

**e. Kiosks, if you want them** — *Kiosks*. Add a tablet per location, open
`/kiosk` on that tablet, and type the pairing code. Set each person's PIN on the
same screen.

**f. Check the two practice settings** — *Settings*, in the top right. Overtime
starts after 40 hours a week, and the app chases you about an unpublished rota 4
days before the week starts. Both are defaults you confirmed rather than
measured — once you have used it for a fortnight, change them if they are wrong
rather than working around them.

**g. Decide who gets the nightly email** — *Notifications*, next to Settings.
Each manager sets their own. It only sends on nights when there is something to
say, and nothing is lost by turning it off: everything in it is also on the
screen it belongs to.

## Turning email on

Until this is done, the app still works — but **nothing is emailed**. Password
resets and time-off notifications get written to the server log instead, where
only you can see them, and the log says so on every message.

It is two variables, and the fiddly part is DNS rather than code:

1. Sign up at [resend.com](https://resend.com). The free tier is far more than
   a practice this size will use.
2. Add `domihealthcare.com` as a sending domain and follow their instructions to
   add the DNS records they give you. This is the step that takes a day or two,
   because it is whoever manages the domain's DNS, and without it mail from you
   lands in spam.
3. Create an API key.
4. In Vercel → **Settings → Environment Variables**, add:

| Name | Value |
| --- | --- |
| `RESEND_API_KEY` | the key from step 3 |
| `EMAIL_FROM` | `Domi Staff <no-reply@domihealthcare.com>` |

5. Redeploy, then use **Forgotten your password?** on the sign-in screen with
   your own address. If the email arrives, it is working. If it does not, the
   Vercel function log says exactly why — usually that the domain is not
   verified yet.

Another provider (SendGrid, SES) is one new class in `apps/api/src/email` — the
app does not care which one sends. See `docs/architecture.md`.

## Showing it to your managers

Send them the link and their email address. Give them the temporary password by
phone or in person — not in the same email as the link.

Send them [docs/manager-review.md](./docs/manager-review.md) too. It is written
for them rather than for a developer: what to try, in what order, what is
deliberately missing, and what we need them to comment on.

**Give them something to look at.** An empty timesheet tells a practice manager
nothing.

Signed in as an admin on a test deployment, open the account menu (top right) →
**Practice settings** → **Load demo data**. It loads a realistic five weeks —
eight more staff across the two offices, rotas, punches that are mostly fine and
occasionally not, time off in every state, a checklist part-way through.

It **replaces** whatever shifts and punches are already there, and it refuses
unless `APP_ENVIRONMENT` is `test`, so it cannot touch a live payroll. Your
account, your locations and your checklist templates are left alone.

The button is not shown at all on a production deployment, and every demo
account shares one well-known password — which is the other reason it is
test-only.

(There is a terminal equivalent, `npm run db:demo`, if you would rather. It
needs the *direct* connection string from Neon in both `DATABASE_URL` and
`DIRECT_DATABASE_URL`, plus `APP_ENVIRONMENT=test`.)

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
