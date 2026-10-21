-- CME requests and allowances, and who is the admin in an office on each
-- weekday, with a staffing minimum that applies only on chosen weekdays
-- (October 2026, Dominguez).
ALTER TYPE "NotificationKind" ADD VALUE 'CME';

-- CreateEnum
CREATE TYPE "CmeStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CmeFormat" AS ENUM ('IN_PERSON', 'ONLINE');

-- AlterTable
ALTER TABLE "staffing_minimums" ADD COLUMN     "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "office_admins" (
    "locationId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "employeeId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_admins_pkey" PRIMARY KEY ("locationId","weekday")
);

-- CreateTable
CREATE TABLE "office_admin_days" (
    "date" DATE NOT NULL,
    "locationId" UUID NOT NULL,
    "employeeId" UUID,
    "note" TEXT,
    "setById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_admin_days_pkey" PRIMARY KEY ("date","locationId")
);

-- CreateTable
CREATE TABLE "cme_requests" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "organizer" TEXT,
    "format" "CmeFormat" NOT NULL,
    "place" TEXT,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "credits" DECIMAL(6,2),
    "registrationCents" INTEGER NOT NULL DEFAULT 0,
    "travelCents" INTEGER NOT NULL DEFAULT 0,
    "lodgingCents" INTEGER NOT NULL DEFAULT 0,
    "otherCents" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "status" "CmeStatus" NOT NULL DEFAULT 'PENDING',
    "approvedCents" INTEGER,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "reimbursedOn" DATE,
    "reimbursedCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cme_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cme_allowances" (
    "employeeId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cme_allowances_pkey" PRIMARY KEY ("employeeId")
);

-- CreateIndex
CREATE INDEX "office_admins_employeeId_idx" ON "office_admins"("employeeId");

-- CreateIndex
CREATE INDEX "cme_requests_employeeId_startsOn_idx" ON "cme_requests"("employeeId", "startsOn");

-- CreateIndex
CREATE INDEX "cme_requests_status_idx" ON "cme_requests"("status");

-- AddForeignKey
ALTER TABLE "office_admins" ADD CONSTRAINT "office_admins_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_admins" ADD CONSTRAINT "office_admins_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_admin_days" ADD CONSTRAINT "office_admin_days_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_admin_days" ADD CONSTRAINT "office_admin_days_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_admin_days" ADD CONSTRAINT "office_admin_days_setById_fkey" FOREIGN KEY ("setById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cme_requests" ADD CONSTRAINT "cme_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cme_requests" ADD CONSTRAINT "cme_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cme_allowances" ADD CONSTRAINT "cme_allowances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- West New York needs an admin every weekday except Friday (Dominguez): one
-- in the Administrative job role on the rota, Monday to Thursday. Only when
-- both are found and no minimum is set for them yet.
INSERT INTO "staffing_minimums" ("id", "locationId", "jobRoleId", "minimum", "weekdays", "updatedAt")
SELECT gen_random_uuid(), l."id", j."id", 1, ARRAY[1, 2, 3, 4], now()
FROM "locations" l, "job_roles" j
WHERE l."slug" = 'west-new-york'
  AND lower(j."name") = 'administrative'
  AND NOT EXISTS (
    SELECT 1 FROM "staffing_minimums" m WHERE m."locationId" = l."id" AND m."jobRoleId" = j."id"
  );

-- And who it is now: Tatiyana R on Monday, Celeste on Tuesday, Kayla B on
-- Wednesday, Angelica Notario on Thursday. Each matched by name only when
-- exactly one current person fits; check Schedule -> Reviews on the live site.
CREATE FUNCTION pg_temp.one_person(first_names text[], last_pattern text) RETURNS uuid AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg("id"))[1] END
  FROM "employees"
  WHERE "employmentStatus" <> 'TERMINATED'
    AND (lower("firstName") = ANY(first_names) OR lower(coalesce("preferredName", '')) = ANY(first_names))
    AND lower("lastName") LIKE last_pattern
$$ LANGUAGE sql;

WITH usual(weekday, person_id) AS (VALUES
  (1, pg_temp.one_person(ARRAY['tatiyana', 'tatiyanna'], 'r%')),
  (2, pg_temp.one_person(ARRAY['celeste'], '%')),
  (3, pg_temp.one_person(ARRAY['kayla'], 'b%')),
  (4, pg_temp.one_person(ARRAY['angelica'], 'notario'))
)
INSERT INTO "office_admins" ("locationId", "weekday", "employeeId", "updatedAt")
SELECT l."id", usual.weekday, usual.person_id, now()
FROM usual, "locations" l
WHERE l."slug" = 'west-new-york' AND usual.person_id IS NOT NULL;

DROP FUNCTION pg_temp.one_person(text[], text);
