# Set-up: reminders to clock in and out

With this done, the app tells somebody, by email and under the bell:

- **"You haven't clocked in yet"** — 15 minutes into a published shift with no
  clock-in, and
- **"You're still clocked in"** — 15 minutes after their shift ended, if they
  have not clocked out.

Once per shift each, never repeated. Nothing is said on approved time off, when
the office is closed, or about a punch with no shift. How it decides is in
*Punch reminders* in `docs/architecture.md`.

**Why an outside timer:** something has to look every few minutes. The app's
own timer is Vercel's, and on the free (Hobby) plan Vercel runs it **once a
day** at most — a more frequent one would make the live deploy fail. So a free
outside service, **cron-job.org**, calls the app every 5 minutes instead. It
can only do this one thing: it has its own secret, which opens the reminders and
nothing else.

**Who does it:** whoever has the Vercel login. About 10 minutes, once.

Until it is done, nothing is broken — the reminders simply never go.

## 1. Make a secret

A long random password, **at least 16 characters, letters and numbers only**
(a symbol can trip up the next steps). Your password manager's "create a strong
password" is ideal — Apple Passwords, Google Password Manager or 1Password —
with symbols turned off. Keep it open in a note for the next two steps, then
delete the note. It is not a password anybody signs in with, so it need not be
saved anywhere else.

## 2. Give it to the app (Vercel)

1. Go to **vercel.com** → the **stafftime** project → **Settings** →
   **Environment Variables**.
2. **Key:** `PUNCH_REMINDER_SECRET` — exactly that.
   **Value:** the secret.
   **Environments:** **Production** only.
3. **Save**.
4. **Redeploy**, so the app picks it up: **Deployments** → the top one → **⋯**
   → **Redeploy**. (If the change that adds the reminders is being merged
   anyway, that deploy does it — add the variable first.)

## 3. Set the timer (cron-job.org)

1. Sign up at **cron-job.org** (free). In **Settings**, set the **time zone** to
   **America/New_York**, so the hours below are the practice's.
2. **Create cronjob**:
   - **Title:** `Domi Staff punch reminders`
   - **URL:** `https://staff.domihealthcare.com/api/maintenance/punch-reminders`
   - **Execution schedule:** *Custom* — every **5** minutes, every day of the
     week, **hours 6 to 23** (6am to just before midnight). Nights are left out:
     there are no shifts, and every call wakes the database.
3. Open the **Advanced** tab:
   - **Request method:** `GET`
   - **Headers** → add one: **Key** `Authorization`, **Value** `Bearer `
     followed by the secret — the word *Bearer*, one space, then the secret.
   - **Notify me on failure:** on, so a broken timer is not missed.
4. **Create**, then **Test run**. It should answer **200** with something like
   `{"clockIn":0,"clockOut":0}` — how many people it just reminded.

## If the test run fails

- **403** — the secret in cron-job.org does not match the one in Vercel. Check
  for a missing space after *Bearer*, or a stray space at the end.
- **503** — the app has no secret: the variable is missing, misspelt, not set
  for Production, or the app was not redeployed after adding it.
- **404** — the URL is wrong, or the change that adds the reminders is not live
  yet.

## Turning it off

Pause the job in cron-job.org. Nothing else needs changing; to stop it for good,
also delete `PUNCH_REMINDER_SECRET` in Vercel, and the route refuses everything.

## Texts instead of (or as well as) email

Not built. The app has no text-message provider; it would need one such as
Twilio (about a cent a text, plus a few dollars a month for the number), and US
carriers now require a business registration (A2P 10DLC) before such texts are
delivered — typically one to three weeks. The reminders are written so that
adding a text is one more message in the same place. See `docs/open-questions.md`.
