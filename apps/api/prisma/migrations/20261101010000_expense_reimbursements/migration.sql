-- Expense reimbursements (1 November 2026, Dominguez): anybody asks to be
-- paid back for their own money spent for the practice, the receipt is
-- emailed, and the people on a list approve (he and Angelica Dominguez to
-- start). Never part of payroll: whoever runs payroll is asked about each
-- approved one not paid yet, CME included, and either records how it was
-- paid (a paper check, say) or puts it off ("Not this time").
-- CreateEnum
CREATE TYPE "ReimbursementMethod" AS ENUM ('PAPER_CHECK', 'CASH', 'DIRECT_DEPOSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseKind" AS ENUM ('SUPPLIES', 'MILEAGE', 'TRAINING', 'MEALS', 'TRAVEL', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'EXPENSE';

-- AlterTable
ALTER TABLE "cme_requests" ADD COLUMN     "payDeferredUntil" DATE,
ADD COLUMN     "reimbursedHow" "ReimbursementMethod",
ADD COLUMN     "reimbursedNote" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "canApproveExpenses" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "expense_requests" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "ExpenseKind",
    "spentOn" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "receiptEmailedAt" TIMESTAMP(3) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "approvedCents" INTEGER,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "receiptReceivedAt" TIMESTAMP(3),
    "paidOn" DATE,
    "paidCents" INTEGER,
    "paidHow" "ReimbursementMethod",
    "paidNote" TEXT,
    "payDeferredUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_requests_employeeId_spentOn_idx" ON "expense_requests"("employeeId", "spentOn");

-- CreateIndex
CREATE INDEX "expense_requests_status_idx" ON "expense_requests"("status");

-- AddForeignKey
ALTER TABLE "expense_requests" ADD CONSTRAINT "expense_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_requests" ADD CONSTRAINT "expense_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Who approves: Dominguez by email, Angelica Dominguez by name, only when
-- exactly one current member of staff fits. Check the list on the live site.
UPDATE "employees" SET "canApproveExpenses" = true
WHERE lower("email") = 'dominguez@domihealthcare.com';

UPDATE "employees" SET "canApproveExpenses" = true
WHERE "employmentStatus" <> 'TERMINATED'
  AND (lower("firstName") = 'angelica' OR lower(coalesce("preferredName", '')) = 'angelica')
  AND lower("lastName") = 'dominguez'
  AND (
    SELECT count(*) FROM "employees"
    WHERE "employmentStatus" <> 'TERMINATED'
      AND (lower("firstName") = 'angelica' OR lower(coalesce("preferredName", '')) = 'angelica')
      AND lower("lastName") = 'dominguez'
  ) = 1;
