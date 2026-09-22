-- Stop holding personnel documents.
--
-- This is a timekeeping app, not a payroll or HR system. ADP TotalSource keeps
-- the personnel file; duplicating it here meant holding social security numbers
-- (Form I-9), licence numbers and scans of identity documents for no
-- operational benefit — and being a target for them.
--
-- Checklists keep their tasks: "I-9 completed and verified" is still a useful
-- thing to tick off, it just stops being somewhere the form itself is filed.
-- Credentials keep their expiry dates, so renewals can still be chased.

-- The bytes first, while the rows that point at them still exist. Dropping the
-- tables first would leave the documents sitting in stored_files with nothing
-- referencing them and no way to tell which they were.
DELETE FROM "stored_files"
WHERE "storageKey" IN (SELECT "storageKey" FROM "checklist_documents");

DELETE FROM "stored_files"
WHERE "storageKey" IN (
  SELECT "storageKey" FROM "employee_credentials" WHERE "storageKey" IS NOT NULL
);

-- DropForeignKey
ALTER TABLE "checklist_documents" DROP CONSTRAINT "checklist_documents_taskId_fkey";

-- DropForeignKey
ALTER TABLE "checklist_documents" DROP CONSTRAINT "checklist_documents_uploadedById_fkey";

-- DropIndex
DROP INDEX "employee_credentials_storageKey_key";

-- AlterTable
ALTER TABLE "checklist_template_tasks" DROP COLUMN "requiresDocument";

-- AlterTable
ALTER TABLE "employee_checklist_tasks" DROP COLUMN "requiresDocument";

-- AlterTable
ALTER TABLE "employee_credentials" DROP COLUMN "checksum",
DROP COLUMN "contentType",
DROP COLUMN "filename",
DROP COLUMN "reference",
DROP COLUMN "sizeBytes",
DROP COLUMN "storageKey";

-- DropTable
DROP TABLE "checklist_documents";
