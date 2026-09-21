-- CreateTable
CREATE TABLE "pto_policy" (
    "id" UUID NOT NULL,
    "vacationDaysPerYear" INTEGER NOT NULL DEFAULT 15,
    "sickDaysPerYear" INTEGER NOT NULL DEFAULT 5,
    "maxCarryoverDays" INTEGER NOT NULL DEFAULT 5,
    "sickCarryoverDays" INTEGER NOT NULL DEFAULT 0,
    "yearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "yearStartDay" INTEGER NOT NULL DEFAULT 1,
    "prorateFirstYear" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pto_policy_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pto_policy" ADD CONSTRAINT "pto_policy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
