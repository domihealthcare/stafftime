-- When the phlebotomist is at an office (23 October 2026, Dominguez): a new
-- kind of entry on the practice calendar, entered by managers like
-- diagnostics. Nothing else changes.
ALTER TYPE "PracticeEventKind" ADD VALUE IF NOT EXISTS 'PHLEBOTOMY';
