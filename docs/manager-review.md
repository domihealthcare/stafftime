# Domi Staff — what to look at, and what to tell us

This is a working version of **Domi Staff**, the practice's staff app, at
**https://staff.domihealthcare.com**. It started as a clock-in and scheduling
app, and that is still its main job; around it now sit practice news, a staff
directory, resources for each job role, availability, anonymous surveys and a
dashboard for managers.

It is at a real address, but it is **not in use**: nothing in it is real. The
staff are invented, the hours are invented, and none of it reaches payroll. No
real member of staff has an account, and nobody is clocking in on it. There is
an amber banner across the top of every screen saying so, and it stays there
until we decide the thing is ready.

What we need from you is the part software cannot work out on its own: whether
this matches how the front desk actually runs, and where it would get in the
way.

**Please be blunt.** "That is not how we do it" is the most useful sentence you
can give us, and it is much cheaper to hear now than after everyone has started
using it.

---

## Signing in

Go to **https://staff.domihealthcare.com** and sign in as one of the invented
staff below. They all use the password **`shift-change-2026`**.

Start as Rosa — she is the one whose job this app is meant to make easier.

| Sign in as | To see |
| --- | --- |
| `r.alvarez@domihealthcare.com` | a manager's view — everybody's hours, the schedule, approvals |
| `d.okafor@domihealthcare.com` | what an ordinary member of staff sees, which is much less |

Sign out and back in to swap between them; the two views are genuinely
different, and the difference is worth seeing.

There are six more ordinary staff accounts, with the same password, if you want
to see the directory or a survey from somebody else's side:
`p.nguyen@`, `j.santos@`, `k.brennan@`, `a.haddad@`, `t.lindqvist@` and
`b.oyelaran@domihealthcare.com`.

**Stuck?** The menu under your name has **Help**: a short guide for everyone,
and a second one for managers.

**Passwords** are now at least 8 characters with a number in them — the old
"three words" rule is gone. A few very common passwords are still refused.

The admin screens — staff, kiosks, locations, policy — sit behind a separate
account that Anthony holds, so ask him to show you those rather than looking
for a login. They are settings rather than daily work.

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
  parking lot? The pharmacy next door? We have guessed **500 feet**, and that
  guess is probably wrong — it is a setting, not something baked in, so say what
  it should be and it changes.

### 2. The front-desk tablet (**/kiosk**)

This is the one we expect to be used most. A tablet at the desk, bound to one
office, and staff tap their name and type their PIN. No signing in, no
geolocation, nothing to forget.

**Staff choose their own PIN** (4 to 8 digits) on **Your profile**, confirming
with their password. Nobody can read a PIN back — the profile says only that
one is set, and since when. If somebody forgets theirs, a manager sets a new
one from **Team → Directory** and tells them in person; they can then change
it to their own.

An admin pairs it once from **Kiosks** and it stays paired.

On the demo data the PINs start as:

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

It opens on this week. Along the top are shortcuts — **this week, last week,
this pay period, last pay period, this month, last month** — and **Custom** for
any two dates; the arrows step back and forward by the same kind of period. The
same picker is on **Export**, which opens on the last pay period.

**The pay-period shortcuts are greyed out until an admin sets the pay period
start** (menu under your name → Practice settings). Pay is every two weeks, so
the app needs the first day of any one pay period and works out the rest.

- **Tell us:** which day does a Domi pay period start on? One real date is all
  it needs.

You will see punches that are fine and a few that are not:
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

The week is now a **rota**: one row per person, one column per day, the
hours and head-count for each day in its heading. Click ＋ in any cell to add
a shift there; click a shift to change who works it, publish it, or remove it
(it asks first — anything that removes something, anywhere in the app,
asks in a pop-up before it happens). Show it for everyone, **by location** or **by job role**,
and filter to one office or one role.

**Open shifts** are shifts an office needs covered that nobody is on yet —
two Front Desk on a Saturday morning, say. Each office has an Open shifts row
at the top; make them one at a time or repeating (choose "Nobody yet"), and
they stay flagged — on the rota, in the banner and in the nightly email —
until you click one and put somebody in it. The demo data has a few.

Only managers see open shifts — decided September 2026. Staff see their own
shifts and nothing else.

**Colour.** Each shift is tinted in its office's colour, with a stripe down
the left in the job role's colour — both at once, so a glance tells you where
and as what. A key above the rota says which colour is which. Open shifts are
amber, drafts a dashed outline.

**Work from home.** Tick "Work from home" when you make a shift, or click one
and choose "Make it work from home"; it shows violet and says Home. Once it is
published, that person can clock in from anywhere from half an hour before it
starts until it ends — no location asked for, none recorded — and the punch,
the timesheet and the Directory all say Work from home. At any other time the
usual office check applies, so nobody can clock in from home on a day they
are due in.

- **Tell us:** is half an hour early the right window for clocking in from
  home? It matches nothing else in particular and is easy to change.

Plus four things that save the tedious part:

- **Repeating shifts** — one form makes a month of Tuesdays and Thursdays.
- **Copy last week into this one** — because most weeks look like the last one.
- **Coverage this week** — hours per day, who is on, who is away, and the days
  nobody is scheduled at all.
- **Overtime warning** — anybody the rota puts past 40 hours in a week, while
  you can still move a shift. It counts the whole week even if you are only
  looking at two days of it, and hours at both offices, not just the one on
  screen. It is in red at the top of the schedule and beside the person's
  weekly total. Adding or assigning a shift warns as you fill it in — amber
  if it brings them within four hours of the line, red if it takes them over
  — and saving one that puts somebody over asks you to confirm. Once saved,
  only going over stays flagged. Once it is published, the person sees it on
  their own Clock and Schedule screens and gets an email.
  - **Tell us:** is four hours the right distance for "close to overtime"?

There is a **Week / Month** switch at the top right. The month view is an
overview — how many people are on each day and for how long — and a day in it
opens that week, where shifts are actually added and removed. It deliberately
does not show names: seven columns on a phone leaves room for a number and not
much else.

The month view shows **who is on** — first names if you are a manager looking at
everybody, or your own start times if you are looking at your own shifts. On a
phone it shows the start time only, because a column that narrow cannot fit
"1pm–9pm" without cutting it in half. Whichever view you pick is remembered.

Both numbers behind the schedule warnings are now yours, under **Practice
settings** in the menu under your name: how many hours a week counts as overtime (40), and how many days before
a week starts the app chases you for an unpublished rota (4). An admin changes
them; managers can see them.

- **Tell us:** once you have used it for a fortnight, are those two numbers
  right? They are easy to change, so change them rather than working around
  them.

Approving somebody's time off deliberately does **not** cancel their shifts. The
coverage strip flags the clash instead, and a person reassigns the cover.

- **Tell us:** should it cancel them automatically? We left it manual because it
  is easy to add and hard to undo.
- **Tell us:** how far ahead do you publish the schedule? A fortnight? A month?
  The app starts nagging four days before an unpublished week begins, which is a
  guess we would rather replace with your answer.

### 5. Time off (**Time off**)

You should get an email when somebody asks for time off, and they should get one
when you decide — with your reason on it. See the note about email below if
nothing turns up.


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

A list per new hire and per leaver — I-9 done, W-4 done, handbook signed,
equipment back, access revoked — tracking who did each step and when.

**The paperwork itself does not go in here.** No forms, no scans, nothing with a
social security number on it. The app records that the I-9 was verified and by
whom; the form stays in the personnel file where you keep it now. That is on
purpose: this is the app people open on their phones and on the front-desk
tablet, and it is the wrong place for the practice's most sensitive records.

The lists in there are a **starting point built from what a small New Jersey
practice generally has to do**, not from how Domi actually does it. Go through
them line by line.

You do not have to just tell us — an admin can edit the lists directly.
Open a template, press **Edit this template**, and you can reword a task,
move it up or down, say who it is for, say when it is due, add tasks and remove
them. Editing a template never touches a checklist already under way.

- **Tell us:** what is missing, what is wrong, and what we have invented —
  or just fix it in the app and tell us what you changed.
- **Tell us:** does keeping the paperwork out of here cause you a problem in
  practice? If a step only makes sense with the form to hand, say which one.

### 7. Licenses and Certifications (**Licenses**)

Anything with a renewal date — a state license, a BLS card, a DEA registration.
The screen opens on what lapses in the next 60 days, with anything already
expired at the top in red.

Record one against a person and put the expiry date on it. When it renews, press
**Renew** and put the new date in — you do not fill the whole form again.

**Dates only**, deliberately: no license numbers and no scans. What this screen
is for is the 13th of March turning up early enough to chase.

You will also get an email about anything lapsing, as part of the nightly
round-up (see the note about email below).

- **Tell us:** is 60 days the right amount of warning?
- **Tell us:** should a lapsed license actually stop somebody being put on the
  rota, or is telling you enough? Today it tells you.

### 8. Payroll: the spreadsheet and the ADP file (**Manage → Export**)

Pick a period (it opens on the last pay period once that is set up), tick the
columns you want, download an Excel file. It tells you how many entries are
flagged before you download, so nothing surprising lands in payroll.

**The ADP TotalSource import file is now built**, following ADP's own
instructions for importing payroll: choose **ADP TotalSource** under *Send to*,
check the Batch ID (it defaults to the last day of the period), and download
`PR…EPI.csv` — one row per person with regular and overtime hours — to upload
in TotalSource under Manage Payroll → Worksheets → Import File.

It needs setting up once, by an admin, under **Practice settings → ADP
TotalSource**: the company code, a worksheet exported from TotalSource pasted
in (the app keeps only ADP's header and footer rows from it), and which columns
take regular and overtime hours. Each person also needs their **ADP File #** on
the Staff screen. Until that is done it shows greyed out, saying what is
missing. On the test site the demo staff have no File # — it is there to try,
not to pay anyone.

- **Tell us:** ask the ADP Payroll Representative which columns Domi uses for
  regular and overtime hours, whether paid leave should go in the file too,
  and what they want as the Batch ID. Then do **one test import** and check the
  imported worksheet in TotalSource before submitting anything.
- **Tell us:** should salaried staff's hours go in the file? They are left out
  unless you tick them in, since TotalSource normally pays them without hours.

**Every export is kept.** Under the download button is a list of every run —
when, by whom, how many hours — with the file exactly as it went out. If payroll
ever disagrees with you six weeks later, you can open the file that was actually
sent rather than trying to remember.

**Hours that have already been sent are protected.** Correct one and the app
stops you, says when it went to payroll, and makes you press again. It then
flags the correction so the next export tells you it still has to reach payroll.

- **Tell us:** is that the right amount of friction, or is it in the way?

- **Tell us:** which columns do you actually want? Save the combination as a
  report and it is one tap next time.
- **Tell us:** who is exempt from overtime? The export currently assumes
  salaried staff are and hourly staff are not, which is a reasonable guess and
  not the legal test.

---

## The staff platform — the newer part

These sit around the clock rather than replacing it. They are under **Team**
(everybody) and **Manage** (managers) in the top bar.

### 9. News (its own tab in the top bar)

Posts from the practice, newest first, like a blog. One post is always the
**primary** one and sits at the top of everybody's home screen after they sign
in — never on the sign-in page, which anyone can see. Only an admin writes
posts, so ask Anthony to show you that side.

- **Tell us:** who should be able to post — admins only, or managers too?

### 10. The directory and who is in (**Team → Directory**)

Everybody's work email, phone number, job roles and offices, with **In now**
beside whoever is clocked in. Colleagues see where somebody is; managers also
see since when. Nothing from the personnel side is shown.

**Each job role has its own colour** — the dot beside "Front Desk", "Medical
Assistant" and so on — so you can tell at a glance who does what. The colours
are set on the Job roles screen (below).

- **Tell us:** is showing phone numbers to everyone still right once you see it?

### 11. Job roles and resources (**Manage → Job roles**, **Team → Resources**)

The job roles are Front Desk, Medical Assistant, Provider, Administrative and
Manager. **Managers** keep the list: add, rename, remove, choose each one's
colour, and put people in them. Somebody can be in more than one — front desk
staff who also work as MAs, providers who also do admin.

A job role decides **which resources somebody sees, and nothing else.** Being
in "Manager" or "Administrative" gives no extra power in the app; that is the
separate Employee / Manager / Admin access level, which only an admin sets.

**Resources** are links (Drive, ADP, vendor portals) and short pages written in
the app, for everybody or for one job role. There are no uploads.

- **Tell us:** put the real staff in their roles when the real staff list is
  in — only the demo people are in one now.
- **Tell us:** what should each role's resources section hold on day one?

### 12. Availability (**Schedule → Availability — yours and the team's**)

Staff say when they cannot work: a weekday every week (all day or between two
times), or a single date. Nobody approves it. It only reaches weeks whose rota
is **not yet published** — a published week is fixed. When you put somebody on
a shift that lands on it, the scheduler **warns but does not refuse**, next to
the overtime warning. Managers can read everyone's but not change it.

- **Tell us:** is "warn, never refuse" right, or should some clashes stop the
  shift being saved?

### 13. Surveys and the suggestion box (**Team → Surveys**)

Short check-ins — a 1–5 rating, pick one, or a written answer — for everyone,
one job role or one office. **Truly anonymous**: answers are stored with no
name and no time, so nobody, admins included, can find out who said what. The
app records separately *that* somebody has taken part, so nobody answers twice;
you see "5 of 12 answered", never names. Results only appear once a survey is
**closed** and at least **3** people answered.

The **suggestion box** is always open and keeps only the message and the day it
arrived.

- **Tell us:** is recording *that* somebody answered acceptable? The
  alternative is allowing repeat answers.
- **Tell us:** is 3 the right minimum? A question sent to a small job role may
  never reach it.

### 14. The dashboard (**Manage → Dashboard**)

This week's hours worked against scheduled, overtime, late clock-ins and time
off; hours per week by office as a chart and a table; and, looking ahead,
shifts in the next two weeks that clash with somebody's availability or push
them into overtime. It uses the same rules as the timesheet, schedule and
export, so the numbers agree.

- **Tell us:** what would you look at first on a Monday morning that is not
  here?

### 15. Profiles

Menu under your name → **Your profile**. Everybody can add a photo of
themselves, the name they go by, pronouns, a phone number and one line about
themselves — all of which colleagues see in the Directory. The photo is the
one thing anyone uploads to the app; it is cropped and shrunk on the phone,
and anyone can take theirs down (an admin can take down anybody's).

- **Tell us:** anything else people would want on their profile?

### 16. The look

The app now uses the Domi Healthcare colours from the website, and says
**Domi Staff** everywhere: the sign-in screen, the browser tab, emails, the
calendar feed and the export spreadsheet.

- **Tell us:** anything that looks off-brand, or that should match the website
  and does not.

---

## What is deliberately missing

Worth knowing so you do not report these as faults:

- **The nightly round-up.** Once email is on, managers get one email a day
  listing anything that needs a look: licenses lapsing, checklist tasks overdue,
  punches with no clock-out, time off nobody has decided. On a day when there is
  nothing, it sends nothing — deliberately, so it stays worth reading.
- **Email may not be switched on yet.** Password reset and the time-off
  notifications are built, but they need an email account set up against the
  practice's domain before anything actually sends. Until then those messages go
  into a log only we can see. If you press "Forgotten your password?" and
  nothing arrives, that is why — tell us and we will check whether it has been
  set up.
- **No badge tap**, only PINs.
- **No direct connection to ADP.** The ADP file is downloaded and uploaded by
  hand — ADP offers no way to push hours into TotalSource automatically.
- **No text messages or phone notifications.** Emails only, once email is
  switched on (above); otherwise the banners on each screen are where you find
  out.
- **No uploads** anywhere — not on checklists, not on resources. Deliberate; see
  the checklists section.
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
  employee's address, not a real license number.

---

## How to tell us

Anything at all: a sentence, a screenshot, a voice note that says "this bit is
annoying". Where it is a decision rather than a bug — a number, a policy, who
should see what — it goes in `docs/open-questions.md`, which is the list of
things we are waiting on before this can go live.

The most valuable feedback is the thing you would have to work around. If you
find yourself thinking "I would just keep doing it on paper for that bit", that
is the bit we need to hear about.

### Notifications, News and the version (September 2026)

- **The bell** beside your name shows things that are just for you, with a red
  count of unread ones: a shift of yours added, changed or removed (once
  published), your time off decided — or, for managers, somebody asking for
  time off — overtime on your schedule, a survey waiting for you, your
  checklist starting, and new News posts. Choose one to go to it; "Mark all as
  read" clears the count. Kept for 90 days. It works even though email is not
  set up yet.
  - **Tell us:** is there anything else you would want to hear about there — or
    anything on the list you would rather not?
- **News** now has its own tab in the top bar.
- **Help → About this version** says which version you are on and when it went
  out, whether you are on the test or the live site, and offers a reload if a
  newer version has gone out since you opened the page.
- The menu item that used to be called **Notifications** (the nightly email for
  managers) is now **Email settings**.

