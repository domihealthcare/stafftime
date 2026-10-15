-- Time off, from staff feedback (October 2026, Dominguez):
-- * sick days earned as they are worked, for hourly staff starting from
--   16 October 2026 (everybody else is given the year's days, uncut);
-- * a request for more than is left records that the person understood the
--   rest may be unpaid;
-- * the start-of-month pop-up with their time off left, once a month.

-- AlterTable
ALTER TABLE "pto_policy" ADD COLUMN     "sickAccrualFrom" DATE DEFAULT '2026-10-16'::date;

-- AlterTable
ALTER TABLE "pto_requests" ADD COLUMN     "pastBalance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "balanceReminderMonth" TEXT;
