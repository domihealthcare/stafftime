-- Staff who do not clock in (October 2026, Dominguez: "an option for some
-- employees that do not have to clock in (i.e. the providers at the moment)
-- though it still should show where they are for that shift in the
-- directory"). Everybody clocks in, except the providers as of today —
-- anybody holding a job role that uses the clinical forms. An admin changes
-- it per person on the Staff screen.

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "clocksIn" BOOLEAN NOT NULL DEFAULT true;

UPDATE "employees" e
SET "clocksIn" = false
WHERE EXISTS (
  SELECT 1
  FROM "employee_job_roles" ejr
  JOIN "job_roles" jr ON jr."id" = ejr."jobRoleId"
  WHERE ejr."employeeId" = e."id" AND jr."usesClinicalForms" = true
);
