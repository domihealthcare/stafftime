-- Repeating events, their invitees, and day-before reminders.
--
-- Additive only: the live site keeps working on the version before this, which
-- reads none of it. (Preview builds run migrations against the live database
-- as soon as a branch is pushed, so a migration must never break the code that
-- is live — see CLAUDE.md.)

-- CreateEnum
CREATE TYPE "RepeatFrequency" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "MonthlyRepeat" AS ENUM ('DAY_OF_MONTH', 'WEEKDAY_OF_MONTH');


-- AlterTable
ALTER TABLE "practice_events" ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "seriesId" UUID;

-- CreateTable
CREATE TABLE "practice_event_invitees" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "employeeId" UUID,
    "jobRoleId" UUID,
    "locationId" UUID,

    CONSTRAINT "practice_event_invitees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_event_series" (
    "id" UUID NOT NULL,
    "frequency" "RepeatFrequency" NOT NULL,
    "interval" INTEGER NOT NULL,
    "weekdays" INTEGER[],
    "monthlyMode" "MonthlyRepeat",
    "monthlyWeek" INTEGER,
    "firstDate" DATE NOT NULL,
    "untilDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_event_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_event_invitees_eventId_idx" ON "practice_event_invitees"("eventId");

-- CreateIndex
CREATE INDEX "practice_event_invitees_employeeId_idx" ON "practice_event_invitees"("employeeId");

-- CreateIndex
CREATE INDEX "practice_event_invitees_jobRoleId_idx" ON "practice_event_invitees"("jobRoleId");

-- CreateIndex
CREATE INDEX "practice_event_invitees_locationId_idx" ON "practice_event_invitees"("locationId");

-- CreateIndex
CREATE INDEX "practice_events_seriesId_startsAt_idx" ON "practice_events"("seriesId", "startsAt");

-- AddForeignKey
ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "practice_event_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_event_invitees" ADD CONSTRAINT "practice_event_invitees_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "practice_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_event_invitees" ADD CONSTRAINT "practice_event_invitees_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_event_invitees" ADD CONSTRAINT "practice_event_invitees_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_event_invitees" ADD CONSTRAINT "practice_event_invitees_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- An invitee is one person, one job role or one office — exactly one.
ALTER TABLE "practice_event_invitees" ADD CONSTRAINT "practice_event_invitees_one_check" CHECK (
  num_nonnulls("employeeId", "jobRoleId", "locationId") = 1
);

-- A rule that makes sense: every 1 to 12, weekdays 1–7, a week of the month
-- for "the first Friday", and it stops after it starts.
ALTER TABLE "practice_event_series" ADD CONSTRAINT "practice_event_series_rule_check" CHECK (
  "interval" BETWEEN 1 AND 12
  AND "untilDate" >= "firstDate"
  AND "weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]
  AND ("frequency" = 'MONTHLY' OR cardinality("weekdays") > 0)
  AND ("monthlyWeek" IS NULL OR "monthlyWeek" IN (1, 2, 3, 4, -1))
);

-- CHOSEN keeps its people, roles and offices in practice_event_invitees, so
-- both single-audience columns stay empty.
ALTER TABLE "practice_events" DROP CONSTRAINT "practice_events_audience_check";
ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_audience_check" CHECK (
  ("audience" = 'EVERYONE' AND "jobRoleId" IS NULL AND "locationId" IS NULL)
  OR ("audience" = 'JOB_ROLE' AND "locationId" IS NULL)
  OR ("audience" = 'LOCATION' AND "jobRoleId" IS NULL)
  OR ("audience" = 'CHOSEN' AND "jobRoleId" IS NULL AND "locationId" IS NULL)
);
