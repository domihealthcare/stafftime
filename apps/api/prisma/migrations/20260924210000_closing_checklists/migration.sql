-- CreateEnum
CREATE TYPE "ClosingItemKind" AS ENUM ('TASK', 'REMINDER', 'COUNT', 'SUPPLY');

-- AlterTable
ALTER TABLE "job_roles" ADD COLUMN     "seesOwnPersonnelTabs" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "closing_sections" (
    "id" UUID NOT NULL,
    "jobRoleId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "isPosition" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closing_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_items" (
    "id" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "kind" "ClosingItemKind" NOT NULL DEFAULT 'TASK',
    "text" TEXT NOT NULL,
    "target" INTEGER,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "locationId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closing_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_records" (
    "id" UUID NOT NULL,
    "timeEntryId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "positions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submitted" BOOLEAN NOT NULL DEFAULT true,
    "gaps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "closing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_answers" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "itemId" UUID,
    "section" TEXT NOT NULL,
    "kind" "ClosingItemKind" NOT NULL,
    "text" TEXT NOT NULL,
    "target" INTEGER,
    "done" BOOLEAN,
    "count" INTEGER,
    "needed" BOOLEAN,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "closing_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_requests" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "itemId" UUID,
    "text" TEXT NOT NULL,
    "firstAskedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAskedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timesAsked" INTEGER NOT NULL DEFAULT 1,
    "lastAskedById" UUID,
    "orderedAt" TIMESTAMP(3),
    "orderedById" UUID,

    CONSTRAINT "supply_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "closing_sections_jobRoleId_sortOrder_idx" ON "closing_sections"("jobRoleId", "sortOrder");

-- CreateIndex
CREATE INDEX "closing_items_sectionId_sortOrder_idx" ON "closing_items"("sectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "closing_records_timeEntryId_key" ON "closing_records"("timeEntryId");

-- CreateIndex
CREATE INDEX "closing_records_day_idx" ON "closing_records"("day");

-- CreateIndex
CREATE INDEX "closing_records_employeeId_day_idx" ON "closing_records"("employeeId", "day");

-- CreateIndex
CREATE INDEX "closing_answers_recordId_idx" ON "closing_answers"("recordId");

-- CreateIndex
CREATE INDEX "supply_requests_locationId_orderedAt_idx" ON "supply_requests"("locationId", "orderedAt");

-- AddForeignKey
ALTER TABLE "closing_sections" ADD CONSTRAINT "closing_sections_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_items" ADD CONSTRAINT "closing_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "closing_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_items" ADD CONSTRAINT "closing_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_records" ADD CONSTRAINT "closing_records_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_records" ADD CONSTRAINT "closing_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_records" ADD CONSTRAINT "closing_records_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_answers" ADD CONSTRAINT "closing_answers_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "closing_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_requests" ADD CONSTRAINT "supply_requests_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The starting closing checklists (src/closing/default-checklists.ts), written
-- once into an existing database. A role that has been renamed or removed
-- simply gets none; managers add their own on the Closing checklists screen.
WITH s_FrontDesk_0 AS (
  INSERT INTO "closing_sections" ("id", "jobRoleId", "title", "isPosition", "sortOrder", "updatedAt")
  SELECT gen_random_uuid(), "id", 'Check In Desk', true, 0, CURRENT_TIMESTAMP
  FROM "job_roles" WHERE "name" = 'Front Desk'
  RETURNING "id"
)
INSERT INTO "closing_items" ("id", "sectionId", "kind", "text", "target", "weekdays", "locationId", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), s_FrontDesk_0."id", v.kind::"ClosingItemKind", v.text, v.target, v.weekdays, (SELECT "id" FROM "locations" WHERE "slug" = v.slug), v.sort, CURRENT_TIMESTAMP
FROM s_FrontDesk_0, (VALUES
  ('TASK', 'Checked each patient in: insurance active, copay collected correctly, PCP is JD/CI/JB — noted under insurance notes (e.g. “Active via ECW +PCP(DOM) 04/01/26 KB”)', NULL::int, ARRAY[]::int[], NULL::text, 0),
  ('TASK', 'Scanned for every patient: photo ID, insurance card (front & back), new patient forms', NULL::int, ARRAY[]::int[], NULL::text, 10),
  ('TASK', '“Homework” done: Needs Appt / Inform/Normal / Action Needed', NULL::int, ARRAY[]::int[], NULL::text, 20),
  ('TASK', 'Patient waitlist reviewed and cleaned up', NULL::int, ARRAY[]::int[], NULL::text, 30),
  ('TASK', 'Copayments organized for submission', NULL::int, ARRAY[]::int[], NULL::text, 40),
  ('TASK', 'Next-day insurances confirmed for NB / WNY providers: name in its acronym version, active, copay, under the correct PCP', NULL::int, ARRAY[]::int[], NULL::text, 50)
) AS v(kind, text, target, weekdays, slug, sort);

WITH s_FrontDesk_1 AS (
  INSERT INTO "closing_sections" ("id", "jobRoleId", "title", "isPosition", "sortOrder", "updatedAt")
  SELECT gen_random_uuid(), "id", 'Outdesk', true, 10, CURRENT_TIMESTAMP
  FROM "job_roles" WHERE "name" = 'Front Desk'
  RETURNING "id"
)
INSERT INTO "closing_items" ("id", "sectionId", "kind", "text", "target", "weekdays", "locationId", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), s_FrontDesk_1."id", v.kind::"ClosingItemKind", v.text, v.target, v.weekdays, (SELECT "id" FROM "locations" WHERE "slug" = v.slug), v.sort, CURRENT_TIMESTAMP
FROM s_FrontDesk_1, (VALUES
  ('TASK', 'All voicemails and texts from the previous day returned (checked morning and before close)', NULL::int, ARRAY[]::int[], NULL::text, 0),
  ('TASK', 'Referral information provided — ECW Referral section read', NULL::int, ARRAY[]::int[], NULL::text, 10),
  ('TASK', 'Follow-up appointments scheduled per the provider’s instructions', NULL::int, ARRAY[]::int[], NULL::text, 20),
  ('TASK', 'Tomorrow’s representative lunch confirmed — rep messaged with the time, place and provider they will see', NULL::int, ARRAY[]::int[], NULL::text, 30),
  ('TASK', '“Homework” done: Needs Appt / Inform/Normal / Action Needed', NULL::int, ARRAY[]::int[], NULL::text, 40)
) AS v(kind, text, target, weekdays, slug, sort);

WITH s_FrontDesk_2 AS (
  INSERT INTO "closing_sections" ("id", "jobRoleId", "title", "isPosition", "sortOrder", "updatedAt")
  SELECT gen_random_uuid(), "id", 'Everyone', false, 20, CURRENT_TIMESTAMP
  FROM "job_roles" WHERE "name" = 'Front Desk'
  RETURNING "id"
)
INSERT INTO "closing_items" ("id", "sectionId", "kind", "text", "target", "weekdays", "locationId", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), s_FrontDesk_2."id", v.kind::"ClosingItemKind", v.text, v.target, v.weekdays, (SELECT "id" FROM "locations" WHERE "slug" = v.slug), v.sort, CURRENT_TIMESTAMP
FROM s_FrontDesk_2, (VALUES
  ('REMINDER', 'Answer incoming calls. Never leave a patient on hold longer than 1 minute. With a patient in front of you, do not answer — silence the call if needed, but do NOT lower the call volume.', NULL::int, ARRAY[]::int[], NULL::text, 0),
  ('TASK', 'TVs and scanners powered off', NULL::int, ARRAY[]::int[], NULL::text, 10),
  ('TASK', 'Enough forms available (e.g. new patient forms, flu consent forms)', NULL::int, ARRAY[]::int[], NULL::text, 20),
  ('TASK', 'Any office supplies needed reported to a Manager/Lead (e.g. computer paper, snacks, sticky notes)', NULL::int, ARRAY[]::int[], NULL::text, 30),
  ('COUNT', 'Calls answered', 20, ARRAY[]::int[], NULL::text, 40),
  ('COUNT', 'Calls placed', NULL::int, ARRAY[]::int[], NULL::text, 50)
) AS v(kind, text, target, weekdays, slug, sort);

WITH s_MedicalAssistant_0 AS (
  INSERT INTO "closing_sections" ("id", "jobRoleId", "title", "isPosition", "sortOrder", "updatedAt")
  SELECT gen_random_uuid(), "id", 'Check In', false, 0, CURRENT_TIMESTAMP
  FROM "job_roles" WHERE "name" = 'Medical Assistant'
  RETURNING "id"
)
INSERT INTO "closing_items" ("id", "sectionId", "kind", "text", "target", "weekdays", "locationId", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), s_MedicalAssistant_0."id", v.kind::"ClosingItemKind", v.text, v.target, v.weekdays, (SELECT "id" FROM "locations" WHERE "slug" = v.slug), v.sort, CURRENT_TIMESTAMP
FROM s_MedicalAssistant_0, (VALUES
  ('REMINDER', 'Follow the procedures of the office you are working at.', NULL::int, ARRAY[]::int[], NULL::text, 0),
  ('TASK', 'All next-day appointments confirmed', NULL::int, ARRAY[]::int[], NULL::text, 10),
  ('TASK', 'All test results taken from the “Pending Appts” folder for the date of service', NULL::int, ARRAY[]::int[], NULL::text, 20),
  ('TASK', 'Pre-charted: last imaging/lab orders checked, results located through the portals', NULL::int, ARRAY[]::int[], NULL::text, 30)
) AS v(kind, text, target, weekdays, slug, sort);

WITH s_MedicalAssistant_1 AS (
  INSERT INTO "closing_sections" ("id", "jobRoleId", "title", "isPosition", "sortOrder", "updatedAt")
  SELECT gen_random_uuid(), "id", 'During shift', false, 10, CURRENT_TIMESTAMP
  FROM "job_roles" WHERE "name" = 'Medical Assistant'
  RETURNING "id"
)
INSERT INTO "closing_items" ("id", "sectionId", "kind", "text", "target", "weekdays", "locationId", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), s_MedicalAssistant_1."id", v.kind::"ClosingItemKind", v.text, v.target, v.weekdays, (SELECT "id" FROM "locations" WHERE "slug" = v.slug), v.sort, CURRENT_TIMESTAMP
FROM s_MedicalAssistant_1, (VALUES
  ('REMINDER', 'If vitals are out of the normal range, notify the doctor immediately.', NULL::int, ARRAY[]::int[], NULL::text, 0),
  ('REMINDER', 'Glucose check for diabetic patients only.', NULL::int, ARRAY[]::int[], NULL::text, 10),
  ('REMINDER', 'Sanitize before and after using an examination room or equipment.', NULL::int, ARRAY[]::int[], NULL::text, 20),
  ('TASK', 'Every nursing visit’s superbill completed and given to the doctor once the note was done', NULL::int, ARRAY[]::int[], NULL::text, 30),
  ('TASK', 'Pharmacy added/confirmed for all patients', NULL::int, ARRAY[]::int[], NULL::text, 40),
  ('TASK', 'ABI / PFT / EKG / rapid test / urine dipstick printouts uploaded to the chart', NULL::int, ARRAY[]::int[], NULL::text, 50)
) AS v(kind, text, target, weekdays, slug, sort);

WITH s_MedicalAssistant_2 AS (
  INSERT INTO "closing_sections" ("id", "jobRoleId", "title", "isPosition", "sortOrder", "updatedAt")
  SELECT gen_random_uuid(), "id", 'Before checking out', false, 20, CURRENT_TIMESTAMP
  FROM "job_roles" WHERE "name" = 'Medical Assistant'
  RETURNING "id"
)
INSERT INTO "closing_items" ("id", "sectionId", "kind", "text", "target", "weekdays", "locationId", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), s_MedicalAssistant_2."id", v.kind::"ClosingItemKind", v.text, v.target, v.weekdays, (SELECT "id" FROM "locations" WHERE "slug" = v.slug), v.sort, CURRENT_TIMESTAMP
FROM s_MedicalAssistant_2, (VALUES
  ('TASK', 'Otoscope tips, band-aids, referral pads, etc. refilled in each examination room', NULL::int, ARRAY[]::int[], NULL::text, 0),
  ('TASK', 'Trash taken out', NULL::int, ARRAY[2,4]::int[], 'north-bergen', 10),
  ('TASK', 'Forms reprinted: New Patient Forms, HIPAA, PHQ9, AWV, Advance Directive', NULL::int, ARRAY[]::int[], NULL::text, 20),
  ('TASK', 'EKG left plugged in', NULL::int, ARRAY[]::int[], NULL::text, 30),
  ('TASK', 'Thermometer on ECO mode', NULL::int, ARRAY[]::int[], 'north-bergen', 40)
) AS v(kind, text, target, weekdays, slug, sort);

WITH s_MedicalAssistant_3 AS (
  INSERT INTO "closing_sections" ("id", "jobRoleId", "title", "isPosition", "sortOrder", "updatedAt")
  SELECT gen_random_uuid(), "id", 'Inventory — tick anything we need more of', false, 30, CURRENT_TIMESTAMP
  FROM "job_roles" WHERE "name" = 'Medical Assistant'
  RETURNING "id"
)
INSERT INTO "closing_items" ("id", "sectionId", "kind", "text", "target", "weekdays", "locationId", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), s_MedicalAssistant_3."id", v.kind::"ClosingItemKind", v.text, v.target, v.weekdays, (SELECT "id" FROM "locations" WHERE "slug" = v.slug), v.sort, CURRENT_TIMESTAMP
FROM s_MedicalAssistant_3, (VALUES
  ('SUPPLY', 'Albuterol', NULL::int, ARRAY[]::int[], NULL::text, 0),
  ('SUPPLY', 'Pregnancy Test', NULL::int, ARRAY[]::int[], NULL::text, 10),
  ('SUPPLY', 'Alcohol Prep Pad', NULL::int, ARRAY[]::int[], NULL::text, 20),
  ('SUPPLY', 'Large Paper Tape', NULL::int, ARRAY[]::int[], NULL::text, 30),
  ('SUPPLY', 'Alcohol Isopropyl 70% Solution', NULL::int, ARRAY[]::int[], NULL::text, 40),
  ('SUPPLY', 'Peroxide', NULL::int, ARRAY[]::int[], NULL::text, 50),
  ('SUPPLY', 'Blood Glucose Test Strip 50/Bx', NULL::int, ARRAY[]::int[], NULL::text, 60),
  ('SUPPLY', 'Rapid Flu Kit', NULL::int, ARRAY[]::int[], NULL::text, 70),
  ('SUPPLY', 'BD Veritor Sars-CoV-2 Test Kit', NULL::int, ARRAY[]::int[], NULL::text, 80),
  ('SUPPLY', 'Speculum Vaginal S/M/L', NULL::int, ARRAY[]::int[], NULL::text, 90),
  ('SUPPLY', 'Bandage Strips Plastic 1x3"', NULL::int, ARRAY[]::int[], NULL::text, 100),
  ('SUPPLY', 'Safety Lancets 21 gauge', NULL::int, ARRAY[]::int[], NULL::text, 110),
  ('SUPPLY', 'B-12 Injection', NULL::int, ARRAY[]::int[], NULL::text, 120),
  ('SUPPLY', 'Sani Cloth Disposable Wipe', NULL::int, ARRAY[]::int[], NULL::text, 130),
  ('SUPPLY', 'Blue Chucks', NULL::int, ARRAY[]::int[], NULL::text, 140),
  ('SUPPLY', 'Tongue Depressor Wood', NULL::int, ARRAY[]::int[], NULL::text, 150),
  ('SUPPLY', 'Bacitracin Zinc', NULL::int, ARRAY[]::int[], NULL::text, 160),
  ('SUPPLY', 'Towelettes', NULL::int, ARRAY[]::int[], NULL::text, 170),
  ('SUPPLY', 'Cytobrush', NULL::int, ARRAY[]::int[], NULL::text, 180),
  ('SUPPLY', 'Table Paper 21 in', NULL::int, ARRAY[]::int[], NULL::text, 190),
  ('SUPPLY', 'Drape Sheet 72 in White', NULL::int, ARRAY[]::int[], NULL::text, 200),
  ('SUPPLY', 'ThinPrep', NULL::int, ARRAY[]::int[], NULL::text, 210),
  ('SUPPLY', 'Electrode Resting Tab', NULL::int, ARRAY[]::int[], NULL::text, 220),
  ('SUPPLY', 'Urinalysis Test Strip 11 Way', NULL::int, ARRAY[]::int[], NULL::text, 230),
  ('SUPPLY', 'Gown Mauve/Pink 50/Ca', NULL::int, ARRAY[]::int[], NULL::text, 240),
  ('SUPPLY', 'Wallach Papette', NULL::int, ARRAY[]::int[], NULL::text, 250),
  ('SUPPLY', 'Gloves S/M/L', NULL::int, ARRAY[]::int[], NULL::text, 260),
  ('SUPPLY', '25G x 1" Hypodermic Needle', NULL::int, ARRAY[]::int[], NULL::text, 270),
  ('SUPPLY', 'Hologic Aptima', NULL::int, ARRAY[]::int[], NULL::text, 280),
  ('SUPPLY', '4.2 Single Use Specula', NULL::int, ARRAY[]::int[], NULL::text, 290),
  ('SUPPLY', 'Ketorolac 30mg', NULL::int, ARRAY[]::int[], NULL::text, 300),
  ('SUPPLY', '6" Cotton Tip Applicator', NULL::int, ARRAY[]::int[], NULL::text, 310),
  ('SUPPLY', 'Kenalog-40 Injection', NULL::int, ARRAY[]::int[], NULL::text, 320),
  ('SUPPLY', '3mL 25G x 1" Syringe', NULL::int, ARRAY[]::int[], NULL::text, 330),
  ('SUPPLY', 'Lubricating Jelly', NULL::int, ARRAY[]::int[], NULL::text, 340),
  ('SUPPLY', 'PPD Tuberculin Injection', NULL::int, ARRAY[]::int[], NULL::text, 350),
  ('SUPPLY', 'Lidocaine', NULL::int, ARRAY[]::int[], NULL::text, 360),
  ('SUPPLY', 'Electrodes', NULL::int, ARRAY[]::int[], NULL::text, 370)
) AS v(kind, text, target, weekdays, slug, sort);

UPDATE "job_roles" SET "seesOwnPersonnelTabs" = true WHERE "name" = 'Provider';
