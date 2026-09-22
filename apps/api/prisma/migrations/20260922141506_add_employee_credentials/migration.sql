-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('LICENSE', 'CERTIFICATION', 'LIFE_SUPPORT', 'REGISTRATION', 'IMMUNIZATION', 'BACKGROUND_CHECK', 'OTHER');

-- CreateTable
CREATE TABLE "employee_credentials" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "reference" TEXT,
    "issuedOn" DATE,
    "expiresOn" DATE NOT NULL,
    "notes" TEXT,
    "filename" TEXT,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "storageKey" TEXT,
    "checksum" TEXT,
    "archivedAt" TIMESTAMP(3),
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_credentials_storageKey_key" ON "employee_credentials"("storageKey");

-- CreateIndex
CREATE INDEX "employee_credentials_employeeId_archivedAt_idx" ON "employee_credentials"("employeeId", "archivedAt");

-- CreateIndex
CREATE INDEX "employee_credentials_expiresOn_archivedAt_idx" ON "employee_credentials"("expiresOn", "archivedAt");

-- AddForeignKey
ALTER TABLE "employee_credentials" ADD CONSTRAINT "employee_credentials_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_credentials" ADD CONSTRAINT "employee_credentials_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

