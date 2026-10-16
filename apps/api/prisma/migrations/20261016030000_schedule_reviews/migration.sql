-- Who reviews which provider's patient schedule (October 2026): a usual
-- pattern by weekday and single days changed. Never a patient.
-- CreateTable
CREATE TABLE "schedule_reviewers" (
    "providerId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "reviewerId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_reviewers_pkey" PRIMARY KEY ("providerId","weekday")
);

-- CreateTable
CREATE TABLE "schedule_review_days" (
    "date" DATE NOT NULL,
    "providerId" UUID NOT NULL,
    "reviewerId" UUID,
    "note" TEXT,
    "setById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_review_days_pkey" PRIMARY KEY ("date","providerId")
);

-- CreateIndex
CREATE INDEX "schedule_reviewers_reviewerId_idx" ON "schedule_reviewers"("reviewerId");

-- AddForeignKey
ALTER TABLE "schedule_reviewers" ADD CONSTRAINT "schedule_reviewers_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_reviewers" ADD CONSTRAINT "schedule_reviewers_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_review_days" ADD CONSTRAINT "schedule_review_days_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_review_days" ADD CONSTRAINT "schedule_review_days_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_review_days" ADD CONSTRAINT "schedule_review_days_setById_fkey" FOREIGN KEY ("setById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

