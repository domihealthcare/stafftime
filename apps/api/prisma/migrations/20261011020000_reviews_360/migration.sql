-- 360 feedback (October 2026): everybody about everybody, anonymously, with
-- reports for managers and an offer of times to talk it through. The answers
-- carry no rater and no time; who rated whom is kept apart.

-- CreateTable
CREATE TABLE "reviews_360" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT,
    "status" "SurveyStatus" NOT NULL DEFAULT 'OPEN',
    "closesOn" DATE,
    "closedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_360_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_360_questions" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "SurveyQuestionKind" NOT NULL,
    "prompt" TEXT NOT NULL,
    "selfPrompt" TEXT,
    "hint" TEXT,

    CONSTRAINT "review_360_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_360_subjects" (
    "reviewId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,

    CONSTRAINT "review_360_subjects_pkey" PRIMARY KEY ("reviewId","subjectId")
);

-- CreateTable
CREATE TABLE "review_360_responses" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "isSelf" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "review_360_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_360_answers" (
    "id" UUID NOT NULL,
    "responseId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "rating" INTEGER,
    "text" TEXT,

    CONSTRAINT "review_360_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_360_rated" (
    "reviewId" UUID NOT NULL,
    "raterId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "review_360_rated_pkey" PRIMARY KEY ("reviewId","raterId","subjectId")
);

-- CreateTable
CREATE TABLE "review_360_meetings" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "offeredById" UUID,
    "place" TEXT,
    "createMeetLink" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "eventId" UUID,
    "chosenAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_360_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_360_meeting_slots" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "chosen" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "review_360_meeting_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_360_status_idx" ON "reviews_360"("status");

-- CreateIndex
CREATE INDEX "review_360_questions_reviewId_position_idx" ON "review_360_questions"("reviewId", "position");

-- CreateIndex
CREATE INDEX "review_360_responses_reviewId_subjectId_idx" ON "review_360_responses"("reviewId", "subjectId");

-- CreateIndex
CREATE INDEX "review_360_answers_questionId_idx" ON "review_360_answers"("questionId");

-- CreateIndex
CREATE INDEX "review_360_meetings_subjectId_idx" ON "review_360_meetings"("subjectId");

-- CreateIndex
CREATE INDEX "review_360_meeting_slots_meetingId_idx" ON "review_360_meeting_slots"("meetingId");

-- AddForeignKey
ALTER TABLE "reviews_360" ADD CONSTRAINT "reviews_360_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_questions" ADD CONSTRAINT "review_360_questions_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews_360"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_subjects" ADD CONSTRAINT "review_360_subjects_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews_360"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_subjects" ADD CONSTRAINT "review_360_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_responses" ADD CONSTRAINT "review_360_responses_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews_360"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_responses" ADD CONSTRAINT "review_360_responses_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_answers" ADD CONSTRAINT "review_360_answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "review_360_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_answers" ADD CONSTRAINT "review_360_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "review_360_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_rated" ADD CONSTRAINT "review_360_rated_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews_360"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_rated" ADD CONSTRAINT "review_360_rated_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_rated" ADD CONSTRAINT "review_360_rated_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_meetings" ADD CONSTRAINT "review_360_meetings_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews_360"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_meetings" ADD CONSTRAINT "review_360_meetings_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_meetings" ADD CONSTRAINT "review_360_meetings_offeredById_fkey" FOREIGN KEY ("offeredById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_360_meeting_slots" ADD CONSTRAINT "review_360_meeting_slots_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "review_360_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

