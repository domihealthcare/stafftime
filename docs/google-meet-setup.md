# Google set-up: Meet links, calendar invites and Drive folders

Parts 1–4 turn on Meet links (done on the live site, September 2026). Part 5
turns on calendar invites, and Part 6 lists Drive folders on Resources; both
reuse the same robot login.

## Meet links

With this done, the event form on the Schedule gets a tick box: **Create a
Google Meet link**. Saving the event makes a new Google Meet meeting, hosted by
**office@domihealthcare.com**, and puts its link on the event: a **Join video
call** button in the app, and a tappable link on everybody's phone calendar. A
repeating event gets one link for all its dates.

Until it is done, nothing is broken: the tick box just isn't shown, and a
link can still be pasted into **Video call link** by hand.

**Who does it:** the practice's Google Workspace super admin,
**dominguez@domihealthcare.com**. It takes about 15 minutes, once. Nobody needs
office@'s password.

## What it allows, and what it doesn't

The app gets a *service account*, a robot login that belongs to the app.
The Workspace admin lets that robot do **one thing**: create Google Meet
meetings **as office@domihealthcare.com**. That is the scope
`https://www.googleapis.com/auth/meetings.space.created`. It cannot read
office@'s mail, calendar, contacts or files, and it can only manage the
meetings it created itself.

The meetings it makes are **Open**: anybody with the link joins straight
away, whatever Google account they use (most staff are on personal ones). So
the link is only as private as the people it is given to. Meetings made
before this was changed (September 2026) stay as they were: practice
accounts walk in, others knock.

## Part 1 — Google Cloud (signed in as dominguez@)

1. Go to **console.cloud.google.com** and sign in as dominguez@domihealthcare.com.
   Accept the terms if asked.
2. At the top, open the project picker → **New project**. Name it
   `Domi Staff`, leave the organization as `domihealthcare.com`, and create
   it. Make sure it is the selected project afterwards.
3. Menu → **APIs & Services → Library**. Search for **Google Meet REST API**,
   open it, and press **Enable**.
4. Menu → **IAM & Admin → Service Accounts → Create service account**.
   - Name: `domi-staff-meet`
   - Press **Create and continue**, skip the two optional steps, press **Done**.
5. Click the new service account. On its **Details** tab, copy the
   **Unique ID** (a long number). You need it in Part 2.
6. Open its **Keys** tab → **Add key → Create new key → JSON → Create**. A
   `.json` file downloads. **This file is a password.** Don't email it or put
   it anywhere shared; you'll paste it into Vercel in Part 3 and then delete
   it.

   > **If Google says key creation is disabled:** newer Google organizations
   > block this by default. Menu → **IAM & Admin → Organization Policies**,
   > find **Disable service account key creation**, **Manage policy** →
   > **Override parent's policy** → **Not enforced** → **Set policy**. If you
   > can't change it, give dominguez@ the role **Organization Policy
   > Administrator** first (IAM & Admin → IAM, with the organization selected
   > at the top, not the project). Then go back to step 6.

## Part 2 — Workspace Admin console (signed in as dominguez@)

7. Go to **admin.google.com**.
8. **Security → Access and data control → API controls → Manage Domain Wide
   Delegation → Add new.**
   - **Client ID:** the Unique ID from step 5.
   - **OAuth scopes:** exactly
     `https://www.googleapis.com/auth/meetings.space.created`
   - Press **Authorize**.

   Google says this can take a few minutes, occasionally longer, to take
   effect.

## Part 3 — Vercel

9. Vercel → the `stafftime` project → **Settings → Environment Variables**.
   Add two, for **Production** only:

   | Name | Value |
   | --- | --- |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | the **whole contents** of the downloaded `.json` file (open it in a text editor, select all, copy, paste) |
   | `GOOGLE_MEET_HOST` | `office@domihealthcare.com` |

10. **Deployments** → the latest Production deployment → **⋯ → Redeploy**.
11. Delete the downloaded `.json` file from your computer (and empty the bin).

## Part 4 — Check it

12. In the app, Schedule → **+ Add event**. You should now see **Create a
    Google Meet link**. Tick it, save, open the event and press **Join video
    call**. The meeting should open, hosted by office@domihealthcare.com.

If it says **"Google did not make a Meet link"**, the reason is in brackets:

- *"the Workspace admin has not allowed the app to create meetings yet"*:
  Part 2 isn't done yet, has a typo in the scope, or hasn't taken effect yet.
  Check it, wait ten minutes, and try again.
- anything else: the Vercel function log has Google's own words for it.

Nothing is saved when this happens, so it is safe to try again.

## Part 5 — Calendar invites (shifts and events from office@)

Once this is on, each published shift goes to the person on it as a real
calendar invite, and each practice event to the people it is for — from a
**Domi Staff** calendar the app makes under office@. Shifts go out **two
weeks** ahead and events **two months** ahead, one invite each, and Google
emails the person when one is new, changed or cancelled. Nobody sees who else
is invited. Staff with Gmail see them straight away; on other calendars they
may need to accept them.

The calendar link on Schedule then carries only office closures and approved
time off, so nobody sees a shift or a meeting twice.

The permission is narrow: **make its own calendar, and manage the events on
it**. It cannot see or change anything else on office@'s calendars.

13. **console.cloud.google.com**, project **Domi Staff** → **APIs & Services →
    Library**. Search for **Google Calendar API** → **Enable**. While there,
    search **Google Drive API** → **Enable** too (for Part 6).
14. **admin.google.com** → **Security → Access and data control → API
    controls → Manage Domain Wide Delegation**. Find the entry from Part 2
    (the same Client ID) → **Edit**. Make the **OAuth scopes** box read
    exactly, with the comma and no spaces:

    `https://www.googleapis.com/auth/meetings.space.created,https://www.googleapis.com/auth/calendar.app.created`

    → **Authorize**.
15. **Vercel** → **Settings → Environment Variables** → add
    `GOOGLE_CALENDAR_INVITES` = `on`, **Production** only → **Deployments** →
    latest Production → **⋯ → Redeploy**.
16. In the app: **Practice settings → Calendar invites** should say **On**.
    Press **Send now** to send what is already on the rota, and check your
    own calendar.

If it says **Google said: … not allowed**, step 14 is missing, has a typo, or
has not taken effect yet — wait ten minutes and press **Send now** again.
Nothing is lost while it fails: the app tries again after every change and
every night.

To switch it off, delete `GOOGLE_CALENDAR_INVITES` and redeploy: shifts and
events go back on the calendar link. Invites already sent stay on people's
calendars.

## Part 6 — Google Drive folders on Resources

Nothing to switch on beyond enabling the **Google Drive API** (step 13). For
each folder:

17. In **Drive**, open the folder → **Share** → add the app's robot address
    (it is shown under the **Web address** box when you add a link in the
    app, and ends `.iam.gserviceaccount.com`) as a **Viewer**, untick
    **Notify people** → **Share**. Leave **General access** as
    **Restricted** — it does not need to be "Anyone with the link".
18. Copy the folder's address from the browser bar. In the app:
    **Resources** → **+ Add to** the job role (or Everyone) → **A link** →
    paste it → **Add it**.

Pressing the folder's name in Resources lists its files; each opens in a new
tab, through the app. Google Docs, Sheets and Slides open as PDFs; Google
Forms open only in Drive. Staff need no Google account, and nothing in Drive
changes when somebody joins or leaves: who sees a folder is decided by its job
role in the app. If the app says it cannot see into the folder, check step 17.

Folders already set to "Anyone with the link" keep working. To close them
off, share them with the robot (step 17) and then set **General access** back
to **Restricted**.

Anybody who can see a resource can open, save and pass on its files, so keep
anything sensitive out of these folders all the same.

## Undoing it

Delete the two Vercel variables and redeploy (the tick box disappears), then
delete the entry in **Manage Domain Wide Delegation** and delete the service
account's key. Links already on events keep working; they are ordinary Meet
meetings owned by office@.
