-- Reminders to a new hire about the tasks on their onboarding checklist that
-- are theirs to do (October 2026, Dominguez). Additive only: one new table,
-- one new enum and one new notification kind, none of which the version live
-- before this reads.

-- CreateEnum
CREATE TYPE "ChecklistReminderStage" AS ENUM ('DUE_SOON', 'OVERDUE');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'ONBOARDING_REMINDER';

-- CreateTable
CREATE TABLE "checklist_task_reminders" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "stage" "ChecklistReminderStage" NOT NULL,
    "dueAt" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_task_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checklist_task_reminders_taskId_stage_dueAt_key" ON "checklist_task_reminders"("taskId", "stage", "dueAt");

-- AddForeignKey
ALTER TABLE "checklist_task_reminders" ADD CONSTRAINT "checklist_task_reminders_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "employee_checklist_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
