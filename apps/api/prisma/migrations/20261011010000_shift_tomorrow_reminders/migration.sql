-- "You're on tomorrow" (October 2026): the evening reminder of tomorrow's
-- shifts, and everybody's own switch to turn it off.

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'SHIFT_TOMORROW';

-- AlterEnum
ALTER TYPE "PunchReminderKind" ADD VALUE 'TOMORROW';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "wantsShiftReminders" BOOLEAN NOT NULL DEFAULT true;
