-- Staff profiles (October 2026, Dominguez): an admins-only record of each
-- person — home address, emergency contact, and pay and position over time —
-- and time off already taken written down after the fact. A deliberate change
-- to "Data this app does not hold" (see CLAUDE.md). Additive only.

-- CreateEnum
CREATE TYPE "EmploymentChangeKind" AS ENUM ('HIRED', 'PROMOTION', 'PAY_CHANGE', 'POSITION_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "PayRateUnit" AS ENUM ('HOURLY', 'YEARLY');

-- AlterTable
ALTER TABLE "pto_requests" ADD COLUMN     "recordedById" UUID;

-- CreateTable
CREATE TABLE "employee_personal_records" (
    "employeeId" UUID NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactRelationship" TEXT,
    "emergencyContactPhone" TEXT,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_personal_records_pkey" PRIMARY KEY ("employeeId")
);

-- CreateTable
CREATE TABLE "employment_changes" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "kind" "EmploymentChangeKind" NOT NULL,
    "position" TEXT,
    "payRate" DECIMAL(10,2),
    "payUnit" "PayRateUnit",
    "note" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employment_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employment_changes_employeeId_effectiveOn_idx" ON "employment_changes"("employeeId", "effectiveOn");

-- AddForeignKey
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_personal_records" ADD CONSTRAINT "employee_personal_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_personal_records" ADD CONSTRAINT "employee_personal_records_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_changes" ADD CONSTRAINT "employment_changes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_changes" ADD CONSTRAINT "employment_changes_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A rate needs its unit and a unit needs its rate; nobody is paid less than nothing.
ALTER TABLE "employment_changes" ADD CONSTRAINT "employment_changes_pay_pair"
  CHECK (("payRate" IS NULL) = ("payUnit" IS NULL));
ALTER TABLE "employment_changes" ADD CONSTRAINT "employment_changes_pay_not_negative"
  CHECK ("payRate" IS NULL OR "payRate" >= 0);
