-- Time off for the switch-over (September 2026, Dominguez): days already taken
-- before Domi Staff, per person and policy year, and a person's own yearly
-- allowance where it differs from the practice's. Two new tables, nothing
-- changed: the version live before this never reads them.

-- CreateTable
CREATE TABLE "pto_allowances" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "vacationDaysPerYear" DOUBLE PRECISION,
    "sickDaysPerYear" DOUBLE PRECISION,
    "setById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pto_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pto_starting_points" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "policyYear" INTEGER NOT NULL,
    "vacationUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sickUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vacationCarriedOver" DOUBLE PRECISION,
    "sickCarriedOver" DOUBLE PRECISION,
    "setById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pto_starting_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pto_allowances_employeeId_key" ON "pto_allowances"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "pto_starting_points_employeeId_policyYear_key" ON "pto_starting_points"("employeeId", "policyYear");

-- AddForeignKey
ALTER TABLE "pto_allowances" ADD CONSTRAINT "pto_allowances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_allowances" ADD CONSTRAINT "pto_allowances_setById_fkey" FOREIGN KEY ("setById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_starting_points" ADD CONSTRAINT "pto_starting_points_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_starting_points" ADD CONSTRAINT "pto_starting_points_setById_fkey" FOREIGN KEY ("setById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Days, never negative, never more than a year.
ALTER TABLE "pto_allowances" ADD CONSTRAINT "pto_allowances_days_check" CHECK (
  ("vacationDaysPerYear" IS NULL OR "vacationDaysPerYear" BETWEEN 0 AND 366) AND
  ("sickDaysPerYear" IS NULL OR "sickDaysPerYear" BETWEEN 0 AND 366)
);
ALTER TABLE "pto_starting_points" ADD CONSTRAINT "pto_starting_points_days_check" CHECK (
  "vacationUsed" BETWEEN 0 AND 366 AND "sickUsed" BETWEEN 0 AND 366 AND
  ("vacationCarriedOver" IS NULL OR "vacationCarriedOver" BETWEEN 0 AND 366) AND
  ("sickCarriedOver" IS NULL OR "sickCarriedOver" BETWEEN 0 AND 366)
);
