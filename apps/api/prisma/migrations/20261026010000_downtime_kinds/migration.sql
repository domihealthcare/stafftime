-- Downtime (October 2026, Dominguez): the new values the downtime tables and
-- their starting content use. In a migration of their own, as Postgres will
-- not use a value added to an enum in the same transaction that adds it.

-- A part of the nightly round-up: a downtime left open, catch-up overdue,
-- paper to shred, the monthly check.
ALTER TYPE "DigestTopic" ADD VALUE IF NOT EXISTS 'DOWNTIME';

-- The downtime procedures, kept as a guide.
ALTER TYPE "GuideKey" ADD VALUE IF NOT EXISTS 'DOWNTIME';

-- On the bell: a downtime started, updated, ended, planned or cancelled, and
-- the monthly check.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DOWNTIME';
