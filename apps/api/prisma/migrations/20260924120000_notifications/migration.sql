-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('TIME_OFF_DECIDED', 'TIME_OFF_REQUESTED', 'OVERTIME', 'SCHEDULE_CHANGED', 'SURVEY_OPEN', 'CHECKLIST_STARTED', 'ANNOUNCEMENT');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_employeeId_createdAt_idx" ON "notifications"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
