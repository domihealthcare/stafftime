# Domi Time & Scheduling — what to look at, and what to tell us

This is a first working version of the clock-in and scheduling app for the
practice, at **https://staff.domihealthcare.com**.

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

The week grid, plus four things that save the tedious part:

- **Repeating shifts** — one form makes a month of Tuesdays and Thursdays.
- **Copy last week into this one** — because most weeks look like the last one.
- **Coverage this week** — hours per day, who is on, who is away, and the days
  nobody is scheduled at all.
- **Overtime warning** — anybody the rota puts past 40 hours in a week, while
  you can still move a shift. It counts the whole week even if you are only
  looking at two days of it, and hours at both offices, not just the one on
  screen.

There is a **Week / Month** switch at the top right. The month view is an
overview — how many people are on each day and for how long — and a day in it
opens that week, where shifts are actually added and removed. It deliberately
does not show names: seven columns on a phone leaves room for a number and not
much else.

The month view shows **who is on** — first names if you are a manager looking at
everybody, or your own start times if you are looking at your own shifts. On a
phone it shows the start time only, because a column that narrow cannot fit
"1pm–9pm" without cutting it in half. Whichever view you pick is remembered.

Both numbers behind the schedule warnings are now yours, on the **Settings**
screen: how many hours a week counts as overtime (40), and how many days before
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

### 7. Licences and certifications (**Licences**)

Anything with a renewal date — a state licence, a BLS card, a DEA registration.
The screen opens on what lapses in the next 60 days, with anything already
expired at the top in red.

Record one against a person and put the expiry date on it. When it renews, press
**Renew** and put the new date in — you do not fill the whole form again.

**Dates only**, deliberately: no licence numbers and no scans. What this screen
is for is the 13th of March turning up early enough to chase.

You will also get an email about anything lapsing, as part of the nightly
round-up (see the note about email below).

- **Tell us:** is 60 days the right amount of warning?
- **Tell us:** should a lapsed licence actually stop somebody being put on the
  rota, or is telling you enough? Today it tells you.

### 8. The payroll spreadsheet (**Export**)

Pick a period, tick the columns you want, download an Excel file. It tells you
how many entries are flagged before you download, so nothing surprising lands in
payroll.

**The ADP TotalSource export is not built yet.** It cannot be: it needs the
client code and the exact pay codes from ADP, and guessing them would produce a
file ADP rejects. You will see it listed on the screen, greyed out, saying what
it is waiting for. Until then this spreadsheet is the payroll route.

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

## What is deliberately missing

Worth knowing so you do not report these as faults:

- **The nightly round-up.** Once email is on, managers get one email a day
  listing anything that needs a look: licences lapsing, checklist tasks overdue,
  punches with no clock-out, time off nobody has decided. On a day when there is
  nothing, it sends nothing — deliberately, so it stays worth reading.
- **Email may not be switched on yet.** Password reset and the time-off
  notifications are built, but they need an email account set up against the
  practice's domain before anything actually sends. Until then those messages go
  into a log only we can see. If you press "Forgotten your password?" and
  nothing arrives, that is why — tell us and we will check whether it has been
  set up.
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
  employee's address, not a real licence number.

---

## How to tell us

Anything at all: a sentence, a screenshot, a voice note that says "this bit is
annoying". Where it is a decision rather than a bug — a number, a policy, who
should see what — it goes in `docs/open-questions.md`, which is the list of
things we are waiting on before this can go live.

The most valuable feedback is the thing you would have to work around. If you
find yourself thinking "I would just keep doing it on paper for that bit", that
is the bit we need to hear about.
