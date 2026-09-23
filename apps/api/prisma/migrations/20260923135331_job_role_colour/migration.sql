-- AlterTable
ALTER TABLE "job_roles" ADD COLUMN     "colour" TEXT NOT NULL DEFAULT 'blue';

-- Give the roles that already exist a colour each, in list order, from the same
-- palette order the app uses for new roles (job-roles/job-role-colours.ts).
-- The five starting roles land on blue, orange, aqua, yellow and pink.
UPDATE "job_roles" AS r
SET "colour" = (ARRAY['blue','orange','aqua','yellow','magenta','green','violet','red'])[((o.n - 1) % 8) + 1]
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "sortOrder", "name") AS n FROM "job_roles"
) AS o
WHERE r."id" = o."id";
