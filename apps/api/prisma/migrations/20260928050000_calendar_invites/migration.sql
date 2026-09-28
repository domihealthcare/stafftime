-- Calendar invites (September 2026, Dominguez): what the app has sent from
-- its own Google calendar, and that calendar. New tables only; the version
-- live before this never reads them.

-- CreateEnum
CREATE TYPE "CalendarInviteKind" AS ENUM ('SHIFT', 'EVENT');

-- CreateTable
CREATE TABLE "calendar_invites" (
    "id" UUID NOT NULL,
    "kind" "CalendarInviteKind" NOT NULL,
    "sourceId" UUID NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar" (
    "id" UUID NOT NULL,
    "singleton" INTEGER NOT NULL DEFAULT 1,
    "calendarId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_invites_googleEventId_key" ON "calendar_invites"("googleEventId");

-- CreateIndex
CREATE INDEX "calendar_invites_endsAt_idx" ON "calendar_invites"("endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_invites_kind_sourceId_key" ON "calendar_invites"("kind", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_singleton_key" ON "google_calendar"("singleton");

