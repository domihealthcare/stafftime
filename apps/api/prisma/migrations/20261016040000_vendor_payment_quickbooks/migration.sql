-- QuickBooks as a way a vendor is paid (October 2026, Dominguez: "another
-- main form I use for payment"). Additive only: one new value, which the
-- version live before this never writes or reads.

-- AlterEnum
ALTER TYPE "VendorPaymentMethod" ADD VALUE 'QUICKBOOKS' BEFORE 'OTHER';
