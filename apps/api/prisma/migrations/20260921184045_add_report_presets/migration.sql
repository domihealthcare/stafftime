-- CreateTable
CREATE TABLE "report_presets" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_presets_isShared_idx" ON "report_presets"("isShared");

-- CreateIndex
CREATE UNIQUE INDEX "report_presets_ownerId_name_key" ON "report_presets"("ownerId", "name");

-- AddForeignKey
ALTER TABLE "report_presets" ADD CONSTRAINT "report_presets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
