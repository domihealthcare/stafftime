-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('LINK', 'PAGE');

-- CreateTable
CREATE TABLE "job_roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_job_roles" (
    "employeeId" UUID NOT NULL,
    "jobRoleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_job_roles_pkey" PRIMARY KEY ("employeeId","jobRoleId")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "jobRoleId" UUID,
    "kind" "ResourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "body" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_roles_name_key" ON "job_roles"("name");

-- CreateIndex
CREATE INDEX "employee_job_roles_jobRoleId_idx" ON "employee_job_roles"("jobRoleId");

-- CreateIndex
CREATE INDEX "resources_jobRoleId_sortOrder_idx" ON "resources"("jobRoleId", "sortOrder");

-- AddForeignKey
ALTER TABLE "employee_job_roles" ADD CONSTRAINT "employee_job_roles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_job_roles" ADD CONSTRAINT "employee_job_roles_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "front desk" and "Front Desk" are the same job. The service says so politely;
-- this makes sure of it.
CREATE UNIQUE INDEX "job_roles_name_lower_key" ON "job_roles"(lower("name"));

-- The starting list, confirmed by Dominguez in September 2026. Managers can
-- rename, add and remove them from the Job roles screen. Inserted here rather
-- than by the seed so a real deployment starts with them too.
INSERT INTO "job_roles" ("id", "name", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'Front Desk', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Medical Assistant', 20, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Provider', 30, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Administrative', 40, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Manager', 50, CURRENT_TIMESTAMP);
