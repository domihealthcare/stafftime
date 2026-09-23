-- CreateEnum
CREATE TYPE "UnavailabilityKind" AS ENUM ('WEEKLY', 'ONE_OFF');

-- CreateTable
CREATE TABLE "unavailability" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "kind" "UnavailabilityKind" NOT NULL,
    "weekday" INTEGER,
    "date" DATE,
    "startTime" TEXT,
    "endTime" TEXT,
    "note" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "effectiveUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unavailability_employeeId_effectiveFrom_idx" ON "unavailability"("employeeId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
