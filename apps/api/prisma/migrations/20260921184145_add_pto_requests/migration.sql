-- CreateEnum
CREATE TYPE "PtoType" AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'BEREAVEMENT', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "PtoStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');

-- CreateTable
CREATE TABLE "pto_requests" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "type" "PtoType" NOT NULL,
    "status" "PtoStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pto_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pto_requests_employeeId_startDate_idx" ON "pto_requests"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "pto_requests_status_startDate_idx" ON "pto_requests"("status", "startDate");

-- AddForeignKey
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
