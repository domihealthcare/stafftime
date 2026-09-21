-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('PENDING', 'ACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('HOURLY', 'SALARY');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClockMethod" AS ENUM ('WEB', 'MOBILE', 'KIOSK');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('GEOFENCE', 'IP_ALLOWLIST', 'KIOSK', 'MANUAL');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('OPEN', 'COMPLETED', 'NEEDS_REVIEW', 'APPROVED');

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "postalCode" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 150,
    "allowedIps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kioskEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "externalId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "preferredName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'PENDING',
    "payType" "PayType" NOT NULL DEFAULT 'HOURLY',
    "hireDate" DATE NOT NULL,
    "terminationDate" DATE,
    "pinHash" TEXT,
    "badgeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_locations" (
    "employeeId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_locations_pkey" PRIMARY KEY ("employeeId","locationId")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "shiftId" UUID,
    "method" "ClockMethod" NOT NULL,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'OPEN',
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockInLatitude" DECIMAL(9,6),
    "clockInLongitude" DECIMAL(9,6),
    "clockInAccuracyMeters" INTEGER,
    "clockInIp" TEXT,
    "clockInVerification" "VerificationMethod" NOT NULL,
    "clockOutAt" TIMESTAMP(3),
    "clockOutLatitude" DECIMAL(9,6),
    "clockOutLongitude" DECIMAL(9,6),
    "clockOutAccuracyMeters" INTEGER,
    "clockOutIp" TEXT,
    "clockOutVerification" "VerificationMethod",
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "isEarlyDeparture" BOOLEAN NOT NULL DEFAULT false,
    "isManuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "isMissingPunch" BOOLEAN NOT NULL DEFAULT false,
    "editedById" UUID,
    "editedAt" TIMESTAMP(3),
    "editReason" TEXT,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_slug_key" ON "locations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "employees_externalId_key" ON "employees"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_badgeId_key" ON "employees"("badgeId");

-- CreateIndex
CREATE INDEX "employees_employmentStatus_idx" ON "employees"("employmentStatus");

-- CreateIndex
CREATE INDEX "employee_locations_locationId_idx" ON "employee_locations"("locationId");

-- CreateIndex
CREATE INDEX "shifts_employeeId_startsAt_idx" ON "shifts"("employeeId", "startsAt");

-- CreateIndex
CREATE INDEX "shifts_locationId_startsAt_idx" ON "shifts"("locationId", "startsAt");

-- CreateIndex
CREATE INDEX "time_entries_employeeId_clockInAt_idx" ON "time_entries"("employeeId", "clockInAt");

-- CreateIndex
CREATE INDEX "time_entries_locationId_clockInAt_idx" ON "time_entries"("locationId", "clockInAt");

-- CreateIndex
CREATE INDEX "time_entries_shiftId_idx" ON "time_entries"("shiftId");

-- AddForeignKey
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
