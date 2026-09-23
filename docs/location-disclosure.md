# Location tracking: what the app does, and the wording to put in the handbook

The brief flagged this as a to-do rather than something to build silently, so
here it is, in two parts: exactly what the app captures, and draft wording for
the handbook. **Neither is legal advice.** Run the wording past whoever advises
Domi on employment matters before it goes in the handbook — it is a starting
point written by the people who built the thing, not a lawyer.

---

## What the app actually captures

Only at the moment of a punch. There is no background tracking of any kind: the
app is not open, not running and not aware of anybody between clock-in and
clock-out.

| Clock-in method | What is captured |
| --- | --- |
| **Browser (phone or computer)** | Latitude, longitude and the GPS accuracy the browser reports, at the instant the button is pressed, plus the network address of the connection |
| **Kiosk** (front-desk tablet) | Nothing. The tablet is bound to a location when it is paired, so the location is already known |
| **Office IP fallback** | The network address of the connection. No coordinates |

The browser asks for permission the first time, in its own dialogue, and the
member of staff can refuse. Refusing means browser clock-in will not work for
them — they use the front-desk kiosk instead, which needs no location at all.

### What happens to it

- It is used **once**, immediately, to decide whether the punch is inside the
  geofence of a location that person is assigned to. The outcome of that check
  is stored with the punch ("verified by geofence").
- Coordinates are **never shown on the timesheet** and never go out with a list
  of entries. An admin can look up a single punch's location deliberately, one
  at a time, and that lookup is written to the server log.
- Coordinates and network addresses are **deleted automatically after 90 days**
  by the nightly housekeeping job. The punch survives; the position does not.
  (`apps/api/src/time-entries/location-retention.ts` explains the number.)
- They are never sent anywhere outside the app — no third party, no advertising,
  no analytics.

### What it cannot do

It cannot tell anyone where somebody is now, where they went after work, or
where they were on a day they did not clock in from a browser. A single
coordinate at the moment of a punch is the entire record.

---

## Draft handbook wording

> ### Timekeeping and location verification
>
> Domi Healthcare uses a timekeeping app to record hours worked. When you clock
> in or out **using a web browser on your phone or computer**, the app asks your
> device for its location and records it, together with the time of the punch.
> This is used to confirm that you are at the office you are clocking in for.
>
> **What is recorded.** Your device's position and the accuracy of that reading,
> at the moment you press the button, and the network address of the connection
> you used. Nothing else.
>
> **When it is recorded.** Only at the moment of a clock-in or clock-out. The app
> does not track your location at any other time, does not run in the background,
> and has no record of where you are between punches or outside working hours.
>
> **Who can see it.** Your manager sees that a punch was verified and where it
> was attributed to — not your coordinates. A practice administrator can look up
> the recorded position of an individual punch if there is a question about it,
> and that lookup is logged.
>
> **How long it is kept.** Recorded positions are deleted automatically after 90
> days. The record that you worked those hours is kept as long as any other
> payroll record.
>
> **If you would rather not.** You do not have to allow browser location access.
> Clock in at the front-desk tablet instead, which uses your PIN and records no
> location at all, because the tablet is already assigned to an office. Choosing
> the tablet is not treated differently in any way.
>
> **Working from home.** When your manager has scheduled you to work from
> home, you clock in from wherever you are during that shift, and no location
> or network address is asked for or recorded. The punch only says it was from
> home.
>
> **What it is for.** Confirming that a punch was made at work, which is what
> makes a remote clock-in trustworthy for everybody. It is not used to monitor
> where staff are, and it cannot be used that way.

### Points to settle before this goes in

- [ ] **Is the tablet actually available at both offices, on every shift?** The
      opt-out above only means something if it is. If someone opens the West New
      York office alone on a Saturday and the tablet lives behind a locked desk,
      "use the kiosk instead" is not a real choice.
- [ ] **Confirm the 90 days** with whoever advises on employment matters. It is
      a considered default, not a legal requirement, and a practice might prefer
      shorter.
- [ ] **Decide whether acknowledgement should be its own checklist task.** The
      onboarding template currently folds it into the handbook signoff. A
      separate line ("location-verification disclosure read and acknowledged")
      makes it individually auditable.
- [ ] **New Jersey specifics.** NJ has notice requirements around electronic
      monitoring of employees (N.J.S.A. 34:6B-22, on tracking devices in
      vehicles, is the one people usually cite and is probably not this) — worth
      one question to an employment attorney rather than an assumption either
      way.
