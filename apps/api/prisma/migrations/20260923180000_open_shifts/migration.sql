-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "jobRoleId" UUID,
ALTER COLUMN "employeeId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "shifts_jobRoleId_startsAt_idx" ON "shifts"("jobRoleId", "startsAt");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

