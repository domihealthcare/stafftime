-- CreateEnum
CREATE TYPE "PayrollExportStatus" AS ENUM ('GENERATED', 'FAILED', 'VOIDED');

-- CreateTable
CREATE TABLE "payroll_exports" (
    "id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "status" "PayrollExportStatus" NOT NULL DEFAULT 'GENERATED',
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "locationId" UUID,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "storageKey" TEXT,
    "entryCount" INTEGER NOT NULL,
    "employeeCount" INTEGER NOT NULL,
    "totalHours" DECIMAL(10,2) NOT NULL,
    "options" JSONB NOT NULL,
    "failureReason" TEXT,
    "generatedById" UUID,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_export_entries" (
    "exportId" UUID NOT NULL,
    "timeEntryId" UUID NOT NULL,

    CONSTRAINT "payroll_export_entries_pkey" PRIMARY KEY ("exportId","timeEntryId")
);

-- CreateIndex
CREATE INDEX "payroll_exports_periodStart_periodEnd_idx" ON "payroll_exports"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "payroll_exports_generatedAt_idx" ON "payroll_exports"("generatedAt");

-- CreateIndex
CREATE INDEX "payroll_export_entries_timeEntryId_idx" ON "payroll_export_entries"("timeEntryId");

-- AddForeignKey
ALTER TABLE "payroll_exports" ADD CONSTRAINT "payroll_exports_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_exports" ADD CONSTRAINT "payroll_exports_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_export_entries" ADD CONSTRAINT "payroll_export_entries_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "payroll_exports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_export_entries" ADD CONSTRAINT "payroll_export_entries_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

