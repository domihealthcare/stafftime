-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "employmentStatus" SET DEFAULT 'ACTIVE';


-- Everybody left in PENDING got there by default, not by choice — no screen
-- ever set it — and PENDING kept them from clocking in, from the scheduler and
-- from the Directory. They are staff; make them active.
UPDATE "employees" SET "employmentStatus" = 'ACTIVE' WHERE "employmentStatus" = 'PENDING';
