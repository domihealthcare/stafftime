-- Telling somebody about their raise in Domi Staff (November 2026, Kayla:
-- "Typically, I will email the individual"), and asking payroll to update ADP.
ALTER TABLE "pay_raises" ADD COLUMN "toldAt" TIMESTAMP(3);
ALTER TABLE "pay_raises" ADD COLUMN "toldById" UUID;
ALTER TABLE "pay_raises" ADD COLUMN "toldMessage" TEXT;
ALTER TABLE "pay_raises" ADD COLUMN "payrollToldAt" TIMESTAMP(3);
ALTER TABLE "pay_raises" ADD COLUMN "payrollToldIds" UUID[];

ALTER TABLE "pay_raises" ADD CONSTRAINT "pay_raises_toldById_fkey" FOREIGN KEY ("toldById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Raises approved before this were told by email, so they count as told:
-- the person's own Your pay shows them, and their pay now includes them.
-- Noon New Jersey time on the day it was decided, as no time was kept.
UPDATE "pay_raises"
SET "toldAt" = ("decidedOn" + TIME '17:00')
WHERE "status" = 'APPROVED' AND "decidedOn" IS NOT NULL;
