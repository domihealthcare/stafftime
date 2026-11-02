-- Face ID sign-in (November 2026, Dominguez): the bell tells the person when
-- a passkey is set up on their account. In a migration of its own, as
-- Postgres will not use a value added to an enum in the same transaction.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'ACCOUNT';
