-- Guides and invoices (October 2026, Dominguez): the Front Desk Cheat Sheet,
-- the Domi Playbook and the inpatient note templates as guides kept in the
-- app, and an invoice maker that keeps a copy of every invoice.

-- CreateEnum
CREATE TYPE "GuideKey" AS ENUM ('FRONT_DESK', 'RESULTS_PLAYBOOK', 'INPATIENT_NOTES');

-- CreateEnum
CREATE TYPE "InvoiceBillTo" AS ENUM ('VENDOR', 'PATIENT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DUE', 'PAID');

-- CreateTable
CREATE TABLE "guide_sections" (
    "id" UUID NOT NULL,
    "guide" "GuideKey" NOT NULL,
    "group" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guide_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "issuedOn" DATE NOT NULL,
    "dueOn" DATE,
    "billTo" "InvoiceBillTo" NOT NULL DEFAULT 'VENDOR',
    "billToName" TEXT,
    "billToAddress" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DUE',
    "paidOn" DATE,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guide_sections_guide_sortOrder_idx" ON "guide_sections"("guide", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A patient's details are printed on their invoice's PDF only, never kept.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_details_not_kept"
  CHECK ("billTo" <> 'PATIENT' OR ("billToName" IS NULL AND "billToAddress" IS NULL));

-- The guides as the documents had them, typos mended and the examples in
-- the message scripts turned into blanks. Only loaded into an empty table.
INSERT INTO "guide_sections" ("id", "guide", "group", "title", "body", "sortOrder", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Getting started$g$, $g$Welcome$g$, $g$As a Front Desk Receptionist you play a key role in creating a positive patient experience. One of your main tools is **eClinicalWorks (eCW) Version 12**, our electronic health record. It is where we manage patient information, appointments, registration, insurance and communication.

By the end of your training you should be able to:
- Log in and find your way around the eCW dashboard.
- Search for and register patients.
- Schedule, reschedule and cancel appointments.
- Verify insurance and update demographics.
- Check patients in and out.
- Collect copays and document payments.$g$, 10, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$Rules to remember$g$, $g$!! Do not book **Med Clearance, New Patients, AWVs, TCM or Pap smears** in the **last hour** of a provider's schedule. The last hour is for **follow ups only**.

- Always read the notes on **grey blockouts** before booking. A grey block can mean a schedule change (hours or availability), something happening in the office (training, meetings, maintenance), or which procedures can or cannot be done that day. Follow them strictly.
- Always check the **tags** on a patient's chart. Every tag means something and needs to be dealt with, outstanding balances included.$g$, 20, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$New patients$g$, $g$Chief complaint must say **"New Patient + [[reason]]"**.

1. Book in the right open slots only.
2. Add the insurance to Demo and verify it is **active**.
  - No insurance: **$150** for the first visit, **$125** for every follow up after.
3. Ask them to bring a **photo ID**, their **insurance card** and their **medication list** (best: bring the medicines).
4. **No more than 2 new patients back to back.**
5. **No new patients in the last two slots of the day.**

==Dr. Jose Badia: no patients under 18.==$g$, 30, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$New patient or follow up?$g$, $g$A **follow up** is an established patient seen within the last **3 years**, to the day. Last seen 3 years ago or more: book them as a **new patient** (last seen in 2023 is new in 2026).

::tool:new-or-follow-up$g$, 40, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$AWV (Annual Wellness Visit)$g$, $g$For patients with **Medicare only**. It is their "annual physical", every year.

- Same rules as new patients: **no more than 2 AWVs back to back**, and **no AWV in the last two slots of the day**.
- AWV video visit messages always go to **Celeste**.$g$, 50, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$Annual physicals$g$, $g$Only for a patient due their annual (every year, to the month and day). Check the **Problem List** in their chart to see if they are due.$g$, 60, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$USCIS (form I-693)$g$, $g$For patients filling in immigration forms, form **I-693**.

- Book them on **Fridays with Dr. D in WNY** first.
- **No more than 2 USCIS back to back**, and **none in the last two slots of the day**.$g$, 70, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$Bloodwork and nursing visits$g$, $g$**Bloodwork:** from when the office opens, **every 20 minutes only**. Don't double book them: the phlebotomist also does bloodwork for patients seeing the provider.

**Nursing only:** don't double book. The medical assistant runs these and also processes patients, so double booking breaks the flow.

Nursing visits are: **BP checks, injections and vaccines, glucose checks.**$g$, 80, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$Procedures, Holters and sleep studies$g$, $g$**Procedures:** AEYE, ear wax removal, Fibroscan, PFT, Cryo (**Cryo is done by the provider**). Watch the grey blocks for days a procedure is not done.

**Holters:** placement on **Monday**, removal (cardiac removal) on **Friday**. Holter monitor and cardiac removal have their own appointment types, booked under **Nursing** at the office where it is done.
- We have **3 Holters: 2 in WNY, 1 in NB.**
- ==If 2 get booked in NB, tell CA or TR.==

**Sleep studies:** read the grey blockout for when sleeps can be picked up ("P/U") and returned ("RTRN").
- Book the pick up in the time allowed.
- Book the return on a return date, in the time allowed (the earlier the better).
- Check in and out, and give the machine to the MA or AD.$g$, 90, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$Women's health$g$, $g$Book with **Dr. Iparraguirre only**: Pap smears and birth control education.

- ==We do not do IUD removals.==
- **Don't double book urgents with Pap smears**, and **don't book 2 Pap smears back to back** (no WH appointments at 9:00 and 9:20).
- **No Pap smears after 3pm.**
- Call Dr. Iparraguirre's **last 2 patients** and offer to double book them earlier. They can only be double booked next to WTM, annual physicals or new patients. If urgents are booked, message Dr. Ip.$g$, 100, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$Urgent appointments$g$, $g$**Urgent appointments** are approved by the provider, or come from urgent results (Appt needed or Action needed).

**Urgent video visits** are approved by the provider, or come from urgent Action needed results. ==An urgent "Appt needed" is never offered a video visit.==

!! Urgent appointments are never double booked.

They can't be double booked next to:
- 40 minute appointments
- Pap smears
- DOT and CDL exams (30 minutes)

Try **not** to book them in the **7am, 9am, 11am, 1pm, 3pm or 5pm** slots (the urgent slots).$g$, 110, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$Video visit or in person?$g$, $g$**Video visits** are telemed visits to discuss Action needed results or weight management (WTM); sometimes the provider approves one to discuss medication or another topic. **Urgent video visits are only booked in the last two slots of a video visit day.**

Video visits can be booked for:
1. TCM (medication review, referrals and so on)
2. Lab results
3. ED follow up
4. A confirmed positive COVID (home test) or a positive flu
5. Any letter or form (not a physical exam): MNL, emotional support animal letters
6. Women's health: irregular periods, HRT options, PCOS, based mostly on the history the patient gives
  - All providers (consider TVUS, hormone panel with the regular bloodwork).
  - Book the follow up for results and a Pap (if needed) with Dr. I or Dr. Hernandez.
7. WTM (unless the provider wants them in person)
8. ==UTI symptoms: now a video visit (urgent)==

**In person** for:
1. New patients
2. Vaginal discomfort, discharge or an STI concern: with Dr. I or Dr. Hernandez
3. A positive STI
4. Annual exams
5. Medication reconciliation
6. AWV: IPPE and AWV Clover (not sure about other Medicare plans)
7. Sick visits (cough, cold, fever)
8. Urgent visits$g$, 120, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$Diagnostics and ultrasounds$g$, $g$**Diagnostics** are done by an outside facility: **EEG, ANS, VNG and TCD**. Use the grey blockouts, as the schedule changes.

**Ultrasounds** are done by an outside facility too; book them as a **Diagnostic**. Only on **Sundays, alternating WNY and NB**. Check insurance cover and booking time on the [Diagnostics board](/diagnostics).

## Explaining the tests to patients

:::copy
VNG (English): A VNG, or videonystagmography, is a test of your balance system. It helps doctors find out if there is a problem with your inner ear or the parts of your brain that control balance and eye movements. During the test you wear special goggles that record your eye movements as you follow targets and change head positions. This shows whether vertigo or dizziness comes from the balance system.
:::

:::copy
VNG (Español): Un VNG, o videonistagmografía, es una prueba que evalúa su sistema de equilibrio. Ayuda a los médicos a saber si hay un problema en el oído interno o en las partes del cerebro que controlan el equilibrio y los movimientos de los ojos. Durante la prueba usará unas gafas especiales que graban los movimientos de sus ojos mientras sigue objetivos con la vista y cambia la posición de la cabeza. Así se sabe si el vértigo o el mareo vienen del sistema de equilibrio.
:::

:::copy
ANS (English): The ANS, or autonomic nervous system, is the part of your nervous system that controls the things your body does automatically, like your heart rate, digestion and breathing. It works without you thinking about it, helping your body respond to stress and keep its balance. It has two parts: the sympathetic system, which gets your body ready for action, and the parasympathetic system, which helps it relax and save energy.
:::

:::copy
ANS (Español): El SNA, o sistema nervioso autónomo, es la parte de su sistema nervioso que controla lo que el cuerpo hace de forma automática, como el ritmo del corazón, la digestión y la respiración. Funciona sin que usted lo piense y ayuda al cuerpo a responder al estrés y a mantener el equilibrio. Tiene dos partes: el sistema simpático, que prepara el cuerpo para la acción, y el parasimpático, que lo ayuda a relajarse y ahorrar energía.
:::$g$, 130, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$Discharged patients$g$, $g$Always ask if the patient has ever been seen here, and always check **Elation** to be safe.

In eCW, change the status from **"Active"** to **"All"**. If they were discharged, write a message to admin.$g$, 140, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Booking$g$, $g$Rep lunches$g$, $g$Reps come to the office to talk to the providers about medications.

1. Book only **one** lunch a day, in the time blocked out (**12:00 to 12:40pm**).
2. Add a block next to the 12pm slot: the right provider, and the duration changed to **40 minutes**.
3. Get the rep's **name, medication or company, and phone number**.
4. **Only 1 rep a day** with the provider.

Rep lunches also go on the practice calendar in Domi Staff (Schedule, Calendar).$g$, 150, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Results calls$g$, $g$Action needed$g$, $g$1. Open the patient's chart.
2. Check whether they already have an appointment (video visit or in person).
  - If one is within the **next 3 weeks** (in person or video, for example a 1 month WTM), call and tell them the results will be discussed then, **or** offer a video visit (if the in person visit is 3 weeks or more away).
3. **Self pay:** a video visit can be offered, but the **$125** is collected while it is being booked (on that first call). If they would rather come in, the same $125 is due on the day.
4. No appointment: call to offer a video visit or an in person appointment.
5. After **2 attempts**, add the **Action Needed tag** and sign off.$g$, 160, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Results calls$g$, $g$Appt needed$g$, $g$1. Open the patient's chart.
2. Check for an upcoming appointment.
  - If there is one, call and tell them the labs will be discussed at that visit.
3. No appointment: book one **in the office only**, with the provider and office they prefer.
4. After **2 attempts**, add the **Appt Needed tag**.

==A patient with one Action needed and one Appt needed result is Appt needed for both.==$g$, 170, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Results calls$g$, $g$Normal results$g$, $g$1. Open the chart.
2. Call and tell them the results are normal.
3. No answer: leave a voicemail saying so, and sign off on the message.$g$, 180, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Results calls$g$, $g$Third attempt$g$, $g$For **Action needed** and **Appt needed**, the third attempt is an **abnormal letter** (ABNL).

==If it is urgent, send the abnormal letter right away on the third attempt.==$g$, 190, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Urgent and ED$g$, $g$Go straight to the ED$g$, $g$!! Go straight to the emergency department, or the patient calls 911, for:

1. **Chest pain**
2. **Stroke-like symptoms**
  - Facial drooping
  - Numbness on one side, or sudden weakness or paralysis in an arm or leg
  - Slurred speech, or trouble speaking or understanding
3. **Unable to breathe** (significant shortness of breath)

==If the patient refuses the ED or 911, send an URGENT message to the providers.==$g$, 200, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Urgent and ED$g$, $g$Sick patients$g$, $g$1. Gather all the symptoms.
2. When did they start?
3. Have they tested, or taken any medication?
4. Send a message to the providers with the **Urgent tag**, asking for an urgent appointment (see Messages and scripts).$g$, 210, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Urgent and ED$g$, $g$COVID positive patients$g$, $g$1. When did the symptoms start?
2. When did they test positive?
3. Ask them to send a picture of the test to the Domi email.
4. When it arrives, upload it to the chart from the email.
5. Offer a video visit, as they are positive.
6. Message the providers with the **Urgent tag**, adding that a video visit was asked for if needed.$g$, 220, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Messages and scripts$g$, $g$Urgent appointment request$g$, $g$To: **Providers**

:::copy
Pt called, c/o: [[Symptoms]]. Onset: [[Onset date]]. Patient is requesting urgent appt, please advise. TY
:::$g$, 230, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Messages and scripts$g$, $g$Medication not covered (prior authorization)$g$, $g$To: **Providers**

:::copy
Pt called, reports [[Medication]] is not covered under insurance. Key code to address PA on CMM is: [[Key code]]. Please advise if PA may be completed. Once complete and a determination is given, will f/u with patient and/or pt will call phx within 3-5 days for an update. TY
:::

Prior authorizations for **medication** are usually done by the provider (we use Tandem / Forus). For **imaging**, usually the provider with Selena, in case clinicals or a letter of medical necessity are needed.$g$, 240, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Messages and scripts$g$, $g$Upcoming surgery (medical clearance)$g$, $g$When a patient calls for a clearance appointment, ask:
1. What surgery are they having?
2. When is it?
3. Who is the surgeon?
4. Do they have forms for it? (Ask them to email the forms.)

Book the appointment, then send this to **Selena Verdezoto** (care coordinator) **and the Provider Group**:

:::copy
Pt called reporting upcoming surgery. Surgery date: [[Surgery date]]. Surgery type: [[Surgery type]]. Surgeon: [[Surgeon]]. Office #: [[Surgeon's office phone]]. Appt for medical clearance set for [[Clearance appt date]]. Please request PAT requirement form from Dr.'s office. TY
:::$g$, 250, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Messages and scripts$g$, $g$Returned a call$g$, $g$To: **Yourself**

:::copy
GM VM [[Date]]. Returned call to patient re: gmail/vm. No response, left vm for call back. TY
:::$g$, 260, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Messages and scripts$g$, $g$Physical forms$g$, $g$1. Scan the physical form into the chart.
2. Label it with the date scanned and **"Physical Form DRAFT"**. ==Always scan the form.==
3. Tell the medical assistant in the office, give them the form, and message **SV**.
4. At checkout the provider hands you a half completed or completed form: **scan it into the chart again**.
5. Label it "Physical Form (Complete)" or "(DRAFT)", and message SV that it is complete, or pending bloodwork.$g$, 270, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Payments$g$, $g$Collecting copays (Weave, then eCW)$g$, $g$**Card payments** are taken in **Weave** with the **3% surcharge** turned on, then **documented** in eCW (not charged again).
- In eCW's **Check #** box, always put **CC** for a card, then:
  - **"DH"** for in office copays, balances and so on.
  - **"Vax"** for vaccines paid through Weave, with the vaccines given written in the **memo**.
- The 3% applies to **all card payments**. A patient who doesn't want the fee can pay cash.

**Cash payments:** collect as usual, and document in eCW.

**New patients not yet in Weave:** create their Weave account and take the balance by card.$g$, 280, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Payments$g$, $g$Self pay prices$g$, $g$- First visit with no insurance: **$150**
- Every follow up after: **$125**
- Video visit (self pay): **$125**, collected when it is booked$g$, 290, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Uploading to eCW$g$, $g$Which tab a document goes in$g$, $g$| Tab | What goes in it |
| Lab Reports | All lab reports (Bio, LabCorp, Quest, Cologuard and so on) |
| Imaging Reports | Mammo, US, TVUS, EKG; imaging orders the provider made. Diagnostic and ultrasound superbills go here as "Diag Superbill" or "US Superbill" |
| Hospital Reports | Hospital discharge, hospital summary |
| Consult Reports | Referrals, e-referrals, specialists' reports (GI, cardio, pulm and so on) |
| Patient Forms Reports | New patient forms, photo ID, PHQ-9 |
| Misc Reports | Medical clearance forms, Vaxcare and vaccine consent forms, abnormal letters |
| Old Records | Records transferred from Practice Fusion (==do not upload into this tab==) |
| Billing Reports | Invoices the patient gives the front desk |
| Insurance Reports | Insurance denials and approvals |

==Always correct the document's date to the date on the document (exam date or collection date).==$g$, 300, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Pharmacy and medications$g$, $g$Pharmacy calls$g$, $g$Always confirm:
1. The patient's **name and date of birth**.
2. That they have been in the office in the **past 3 months**.
3. The **Permanent Rx Meds** on the left of the chart.
4. If several refills are needed, select all that apply. Always confirm the pharmacy with the patient.
5. Send the **draft(s)** to the **Providers Group** and write the message to the provider.$g$, 310, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Pharmacy and medications$g$, $g$Controlled medications$g$, $g$!! Every request for a controlled medication must be handled at an **in person appointment**.

- alprazolam (Xanax)
- clonazepam (Klonopin)
- diazepam (Valium)
- lorazepam (Ativan)
- temazepam (Restoril)
- zolpidem
- Tylenol with Codeine (Tylenol #3)
- oxycodone
- Lyrica$g$, 320, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Pharmacy and medications$g$, $g$Entering a medication order$g$, $g$**Do not add days supply** to the medication name. Enter the medicine, the **shorthand** (sig), the **dispense** quantity and the **days supply**.

**Doctor: Cipro 500mg BID x 7 days**
- Medication: **Cipro 500mg oral daily**
- Shorthand (not a favorite): **Take 1 tablet by mouth bid**
- Dispense **14**, days supply **7** (7 days x 2 a day)

::tool:pill-count$g$, 330, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Pharmacy and medications$g$, $g$Common orders$g$, $g$| Doctor orders | Medication | Shorthand | Dispense | Days |
| Omega 3 | Omega-3-acid Ethyl Esters 1 GM Oral Capsule | Take 2 tablet by mouth bid (favorite) | 360 | 90 |
| Hep B | Recombivax HB 10 MCG/ML Injection Suspension | Inject IM once now, then 1 month, then 6 months (refills: 2) | 1 | 1 |
| Vitamin D 2,000 units daily | Vitamin D3 50mcg (2000 UT) Oral Capsule | Take 1 tablet by mouth daily (favorite) | 90 | 90 |
| Vitamin D 50,000 units weekly | Vitamin D (Ergocalciferol) 1.25mg (50000 UT) Oral Capsule | Take 1 capsule by mouth weekly | 12 | 90 |
| Vitamin E | Vitamin E 400 Oral Capsule | Take 1 capsule by mouth BID | 180 | 90 |
| Caltrate 600+D3 | Caltrate 600+D3 600-20 MG-MCG Oral Tablet | Take 1 tablet po BID with meal | 180 | 90 |

## H. pylori triple therapy (3 medicines)
| Doctor orders | Medication | Shorthand | Dispense | Days |
| Metronidazole 500mg TID x 14 days | Metronidazole 500mg Oral Tablet | Take 1 tablet by mouth three times per day | 42 | 14 |
| Clarithromycin 500 BID x 14 days | Clarithromycin 500 MG Oral Tablet | Take 1 tablet by mouth two times per day | 28 | 14 |
| Omeprazole 40mg x 30 days | Omeprazole 40 MG Oral Capsule Delayed Release | Take 1 capsule (40 mg) by mouth daily | 30 | 30 |$g$, 340, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Pharmacy and medications$g$, $g$Vitamin B12 (Dr. Dominguez)$g$, $g$When the B12 level is low:
- **Not on B12 before:** Vitamin B12 **500 mcg** daily for 90 days (500 mcg is a favorite). Take 1 tablet by mouth daily; dispense 90, days 90.
- **Already on 500 mcg:** Vitamin B12 **1000 mcg** for 90 days.
- **Already on 1000 mcg:** coordinate **weekly B12 injections**.

==Always confirm with the patient that they have been taking it as prescribed.==$g$, 350, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Abbreviations$g$, $g$How often (frequencies)$g$, $g$These are Latin based.

| Abbreviation | Meaning | Military time | Standard time |
| QD | Daily | 0900 | 9:00 AM |
| BID | Twice a day | 0900, 1700 | 9:00 AM, 5:00 PM |
| TID | Three times a day | 0900, 1300, 1700 | 9:00 AM, 1:00 PM, 5:00 PM |
| QID | Four times a day | 0900, 1300, 1700, 2100 | 9:00 AM, 1:00 PM, 5:00 PM, 9:00 PM |
| AC | Before meals | As the doctor orders | |
| PC | After meals | As the doctor orders | |
| Q12H, Q12HRS | Every twelve hours | 0900, 2100 | 9:00 AM, 9:00 PM |
| QHS, HS | At bedtime | 2200 | 10:00 PM |
| PRN | As needed | As the doctor orders | |$g$, 360, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Abbreviations$g$, $g$How it is given (routes)$g$, $g$| Abbreviation | Meaning |
| NPO | Nothing by mouth |
| PO | Oral, by mouth |
| IM | Intramuscular |
| SQ, sub-q | Subcutaneous |
| IV | Intravenous |
| INJ | Injection |
| Top, topical | Put straight on the skin |
| Via nasal suspension | Nose sprays |
| Via nebulizer | A nebulizer turns a liquid medicine into a mist |$g$, 370, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Abbreviations$g$, $g$Units$g$, $g$| Abbreviation | Meaning |
| mg | milligrams |
| mcg | micrograms |
| gtt | (eye) drops |
| gm | grams |
| mL | milliliters |
| L | liters |
| tsp | teaspoon |
| Tbs | tablespoon |$g$, 380, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Abbreviations$g$, $g$Imaging and body$g$, $g$| Term | Short |
| Bilateral X-ray hips | BL XR Hips |
| Mammogram | Mammo |
| X-ray left knee | XR L Knee |
| X-ray right knee | XR R Knee |
| X-ray cervical spine | XR C-Spine |
| Transvaginal pelvic ultrasound | TVUS |
| Neck CAT scan | Neck CT |
| Abdomen ultrasound | Abd US |
| Chest CAT scan | Chest CT |
| Lower extremity vein, bilateral US doppler | BL US Doppler |
| Chest X-ray | CXR |
| Sonogram | Sono |
| Right upper quadrant | RUQ |
| Left upper quadrant | LUQ |
| Right lower quadrant | RLQ |
| Left lower quadrant | LLQ |
| Right upper extremity | RUE |
| Left upper extremity | LUE |
| Right lower extremity | RLE |
| Left lower extremity | LLE |
| Bilateral lower extremity | BLE |
| Bilateral lower extremity venous duplex | BL Duplex |$g$, 390, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Abbreviations$g$, $g$Specialties$g$, $g$| Specialty | Short |
| Cardiology | Cardio |
| Dermatology | Derm |
| Ears, nose and throat | ENT |
| Endocrinology | Endo |
| Gastroenterology | GI |
| General surgery | Gen. Surg (GS) |
| Hematology / oncology | Heme/Onc |
| Nephrology | Nephro |
| Neurology | Neuro |
| Obstetrics / gynecology | Ob/Gyn |
| Orthopedics | Ortho |
| Pain medicine | APM, PMM, PMN |
| Pain management | PME, PMP |
| Physical therapy | PT |
| Podiatry | Pod |
| Psychiatry | Psych |
| Pulmonology | Pulmo |
| Rheumatology | Rheum |
| Urology | Uro |
| Infectious disease | ID |
| Ophthalmology | OPH |
| Occupational therapy | OT |
| Respiratory therapy | RT |$g$, 400, now()),
  (gen_random_uuid(), 'FRONT_DESK'::"GuideKey", $g$Abbreviations$g$, $g$Everyday abbreviations$g$, $g$| Term | Short |
| Follow up | F/U |
| Abdomen, abdominal | ABD |
| Normal | Nml |
| Abnormal | Abnl |
| Continue, consistent with | C/W |
| As needed | PRN |
| Every | Q |
| Twice a day | BID (q12h) |
| Three times a day | TID (q8h) |
| Four times a day | QID (q6h) |
| Annual Wellness Visit | AWV |
| Prescription | Rx |
| Expiratory | Exp |
| Weeks | Wks |
| Months | Mos |
| Years | Yrs |
| Diabetes type 2 | DM2 |
| Treatment | Tx |
| Voicemail | VM |
| Injection | Inj |
| Over the counter | OTC |
| History | Hx |
| History of | H/O |
| Weight | Wt |
| Medications | Meds |
| Cancer | Ca |
| Screening | Scr |
| Negative | Neg |
| Positive | Pos |
| Extremity | Ext |
| Bloodwork | BW |
| Antibiotic | ABX |
| Hospital discharge | Hosp. D/C |
| Shortness of breath | SOB |
| Pregnancy test | UCG |
| Weight management | WTM |
| Measles, mumps, rubella vaccine | MMR |
| Measles, mumps, rubella, varicella vaccine | MMRV |
| Tetanus, diphtheria, acellular pertussis | Tdap |
| Thyroid stimulating hormone | TSH |
| Urine culture; uterine contractions | U/C |
| Urinalysis | U/A |$g$, 410, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$How to read it$g$, $g$What the highlights mean$g$, $g$Each test gives its normal range where there is one, and in a highlight **when action is needed** (send for review, an urgent appointment, or the person named).

- **Urgent appt:** within **24 to 48 hours**.
- **CI** is Dr. Iparraguirre, **JD** Dr. Dominguez, **JB** Dr. Badia.$g$, 10, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Cortisol (AM)$g$, $g$- ==More than 1.5==

**Dexamethasone**
- Range should be **180 to 550**.
- ==Test must be repeated if under 20.==$g$, 20, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Ferritin$g$, $g$- ==Anything low: action needed.==$g$, 30, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$eGFR and kidney$g$, $g$==No diagnosis: action needed for anything abnormal.==
- CKD 3: ==30 to 60==
- CKD 4: ==15 to 20==
- ==Under 30 GFR==$g$, 40, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$PSA (prostate)$g$, $g$- ==Urgent when over 10==
- ==Anything abnormal==$g$, 50, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$QuantiFERON$g$, $g$- ==Positive only: action needed.== **Cannot be seen in person, so it must be action needed.**
- ==Video visit only.==$g$, 60, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$CD4 and HIV$g$, $g$- Absolute count **over 400**: stable.
- ==Absolute count under 400: action needed.==
- ==HIV viral load detected: action needed.==$g$, 70, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Gonorrhea, chlamydia, RPR (STI)$g$, $g$- **Gonorrhea:** ==urgent appt==
- **Chlamydia:** ==urgent appt==
- **RPR:** ==flagged at all: urgent appt needed==$g$, 80, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Vitamin D and B12$g$, $g$- **Vitamin D:** ==under 20: 50k, abnormal.== Send a tele encounter for vitamin D.
- **Vitamin B12:** ==under 400.== **Send a tele encounter for vitamin B12.**
- Ranges: Vitamin D, 25-OH, total 30 to 100 ng/mL ==abnormal==; B12 200 to 1100 pg/mL ==if under 400==.$g$, 90, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Ceruloplasmin$g$, $g$- ==Low ceruloplasmin is abnormal.==$g$, 100, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Comprehensive metabolic panel (CMP)$g$, $g$| Test | Normal | Action |
| Glucose | 65 to 99 mg/dL | ==Over 400: urgent appt, not action needed== |
| eGFR | 60 or more mL/min/1.73m2 | See eGFR and kidney |
| Sodium | 135 to 146 mmol/L | ==Under 130 or over 150== |
| Potassium | 3.5 to 5.3 mmol/L | ==Under 3.2 or over 5.5== |
| Calcium | 8.6 to 10.2 mg/dL | ==More than 12, or if elevated== |
| Protein, total | 6.1 to 8.1 g/dL | ==Action needed if +1== |
| Bilirubin, total (liver) | 0.2 to 1.2 mg/dL | ==If high: action needed== |
| Alkaline phosphatase (liver) | 31 to 125 U/L | ==If high: action needed== |
| AST (liver) | 10 to 30 U/L | ==If high: action needed== |
| ALT (liver) | 6 to 29 U/L | ==If high: action needed== |$g$, 110, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Lipid panel$g$, $g$| Test | Normal | Action |
| Cholesterol, total | Under 200 mg/dL | ==Over 200== ==Over 300== |
| Triglycerides | ==Under 150 mg/dL== | ==Over 300== ==Over 400== |
| LDL cholesterol | Under 100 mg/dL | ==Over 100== ==Over 200== |$g$, 120, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Diabetes and endocrine$g$, $g$| Test | Normal | Action |
| Hemoglobin A1c | Under 5.7% | ==Elevated and not diagnosed: prediabetes, over 6.5== Over 9: appt needed. No history of diabetes and over 6.5: appt needed |
| Uric acid | 2.5 to 7.0 mg/dL | |
| TSH (20 years and over) | 0.40 to 4.50 mIU/L | ==Anything abnormal== |
| NT-proBNP | | ==Any elevated: send to CI urgently== |$g$, 130, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Complete blood count (CBC)$g$, $g$| Test | Normal | Action |
| White blood cells (WBC) | 3.8 to 10.8 thousand/uL | ==Under 3 or over 11== |
| Hemoglobin | 11.7 to 15.5 g/dL | ==Under normal== ==Under 7== |
| Hematocrit | 35.9 to 46.0% | |
| Platelets | 140 to 400 thousand/uL | ==Under 130== ==Under 50k== |$g$, 140, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Urinalysis$g$, $g$| Test | Normal | Action |
| Specific gravity | 1.001 to 1.035 | |
| pH | 5.0 to 8.0 | |
| Glucose | Negative | |
| Bilirubin | Negative | |
| Ketones | Negative | |
| Occult blood | Negative | ==Only matters if RBC is also out of range== |
| Protein | Negative | ==+1== |
| Nitrite | Negative | |
| Leukocyte esterase | Negative | |
| WBC (microscopic) | 5/HPF or less | |
| RBC (microscopic) | 2/HPF or less | |
| Squamous epithelial cells | 5/HPF or less | |
| Bacteria | None seen/HPF | |
| Hyaline cast | None seen/LPF | |
| Yeast | | ==Yeast in urine== |

**Bacteria (urine culture) 100,000 or more**
- Check if an antibiotic was sent.
  - If so, is it sensitive?
    - ==Urgent message: action needed.==$g$, 150, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Stool$g$, $g$- ==Positive: action needed.==$g$, 160, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Labs$g$, $g$Immunology and infectious disease$g$, $g$| Test | Normal | Action |
| Rheumatoid factor | Under 14 IU/mL | ==Positive== |
| Lyme Ab screen | Under 0.90 index | ==Positive== |
| Lyme disease Ab (IgG) blot | Negative | ==Positive== |
| Lyme disease Ab (IgM) blot | Negative | ==Positive== |
| ANA screen, IFA | Negative | ==Positive== |
| ANA titer | Under 1:40 (negative) | |$g$, 170, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Hormones$g$, $g$Hormones$g$, $g$==Anything abnormal: send to CI.==

| Test | Action |
| Prolactin | Anything abnormal |
| Estradiol | Under 30. ==Estradiol under 30 in any female: action needed with Dr. I== |
| Progesterone | Under 0.5 |
| Testosterone | Women: anything abnormal. Men: anything under 400 |
| FSH | Anything abnormal |
| LH | Anything abnormal |$g$, 180, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Women's health$g$, $g$Pap smears and vaginal concerns$g$, $g$- **Pap smears:** abnormal: send to Dr. I.
- **Vaginal concerns:** send to CI before addressing any concern.$g$, 190, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Imaging and other tests$g$, $g$Ultrasounds and scans$g$, $g$- **Thyroid:** ==TR4== ==TR3==
- **Prostate size:** about 4 x 3 x 3 cm; volume 30 to 40 mL.
  - PVR: under 50 mL normal; ==over 50 mL==
- **Breast:** ==anything BI-RADS, TI-RADS or LI-RADS (any "-RADS") category 4 or 5 is urgent.== ==BI-RADS 0 or 3.==
- **DEXA:** ==osteopenia or osteoporosis==
- **Carotid US:** ==stenosis over 70%== ==anything abnormal==
- **Cologuard / Shield:** ==positive==$g$, 200, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Imaging and other tests$g$, $g$ANS reports$g$, $g$Look at:
- Sudomotor autonomic neuropathy: ==over 50==
- Both lower artery: ==anything out of the green==
- Autonomic orthostatic tests: ==anything out of the green==
- Coronary artery disease: ==anything out of the green==$g$, 210, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Imaging and other tests$g$, $g$VNG, PFT and diagnosis papers$g$, $g$- **Video nystagmography (VNG):** ==anything mild is action needed.== A normal report says "normal" or "no".
- **PFT:** ==anything besides normal.==
- **Diagnosis papers:** review.$g$, 220, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Routing$g$, $g$Urgent appointment guidelines$g$, $g$- **Urgents:** ==within 24 to 48 hours.==
- Offered between 1 and 2 weeks: can be offered if symptoms have got worse.
- Went to urgent care: symptoms worse and medication not working.
- Lab related: send to CI, JD, JB.
- BP check only: urgent nursing.
- BP check **and** chest pain: send to the hospital.

!! Any chest pain: send to the ED.$g$, 230, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Routing$g$, $g$Hospital discharge patients$g$, $g$- TCM in the message.
  - CCM patient: send to CCM.
  - Not CCM: send to Selena.$g$, 240, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Routing$g$, $g$USCIS$g$, $g$- If shots, the lab should say USCIS in the notes.
- If not, look at the problem list.
- USCIS goes to **Selena**.$g$, 250, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Routing$g$, $g$Travel medicine$g$, $g$- When a patient is travelling, refer to the **travel clinic at Holy Name**.$g$, 260, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Routing$g$, $g$Forus (medication prior authorizations)$g$, $g$- Asking for a different medication: send a tele encounter to the provider.
- Appeal denied: send a tele encounter to the provider.
- Appeal denied for a **weight loss medication** (Zepbound, Wegovy, Foundayo): send a message to admin to offer DW.$g$, 270, now()),
  (gen_random_uuid(), 'RESULTS_PLAYBOOK'::"GuideKey", $g$Screening$g$, $g$Screening tests: document in the problem list$g$, $g$Document the **date and result** in the problem list:
1. Mammogram: date, BI-RADS [[BI-RADS]]
2. DEXA scan
3. Pap smear: date; "NILM, HPV neg" if all normal
4. Colonoscopy
5. LDCT$g$, 280, now()),
  (gen_random_uuid(), 'INPATIENT_NOTES'::"GuideKey", $g$Templates$g$, $g$Daily progress note$g$, $g$Fill in the blanks, then **Copy** and paste into the note.

:::copy
Patient seen and examined at bedside.
Interim events noted.
Denies cp/sob/fever/chills.
No other complaints offered at this time.
Available diagnostic data reviewed.

ROS
12 point review of systems reviewed, otherwise negative and unremarkable except mentioned in HPI.

Objective
Vital signs noted.
Appears: Non-toxic, no acute distress.
Head exam: Normal inspection.
Eye exam: Normal appearance.
Respiratory exam: Normal breathing pattern.
Cardiovascular exam: +S1, +S2.
GI & abdominal exam: Soft.
Neurological exam: Alert, awake.
Psychiatric exam: Normal affect, normal mood.
Skin exam: Normal color, warm.

Plan
Monitor vitals.
Monitor labs.
Cont meds.
Cont tx.
Consultants' input appreciated.
Rest of plan as ordered.

Complexity of data reviewed:
Reviewed and summarized old records.
Reviewed imaging.
Reviewed labs.
:::$g$, 10, now()),
  (gen_random_uuid(), 'INPATIENT_NOTES'::"GuideKey", $g$Templates$g$, $g$Total visit time$g$, $g$:::copy
Total visit time = [[Minutes]] minutes; more than 50% spent counseling/coordinating care. Total time includes the face-to-face time spent with the patient at the bedside and the additional time spent on reviewing data, obtaining relevant patient information, and discussing the case with other involved healthcare providers.
:::$g$, 20, now()),
  (gen_random_uuid(), 'INPATIENT_NOTES'::"GuideKey", $g$Templates$g$, $g$Discharge summary statement$g$, $g$:::copy
This is a brief discharge summary of events in the hospital, please refer to daily notes for further details.
:::$g$, 30, now()),
  (gen_random_uuid(), 'INPATIENT_NOTES'::"GuideKey", $g$Templates$g$, $g$Covering for another provider$g$, $g$:::copy
COVERING FOR DR. [[Covering for]] ON DOS [[First day]] - [[Last day]], DR. [[Resuming provider]] WILL RESUME CARE ON [[Resumes on]].
:::$g$, 40, now()),
  (gen_random_uuid(), 'INPATIENT_NOTES'::"GuideKey", $g$Templates$g$, $g$Opening line (state of emergency)$g$, $g$From the COVID-19 period; use only if it applies.

:::copy
Patient evaluated during COVID 19 crisis and state of emergency.
:::$g$, 50, now()),
  (gen_random_uuid(), 'INPATIENT_NOTES'::"GuideKey", $g$Billing$g$, $g$Hospital care codes by time$g$, $g$| Initial hospital care | Time | Subsequent hospital care | Time |
| 99221 | 30 mins | 99231 | 15 mins |
| 99222 | 50 mins | 99232 | 25 mins |
| 99223 | 70 mins | 99233 | 35 mins |

::tool:inpatient-code$g$, 60, now())
) AS v(id, guide, "group", title, body, "sortOrder", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "guide_sections");
