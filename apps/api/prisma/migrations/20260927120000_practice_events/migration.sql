-- CreateEnum
CREATE TYPE "EventAudience" AS ENUM ('EVERYONE', 'JOB_ROLE', 'LOCATION');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'EVENT';

-- CreateTable
CREATE TABLE "practice_events" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "place" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "audience" "EventAudience" NOT NULL DEFAULT 'EVERYONE',
    "jobRoleId" UUID,
    "locationId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_events_startsAt_idx" ON "practice_events"("startsAt");

-- AddForeignKey
ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- An event ends after it starts. The service says so in words; this is the
-- backstop.
ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_range_check" CHECK ("endsAt" > "startsAt");

-- The audience names the one thing it is for, and nothing else.
ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_audience_check" CHECK (
  ("audience" = 'EVERYONE' AND "jobRoleId" IS NULL AND "locationId" IS NULL)
  OR ("audience" = 'JOB_ROLE' AND "locationId" IS NULL)
  OR ("audience" = 'LOCATION' AND "jobRoleId" IS NULL)
);
