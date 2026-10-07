-- Rep lunches and the reps who book them (October 2026, Dominguez).

CREATE TYPE "RepFood" AS ENUM ('CATERING', 'SELF_ORDER');

CREATE TYPE "RepStatus" AS ENUM ('PREFERRED', 'OK', 'RESTRICTED', 'DO_NOT_BOOK');

ALTER TYPE "PracticeEventKind" ADD VALUE IF NOT EXISTS 'REP_LUNCH';

-- Business contacts only: managers keep them, and the schema guard pins the
-- columns.
CREATE TABLE "reps" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "medication" TEXT,
    "cellPhone" TEXT,
    "food" "RepFood",
    "status" "RepStatus" NOT NULL DEFAULT 'OK',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reps_pkey" PRIMARY KEY ("id")
);

-- A lunch outlives its rep being taken off the list; its title still names them.
ALTER TABLE "practice_events" ADD COLUMN "repId" UUID;

ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_repId_fkey" FOREIGN KEY ("repId") REFERENCES "reps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
