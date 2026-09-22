# Domi Time & Scheduling — what to look at, and what to tell us

This is a first working version of the clock-in and scheduling app for the
practice. It is **not live**. Nothing in it is real: the staff are invented, the
hours are invented, and none of it reaches payroll. There is an amber banner
across the top of every screen saying exactly that, and it stays there until we
decide the thing is ready.

What we need from you is the part software cannot work out on its own: whether
this matches how the front desk actually runs, and where it would get in the
way.

**Please be blunt.** "That is not how we do it" is the most useful sentence you
can give us, and it is much cheaper to hear now than after everyone has started
using it.

---

## Signing in

You will be sent a web address and your own temporary password. The first time
you sign in it will make you pick a new one.

If you are trying it on the shared demo data, every demo account uses the
password **`shift-change-2026`**, and these are the ones worth trying:

| Sign in as | To see |
| --- | --- |
| `r.alvarez@domihealthcare.com` | a manager's view — everybody's hours, the schedule, approvals |
| `d.okafor@domihealthcare.com` | what an ordinary member of staff sees, which is much less |
| `admin@domihealthcare.com` | the admin screens — staff, kiosks, locations, policy |

It works on a phone. Please try it on a phone, because that is where half of
this will actually be used.

---

## The ten minutes that matter most

Do these in order. They are the things most likely to be wrong.

### 1. Clock in and out (**Clock**)

Press the big button. It will ask for your location the first time — that is the
geofence check, and the practice will need to tell staff about it in the
handbook before this goes live.

- **On the demo data the geofence is set to placeholder coordinates**, so
  clocking in from home may well be refused. That refusal is the feature
  working. If you want to try it properly, an admin can set the real
  coordinates while standing at the front desk (**Locations** → *Use my current
  location*).
- **Tell us:** how far from the door should still count as "at work"? The
  parking lot? The pharmacy next door? We have guessed 150 metres and that guess
  is probably wrong.

### 2. The front-desk tablet (**/kiosk**)

This is the one we expect to be used most. A tablet at the desk, bound to one
office, and staff tap their name and type a four-digit PIN. No signing in, no
geolocation, nothing to forget.

An admin pairs it once from **Kiosks** and it stays paired.

On the demo data the PINs are:

| Person | PIN | Office |
| --- | --- | --- |
| Rosa Alvarez | `2914` | North Bergen |
| Daniel Okafor | `3827` | North Bergen |
| Phuong Nguyen | `5140` | North Bergen |
| Julia Santos | `6472` | North Bergen |
| Kevin Brennan | `7358` | West New York |
| Amal Haddad | `8291` | West New York |
| Tove Lindqvist | `9043` | West New York |
| Bola Oyelaran | `1586` | West New York |

Only staff assigned to that tablet's office appear on its keypad, so the North
Bergen tablet will not show the West New York names.

- **Tell us:** is a PIN enough, or do you want badge taps? A badge reader is a
  small addition but somebody has to buy one.
- **Tell us:** one tablet per office, or the existing front-desk PC?

### 3. The timesheet (**Timesheet**)

A week at a time. You will see punches that are fine and a few that are not:
somebody late, somebody who left early, somebody who forgot to clock out
entirely, and one entry a manager had to correct — with the reason recorded
underneath it, because a corrected timesheet with no explanation is worth
nothing when somebody disputes their pay.

- **Approve** signs an entry off. **Correct** lets you fix a punch, and it
  insists on a reason.
- **Tell us:** are the flags the right ones? Is five minutes the right grace
  period before "late" means late?
- **Tell us:** should any manager be able to correct anyone's hours, or only
  their own staff? Right now it is any manager.

### 4. Building the week (**Schedule**)

The week grid, plus three things that save the tedious part:

- **Repeating shifts** — one form makes a month of Tuesdays and Thursdays.
- **Copy last week into this one** — because most weeks look like the last one.
- **Coverage this week** — hours per day, who is on, who is away, and the days
  nobody is scheduled at all.

Approving somebody's time off deliberately does **not** cancel their shifts. The
coverage strip flags the clash instead, and a person reassigns the cover.

- **Tell us:** should it cancel them automatically? We left it manual because it
  is easy to add and hard to undo.
- **Tell us:** how far ahead do you publish the schedule? A fortnight? A month?

### 5. Time off (**Time off**)

Request, approve, deny. Balances come from a policy the practice sets — it
currently says 15 PTO days, 5 sick days, and 5 days that can carry into next
year. An admin can change all three on that screen.

When you go to approve something, it tells you what is already scheduled in
those dates before you decide.

- **Tell us:** are those the right numbers?
- **Tell us:** do personal days come out of the PTO allowance, or are they
  separate?
- **Tell us:** should days be granted for the whole year up front (what it does
  now) or accrue per pay period?

### 6. Onboarding and offboarding (**Checklists**)

A list per new hire and per leaver, with the paperwork attached to the step it
belongs to — I-9, W-4, signed handbook, equipment back, access revoked.

The lists in there are a **starting point built from what a small New Jersey
practice generally has to do**, not from how Domi actually does it. Go through
them line by line.

- **Tell us:** what is missing, what is wrong, and what we have invented.
- Note that documents are visible to an **admin and to the person they are
  about, and nobody else** — an I-9 has a social security number on it.
  Managers can see that a form was collected but cannot open it. If that is
  wrong for how the practice works, say so: the fix is giving the right person
  the admin role.

### 7. The payroll spreadsheet (**Export**)

Pick a period, tick the columns you want, download an Excel file. It tells you
how many entries are flagged before you download, so nothing surprising lands in
payroll.

**The ADP TotalSource export is not built yet.** It cannot be: it needs the
client code and the exact pay codes from ADP, and guessing them would produce a
file ADP rejects. Getting those is on the list. Until then this spreadsheet is
the payroll route.

- **Tell us:** which columns do you actually want? Save the combination as a
  report and it is one tap next time.
- **Tell us:** who is exempt from overtime? The export currently assumes
  salaried staff are and hourly staff are not, which is a reasonable guess and
  not the legal test.

---

## What is deliberately missing

Worth knowing so you do not report these as faults:

- **No "forgot my password" email.** An admin issues a temporary password. Email
  sending is a decision nobody has made yet.
- **No badge tap**, only PINs.
- **No ADP integration**, only the spreadsheet — see above.
- **No notifications.** Nobody is emailed or texted when a request is decided or
  a task is overdue. You have to look.
- **No two-way calendar sync.** Staff can subscribe to their shifts in Google,
  Apple or Outlook calendar and it updates itself, but they cannot move a shift
  from their phone's calendar app.

---

## Two things to be careful with

- **The calendar subscription address is a password.** Anyone who has the link
  can see that person's schedule without signing in. If somebody shares theirs
  by accident, they can regenerate it on the Schedule screen and the old one
  stops working immediately.
- **Anything you type in here is throwaway.** It is a test copy and the data may
  be wiped without warning. Do not put anything real in it — not a real
  employee's address, not a real I-9.

---

## How to tell us

Anything at all: a sentence, a screenshot, a voice note that says "this bit is
annoying". Where it is a decision rather than a bug — a number, a policy, who
should see what — it goes in `docs/open-questions.md`, which is the list of
things we are waiting on before this can go live.

The most valuable feedback is the thing you would have to work around. If you
find yourself thinking "I would just keep doing it on paper for that bit", that
is the bit we need to hear about.
