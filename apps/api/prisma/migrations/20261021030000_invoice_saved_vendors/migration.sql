-- Saved vendors for invoices (October 2026, Dominguez: "have a way to save
-- the vendor information"). Businesses only, never a patient; each invoice
-- still keeps its own copy of who it is to.

-- CreateTable
CREATE TABLE "invoice_vendors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_vendors_pkey" PRIMARY KEY ("id")
);
