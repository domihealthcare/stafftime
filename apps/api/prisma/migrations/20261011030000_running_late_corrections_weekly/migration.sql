-- Running late, the managers' no-show alert, asking for a correction and
-- "Your week" on Sunday (October 2026).

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'RUNNING_LATE';
ALTER TYPE "NotificationKind" ADD VALUE 'NO_SHOW';
ALTER TYPE "NotificationKind" ADD VALUE 'CORRECTION';
ALTER TYPE "NotificationKind" ADD VALUE 'WEEKLY_SUMMARY';

-- AlterEnum
ALTER TYPE "PunchReminderKind" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "wantsWeeklySummary" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "running_late" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "running_late_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_requests" (
    "id" UUID NOT NULL,
    "timeEntryId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockOutAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_summaries" (
    "employeeId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_summaries_pkey" PRIMARY KEY ("employeeId","weekStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "running_late_shiftId_key" ON "running_late"("shiftId");

-- CreateIndex
CREATE INDEX "correction_requests_status_createdAt_idx" ON "correction_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "correction_requests_timeEntryId_idx" ON "correction_requests"("timeEntryId");

-- AddForeignKey
ALTER TABLE "running_late" ADD CONSTRAINT "running_late_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "running_late" ADD CONSTRAINT "running_late_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_summaries" ADD CONSTRAINT "weekly_summaries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

