-- Clocking out anybody still clocked in at midnight (October 2026, Dominguez).
-- Additive only: one nullable column, which the version live before this
-- never reads.

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "autoClockedOutAt" TIMESTAMP(3);

