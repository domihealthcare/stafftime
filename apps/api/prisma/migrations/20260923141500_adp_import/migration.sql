-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "adpFileNumber" TEXT;

-- CreateTable
CREATE TABLE "adp_settings" (
    "id" UUID NOT NULL,
    "singleton" INTEGER NOT NULL DEFAULT 1,
    "companyCode" TEXT,
    "headerRows" TEXT,
    "footerRows" TEXT,
    "regularColumn" TEXT,
    "overtimeColumn" TEXT,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adp_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adp_settings_singleton_key" ON "adp_settings"("singleton");

-- CreateIndex
CREATE UNIQUE INDEX "employees_adpFileNumber_key" ON "employees"("adpFileNumber");

