-- Fill and sign a PDF (November 2026): a provider's saved signature, who may
-- stamp one (Employee.canStampSignatures), and a log of each stamp. The PDFs
-- themselves never reach the server.
-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "canStampSignatures" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "saved_signatures" (
    "employeeId" UUID NOT NULL,
    "bytes" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_signatures_pkey" PRIMARY KEY ("employeeId"),
    -- A small PNG of the ink and nothing else (signatures/signature.ts).
    CONSTRAINT "saved_signatures_bytes_size" CHECK (octet_length("bytes") BETWEEN 1 AND 61440)
);

-- CreateTable
CREATE TABLE "signature_uses" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "usedById" UUID,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_uses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signature_uses_ownerId_usedAt_idx" ON "signature_uses"("ownerId", "usedAt");

-- CreateIndex
CREATE INDEX "signature_uses_usedAt_idx" ON "signature_uses"("usedAt");

-- AddForeignKey
ALTER TABLE "saved_signatures" ADD CONSTRAINT "saved_signatures_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_uses" ADD CONSTRAINT "signature_uses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_uses" ADD CONSTRAINT "signature_uses_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

