-- CreateTable
CREATE TABLE "practice_settings" (
    "id" UUID NOT NULL,
    "singleton" INTEGER NOT NULL DEFAULT 1,
    "overtimeThresholdHours" INTEGER NOT NULL DEFAULT 40,
    "rotaWarningDays" INTEGER NOT NULL DEFAULT 4,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "practice_settings_singleton_key" ON "practice_settings"("singleton");

-- AddForeignKey
ALTER TABLE "practice_settings" ADD CONSTRAINT "practice_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

