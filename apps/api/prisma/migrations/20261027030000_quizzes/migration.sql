-- Quizzes (October 2026, Dominguez: "i want to send all staff a 'quiz' to
-- make sure they are uptodate on these procedures"): a quiz, its questions and
-- each go at it, by name. Sent through Required reading, which a pass confirms.

-- AlterTable
ALTER TABLE "requirements" ADD COLUMN     "quizId" UUID;

-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT,
    "passPercent" INTEGER NOT NULL DEFAULT 80,
    "studyHref" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "choices" TEXT[],
    "correct" INTEGER NOT NULL,
    "explanation" TEXT,
    "jobRoleIds" UUID[],
    "forManagers" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "correct" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "missedIds" UUID[],
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quiz_questions_quizId_sortOrder_idx" ON "quiz_questions"("quizId", "sortOrder");

-- CreateIndex
CREATE INDEX "quiz_attempts_quizId_employeeId_idx" ON "quiz_attempts"("quizId", "employeeId");

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One right answer among two to six; a pass mark between 1 and 100.
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_choices_check"
  CHECK (cardinality("choices") BETWEEN 2 AND 6 AND "correct" >= 0 AND "correct" < cardinality("choices"));
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_pass_percent_check"
  CHECK ("passPercent" BETWEEN 1 AND 100);
-- A quiz requirement names its quiz; nothing else does.
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_quiz_check"
  CHECK (("kind" = 'QUIZ') = ("quizId" IS NOT NULL));

-- The first quiz: the downtime procedures, as written on 26 October 2026.
-- Not sent to anybody: a manager sends it from Required reading. Questions
-- for one job are only loaded where that job role exists, and are asked only
-- of the people holding it; the managers' ones go by access level.
INSERT INTO "quizzes" ("id", "title", "intro", "passPercent", "studyHref", "updatedAt")
VALUES (gen_random_uuid(), 'Downtime procedures',
  $q$What to do when eCW, the phones or the internet are down. Read "What to do" on the Downtime page first. You need 80% to pass, and you can take it again as often as you like.$q$,
  80, '/downtime?tab=procedures', now());

INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$eCW stops working while you are seeing patients. What do you do first?$q$,
  ARRAY[$q$Tell a manager straight away$q$, $q$Call eCW support yourself$q$, $q$Send the patients in the waiting room home$q$, $q$Wait half an hour to see if it comes back$q$]::text[],
  0, $q$A manager starts the downtime in Domi Staff, which tells everybody on shift, and calls support.$q$, ARRAY[]::uuid[], false, 10
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$During a downtime, where can you write a patient's name or details?$q$,
  ARRAY[$q$On paper only, kept in the downtime folder$q$, $q$In a note on your phone, deleted afterwards$q$, $q$In Domi Staff, so it is not lost$q$, $q$In a WhatsApp message to the provider$q$]::text[],
  0, $q$Nothing about a patient goes into Domi Staff or on your phone. Paper only, in the downtime folder.$q$, ARRAY[]::uuid[], false, 20
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$eCW is down. How do you clock in?$q$,
  ARRAY[$q$As usual, in Domi Staff on your phone$q$, $q$You can't: write your hours on paper$q$, $q$Ask a manager to add your hours later$q$, $q$Wait until eCW is back$q$]::text[],
  0, $q$Domi Staff is separate from eCW and works on your phone's data, so clock in as usual.$q$, ARRAY[]::uuid[], false, 30
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$The internet is down at one office, but the lights are on. What happens with patients?$q$,
  ARRAY[$q$Keep seeing them, on paper$q$, $q$Send everybody home$q$, $q$Move every patient to the other office$q$, $q$Stop until the internet is back$q$]::text[],
  0, $q$If it is only the internet, keep seeing patients on paper. The other office may be working normally.$q$, ARRAY[]::uuid[], false, 40
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$The power is out at one office. What happens?$q$,
  ARRAY[$q$A manager decides: patients go to the other office if it can take them, or they are rescheduled$q$, $q$Keep seeing patients as best you can$q$, $q$Each of us decides for our own patients$q$, $q$The front desk reschedules everybody for tomorrow$q$]::text[],
  0, $q$With the lights out a manager makes the call: the other office if it can take them, otherwise reschedule.$q$, ARRAY[]::uuid[], false, 50
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$The phones are down and you need to make an urgent call to a pharmacy, lab or hospital. How?$q$,
  ARRAY[$q$Doximity on your phone, which shows the office number$q$, $q$From your own phone number$q$, $q$With the Weave app on your phone$q$, $q$Wait until the phones are back$q$]::text[],
  0, $q$Use Doximity: it shows the office number, not yours. The Weave app is usually down when Weave is.$q$, ARRAY[]::uuid[], false, 60
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$Where are the blank downtime forms?$q$,
  ARRAY[$q$In the downtime stack at the front desk, and printable from Domi Staff, Downtime, Forms$q$, $q$On Google Drive$q$, $q$Inside eCW$q$, $q$Only a manager has them$q$]::text[],
  0, $q$The stack at each front desk, and every form prints from the Forms tab of Downtime. Nothing is on Drive.$q$, ARRAY[]::uuid[], false, 70
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$During an eCW downtime, what happens to everything a patient leaves with (prescriptions, lab and referral slips, handouts)?$q$,
  ARRAY[$q$It is photocopied first, so it can be scanned into eCW later$q$, $q$It is handed over, and nothing is kept$q$, $q$A photo of it is taken on a phone$q$, $q$The patient is asked to bring it back$q$]::text[],
  0, $q$Keep a copy of everything the patient leaves with, so it goes into eCW Documents once it is back.$q$, ARRAY[]::uuid[], false, 80
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$A patient arrives while eCW is down. What do you start?$q$,
  ARRAY[$q$Sign them in on the sign-in sheet with the time, and start a running patient sheet and a progress note for the MA$q$, $q$Write their name on a sticky note for the MA$q$, $q$Ask them to come back once eCW is working$q$, $q$Nothing until eCW is back$q$]::text[],
  0, $q$The sign-in sheet with the time, then the running patient sheet and progress note, clipped together and handed to the MA.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE name ILIKE 'Front Desk%'), ARRAY[]::uuid[]), false, 90
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE name ILIKE 'Front Desk%');
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$eCW is down but Weave is working. A patient wants to pay their copay by card.$q$,
  ARRAY[$q$Take it as usual and write the amount on the sign-in sheet$q$, $q$Mark it Owed and collect it later$q$, $q$Do not collect copays during a downtime$q$, $q$Write the card number down to charge later$q$]::text[],
  0, $q$Card, cash or check as usual: Weave runs the card machine. Write the amount on the sign-in sheet.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE name ILIKE 'Front Desk%'), ARRAY[]::uuid[]), false, 100
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE name ILIKE 'Front Desk%');
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$Weave is down, so the card machine is too. The patient can only pay by card.$q$,
  ARRAY[$q$Tick Owed with the amount and collect it once Weave is back$q$, $q$Write their card number down and charge it later$q$, $q$Turn the patient away$q$, $q$Skip the copay altogether$q$]::text[],
  0, $q$Mark it Owed with the amount on the sign-in sheet. Never write a card number down.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE name ILIKE 'Front Desk%'), ARRAY[]::uuid[]), false, 110
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE name ILIKE 'Front Desk%');
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$A patient needs a follow-up appointment while eCW is down.$q$,
  ARRAY[$q$Write it on the Checkout list: when, and what for$q$, $q$Tell them to call back next week$q$, $q$Book it from memory once eCW is back$q$, $q$Write it on the back of their receipt$q$]::text[],
  0, $q$The Checkout list. Each one is booked once eCW is back, and the patient is told the date.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE name ILIKE 'Front Desk%'), ARRAY[]::uuid[]), false, 120
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE name ILIKE 'Front Desk%');
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$A patient calls for a refill while eCW is down.$q$,
  ARRAY[$q$Write it on the Call-back list$q$, $q$Tell them to call back tomorrow$q$, $q$Ask the provider to call the pharmacy now$q$, $q$Write it on the sign-in sheet$q$]::text[],
  0, $q$Appointment requests, refills and messages go on the Call-back list, worked through once it is back.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE name ILIKE 'Front Desk%'), ARRAY[]::uuid[]), false, 130
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE name ILIKE 'Front Desk%');
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$You need to draw labs while eCW is down.$q$,
  ARRAY[$q$Only from a lab order slip the provider signed: label each tube by hand and photocopy the slip$q$, $q$Draw what the patient usually has$q$, $q$Wait until eCW is back to print labels$q$, $q$Text the provider to ask what to draw$q$]::text[],
  0, $q$A signed lab order slip from the downtime pad, tubes labelled by hand with name, DOB and date, and a copy of the slip kept.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE name ILIKE 'Medical Assistant%'), ARRAY[]::uuid[]), false, 140
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE name ILIKE 'Medical Assistant%');
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$Where do vitals and allergies go during an eCW downtime?$q$,
  ARRAY[$q$At the bottom of page 1 of the downtime progress note$q$, $q$On the running patient sheet$q$, $q$In Domi Staff$q$, $q$On the sign-in sheet$q$]::text[],
  0, $q$Vitals and allergies go at the bottom of page 1 of the progress note.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE name ILIKE 'Medical Assistant%'), ARRAY[]::uuid[]), false, 150
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE name ILIKE 'Medical Assistant%');
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$Domi Staff cannot be reached either, and a patient is in for an Annual Wellness Visit.$q$,
  ARRAY[$q$Use the paper AWV page 2 from the downtime stack, and enter it in Domi Staff once it is back$q$, $q$Skip page 2 this time$q$, $q$Write the answers on the running sheet$q$, $q$Reschedule the visit$q$]::text[],
  0, $q$The paper AWV (page 2, preventive services) is in the stack. Enter it in Domi Staff once it is back, then scan the paper.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE name ILIKE 'Medical Assistant%'), ARRAY[]::uuid[]), false, 160
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE name ILIKE 'Medical Assistant%');
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$How do you write prescriptions while eCW is down?$q$,
  ARRAY[$q$On the paper prescription pads (NJ blanks for controlled substances), and in the plan on the progress note$q$, $q$Call them in to the pharmacy from memory$q$, $q$Wait until eCW is back$q$, $q$Text them to the pharmacy$q$]::text[],
  0, $q$Paper prescription pads, NJ blanks for controlled substances, and each one written in the plan too.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE "usesClinicalForms" = true), ARRAY[]::uuid[]), false, 170
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE "usesClinicalForms" = true);
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$How do you order labs, referrals and imaging while eCW is down?$q$,
  ARRAY[$q$On the downtime pads: sign each slip and tick your name under the signature$q$, $q$On a blank sheet of paper$q$, $q$Ask the front desk to remember them$q$, $q$Enter them once eCW is back$q$]::text[],
  0, $q$The downtime pads carry all five providers with their NPIs. Sign, and tick your name under the signature.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE "usesClinicalForms" = true), ARRAY[]::uuid[]), false, 180
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE "usesClinicalForms" = true);
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$eCW is back. What do you do with the prescriptions you wrote on paper?$q$,
  ARRAY[$q$Enter them in eCW as already given, and do not send them again$q$, $q$Send each one to the pharmacy so it is on file$q$, $q$Nothing, the paper copy is enough$q$, $q$Ask the patient whether they filled it$q$]::text[],
  0, $q$Enter them as already given. Sending them again would fill them twice.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE "usesClinicalForms" = true), ARRAY[]::uuid[]), false, 190
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE "usesClinicalForms" = true);
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$You have a telemedicine visit during an eCW downtime.$q$,
  ARRAY[$q$Use doxy.me; if it is not working, call the patient with Doximity$q$, $q$Cancel the visit$q$, $q$Call from your own phone number$q$, $q$Wait until eCW is back$q$]::text[],
  0, $q$doxy.me does not need eCW. If it is not working either, call with Doximity.$q$, COALESCE((SELECT array_agg(id) FROM job_roles WHERE "usesClinicalForms" = true), ARRAY[]::uuid[]), false, 200
FROM "quizzes" q WHERE q.title = 'Downtime procedures'
  AND EXISTS (SELECT 1 FROM job_roles WHERE "usesClinicalForms" = true);
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$What are the first steps when you start a downtime?$q$,
  ARRAY[$q$Start it in Domi Staff with what is down and which office, then contact support and tick each one$q$, $q$Email every member of staff$q$, $q$Call support, and start it in Domi Staff once they reply$q$, $q$Post it in the WhatsApp group$q$]::text[],
  0, $q$Starting it in Domi Staff tells everybody on shift. Then contact support and tick each contact so it is in the log.$q$, ARRAY[]::uuid[], true, 210
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$eCW is down. Which offices do you start the downtime for?$q$,
  ARRAY[$q$Usually both: eCW is the same for both offices$q$, $q$Only the office you are at$q$, $q$Only the office that called it in$q$, $q$Neither, eCW is not ours$q$]::text[],
  0, $q$eCW is the same for both offices, so an eCW downtime is usually both, which also tells people working from home.$q$, ARRAY[]::uuid[], true, 220
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$A downtime lasted 3 hours. When should the catch-up be done?$q$,
  ARRAY[$q$The same day$q$, $q$By the end of the next working day$q$, $q$Within the week$q$, $q$Whenever there is time$q$]::text[],
  0, $q$Under 4 hours, the same day. Up to a day, by the end of the next working day. Longer, a plan written when you close it.$q$, ARRAY[]::uuid[], true, 230
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
INSERT INTO "quiz_questions" ("id", "quizId", "prompt", "choices", "correct", "explanation", "jobRoleIds", "forManagers", "sortOrder")
SELECT gen_random_uuid(), q.id,
  $q$How long is the downtime paper kept once it has been scanned?$q$,
  ARRAY[$q$2 weeks, then shredded and marked shredded in the log$q$, $q$A year$q$, $q$It is shredded straight away$q$, $q$It is kept for good$q$]::text[],
  0, $q$Keep it 2 weeks, then shred it. Domi Staff reminds you, and you mark it shredded.$q$, ARRAY[]::uuid[], true, 240
FROM "quizzes" q WHERE q.title = 'Downtime procedures';
