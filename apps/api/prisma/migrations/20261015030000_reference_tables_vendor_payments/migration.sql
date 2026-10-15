-- Reference tables (the diagnostics guide, the fee schedule) and vendor
-- payments, from the practice's spreadsheets (October 2026, Dominguez).

-- CreateEnum
CREATE TYPE "ReferenceAudience" AS ENUM ('EVERYONE', 'MANAGERS');

-- CreateEnum
CREATE TYPE "VendorPaymentMethod" AS ENUM ('CHECK', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "VendorPaymentStatus" AS ENUM ('TO_PAY', 'SENT', 'COMPLETED');

-- CreateTable
CREATE TABLE "reference_tables" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "audience" "ReferenceAudience" NOT NULL DEFAULT 'EVERYONE',
    "headerRows" INTEGER NOT NULL DEFAULT 1,
    "keyColumns" INTEGER NOT NULL DEFAULT 1,
    "rows" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "details" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payments" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "forWhat" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "method" "VendorPaymentMethod" NOT NULL DEFAULT 'CHECK',
    "checkNumber" TEXT,
    "amount" DECIMAL(10,2),
    "status" "VendorPaymentStatus" NOT NULL DEFAULT 'TO_PAY',
    "sentOn" DATE,
    "completedOn" DATE,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_payments_vendorId_createdAt_idx" ON "vendor_payments"("vendorId", "createdAt");

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

