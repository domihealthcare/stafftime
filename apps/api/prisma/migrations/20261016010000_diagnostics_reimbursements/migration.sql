-- The diagnostics guide and the reimbursements, as boards of their own
-- (October 2026, Dominguez: "it shouldn't be an excel, it should be an app
-- inside the app"). They replace the pasted reference tables of 15 October,
-- which nothing had been pasted into; should anything have been, the table
-- is kept under another name rather than dropped.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "reference_tables") THEN
    ALTER TABLE "reference_tables" RENAME TO "reference_tables_retired";
    ALTER TABLE "reference_tables_retired" RENAME CONSTRAINT "reference_tables_pkey" TO "reference_tables_retired_pkey";
    ALTER TABLE "reference_tables_retired" ALTER COLUMN "audience" TYPE TEXT;
    ALTER TABLE "reference_tables_retired" ALTER COLUMN "audience" DROP DEFAULT;
  ELSE
    DROP TABLE "reference_tables";
  END IF;
END $$;

-- DropEnum
DROP TYPE "ReferenceAudience";

-- CreateEnum
CREATE TYPE "DiagnosticSection" AS ENUM ('ULTRASOUND', 'TESTING');

-- CreateEnum
CREATE TYPE "DiagnosticAnswer" AS ENUM ('YES', 'NO', 'PA', 'CALL_REF', 'NA');

-- CreateTable
CREATE TABLE "diagnostic_tests" (
    "id" UUID NOT NULL,
    "section" "DiagnosticSection" NOT NULL,
    "name" TEXT NOT NULL,
    "detail" TEXT,
    "duration" TEXT,
    "prep" TEXT,
    "selfPay" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnostic_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ecwName" TEXT,
    "payerId" TEXT,
    "insuranceId" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnostic_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_answers" (
    "id" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "answer" "DiagnosticAnswer" NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnostic_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_reminders" (
    "id" UUID NOT NULL,
    "section" "DiagnosticSection" NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "diagnostic_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reimbursement_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_payers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reimbursement_payers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_rates" (
    "id" UUID NOT NULL,
    "codeId" UUID NOT NULL,
    "payerId" UUID NOT NULL,
    "amount" DECIMAL(12,4),
    "text" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reimbursement_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diagnostic_tests_section_sortOrder_idx" ON "diagnostic_tests"("section", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_answers_testId_planId_key" ON "diagnostic_answers"("testId", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "reimbursement_codes_code_key" ON "reimbursement_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "reimbursement_rates_codeId_payerId_key" ON "reimbursement_rates"("codeId", "payerId");

-- AddForeignKey
ALTER TABLE "diagnostic_answers" ADD CONSTRAINT "diagnostic_answers_testId_fkey" FOREIGN KEY ("testId") REFERENCES "diagnostic_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_answers" ADD CONSTRAINT "diagnostic_answers_planId_fkey" FOREIGN KEY ("planId") REFERENCES "diagnostic_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursement_rates" ADD CONSTRAINT "reimbursement_rates_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "reimbursement_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursement_rates" ADD CONSTRAINT "reimbursement_rates_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "reimbursement_payers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A rate is an amount or the words the sheet gave, never both or neither.
ALTER TABLE "reimbursement_rates" ADD CONSTRAINT "reimbursement_rates_amount_or_text" CHECK (("amount" IS NULL) <> ("text" IS NULL));
