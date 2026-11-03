-- Students and residents on rotation with a provider (3 November 2026,
-- Dominguez): a new kind of entry on the practice calendar. Its own
-- migration, as a new enum value cannot be used in the transaction that adds
-- it.
ALTER TYPE "PracticeEventKind" ADD VALUE IF NOT EXISTS 'ROTATION';
