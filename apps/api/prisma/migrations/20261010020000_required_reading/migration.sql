-- Required reading and tasks (October 2026): a manager asks people to confirm
-- they have read something, or done something; the app records that they did.
-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('READ', 'TASK');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'REQUIRED';

-- CreateTable
CREATE TABLE "requirements" (
    "id" UUID NOT NULL,
    "kind" "RequirementKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "url" TEXT,
    "announcementId" UUID,
    "resourceId" UUID,
    "dueOn" DATE,
    "everyone" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_targets" (
    "id" UUID NOT NULL,
    "requirementId" UUID NOT NULL,
    "employeeId" UUID,
    "jobRoleId" UUID,
    "locationId" UUID,

    CONSTRAINT "requirement_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_done" (
    "requirementId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_done_pkey" PRIMARY KEY ("requirementId","employeeId")
);

-- CreateTable
CREATE TABLE "requirement_nudges" (
    "requirementId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "lastOn" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "requirement_nudges_pkey" PRIMARY KEY ("requirementId","employeeId")
);

-- CreateIndex
CREATE INDEX "requirements_closedAt_createdAt_idx" ON "requirements"("closedAt", "createdAt");

-- CreateIndex
CREATE INDEX "requirement_targets_requirementId_idx" ON "requirement_targets"("requirementId");

-- CreateIndex
CREATE INDEX "requirement_targets_employeeId_idx" ON "requirement_targets"("employeeId");

-- CreateIndex
CREATE INDEX "requirement_done_employeeId_idx" ON "requirement_done"("employeeId");

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_targets" ADD CONSTRAINT "requirement_targets_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_targets" ADD CONSTRAINT "requirement_targets_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_targets" ADD CONSTRAINT "requirement_targets_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_targets" ADD CONSTRAINT "requirement_targets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_done" ADD CONSTRAINT "requirement_done_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_done" ADD CONSTRAINT "requirement_done_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_nudges" ADD CONSTRAINT "requirement_nudges_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_nudges" ADD CONSTRAINT "requirement_nudges_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
