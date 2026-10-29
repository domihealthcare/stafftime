-- Date searches across the whole practice (maintenance pass, October 2026).
-- The tables already had indexes by person or office and date; these serve
-- the searches by date alone. IF NOT EXISTS so a re-run is harmless; plain
-- CREATE INDEX, as Prisma runs a migration in a transaction and the tables
-- are small.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "shifts_startsAt_idx" ON "shifts"("startsAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "time_entries_clockInAt_idx" ON "time_entries"("clockInAt");
