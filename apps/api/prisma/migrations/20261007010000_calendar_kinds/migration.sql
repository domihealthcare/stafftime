-- The practice calendar (October 2026, Dominguez): holidays that shut
-- nothing, and the diagnostics schedule, alongside events and closures.

ALTER TYPE "PracticeEventKind" ADD VALUE IF NOT EXISTS 'HOLIDAY';
ALTER TYPE "PracticeEventKind" ADD VALUE IF NOT EXISTS 'DIAGNOSTIC';

-- The office a diagnostics date is at. Not who it is for — that stays the
-- audience, and diagnostics are for everyone.
ALTER TABLE "practice_events" ADD COLUMN "atLocationId" UUID;

ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_atLocationId_fkey" FOREIGN KEY ("atLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
