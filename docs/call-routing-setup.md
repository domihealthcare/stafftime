# The after-hours phone line: setting it up and testing it

November 2026, Dominguez: replaces Talkroute. After hours, Weave's **Closed**
routing forwards every call to one Twilio number. Twilio asks Domi Staff who
is on call right now and rings that provider's cell (their **Directory
phone**). Nothing is recorded, transcribed or kept as voicemail on Twilio: an
unanswered call ends in the provider's own cell voicemail.

How a call goes, with the times on the admin page's defaults:

1. "Thank you for calling Domi Healthcare. For English, press 1." then
   "Para español, oprima 2." (about 7 seconds). No key, or a wrong one: the
   menu once more, then English.
2. The greeting in the chosen language only (about 25 seconds).
3. **Try 1**: the on-call provider's cell rings for 20 seconds. When they
   answer they hear "Domi Healthcare after-hours call, English-speaking
   caller. Press 1 to accept." Only pressing 1 connects the caller.
4. "Please continue to hold while we connect you." **Try 2**: the backup, the
   same way (skipped when there is none).
5. **Try 3**: the on-call provider again, **without** the whisper, ringing up
   to 45 seconds, so an unanswered call falls into their own voicemail.
6. Only if even that is not answered at all (the phone is off, busy, or has
   no voicemail and just rings out): **Try 4**, the default provider (Dr.
   Jonathan Dominguez) with the whisper; then "We could not reach the
   on-call provider ..." and the call ends, and the on-call provider and
   backup get a **missed-call alert** (bell, email, phone) with the caller's
   number. A **full** voicemail box usually still answers with the
   carrier's own message, and the line cannot tell that from a person, so
   try 4 does not happen then: keep voicemail boxes from filling up.
   If the caller hangs up while a provider's phone is ringing, the providers
   rung get an alert too ("ended before anybody pressed 1. If they left no
   voicemail, please call back").

Worst case, English, with a backup: about 2 minutes from pickup to the
provider's voicemail (the greeting is about 25 seconds since 7 November
2026). The caller hears ringing, never silence, while a
cell rings.

The provider's phone shows the **Twilio number**, not the patient's. The
caller's number is under **Recent calls** at the bottom of **Schedule -> On
call** for 90 days, for
providers, managers and admins.

If Domi Staff cannot read the schedule (the database is slow or down), the
call goes to `ONCALL_FALLBACK_PHONE`. If Domi Staff itself is down, Twilio's
own **fallback** (Part 3, step 5) rings the same cell. A call never hits a
dead end.

---

## Before you start: things only you can decide

- **Each provider's number.** The line rings a provider's **on-call
  number** (theirs to set in **Your profile**, or an admin's under Manage ->
  Staff -> Edit), or their Directory phone when they have not set one. Schedule
  -> On call -> Phone line settings -> Providers' phones shows which number
  is rung for each, and whether it can be dialled.
- **How long each provider's phone rings before its voicemail answers.** It
  must be longer than the 20 seconds the line rings, or their voicemail picks
  up during try 1 and records the whisper as a short junk message. Most
  phones ring about 25 to 30 seconds. If one is shorter, either ask the
  carrier to lengthen it or lower "Ring each provider for" under Phone line settings.
- **No BAA** (Dominguez, November 2026): Twilio only signs one on its paid
  Security or Enterprise Editions; you chose to go ahead without one.

## Part 1: buy the Twilio number (about 15 minutes)

1. Go to **twilio.com**, sign up with a practice email (devices@ would suit,
   like the iPad's Apple Account), and verify your own cell when asked.
2. **Upgrade the account** (Admin -> Account billing -> Upgrade, add a card).
   A trial account plays "this is a trial account" to every caller and can
   only ring verified numbers, so it is no good even for testing with staff.
3. **Phone Numbers -> Manage -> Buy a number.** Country United States,
   Capability **Voice**, and type 201 as the area code if you like. Buy it
   (about $1.15 a month). Write the number down as +1 and ten digits, e.g.
   `+12015550199`.
4. Leave the number's region as **United States (US1)**: that is Twilio's US
   East (Virginia) region, the closest to New Jersey. Domi Staff runs in US
   East too.
5. In **Account -> API keys & tokens** (or the Console's home page), copy the
   **Account SID** (starts AC) and the **Auth Token** (press Show). Treat the
   token like a password: never paste it in chat or email.

Rough costs: about a cent a minute for the forwarded call coming in, about
1.5 cents a minute for each call to a cell, and a fraction of a cent for the
spoken words. A 3-minute call is roughly 5 to 8 cents.

## Part 2: tell Domi Staff about it, in Vercel (about 5 minutes)

In Vercel -> the stafftime project -> **Settings -> Environment Variables**,
add each of these for **Production** only, then **redeploy** (Deployments ->
the latest -> ... -> Redeploy):

| Name | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | the AC... Account SID |
| `TWILIO_AUTH_TOKEN` | the Auth Token |
| `TWILIO_PHONE_NUMBER` | the number, `+12015550199` |
| `TWILIO_WEBHOOK_BASE_URL` | `https://staff.domihealthcare.com` |
| `ONCALL_FALLBACK_PHONE` | Dr. Jonathan Dominguez's cell, `+1` and ten digits |

Then open **Schedule -> On call -> Phone line settings**: the status card
should say the line is switched on and the fallback cell is set.

## Part 3: point the number at Domi Staff (about 5 minutes)

1. Twilio Console -> **Phone Numbers -> Manage -> Active numbers** -> your
   number -> **Configure**.
2. **Voice configuration -> A call comes in**: Webhook,
   `https://staff.domihealthcare.com/api/call-routing/voice/incoming`,
   HTTP **POST**.
3. **Call status changes**:
   `https://staff.domihealthcare.com/api/call-routing/voice/status`, POST.
   (This is how the log knows a caller hung up.)
4. Make the fallback first: **TwiML Bins** (Develop -> TwiML Bins, or search
   "TwiML Bins") -> **Create new**, name it "Domi on-call fallback", and paste
   this, putting the Twilio number and Dr. Dominguez's cell in place of the
   two numbers:

   ```xml
   <Response>
     <Say voice="Polly.Joanna-Neural">Thank you for calling Domi Healthcare. Please hold while we connect you to the on-call provider.</Say>
     <Dial callerId="+12015550199" record="do-not-record" timeout="45">
       <Number>+12015550100</Number>
     </Dial>
   </Response>
   ```

5. Back on the number: **Primary handler fails**: TwiML Bin, "Domi on-call
   fallback". Twilio uses it if Domi Staff does not answer within its time
   limit or answers with an error.
6. **Save configuration.** Leave recording, transcription and voicemail
   features off (they are off unless switched on; Domi Staff also tells Twilio
   "do not record" on every call).

## Part 4: test with staff phones only, before Weave (about 30 minutes)

Do these by calling the **Twilio number directly** from a staff cell, with
two providers' cells to hand (or one provider and a manager made backup).
After each, look at **Recent calls** at the bottom of **Schedule -> On call**.

1. **Set up**: on **Schedule -> On call**, press today and choose **Part of
   the day**: an override for the next hour with provider A and backup B (so
   the test does not depend on the usual pattern).
2. **English**: call, press 1. You hear the English greeting. A's phone shows
   the Twilio number; A answers, hears "English-speaking caller", presses 1:
   you are connected. Log: *Accepted by A*.
3. **Spanish**: call, press 2. Spanish greeting only; A hears
   "Spanish-speaking caller". Log language: Spanish.
4. **No key**: call and press nothing. The menu plays twice, then the English
   greeting. Also try pressing 7: the menu plays again.
5. **Provider declines**: A answers but does not press 1 (or hangs up). You
   hear "please continue to hold", then B's phone rings. B presses 1. Log:
   A *declined*, *Accepted by B*.
6. **Nobody answers**: neither presses 1. After B, A's phone rings again with
   no whisper; let it go to A's voicemail and leave a test message. Log:
   *Rang through to A's phone*. Check the message is in A's own voicemail.
7. **Override day**: remove the override. Under On call, press today and
   choose **Whole day** with provider B, and call: B rings first. Put it back
   to the usual afterwards.
8. **Split night**: add a part-of-the-day override for the next 15 minutes
   for B, then one from 15 minutes on for A. Call during each.
9. **Caller hangs up**: call, press 1, and hang up while A's phone rings. Log:
   *Caller hung up*, and A and B get a missed-call alert with your number.
10. **Fallback** (optional, with Dominguez watching): in Twilio, change "A
    call comes in" to a wrong address for a minute and call: the TwiML Bin
    rings the fallback cell. Change it back.
11. **Caller ID through Weave** comes in Part 5.

## Part 5: switch Weave over (about 10 minutes, then one more test)

1. In the Weave portal (or ask Weave support): **Phones -> Call routing**
   (sometimes under Departments or Office hours) -> the **Closed** routing ->
   **Forward to an outside number** -> the Twilio number. Leave the open-hours
   routing as it is.
2. Check Weave's office hours match when the practice is closed, holidays
   included.
3. After hours, call the **main office number** from a staff cell. It should
   go through to the menu exactly as in Part 4.
4. Look at Recent calls: does it show **your cell's number**, or the
   office's? That says whether Weave passes on the caller's number when it
   forwards. If it shows the office number, providers will rely on the
   callback number the caller leaves in voicemail; ask Weave support whether
   "pass through caller ID on forward" can be turned on.
5. Cancel Talkroute only after a week of real calls going through.

## Changing things later

- **Who is on call**: Schedule -> On call, as before (the usual pattern, one
  day changed, swaps), now with an optional **backup** on each. A day's turn
  runs from **6 AM** to 6 AM the next day (it was noon for the old answering
  service). For part of a night, or any odd hours, press the day and choose
  **Part of the day**: an **override** beats the day and the pattern, and
  nothing else changes. The line rings exactly what the On call page shows.
- **What callers hear**: On call -> Phone line settings -> What callers hear. To use your
  own recording, upload the MP3 to **Twilio -> Assets** (Develop -> Functions
  and Assets -> Assets), copy its https link and paste it beside the message.
  Nothing is uploaded to Domi Staff.
- **Who is rung by default**: On call -> Phone line settings -> Default
  provider. Keep
  `ONCALL_FALLBACK_PHONE` in Vercel and the TwiML Bin in step with it.

## If something goes wrong

- **Callers hear "an application error has occurred"**: the TwiML Bin is not
  set as the fallback (Part 3, step 5). Set it; then check Vercel's logs.
- **Every call goes to the fallback cell**: Recent calls says "Fallback used".
  Look for problems on the admin page (no default provider, phones that
  cannot be dialled), then Vercel's logs for "call-routing".
- **The log is empty though calls work, or every call goes to the
  TwiML Bin**: the token or the address does not match. Vercel's logs say
  "Refused a phone line request" with the address that was checked.
  `TWILIO_WEBHOOK_BASE_URL` is only the start of the address, with no `/api`
  and no slash at the end: `https://staff.domihealthcare.com`, matching the
  start of the address in Twilio's "A call comes in" box.
- **The fallback TwiML Bin only covers the first step.** If the app stops
  answering part-way through a call (after the language menu), Twilio cannot
  use it. The app answers every step within 8 seconds, rings the fallback
  cell itself when the schedule cannot be read, and never waits long on
  writing the log; test 10 in Part 4 checks the first step only.
