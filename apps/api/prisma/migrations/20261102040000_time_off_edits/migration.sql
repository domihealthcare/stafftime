-- Editing time off, and paid and unpaid days kept apart (2 November 2026,
-- Dominguez: "I need to be able to edit PTO/SICK ... say who it is altered
-- by ... it says Approved but does not say UNPAID").
ALTER TABLE "pto_requests" ADD COLUMN "splitFromId" UUID;
ALTER TABLE "pto_requests" ADD COLUMN "unpaidPastBalanceOf" "PtoType";

ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_splitFromId_fkey" FOREIGN KEY ("splitFromId") REFERENCES "pto_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "pto_requests_splitFromId_idx" ON "pto_requests"("splitFromId");

CREATE TABLE "pto_changes" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "changedById" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "pto_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pto_changes_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500)
);

CREATE INDEX "pto_changes_requestId_changedAt_idx" ON "pto_changes"("requestId", "changedAt");

ALTER TABLE "pto_changes" ADD CONSTRAINT "pto_changes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "pto_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pto_changes" ADD CONSTRAINT "pto_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
