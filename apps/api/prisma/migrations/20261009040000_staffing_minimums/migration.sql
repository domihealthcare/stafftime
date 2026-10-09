-- The fewest people wanted on in one job role at one office on an open day
-- (October 2026, Dominguez). Additive only: one new table, which the version
-- live before this never reads.

-- CreateTable
CREATE TABLE "staffing_minimums" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "jobRoleId" UUID NOT NULL,
    "minimum" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staffing_minimums_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staffing_minimums_locationId_jobRoleId_key" ON "staffing_minimums"("locationId", "jobRoleId");

-- AddForeignKey
ALTER TABLE "staffing_minimums" ADD CONSTRAINT "staffing_minimums_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_minimums" ADD CONSTRAINT "staffing_minimums_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One to fifty: none is "no minimum", which is no row at all.
ALTER TABLE "staffing_minimums" ADD CONSTRAINT "staffing_minimums_minimum_check" CHECK ("minimum" BETWEEN 1 AND 50);
