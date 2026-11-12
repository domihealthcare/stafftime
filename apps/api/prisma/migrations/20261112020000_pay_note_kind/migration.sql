-- A pay note somebody is asked to read (November 2026). In a migration of
-- its own, as Postgres will not use a value added to an enum in the same
-- transaction.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'PAY';
