-- Clinical forms (September 2026, Dominguez): the 99483 cognitive assessment.
-- Additive: two columns the version live before this never reads. The form
-- itself runs in the browser and stores nothing — no table holds any of it.

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "postNominals" TEXT;

-- AlterTable
ALTER TABLE "job_roles" ADD COLUMN     "usesClinicalForms" BOOLEAN NOT NULL DEFAULT false;

UPDATE "job_roles" SET "usesClinicalForms" = true WHERE "name" = 'Provider';
