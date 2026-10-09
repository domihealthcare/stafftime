-- Managers told on the bell when somebody's new availability clashes with one
-- of their regular shifts (October 2026, Dominguez). Additive only: one new
-- notification kind, which the version live before this never writes or reads.

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'AVAILABILITY_CLASH';
