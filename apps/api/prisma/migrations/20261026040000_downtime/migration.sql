-- Downtime (October 2026, Dominguez): when eCW, the phones (Weave) or the
-- internet go down. A manager or admin starts one for an office or both, the
-- people on shift are told, updates go to them, and a manager closes it with
-- its cause; the log keeps how long, why, the catch-up and the shredding. The
-- procedures for each job role are a guide, and the forms print from the
-- Downtime page. No patient details anywhere: the downtime paperwork stays on
-- paper.

-- CreateEnum
CREATE TYPE "DowntimeSystem" AS ENUM ('ECW', 'PHONES', 'INTERNET');

-- CreateEnum
CREATE TYPE "DowntimeCause" AS ENUM ('ECW_OUTAGE', 'INTERNET_PROVIDER', 'POWER', 'WEAVE', 'PLANNED_MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "DowntimeNoticeKind" AS ENUM ('AHEAD', 'STARTED');

-- CreateTable
CREATE TABLE "downtimes" (
    "id" UUID NOT NULL,
    "systems" "DowntimeSystem"[],
    "note" TEXT,
    "planned" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "plannedEndsAt" TIMESTAMP(3),
    "announcedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "cause" "DowntimeCause",
    "causeNote" TEXT,
    "catchUpPlan" TEXT,
    "catchUpDueOn" DATE,
    "caughtUpAt" TIMESTAMP(3),
    "shreddedAt" TIMESTAMP(3),
    "startedById" UUID,
    "endedById" UUID,
    "caughtUpById" UUID,
    "shreddedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "downtimes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downtime_locations" (
    "downtimeId" UUID NOT NULL,
    "locationId" UUID NOT NULL,

    CONSTRAINT "downtime_locations_pkey" PRIMARY KEY ("downtimeId","locationId")
);

-- CreateTable
CREATE TABLE "downtime_updates" (
    "id" UUID NOT NULL,
    "downtimeId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downtime_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downtime_recipients" (
    "downtimeId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "kind" "DowntimeNoticeKind" NOT NULL,
    "toldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downtime_recipients_pkey" PRIMARY KEY ("downtimeId","employeeId","kind")
);

-- CreateTable
CREATE TABLE "downtime_contacts" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "name" TEXT,
    "detail" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "systems" "DowntimeSystem"[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "downtime_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downtime_contacts_made" (
    "id" UUID NOT NULL,
    "downtimeId" UUID NOT NULL,
    "contactId" UUID,
    "label" TEXT NOT NULL,
    "doneById" UUID,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downtime_contacts_made_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downtime_kit_items" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "downtime_kit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downtime_checks" (
    "id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "locationId" UUID,
    "employeeId" UUID,
    "lowItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feedback" TEXT,
    "readAt" TIMESTAMP(3),
    "readById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downtime_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downtime_check_notices" (
    "month" DATE NOT NULL,
    "employeeId" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downtime_check_notices_pkey" PRIMARY KEY ("month","employeeId","round")
);

-- CreateTable
CREATE TABLE "downtime_pad_providers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "npi" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "downtime_pad_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "downtimes_endedAt_idx" ON "downtimes"("endedAt");

-- CreateIndex
CREATE INDEX "downtimes_startsAt_idx" ON "downtimes"("startsAt");

-- CreateIndex
CREATE INDEX "downtime_locations_locationId_idx" ON "downtime_locations"("locationId");

-- CreateIndex
CREATE INDEX "downtime_updates_downtimeId_createdAt_idx" ON "downtime_updates"("downtimeId", "createdAt");

-- CreateIndex
CREATE INDEX "downtime_recipients_employeeId_idx" ON "downtime_recipients"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "downtime_contacts_made_downtimeId_contactId_key" ON "downtime_contacts_made"("downtimeId", "contactId");

-- CreateIndex
CREATE INDEX "downtime_checks_month_idx" ON "downtime_checks"("month");

-- AddForeignKey
ALTER TABLE "downtimes" ADD CONSTRAINT "downtimes_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtimes" ADD CONSTRAINT "downtimes_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtimes" ADD CONSTRAINT "downtimes_caughtUpById_fkey" FOREIGN KEY ("caughtUpById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtimes" ADD CONSTRAINT "downtimes_shreddedById_fkey" FOREIGN KEY ("shreddedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_locations" ADD CONSTRAINT "downtime_locations_downtimeId_fkey" FOREIGN KEY ("downtimeId") REFERENCES "downtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_locations" ADD CONSTRAINT "downtime_locations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_updates" ADD CONSTRAINT "downtime_updates_downtimeId_fkey" FOREIGN KEY ("downtimeId") REFERENCES "downtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_updates" ADD CONSTRAINT "downtime_updates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_recipients" ADD CONSTRAINT "downtime_recipients_downtimeId_fkey" FOREIGN KEY ("downtimeId") REFERENCES "downtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_recipients" ADD CONSTRAINT "downtime_recipients_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_contacts_made" ADD CONSTRAINT "downtime_contacts_made_downtimeId_fkey" FOREIGN KEY ("downtimeId") REFERENCES "downtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_contacts_made" ADD CONSTRAINT "downtime_contacts_made_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "downtime_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_contacts_made" ADD CONSTRAINT "downtime_contacts_made_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_checks" ADD CONSTRAINT "downtime_checks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_checks" ADD CONSTRAINT "downtime_checks_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_checks" ADD CONSTRAINT "downtime_checks_readById_fkey" FOREIGN KEY ("readById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_check_notices" ADD CONSTRAINT "downtime_check_notices_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- What each job role does, as a guide managers and admins keep up to date.
INSERT INTO "guide_sections" ("id", "guide", "group", "title", "body", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'DOWNTIME', $d$Front desk$d$, $d$First$d$, $d$Tell a manager straight away. They start the downtime in Domi Staff and call support.

Domi Staff still works on your phone's data, so keep clocking in as usual.

!! Nothing about a patient goes into Domi Staff or on your phone. Paper only, in the downtime folder.$d$, 10, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Front desk$d$, $d$eCW is down$d$, $d$Phones, fax and the card machine still work (they are Weave).

- Sign each patient in on the **Downtime sign-in sheet** as they arrive, with the time.
- We cannot see today's schedule. Anyone booked who does not come is found and marked during catch-up.
- Photocopy the insurance card, front and back. For a new patient, their ID as well.
- Start a **Running patient sheet** and a **Downtime progress note**. Fill in the top of both, clip them together and hand them to the MA.
- Copays: take card, cash or check as usual. Write the amount on the sign-in sheet.
- Appointment requests, refills and messages go on the **Call-back list**.
- Faxes still go through Weave. Print anything that comes in for a patient and put it in the downtime folder.
- At checkout, write the time. ==Photocopy everything the patient leaves with== (prescriptions, lab and referral slips, handouts) before handing it over.
- A follow-up appointment goes on the **Checkout list**: when, and what for.$d$, 20, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Front desk$d$, $d$Phones are down$d$, $d$Weave is down: the phones, fax, the card machine and the Weave app.

- Copays: take cash or check now. If they can only pay by card, tick **Owed** with the amount. It is collected once Weave is back.
- Requests from patients at the desk go on the Call-back list.
- Urgent calls (a pharmacy, a lab, a hospital): use **Doximity** on your phone. It shows the office number, not yours.$d$, 30, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Front desk$d$, $d$Internet is down$d$, $d$- Usually eCW and Weave are both down at this office. Do both lists above.
- Keep seeing patients.
- The other office may be working normally. A manager can ask them for help.$d$, 40, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Front desk$d$, $d$Power is out$d$, $d$- If the lights are out, a manager decides: patients move to the other office if it can take them, or they are rescheduled.
- Write down who needs rescheduling on the Call-back list.$d$, 50, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Front desk$d$, $d$When it's back$d$, $d$A manager says how fast and in what order.

- Enter the check-ins and check-outs in eCW. Post the copays and collect any marked Owed.
- Book each follow-up on the Checkout list and tell the patient the date.
- Work through the Call-back list and call each patient back.
- Scan every paper into eCW Documents. Write your name and the date at the bottom of each sheet.
- Give the downtime folder to a manager.$d$, 60, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Medical assistant$d$, $d$First$d$, $d$Tell a manager if they do not know yet. They start the downtime in Domi Staff and call support.

Domi Staff still works on your phone's data, so keep clocking in as usual.

!! Nothing about a patient goes into Domi Staff or on your phone. Paper only, in the downtime folder.$d$, 70, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Medical assistant$d$, $d$eCW is down$d$, $d$- Take the **Running patient sheet** and **Downtime progress note** from the front desk. Write the time you room the patient and your initials.
- Vitals and allergies go at the bottom of page 1 of the progress note.
- Vaccines or screenings given go under Screenings / vaccines, with the date.
- Medication list: ask the patient or check their bottles. Write any changes next to Meds.
- Lab draws: only from a **lab order slip** the provider has signed. Label each tube by hand with name, DOB and date. ==Photocopy the slip== before it goes with the specimen.
- Write the time and your initials for each step on the running sheet, then pass both sheets to the provider.$d$, 80, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Medical assistant$d$, $d$Phones are down$d$, $d$- Lab results and faxes cannot come in. Tell the provider about anything expected today.
- Urgent calls: use **Doximity** on your phone. It shows the office number, not yours.$d$, 90, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Medical assistant$d$, $d$Internet is down$d$, $d$- Usually eCW and Weave are both down at this office. Do both lists above.
- Keep seeing patients.$d$, 100, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Medical assistant$d$, $d$Power is out$d$, $d$- If the lights are out, a manager decides: patients move to the other office if it can take them, or they are rescheduled.$d$, 110, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Medical assistant$d$, $d$When it's back$d$, $d$- Enter vitals, injections and labs drawn in eCW, in the order a manager gives.
- Write your name and the date on the running sheet once done.$d$, 120, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Provider$d$, $d$First$d$, $d$Tell a manager if they do not know yet. They start the downtime in Domi Staff and call support.

Domi Staff still works on your phone's data, so keep clocking in as usual.

!! Nothing about a patient goes into Domi Staff or on your phone. Paper only, in the downtime folder.$d$, 130, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Provider$d$, $d$eCW is down$d$, $d$- Write the visit on the **Downtime progress note**. Sign and date it.
- Labs, referrals and imaging go on the **Downtime pads**. Sign each slip and tick your name under the signature.
- Prescriptions go on the **paper prescription pads** (NJ blanks for controlled substances). Also write each one in the plan on the progress note.
- Everything the patient leaves with is ==photocopied first== by the front desk, so it can be scanned in later.
- No chart: ask the patient, and the pharmacy can give their fill history. Put off a decision that needs records if it can wait.
- Write the time you go in and the time you finish on the running sheet.
- Telemedicine visits use **doxy.me**, which does not need eCW. If doxy.me is not working, call the patient with **Doximity**.$d$, 140, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Provider$d$, $d$Phones are down$d$, $d$- Results and faxes cannot come in.
- Urgent calls: use **Doximity** on your phone. It shows the office number, not yours.$d$, 150, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Provider$d$, $d$Internet is down$d$, $d$- Usually eCW and Weave are both down at this office. Do both lists above.
- Keep seeing patients.$d$, 160, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Provider$d$, $d$Power is out$d$, $d$- If the lights are out, a manager decides: patients move to the other office if it can take them, or they are rescheduled.$d$, 170, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Provider$d$, $d$When it's back$d$, $d$- Enter or sign each note in eCW. The paper note is scanned into Documents too.
- Enter the orders and prescriptions you wrote on paper as **already given**.

!! Do not send a prescription to the pharmacy again.$d$, 180, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Managers and admins$d$, $d$Starting a downtime$d$, $d$1. **Start it in Domi Staff**: Downtime, Start a downtime. Say what is down, which office, and add a note. Everybody on shift there now or later today is told by bell, email and phone.
2. An eCW downtime is usually **both offices**: eCW is the same for both, and the people working from home and on telemedicine are told with them.
3. Contact support. The numbers are on the Downtime page, for managers and admins only. Tick each one there so it goes in the log.
4. Post updates as you hear back. They go to the same people.
5. Make sure each front desk has the downtime stack out and a downtime folder.$d$, 190, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Managers and admins$d$, $d$Phones are down$d$, $d$- Staff make urgent calls with **Doximity** on their own phones, which shows the office number.
- Card payments that cannot be taken are marked Owed and collected once Weave is back.$d$, 200, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Managers and admins$d$, $d$Power is out$d$, $d$- If the lights are out, decide: move patients to the other office if it can take them, or reschedule them.
- If it is only the internet, keep seeing patients.$d$, 210, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Managers and admins$d$, $d$When it's back$d$, $d$1. **Close it in Domi Staff** and pick the cause: eCW outage, internet provider, power, Weave, planned maintenance, or other, with a note.
2. The catch-up: under 4 hours, done the same day. Up to a day, by the end of the next working day. Longer, write a plan when you close it.
3. Order: prescriptions and orders, the checkout and call-back lists, visit notes, copays, then scanning.
4. Collect each downtime folder. Keep the paper 2 weeks, then shred it. Domi Staff reminds you, and you mark it shredded.
5. Mark the downtime **Caught up** in the log.$d$, 220, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Managers and admins$d$, $d$Planned downtime$d$, $d$An eCW upgrade or other planned work that falls in working hours: enter it ahead (Start a downtime, then **Planned**). The people working then are told the evening before, and again when it starts. Close it when it is over, like any other.$d$, 230, now()),
  (gen_random_uuid(), 'DOWNTIME', $d$Managers and admins$d$, $d$The monthly check$d$, $d$On the 1st of each month the admin team and the admins are asked to check the downtime stack at their front desk, and to say if anything in these procedures has changed or should be added. What is running low, and what they wrote, comes to managers on the Downtime page and in the nightly email.$d$, 240, now());

-- Who to contact (managers and admins only), from Dominguez, 26 October 2026.
INSERT INTO "downtime_contacts" ("id", "label", "name", "detail", "phone", "email", "systems", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'eCW: email first', NULL, 'Whoever starts the downtime emails them', NULL, 'ECWsupport@tmgnj.com', ARRAY['ECW']::"DowntimeSystem"[], 10, now()),
  (gen_random_uuid(), 'eCW', 'Stephanie Parker', 'eCW admin: she is the one who fixes it', '347-580-9685', NULL, ARRAY['ECW']::"DowntimeSystem"[], 20, now()),
  (gen_random_uuid(), 'United MSO', 'Kevin S. MacNiven', 'CEO of United MSO, the group we are part of. So he knows and can escalate', '908-433-6437', NULL, ARRAY['ECW']::"DowntimeSystem"[], 30, now()),
  (gen_random_uuid(), 'Internet', 'Miguel (IT)', NULL, '201-966-9324', NULL, ARRAY['INTERNET']::"DowntimeSystem"[], 40, now()),
  (gen_random_uuid(), 'Phones, fax, card machine', 'Weave support', 'Mon to Thu 8 AM to 8 PM, Fri 8 AM to 7 PM (Eastern)', '1-888-579-5668', NULL, ARRAY['PHONES']::"DowntimeSystem"[], 50, now());

-- What should be in the stack at each front desk, checked monthly.
INSERT INTO "downtime_kit_items" ("id", "label", "quantity", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'Downtime sign-in sheets', 10, 10, now()),
  (gen_random_uuid(), 'Running patient sheets (pages of two)', 25, 20, now()),
  (gen_random_uuid(), 'Downtime progress notes', 50, 30, now()),
  (gen_random_uuid(), 'Order pads (lab and referral)', 50, 40, now()),
  (gen_random_uuid(), 'Checkout lists', 5, 50, now()),
  (gen_random_uuid(), 'Call-back lists', 5, 60, now()),
  (gen_random_uuid(), 'What to do sheets, one for each role', 4, 70, now()),
  (gen_random_uuid(), 'Window sign (English and Spanish)', 1, 80, now()),
  (gen_random_uuid(), 'Paper prescription pads (NJ blanks)', NULL, 90, now()),
  (gen_random_uuid(), 'Downtime folder', 1, 100, now());

-- The providers on the order pads, as Dominguez gave them (26 October 2026).
-- Dr. Iparraguirre's NPI is 1700383924; the old paper pads had it wrong.
INSERT INTO "downtime_pad_providers" ("id", "name", "npi", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'Jonathan M. Dominguez, M.D.', '1376923755', 10, now()),
  (gen_random_uuid(), 'Caridad M. Iparraguirre, M.D.', '1700383924', 20, now()),
  (gen_random_uuid(), 'Jose Badia, AGNP-C', '1740926161', 30, now()),
  (gen_random_uuid(), 'Daniel Dominguez, M.D.', '1891484499', 40, now()),
  (gen_random_uuid(), 'Kimberly Hernandez, M.D.', '1003370875', 50, now());

