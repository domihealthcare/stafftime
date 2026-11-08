-- Provider day off (8 November 2026): a cover request can come from a
-- provider's approved time off, and remembers which of the taker's own
-- work-from-home shifts were released when they said yes. Additive only.
ALTER TABLE "cover_requests" ADD COLUMN "ptoRequestId" UUID;
ALTER TABLE "cover_requests" ADD COLUMN "releasedShiftIds" UUID[] DEFAULT ARRAY[]::UUID[];

CREATE INDEX "cover_requests_ptoRequestId_idx" ON "cover_requests"("ptoRequestId");

ALTER TABLE "cover_requests" ADD CONSTRAINT "cover_requests_ptoRequestId_fkey" FOREIGN KEY ("ptoRequestId") REFERENCES "pto_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
