-- Provider productivity (September 2026, Dominguez): a plan per provider,
-- and statements of patients counted per interval. Additive only: four new
-- tables and one new notification kind, none of which the version live before
-- this reads.

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'PRODUCTIVITY';

-- CreateTable
CREATE TABLE "productivity_plans" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "intervalWeeks" INTEGER NOT NULL DEFAULT 2,
    "intervalsPerStatement" INTEGER NOT NULL DEFAULT 1,
    "expectedPerInterval" INTEGER,
    "multiplier" DECIMAL(10,2),
    "categories" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productivity_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_statements" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "multiplier" DECIMAL(10,2),
    "paidOn" DATE,
    "note" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productivity_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_intervals" (
    "id" UUID NOT NULL,
    "statementId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "expected" INTEGER,

    CONSTRAINT "productivity_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_counts" (
    "id" UUID NOT NULL,
    "intervalId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "count" INTEGER NOT NULL,

    CONSTRAINT "productivity_counts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "productivity_plans_employeeId_key" ON "productivity_plans"("employeeId");

-- CreateIndex
CREATE INDEX "productivity_statements_employeeId_startDate_idx" ON "productivity_statements"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "productivity_statements_employeeId_publishedAt_idx" ON "productivity_statements"("employeeId", "publishedAt");

-- CreateIndex
CREATE INDEX "productivity_intervals_statementId_position_idx" ON "productivity_intervals"("statementId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "productivity_counts_intervalId_label_key" ON "productivity_counts"("intervalId", "label");

-- AddForeignKey
ALTER TABLE "productivity_plans" ADD CONSTRAINT "productivity_plans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_statements" ADD CONSTRAINT "productivity_statements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_statements" ADD CONSTRAINT "productivity_statements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_statements" ADD CONSTRAINT "productivity_statements_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_intervals" ADD CONSTRAINT "productivity_intervals_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "productivity_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_counts" ADD CONSTRAINT "productivity_counts_intervalId_fkey" FOREIGN KEY ("intervalId") REFERENCES "productivity_intervals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sensible bounds, so a typo cannot make a nonsense statement.
ALTER TABLE "productivity_plans" ADD CONSTRAINT "productivity_plans_interval_check"
  CHECK ("intervalWeeks" BETWEEN 1 AND 8 AND "intervalsPerStatement" BETWEEN 1 AND 12);
ALTER TABLE "productivity_plans" ADD CONSTRAINT "productivity_plans_expected_check"
  CHECK ("expectedPerInterval" IS NULL OR "expectedPerInterval" BETWEEN 0 AND 100000);
ALTER TABLE "productivity_statements" ADD CONSTRAINT "productivity_statements_dates_check"
  CHECK ("endDate" >= "startDate");
ALTER TABLE "productivity_intervals" ADD CONSTRAINT "productivity_intervals_dates_check"
  CHECK ("endDate" >= "startDate" AND ("expected" IS NULL OR "expected" >= 0));
ALTER TABLE "productivity_counts" ADD CONSTRAINT "productivity_counts_count_check"
  CHECK ("count" BETWEEN 0 AND 100000);
