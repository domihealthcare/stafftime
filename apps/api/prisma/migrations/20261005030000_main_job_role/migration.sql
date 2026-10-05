-- Each person's main job role (October 2026, Dominguez).
ALTER TABLE "employee_job_roles" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- At most one main role per person. Prisma cannot declare a partial unique
-- index, so it lives here; the service keeps "at least one" by handing the
-- flag on, never clearing it.
CREATE UNIQUE INDEX "employee_job_roles_one_primary" ON "employee_job_roles"("employeeId") WHERE "isPrimary";

-- Everybody starts on the role they were already listed under: their first in
-- the practice's order of job roles.
UPDATE "employee_job_roles" AS m
SET "isPrimary" = true
FROM (
  SELECT DISTINCT ON (ejr."employeeId") ejr."employeeId", ejr."jobRoleId"
  FROM "employee_job_roles" ejr
  JOIN "job_roles" jr ON jr."id" = ejr."jobRoleId"
  ORDER BY ejr."employeeId", jr."sortOrder", jr."name"
) AS first
WHERE m."employeeId" = first."employeeId" AND m."jobRoleId" = first."jobRoleId";

-- Telling somebody that an admin put up their profile photo (October 2026,
-- Dominguez: "i should be able to upload pictures for staff avatars").
ALTER TYPE "NotificationKind" ADD VALUE 'PROFILE_PHOTO';
