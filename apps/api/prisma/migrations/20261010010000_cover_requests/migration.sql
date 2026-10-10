-- "Ask who can cover" (October 2026): an open shift offered to chosen people,
-- the first yes taking it.
-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'COVER_REQUEST';

-- CreateTable
CREATE TABLE "cover_requests" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "askedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "takenById" UUID,

    CONSTRAINT "cover_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cover_asks" (
    "requestId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "answer" BOOLEAN,
    "answeredAt" TIMESTAMP(3),
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cover_asks_pkey" PRIMARY KEY ("requestId","employeeId")
);

-- CreateIndex
CREATE INDEX "cover_requests_shiftId_idx" ON "cover_requests"("shiftId");

-- CreateIndex
CREATE INDEX "cover_asks_employeeId_idx" ON "cover_asks"("employeeId");

-- AddForeignKey
ALTER TABLE "cover_requests" ADD CONSTRAINT "cover_requests_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_asks" ADD CONSTRAINT "cover_asks_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "cover_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_asks" ADD CONSTRAINT "cover_asks_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

