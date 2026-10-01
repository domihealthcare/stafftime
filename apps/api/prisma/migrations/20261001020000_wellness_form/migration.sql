-- The Annual Wellness Visit form (October 2026, Dominguez): Medical Assistants
-- fill in its second page and providers its first. Additive: one column the
-- version live before this never reads. Like the other clinical forms it runs
-- in the browser and stores nothing — no table holds any of it.

-- AlterTable
ALTER TABLE "job_roles" ADD COLUMN     "usesWellnessForm" BOOLEAN NOT NULL DEFAULT false;

UPDATE "job_roles" SET "usesWellnessForm" = true WHERE "name" IN ('Provider', 'Medical Assistant');
