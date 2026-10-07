-- Choosing which parts of the nightly round-up each manager gets (October
-- 2026, Dominguez). Additive only: a new enum and one column defaulting to
-- "nothing left out", which the version live before this never reads.

-- CreateEnum
CREATE TYPE "DigestTopic" AS ENUM ('SCHEDULE', 'TIME_OFF', 'HOURS', 'LICENSES', 'CHECKLISTS', 'CLOSING', 'TIME_CLOCK', 'SUGGESTIONS');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "mutedDigestTopics" "DigestTopic"[] DEFAULT ARRAY[]::"DigestTopic"[];
