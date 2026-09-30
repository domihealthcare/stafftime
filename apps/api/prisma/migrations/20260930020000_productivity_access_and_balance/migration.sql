-- Provider productivity, second step (30 September 2026, Dominguez): who may
-- work it out is a list the super admin chooses, and a short period is carried
-- forward as a running balance. Additive only.

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "canManageProductivity" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "productivity_plans" ADD COLUMN "carriesBalance" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "productivity_statements" ADD COLUMN "carriesBalance" BOOLEAN NOT NULL DEFAULT false;

-- The two people who have it to begin with: Dominguez and Angelica Dominguez.
-- After this an admin changes the list in the app.
UPDATE "employees" SET "canManageProductivity" = true
WHERE lower("email") = 'dominguez@domihealthcare.com'
   OR (lower("firstName") = 'angelica' AND lower("lastName") = 'dominguez');
