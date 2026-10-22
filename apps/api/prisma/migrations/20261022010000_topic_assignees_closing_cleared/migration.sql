-- Who looks after each part of the practice (time off, closing checklists
-- and the rest), and a closing checklist cleared once looked into
-- (October 2026, Dominguez).
ALTER TYPE "NotificationKind" ADD VALUE 'CLOSING';

-- AlterTable
ALTER TABLE "closing_records" ADD COLUMN     "clearedAt" TIMESTAMP(3),
ADD COLUMN     "clearedById" UUID;

-- CreateTable
CREATE TABLE "topic_assignees" (
    "topic" "DigestTopic" NOT NULL,
    "employeeId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_assignees_pkey" PRIMARY KEY ("topic","employeeId")
);

-- CreateIndex
CREATE INDEX "topic_assignees_employeeId_idx" ON "topic_assignees"("employeeId");

-- AddForeignKey
ALTER TABLE "closing_records" ADD CONSTRAINT "closing_records_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_assignees" ADD CONSTRAINT "topic_assignees_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
