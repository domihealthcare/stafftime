-- Raises from the ask to the decision, and why somebody left (October 2026,
-- Dominguez: "stop having to use this excel workflow"). Read only by the
-- rota-cost people, behind their PIN.

-- CreateEnum
CREATE TYPE "PayRaiseStatus" AS ENUM ('REQUESTED', 'MEETING_SET', 'OFFERED', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LeavingKind" AS ENUM ('RESIGNED', 'LET_GO', 'LAID_OFF', 'RETIRED', 'END_OF_CONTRACT', 'OTHER');

-- CreateTable
CREATE TABLE "pay_raises" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "status" "PayRaiseStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedOn" DATE NOT NULL,
    "askedRate" DECIMAL(10,2),
    "askedUnit" "PayRateUnit",
    "meetingEventId" UUID,
    "meetingAt" TIMESTAMP(3),
    "decidedOn" DATE,
    "newRate" DECIMAL(10,2),
    "newUnit" "PayRateUnit",
    "newPosition" TEXT,
    "effectiveOn" DATE,
    "payChangeId" UUID,
    "note" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_raises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaving_records" (
    "employeeId" UUID NOT NULL,
    "kind" "LeavingKind",
    "reason" TEXT,
    "lastPaycheckOn" DATE,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaving_records_pkey" PRIMARY KEY ("employeeId")
);

-- CreateIndex
CREATE INDEX "pay_raises_employeeId_requestedOn_idx" ON "pay_raises"("employeeId", "requestedOn");

-- CreateIndex
CREATE INDEX "pay_raises_status_idx" ON "pay_raises"("status");

-- AddForeignKey
ALTER TABLE "pay_raises" ADD CONSTRAINT "pay_raises_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_raises" ADD CONSTRAINT "pay_raises_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaving_records" ADD CONSTRAINT "leaving_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaving_records" ADD CONSTRAINT "leaving_records_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Never negative, and a rate always with its unit.
ALTER TABLE "pay_raises" ADD CONSTRAINT "pay_raises_asked_rate_check"
  CHECK (("askedRate" IS NULL) = ("askedUnit" IS NULL) AND ("askedRate" IS NULL OR "askedRate" >= 0));
ALTER TABLE "pay_raises" ADD CONSTRAINT "pay_raises_new_rate_check"
  CHECK (("newRate" IS NULL) = ("newUnit" IS NULL) AND ("newRate" IS NULL OR "newRate" >= 0));

-- The exit checklist (October 2026, Dominguez: "an exit employee checklist for
-- terminated employees (i.e. keys, emr access, staff portal access, whatsapp,
-- etc.)"). The default offboarding template already starts by itself when
-- somebody is marked as left; this adds to it each exit step it does not
-- already have (matched loosely by a word in its title), after its own tasks,
-- so nothing a manager wrote is changed. With no default template, one is made.
DO $$
DECLARE
  template_id uuid;
  next_position int;
  step record;
BEGIN
  SELECT "id" INTO template_id
    FROM "checklist_templates"
   WHERE "kind" = 'OFFBOARDING' AND "isDefault" AND "archivedAt" IS NULL
   ORDER BY "createdAt"
   LIMIT 1;

  IF template_id IS NULL THEN
    template_id := gen_random_uuid();
    INSERT INTO "checklist_templates" ("id", "kind", "name", "description", "isDefault", "createdAt", "updatedAt")
    VALUES (template_id, 'OFFBOARDING', 'Exit checklist - Domi Healthcare',
            'Keys back and every system the person had access to closed. Starts by itself when somebody is marked as left.',
            true, now(), now());
  END IF;

  SELECT COALESCE(MAX("position"), 0) INTO next_position
    FROM "checklist_template_tasks" WHERE "templateId" = template_id;

  FOR step IN
    SELECT * FROM (VALUES
      (1, '%key%', 'Office keys returned, and door and alarm codes changed', NULL, 'MANAGER'),
      (2, '%emr%', 'EMR (eCW) access removed', NULL, 'ADMIN'),
      (3, '%domi staff%', 'Domi Staff access ended',
         'Marking them as left on the Staff screen signs them out everywhere and stops them clocking in.', 'ADMIN'),
      (4, '%whatsapp%', 'Removed from the practice WhatsApp groups', NULL, 'MANAGER'),
      (5, '%email%', 'Work email disabled and mail forwarded', NULL, 'ADMIN'),
      (6, '%extension%', 'Phone extension or softphone taken back, and the Directory''s extensions updated', NULL, 'ADMIN'),
      (7, '%drive%', 'Google Drive and shared folders access removed', NULL, 'ADMIN'),
      (8, '%braincheck%', 'BrainCheck, lab and other outside portal accounts closed', NULL, 'ADMIN'),
      (9, '%password%', 'Shared passwords they knew changed (Wi-Fi, the iPad, shared logins)', NULL, 'ADMIN'),
      (10, '%equipment%', 'Laptop, phone and any other equipment returned', NULL, 'MANAGER')
    ) AS t(n, word, title, description, owner)
    ORDER BY n
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM "checklist_template_tasks"
       WHERE "templateId" = template_id AND "title" ILIKE step.word
    ) THEN
      next_position := next_position + 1;
      INSERT INTO "checklist_template_tasks"
        ("id", "templateId", "position", "title", "description", "owner", "dueOffsetDays", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), template_id, next_position, step.title, step.description,
              step.owner::"TaskOwner", 0, now(), now());
    END IF;
  END LOOP;
END $$;
