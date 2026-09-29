-- Standing shifts (September 2026): "every Monday, 8 to 4", with no end date.
-- A new table, and a nullable column on shifts saying which standing shift
-- made it. Additive: the version live before this never reads either.

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "seriesId" UUID;

-- CreateTable
CREATE TABLE "shift_series" (
    "id" UUID NOT NULL,
    "employeeId" UUID,
    "locationId" UUID NOT NULL,
    "jobRoleId" UUID,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "openCount" INTEGER NOT NULL DEFAULT 1,
    "daysOfWeek" INTEGER[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" "ShiftStatus" NOT NULL,
    "notes" TEXT,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "filledThrough" DATE NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_series_endsOn_idx" ON "shift_series"("endsOn");

-- CreateIndex
CREATE INDEX "shifts_seriesId_startsAt_idx" ON "shifts"("seriesId", "startsAt");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "shift_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_series" ADD CONSTRAINT "shift_series_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_series" ADD CONSTRAINT "shift_series_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_series" ADD CONSTRAINT "shift_series_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_series" ADD CONSTRAINT "shift_series_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

