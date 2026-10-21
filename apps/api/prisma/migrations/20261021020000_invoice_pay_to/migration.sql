-- Who an invoice is paid to (October 2026, Dominguez: "some invoices go
-- directly to the provider"). The practice stays the default; saved options
-- are kept in invoice_payees, and each invoice keeps a copy of the one it
-- went out with.

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "payToName" TEXT,
ADD COLUMN "payToLines" TEXT,
ADD COLUMN "payableTo" TEXT;

-- A pay-to is the practice (all empty) or names somebody to pay.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pay_to_whole"
  CHECK (("payToName" IS NULL) = ("payableTo" IS NULL) AND ("payToName" IS NOT NULL OR "payToLines" IS NULL));

-- CreateTable
CREATE TABLE "invoice_payees" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lines" TEXT,
    "payableTo" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_payees_pkey" PRIMARY KEY ("id")
);
