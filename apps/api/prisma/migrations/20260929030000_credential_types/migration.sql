-- License types and which job roles need them (September 2026, Dominguez).
-- Additive: two new tables and a nullable column, which the version live
-- before this never reads. Starts the practice off with the provider list
-- Dominguez gave; managers change it in the app from then on.

-- AlterTable
ALTER TABLE "employee_credentials" ADD COLUMN     "credentialTypeId" UUID;

-- CreateTable
CREATE TABLE "credential_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL DEFAULT 'OTHER',
    "renewalMonths" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_requirements" (
    "credentialTypeId" UUID NOT NULL,
    "jobRoleId" UUID NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "credential_requirements_pkey" PRIMARY KEY ("credentialTypeId","jobRoleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "credential_types_name_key" ON "credential_types"("name");

-- CreateIndex
CREATE INDEX "credential_requirements_jobRoleId_idx" ON "credential_requirements"("jobRoleId");

-- AddForeignKey
ALTER TABLE "employee_credentials" ADD CONSTRAINT "employee_credentials_credentialTypeId_fkey" FOREIGN KEY ("credentialTypeId") REFERENCES "credential_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_requirements" ADD CONSTRAINT "credential_requirements_credentialTypeId_fkey" FOREIGN KEY ("credentialTypeId") REFERENCES "credential_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_requirements" ADD CONSTRAINT "credential_requirements_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A renewal interval is months, between one and ten years.
ALTER TABLE "credential_types" ADD CONSTRAINT "credential_types_renewal_months_check"
  CHECK ("renewalMonths" IS NULL OR ("renewalMonths" BETWEEN 1 AND 120));

-- The starting list. Intervals only where they are fixed and well known;
-- the rest are left for the practice to fill in.
INSERT INTO "credential_types" ("id", "name", "kind", "renewalMonths", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'Medical license', 'LICENSE', NULL, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CDS registration', 'REGISTRATION', NULL, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DEA registration', 'REGISTRATION', 36, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Medical malpractice insurance', 'OTHER', NULL, 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACLS', 'LIFE_SUPPORT', 24, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BLS', 'LIFE_SUPPORT', 24, 6, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Student-Athlete Cardiac Assessment Certificate', 'CERTIFICATION', NULL, 7, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Flu vaccine', 'IMMUNIZATION', 12, 8, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TB test', 'IMMUNIZATION', 12, 9, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Providers: license, CDS, DEA and malpractice required; the rest optional.
INSERT INTO "credential_requirements" ("credentialTypeId", "jobRoleId", "required")
SELECT t."id", r."id", t."name" IN ('Medical license', 'CDS registration', 'DEA registration', 'Medical malpractice insurance')
FROM "credential_types" t
CROSS JOIN "job_roles" r
WHERE r."name" = 'Provider'
ON CONFLICT DO NOTHING;

-- Anything already recorded under exactly one of these names is that type.
UPDATE "employee_credentials" c
SET "credentialTypeId" = t."id"
FROM "credential_types" t
WHERE c."credentialTypeId" IS NULL AND lower(trim(c."name")) = lower(t."name");
