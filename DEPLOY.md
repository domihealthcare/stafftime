# Deploying to staff.domihealthcare.com

About 30 minutes, most of it waiting. You need accounts for the database host
and Vercel; everything on the repository side is already done.

There are three moving parts: a **Postgres database**, a **Vercel project** that
serves both the web app and the API, and the **domain**.

---

## 1. Create the database

Any hosted Postgres works. [Neon](https://neon.tech) is suggested because its
free tier is enough for a practice this size and it handles connection pooling,
which serverless functions need.

1. Sign up, create a project, call it `stafftime`, pick a US East region
2. From the connection details, copy **two** connection strings:
   - the **pooled** one (it has `-pooler` in the host)
   - the **direct** one (no `-pooler`)

Keep both to hand. Migrations cannot run through a pooler, which is why there
are two.

---

## 2. Create the Vercel project

1. Sign in to [Vercel](https://vercel.com) with the GitHub account that has
   access to `domihealthcare/stafftime`
2. **Add New → Project**, import the repository
3. Leave every build setting alone — `vercel.json` in the repository already
   sets the build command, the output directory and the API routing
4. Before deploying, open **Environment Variables** and add:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the **pooled** connection string |
| `DIRECT_DATABASE_URL` | the **direct** connection string |
| `SESSION_TTL_HOURS` | `12` |
| `SESSION_IDLE_TIMEOUT_HOURS` | `8` |
| `MAX_LOGIN_ATTEMPTS` | `8` |
| `LOCKOUT_MINUTES` | `15` |
| `MAX_PIN_ATTEMPTS` | `5` |
| `PIN_LOCKOUT_MINUTES` | `10` |
| `PUNCH_GRACE_MINUTES` | `5` |

Do **not** set `NODE_ENV` — Vercel sets it to `production`, which is what makes
the session cookie `Secure`.

5. **Deploy**. The build runs the database migrations for you.

You will get a URL like `stafftime-xxxx.vercel.app`. It works, but nobody can
sign in yet.

---

## 3. Create the first administrator

There is no sign-up page, on purpose. Create the first account from your own
machine, pointed at the production database:

```bash
git clone https://github.com/domihealthcare/stafftime.git
cd stafftime
npm install

# Paste the DIRECT connection string from step 1.
export DATABASE_URL="postgresql://...neon.tech/stafftime?sslmode=require"
export DIRECT_DATABASE_URL="$DATABASE_URL"

npm run create-admin --workspace @stafftime/api
```

It asks for your email, name and a password, hiding the password as you type.
Now sign in at the Vercel URL.

> **Never run `npm run db:seed` against the production database.** It creates
> test accounts that all share one well-known password, and it resets the
> locations back to placeholder coordinates.

---

## 4. Point the domain at it

1. In Vercel: **Project → Settings → Domains → Add**, enter
   `staff.domihealthcare.com`
2. Vercel shows a `CNAME` record to create
3. Add that record wherever `domihealthcare.com`'s DNS is managed
4. Wait for it to verify — usually minutes, occasionally an hour

Vercel issues the HTTPS certificate automatically.

---

## 5. Set it up for real use

In this order, signed in as the administrator:

1. **Locations** — open this **on your phone**, stand at each front desk and
   press *Use my current location*. Set a radius and save. This is the one step
   that cannot be done from a desk; until it is done, browser clock-in will
   refuse people or let in the car park
2. **Kiosks** — add a tablet per location if you are using kiosk mode, and set
   each person's PIN
3. **Time off** — check the policy reads 15 PTO days, 5 sick days, 5 carried
   over, and change it if your handbook says otherwise
4. Add your managers as employees, assign them to locations, and give each a
   temporary password. They must change it at first sign-in

---

## Showing it to managers

Give them the URL and their email address, and tell them the temporary password
in person or by phone — not in the same email as the link.

Everything they do is real: real punches, real requests. If you would rather
they poked at throwaway data first, create a **second** Vercel project against a
**second** Neon database, run `db:seed` against that one, and share that URL
instead. The seeded accounts all use the password printed by the seed script.

---

## What to expect

- **The first request after a quiet spell is slow** — two or three seconds
  while the function starts. Normal for serverless, and it warms up.
- **Deploys are automatic.** A push to `main` deploys; a push to any other
  branch gets its own preview URL.
- **Migrations run on every deploy**, so a schema change ships with its code.

## If something goes wrong

| Symptom | Cause |
| --- | --- |
| Build fails on `prisma migrate deploy` | `DIRECT_DATABASE_URL` missing, or pointing at the pooled host |
| Every API call 500s | `DATABASE_URL` wrong, or the database is asleep — open it once in the Neon console |
| Sign-in appears to work but bounces back | The cookie was rejected. Check the site is on `https://` |
| "Too many connections" | `DATABASE_URL` is the direct URL, not the pooled one |
