-- Reminders to clock in or out, 15 minutes after a shift starts or ends
-- (October 2026, Dominguez). Additive only: one new table, one new enum and
-- one new notification kind, none of which the version live before this reads.

-- CreateEnum
CREATE TYPE "PunchReminderKind" AS ENUM ('CLOCK_IN', 'CLOCK_OUT');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'PUNCH_REMINDER';

-- CreateTable
CREATE TABLE "punch_reminders" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "kind" "PunchReminderKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punch_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "punch_reminders_shiftId_kind_key" ON "punch_reminders"("shiftId", "kind");

-- AddForeignKey
ALTER TABLE "punch_reminders" ADD CONSTRAINT "punch_reminders_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

