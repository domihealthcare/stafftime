# Turning on "Create a Google Meet link"

With this done, the event form on the Schedule gets a tick box: **Create a
Google Meet link**. Saving the event makes a new Google Meet meeting, hosted by
**office@domihealthcare.com**, and puts its link on the event: a **Join video
call** button in the app, and a tappable link on everybody's phone calendar. A
repeating event gets one link for all its dates.

Until it is done, nothing is broken: the tick box just isn't shown, and a
link can still be pasted into **Video call link** by hand.

**Who does it:** somebody who can sign in as **admin@domihealthcare.com** (a
Google Workspace super admin). It takes about 15 minutes, once. Nobody needs
office@'s password.

## What it allows, and what it doesn't

The app gets a *service account*, a robot login that belongs to the app.
The Workspace admin lets that robot do **one thing**: create Google Meet
meetings **as office@domihealthcare.com**. That is the scope
`https://www.googleapis.com/auth/meetings.space.created`. It cannot read
office@'s mail, calendar, contacts or files, and it can only manage the
meetings it created itself.

The meetings it makes are **Trusted**: anybody signed in with a
@domihealthcare.com Google account joins straight away; anybody on another
account (a personal Gmail) knocks and is let in by somebody already in the
meeting.

## Part 1 — Google Cloud (signed in as admin@)

1. Go to **console.cloud.google.com** and sign in as admin@domihealthcare.com.
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
   > can't change it, give admin@ the role **Organization Policy
   > Administrator** first (IAM & Admin → IAM, with the organization selected
   > at the top, not the project). Then go back to step 6.

## Part 2 — Workspace Admin console (signed in as admin@)

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

## Undoing it

Delete the two Vercel variables and redeploy (the tick box disappears), then
delete the entry in **Manage Domain Wide Delegation** and delete the service
account's key. Links already on events keep working; they are ordinary Meet
meetings owned by office@.
