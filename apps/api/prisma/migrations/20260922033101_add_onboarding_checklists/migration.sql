-- CreateEnum
CREATE TYPE "ChecklistKind" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "TaskOwner" AS ENUM ('EMPLOYEE', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ChecklistTaskStatus" AS ENUM ('PENDING', 'DONE', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "kind" "ChecklistKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_template_tasks" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner" "TaskOwner" NOT NULL DEFAULT 'ADMIN',
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "dueOffsetDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_template_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_checklists" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "kind" "ChecklistKind" NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" UUID,
    "anchorDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_checklist_tasks" (
    "id" UUID NOT NULL,
    "checklistId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner" "TaskOwner" NOT NULL DEFAULT 'ADMIN',
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" DATE,
    "status" "ChecklistTaskStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "completedById" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_checklist_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_documents" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedById" UUID,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "storageKey" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("storageKey")
);

-- CreateIndex
CREATE INDEX "checklist_templates_kind_archivedAt_idx" ON "checklist_templates"("kind", "archivedAt");

-- CreateIndex
CREATE INDEX "checklist_template_tasks_templateId_position_idx" ON "checklist_template_tasks"("templateId", "position");

-- CreateIndex
CREATE INDEX "employee_checklists_employeeId_kind_idx" ON "employee_checklists"("employeeId", "kind");

-- CreateIndex
CREATE INDEX "employee_checklists_completedAt_idx" ON "employee_checklists"("completedAt");

-- CreateIndex
CREATE INDEX "employee_checklist_tasks_checklistId_position_idx" ON "employee_checklist_tasks"("checklistId", "position");

-- CreateIndex
CREATE INDEX "employee_checklist_tasks_status_dueAt_idx" ON "employee_checklist_tasks"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_documents_storageKey_key" ON "checklist_documents"("storageKey");

-- CreateIndex
CREATE INDEX "checklist_documents_taskId_idx" ON "checklist_documents"("taskId");

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_tasks" ADD CONSTRAINT "checklist_template_tasks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_checklists" ADD CONSTRAINT "employee_checklists_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_checklists" ADD CONSTRAINT "employee_checklists_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_checklists" ADD CONSTRAINT "employee_checklists_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_checklist_tasks" ADD CONSTRAINT "employee_checklist_tasks_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "employee_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_checklist_tasks" ADD CONSTRAINT "employee_checklist_tasks_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_documents" ADD CONSTRAINT "checklist_documents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "employee_checklist_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_documents" ADD CONSTRAINT "checklist_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

