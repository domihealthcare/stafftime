-- Reminders to the person whose license or certificate runs out (October
-- 2026, Dominguez). Additive only: one new table, one new enum and one new
-- notification kind, none of which the version live before this reads.

-- CreateEnum
CREATE TYPE "CredentialReminderStage" AS ENUM ('DAYS_60', 'DAYS_30', 'LAPSED');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'LICENSE_REMINDER';

-- CreateTable
CREATE TABLE "credential_reminders" (
    "id" UUID NOT NULL,
    "credentialId" UUID NOT NULL,
    "stage" "CredentialReminderStage" NOT NULL,
    "expiresOn" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credential_reminders_credentialId_stage_expiresOn_key" ON "credential_reminders"("credentialId", "stage", "expiresOn");

-- AddForeignKey
ALTER TABLE "credential_reminders" ADD CONSTRAINT "credential_reminders_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "employee_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
